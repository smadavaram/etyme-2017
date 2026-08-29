import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import {
  holdBackPosting, reserveBalance, drawFromReserve, exitPosting,
  type Policy, type ReserveMovement, type ReserveMovementKind, type LeaveReason,
} from '@/lib/bench-policy'
import { postReserve, reserveMovementsFor, orderFor } from '@/lib/order-postings'

/**
 * The bench reserve — what is in somebody's pot, and what moves it.
 *
 * ── The gap this closes ──────────────────────────────────────────────
 *
 * `bench-policy.ts` has known how to compute a hold-back since it was
 * written. Nothing ever wrote one. `BenchPolicy.RESERVE_FUNDED` and
 * `ReserveOnExit` were settings a firm could choose, the `RESERVE`
 * posting kind existed for exactly this, and the whole thing was
 * arithmetic with no ledger behind it — so a firm could run a
 * reserve-funded bench for a year and have no record of what it owed
 * anybody.
 *
 * ── The balance is the movements ─────────────────────────────────────
 *
 * Never a stored total. A stored total and the postings behind it
 * disagree the first time a run is retried, and when they disagree the
 * number somebody argues with is the consultant's.
 *
 * ── Where a movement posts ───────────────────────────────────────────
 *
 * To the project order the share was earned on. The money held back came
 * out of that project's pay, so that is where it left from — and
 * `resultOf` deliberately excludes RESERVE from gross and net, because
 * holding somebody's own money is a movement between two of our own
 * obligations rather than a cost of the work.
 */

const KINDS: ReserveMovementKind[] = ['HOLD', 'DRAW', 'PAY_OUT', 'FORFEIT']

/** GET /api/payroll/reserve?personId= — one pot, or every pot. */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Bench reserves')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A reserve is held by a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payroll.run') && !caller.permissions.includes('pnl.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Seeing what the firm holds for people needs payroll.run' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const personId = new URL(request.url).searchParams.get('personId')

  const rows = await prisma.orderPosting.findMany({
    where: {
      companyId,
      kind: 'RESERVE',
      reversalOfId: null,
      ...(personId ? { personId } : {}),
    },
    select: {
      amountCents: true, currency: true, postedAt: true, says: true, sourceId: true,
      person: { select: { id: true, name: true } },
    },
    orderBy: { postedAt: 'asc' },
    take: 5_000,
  })

  const byPerson = new Map<string, { name: string; movements: ReserveMovement[]; currency: string }>()
  for (const r of rows) {
    if (!r.person) continue
    const held = byPerson.get(r.person.id) ?? {
      name: r.person.name,
      movements: [],
      currency: r.currency,
    }
    held.movements.push({
      kind: kindOf(r.sourceId, r.amountCents),
      amountCents: r.amountCents,
      at: r.postedAt,
      says: r.says,
    })
    byPerson.set(r.person.id, held)
  }

  const pots = [...byPerson.entries()]
    .map(([id, held]) => ({
      personId: id,
      personName: held.name,
      currency: held.currency,
      ...reserveBalance(held.movements),
      movements: held.movements,
    }))
    .sort((a, b) => b.balanceCents - a.balanceCents)

  const overdrawn = pots.filter((p) => p.overdrawn)

  return NextResponse.json({
    data: {
      pots,
      totalHeldCents: pots.reduce((n, p) => n + Math.max(0, p.balanceCents), 0),
      overdrawn: overdrawn.map((p) => ({ personName: p.personName, balanceCents: p.balanceCents })),
      note:
        'The balance is the sum of the movements and nothing is stored as a total. A stored ' +
        'total and the postings behind it disagree the first time a run is retried, and the ' +
        'number somebody argues with is the consultant’s.',
    },
  })
}

/**
 * POST — hold back, draw down, or settle a pot on exit.
 *
 * `sourceId` is deterministic per movement, so a retried payroll run
 * writes the same row rather than a second one.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Bench reserves')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A reserve is held by a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Moving money in or out of a reserve needs payroll.run' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const buyContractId = String(body.buyContractId ?? '')

  if (!['hold', 'draw', 'exit'].includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'One of hold, draw or exit', field: 'action' } },
      { status: 422 }
    )
  }
  if (!buyContractId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Which contract? The bench policy and the person both hang off it.',
          field: 'buyContractId',
        },
      },
      { status: 422 }
    )
  }

  const buy = await prisma.buyContract.findUnique({
    where: { id: buyContractId },
    select: {
      id: true, companyId: true, payCurrency: true,
      candidates: { select: { personId: true, person: { select: { name: true } } } },
      sellLinks: { select: { sellContractId: true } },
    },
  })
  if (!buy || buy.companyId !== companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such contract here', field: 'buyContractId' } },
      { status: 404 }
    )
  }

  // The bench policy is a COMPANY setting with four shapes, not a rule
  // and not a per-contract field. Building any one of them into the core
  // would make this a product for whichever firm happened to run it that
  // way; reading it here is what keeps it a setting.
  const house = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      benchPolicy: true, benchRateBps: true, benchCarryDays: true,
      reserveBps: true, reserveOnExit: true,
    },
  })

  const personId = String(body.personId ?? buy.candidates[0]?.personId ?? '')
  if (!personId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Whose reserve?', field: 'personId' } },
      { status: 422 }
    )
  }

  const policy: Policy = {
    policy: (house?.benchPolicy ?? 'NO_PAY') as Policy['policy'],
    benchRateBps: house?.benchRateBps ?? null,
    carryDays: house?.benchCarryDays ?? null,
    reserveBps: house?.reserveBps ?? null,
    reserveOnExit: (house?.reserveOnExit ?? 'PAY_OUT') as Policy['reserveOnExit'],
  }

  // Where the movement posts. The share it came out of was earned on a
  // project, so that is where it leaves from.
  const sellContractId = buy.sellLinks[0]?.sellContractId ?? null
  const projectOrderId = sellContractId ? await orderFor(sellContractId) : null
  if (!projectOrderId) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_ORDER',
          message:
            'This contract has no sell contract linked, so there is no project order for ' +
            'the movement to leave from. A reserve posting with nowhere to sit would be a ' +
            'number in a table nobody can reconcile.',
        },
      },
      { status: 422 }
    )
  }

  const periodStart = body.periodStart ? new Date(String(body.periodStart)) : new Date()
  if (Number.isNaN(periodStart.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That period could not be read', field: 'periodStart' } },
      { status: 422 }
    )
  }
  const periodKey = periodStart.toISOString().slice(0, 10)

  const existing = await reserveMovementsFor(companyId, personId)
  const balance = reserveBalance(
    existing.map((m) => ({
      kind: kindOf(m.sourceId, m.amountCents),
      amountCents: m.amountCents,
      at: m.postedAt,
      says: m.says,
    }))
  )

  if (action === 'hold') {
    const shareCents = Math.round(Number(body.shareCents))
    if (!Number.isFinite(shareCents) || shareCents <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'What share is being held back from?', field: 'shareCents' } },
        { status: 422 }
      )
    }
    const posting = holdBackPosting(policy, shareCents)
    if (!posting) {
      return NextResponse.json({
        data: {
          held: false,
          balanceCents: balance.balanceCents,
          note:
            policy.policy === 'RESERVE_FUNDED'
              ? 'This contract funds its bench from a reserve but names no percentage, so ' +
                'nothing is held back. A guessed percentage would be a deduction nobody agreed.'
              : `This contract's bench policy is ${policy.policy}, which holds nothing back. ` +
                `A consultant on any other policy never sees a deduction they were not told about.`,
        },
      })
    }

    const written = await postReserve({
      projectOrderId,
      companyId,
      personId,
      buyContractId,
      amountCents: posting.amountCents,
      postedAt: periodStart,
      sourceId: `reserve:${buyContractId}:${personId}:${periodKey}:HOLD`,
      says: posting.says,
      txCurrency: buy.payCurrency,
      createdById: realPersonId(caller),
    })

    return NextResponse.json(
      {
        data: {
          held: true,
          postingId: written?.id ?? null,
          amountCents: posting.amountCents,
          balanceCents: balance.balanceCents + posting.amountCents,
          note: posting.says,
        },
      },
      { status: 201 }
    )
  }

  if (action === 'draw') {
    const neededCents = Math.round(Number(body.neededCents))
    if (!Number.isFinite(neededCents) || neededCents <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'How much does the bench week cost?', field: 'neededCents' } },
        { status: 422 }
      )
    }
    const over = String(body.over ?? `the period from ${periodKey}`)
    const draw = drawFromReserve(balance.balanceCents, neededCents, over)

    if (!draw.posting) {
      return NextResponse.json({
        data: {
          drawn: false,
          shortfallCents: draw.shortfallCents,
          balanceCents: balance.balanceCents,
          note: draw.says,
        },
      })
    }

    const written = await postReserve({
      projectOrderId,
      companyId,
      personId,
      buyContractId,
      amountCents: draw.posting.amountCents,
      postedAt: periodStart,
      sourceId: `reserve:${buyContractId}:${personId}:${periodKey}:DRAW`,
      says: draw.posting.says,
      txCurrency: buy.payCurrency,
      createdById: realPersonId(caller),
    })

    return NextResponse.json(
      {
        data: {
          drawn: true,
          postingId: written?.id ?? null,
          amountCents: draw.posting.amountCents,
          shortfallCents: draw.shortfallCents,
          balanceCents: balance.balanceCents + draw.posting.amountCents,
          note: draw.says,
        },
      },
      { status: 201 }
    )
  }

  // action === 'exit'
  const reason = String(body.reason ?? '') as LeaveReason
  if (!['PROJECT_ENDED', 'RELEASED', 'RESIGNED', 'DISMISSED'].includes(reason)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'How did they leave? Where the outcome turns on the reason, a reason decided at ' +
            'the moment of payout becomes whatever is cheapest — so it is asked for here.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  const settlement = exitPosting(policy, balance.balanceCents, reason)
  if (!settlement.posting) {
    return NextResponse.json({
      data: { settled: false, balanceCents: balance.balanceCents, note: settlement.says },
    })
  }

  const written = await postReserve({
    projectOrderId,
    companyId,
    personId,
    buyContractId,
    amountCents: settlement.posting.amountCents,
    postedAt: periodStart,
    sourceId: `reserve:${buyContractId}:${personId}:${periodKey}:${settlement.posting.kind}`,
    says: settlement.posting.says,
    txCurrency: buy.payCurrency,
    createdById: realPersonId(caller),
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: `RESERVE_${settlement.posting.kind}`,
      summary:
        `${settlement.posting.kind === 'PAY_OUT' ? 'Paid out' : 'Kept'} ` +
        `${(Math.abs(settlement.posting.amountCents) / 100).toFixed(2)} of a bench reserve`,
      reason: settlement.says,
      payload: {
        personId, buyContractId, reason,
        payOutCents: settlement.payOutCents,
        keptByFirmCents: settlement.keptByFirmCents,
      },
      // A forfeit is a decision about somebody's money. Reversing it is
      // re-crediting the pot, which is its own act with its own reason.
      reversible: false,
    },
  })

  return NextResponse.json(
    {
      data: {
        settled: true,
        postingId: written?.id ?? null,
        payOutCents: settlement.payOutCents,
        keptByFirmCents: settlement.keptByFirmCents,
        balanceCents: 0,
        note: settlement.says,
      },
    },
    { status: 201 }
  )
}

/**
 * Which kind of movement a posting was.
 *
 * Read from the deterministic source key rather than inferred from the
 * sign, because a draw and a forfeit are both money leaving the pot and
 * they mean entirely different things to the person whose pot it is.
 */
function kindOf(sourceId: string | null, amountCents: number): ReserveMovementKind {
  const tail = (sourceId ?? '').split(':').pop() ?? ''
  if ((KINDS as string[]).includes(tail)) return tail as ReserveMovementKind
  return amountCents >= 0 ? 'HOLD' : 'DRAW'
}
