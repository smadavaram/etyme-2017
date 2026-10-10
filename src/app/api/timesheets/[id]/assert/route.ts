import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  chain, position, mayAssert, supersede, historyOf, gaps, live,
  legAsSeen, positionAsSeen, mayReadLegRate,
  type Assertion, type Record_, type Role, type Leg, type ChainReader, type FiledParties,
} from '@/lib/work-ledger'
import { mayReadPayOf } from '@/lib/money/pay-visibility'
import { writePayTrail } from '@/lib/money/pay-trail'
import type { CallerContext } from '@/lib/api-context'

/**
 * Who is reading the chain, for the rate rules in lib/work-ledger: the
 * employer's leg is the worker's pay, read only by a desk at the employer
 * that reads pay (lib/money/pay-visibility); every other leg is a price
 * between the two parties to the contract the hours were filed on.
 */
function readerOf(caller: CallerContext, workerPersonId: string): ChainReader {
  return {
    companyId: caller.company?.id ?? null,
    readsWorkerPay: mayReadPayOf({ permissions: caller.permissions, personId: caller.person.id }, workerPersonId),
  }
}

/**
 * The worker's pay went in front of this reader, or was withheld from
 * them: either way it is on the trail (CLAUDE.md, every read of another
 * person's data, refusals included). Only where the employer has said
 * something — before that there is no rate on the leg to read.
 */
async function trailPay(caller: CallerContext, reader: ChainReader, legs: Leg[], filed: FiledParties, workerPersonId: string) {
  const employer = legs.find((l) => l.role === 'EMPLOYER_ACCEPTANCE')
  if (!employer?.assertion || workerPersonId === caller.person.id) return
  const may = mayReadLegRate(reader, employer, filed)
  await writePayTrail(
    caller,
    { refused: may ? [] : [workerPersonId], read: may ? [workerPersonId] : [] },
    'the chain of approvals on a week'
  )
}
import { postAssertion, reversePostingsFor } from '@/lib/order-postings'
import { rateInForce, ratePeriods } from '@/lib/contract-rate'
import { ladderAbove } from '../../ladder'
import { topDown } from '../../chain-turn'
import { signatureRateCents, type RungRate } from '../../signature-rate'

/**
 * GET  /api/timesheets/:id/assert — where every party stands
 * POST /api/timesheets/:id/assert — one party says its piece
 *
 * Hours are a fact; approvals are opinions about that fact. The chain is
 * derived from the contracts at read time, so a party joining an
 * assignment mid-flight appears immediately with nothing asserted rather
 * than needing somebody to backfill rows they did not know were missing.
 *
 * Nothing is edited. A correction supersedes and both rows remain, which
 * is why the audit chain costs nothing to produce.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Who has to say something about these hours.
 *
 * Walked from the contract rather than stored, because storing it is
 * what made 2017 duplicate a timesheet down the chain and then have to
 * reconcile the copies.
 */
async function expectedLegs(sellContractId: string, weekStart: Date) {
  const sell = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      id: true,
      companyId: true,
      clientCompanyId: true,
      endClientCompanyId: true,
      billRate: true,
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      person: { select: { id: true } },
    },
  })
  if (!sell) return null

  const endClient = sell.endClientCompany ?? sell.clientCompany

  // ── What each signature records ────────────────────────────────────
  //
  // `WorkAssertion.rateCents` is the rate on the rung the signing firm
  // pays on, as that firm pays it, in force on the week's first day — a
  // record of what the signer saw, read by no posting (decided
  // 2026-10-06, lib/money/hop-ledger; the rule is `signatureRateCents`
  // beside this route). The client's is the top contract's bill rate,
  // which on a chain is not the contract the week is filed on.
  const above = await ladderAbove(sell.id, {
    sellContractId: sell.id,
    companyId: sell.companyId,
    clientCompanyId: sell.clientCompanyId,
    endClientCompanyId: sell.endClientCompanyId,
    supplierSellContractId: null,
  })
  const ladder = topDown(above.map((r) => r.rung))
  const billOf = new Map(above.map((r) => [r.rung.sellContractId, r.contract?.billRate ?? sell.billRate]))
  const sellChanges = await prisma.rateHistory.findMany({
    where: { contractType: 'SELL', contractId: { in: ladder.map((r) => r.sellContractId) }, approvalState: 'APPROVED' },
    select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  const rungs: RungRate[] = ladder.map((r) => ({
    sellContractId: r.sellContractId,
    companyId: r.companyId,
    clientCompanyId: r.clientCompanyId,
    billRateCents: rateInForce(
      billOf.get(r.sellContractId) ?? sell.billRate,
      ratePeriods(sellChanges.filter((c) => c.contractId === r.sellContractId)),
      weekStart
    ).rateCents,
  }))

  /**
   * A firm's own buy line for this person, rate in force on the week's
   * first day. For a firm in the middle, the line to the rung below it;
   * for the employer, the line linked to the contract the week is filed
   * on — found by the person alone, a person paid by two firms had the
   * other firm's pay put on this week.
   */
  async function ownBuyLine(companyId: string, below: string | null): Promise<number | null> {
    const person = sell!.person.id
    const pick = { id: true, candidates: { where: { personId: person }, select: { payRate: true }, take: 1 } } as const
    const buy = below
      ? await prisma.buyContract.findFirst({
          where: { companyId, supplierSellContractId: below, candidates: { some: { personId: person } } },
          select: pick,
        })
      : (await prisma.buyContract.findFirst({
          where: { companyId, sellLinks: { some: { sellContractId: sell!.id } }, candidates: { some: { personId: person } } },
          select: pick,
        })) ??
        (await prisma.buyContract.findFirst({
          where: { companyId, candidates: { some: { personId: person } } },
          select: pick,
        }))
    const pay = buy?.candidates[0]?.payRate
    if (!buy || pay == null) return null
    const changes = await prisma.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: buy.id, approvalState: 'APPROVED' },
      select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
    return rateInForce(pay, ratePeriods(changes), weekStart).rateCents
  }

  const legs: { companyId: string; companyName: string; role: Role; rateCents: number }[] = [
    {
      companyId: endClient.id,
      companyName: endClient.name,
      role: 'CLIENT_APPROVAL',
      rateCents: signatureRateCents({ role: 'CLIENT_APPROVAL', companyId: endClient.id, ladder: rungs, ownBuyLineCents: null }),
    },
  ]

  // A prime sits between only where the paying client and the end client
  // are different companies. Where they are the same there is no middle
  // leg, and inventing one would leave every direct placement waiting on
  // a party that does not exist.
  if (sell.endClientCompany && sell.endClientCompany.id !== sell.clientCompany.id) {
    // The middle firm pays on the rung it buys — here, the contract the
    // week is filed on — so its own buy line is the one to that rung.
    const middle = sell.clientCompany.id
    legs.push({
      companyId: middle,
      companyName: sell.clientCompany.name,
      role: 'PASS_THROUGH',
      rateCents: signatureRateCents({
        role: 'PASS_THROUGH', companyId: middle, ladder: rungs,
        ownBuyLineCents: await ownBuyLine(middle, sell.id),
      }),
    })
  }

  // Who actually pays the person: the firm that sold these hours, on its
  // pay line. Its rate is not the client's rate and never was.
  legs.push({
    companyId: sell.company.id,
    companyName: sell.company.name,
    role: 'EMPLOYER_ACCEPTANCE',
    rateCents: signatureRateCents({
      role: 'EMPLOYER_ACCEPTANCE', companyId: sell.company.id, ladder: rungs,
      ownBuyLineCents: await ownBuyLine(sell.company.id, null),
    }),
  })

  return { legs, sell }
}

function toRecord(t: any): Record_ {
  const days = Object.entries((t.days ?? {}) as Record<string, number>)
    .map(([on, hours]) => ({ on, hours: Number(hours) }))
    .sort((a, b) => a.on.localeCompare(b.on))

  return {
    id: t.id,
    personId: t.personId,
    personName: t.person.name,
    days,
    periodStart: iso(t.periodStart),
    periodEnd: iso(t.periodEnd),
    submittedAt: t.submittedAt ?? t.periodEnd,
    supersededById: null,
  }
}

function toAssertion(a: any, names: Map<string, string>): Assertion {
  return {
    id: a.id,
    recordId: a.timesheetId,
    companyId: a.companyId,
    companyName: names.get(a.companyId) ?? 'A company',
    role: a.role as Role,
    from: a.coversFrom ? iso(a.coversFrom) : null,
    to: a.coversTo ? iso(a.coversTo) : null,
    hours: Number(a.hours),
    rateCents: a.rateCents,
    state: a.state,
    at: a.at,
    byId: a.byId,
    auto: a.auto,
    note: a.note,
    supersedesId: a.supersedesId,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Timesheets')
  if (notStaff) return notStaff

  const { id } = await params

  const t = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      person: { select: { name: true } },
      assertions: { orderBy: { at: 'asc' } },
    },
  })
  if (!t) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No timesheet by that id.' } },
      { status: 404 }
    )
  }

  const walked = await expectedLegs(t.sellContractId, t.periodStart)
  if (!walked) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That timesheet has no contract behind it.' } },
      { status: 404 }
    )
  }

  // Only a party to the chain may read it.
  const isParty = walked.legs.some((l) => l.companyId === caller.company?.id)
  if (!isParty) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No timesheet by that id.' } },
      { status: 404 }
    )
  }

  const names = new Map(walked.legs.map((l) => [l.companyId, l.companyName]))
  const record = toRecord(t)
  const all = t.assertions.map((a) => toAssertion(a, names))
  const legs = chain(record, walked.legs, all)

  const claimed = await prisma.company.findMany({
    where: { id: { in: walked.legs.map((l) => l.companyId) }, claimedAt: { not: null } },
    select: { id: true },
  })

  const reader = readerOf(caller, t.personId)
  const filed: FiledParties = [walked.sell.company.id, walked.sell.clientCompany.id]
  await trailPay(caller, reader, legs, filed, t.personId)

  return NextResponse.json({
    data: {
      timesheetId: t.id,
      person: t.person.name,
      period: `${record.periodStart} to ${record.periodEnd}`,
      submittedHours: record.days.reduce((n, d) => n + d.hours, 0),
      legs: legs.map((l) => ({
        ...legAsSeen(reader, l, filed),
        yours: l.companyId === caller.company?.id,
        history: historyOf(all, l.companyId, l.role),
      })),
      ...positionAsSeen(reader, position(record, legs), legs, filed),
      // A leg whose company is not here cannot assert anything, and
      // resolving it to somebody else's approval is how a sub-vendor
      // pays on a signature nobody collected.
      gaps: gaps(legs, new Set(claimed.map((c) => c.id))),
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Timesheets')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id
  const now = new Date()
  const body = await request.json().catch(() => ({}))

  const t = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      person: { select: { name: true } },
      assertions: { orderBy: { at: 'asc' } },
    },
  })
  if (!t) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No timesheet by that id.' } },
      { status: 404 }
    )
  }

  const walked = await expectedLegs(t.sellContractId, t.periodStart)
  if (!walked) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That timesheet has no contract behind it.' } },
      { status: 404 }
    )
  }

  const names = new Map(walked.legs.map((l) => [l.companyId, l.companyName]))
  const record = toRecord(t)
  const all = t.assertions.map((a) => toAssertion(a, names))
  const mine = walked.legs.find((l) => l.companyId === companyId)

  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS', message: 'That is not your part of this chain to answer.' } },
      { status: 403 }
    )
  }

  // ── Correcting what we already said ─────────────────────────────────
  if (body?.supersedes) {
    const old = all.find((a) => a.id === body.supersedes && a.companyId === companyId)
    if (!old || old.state !== 'LIVE') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No live answer of yours by that id.' } },
        { status: 404 }
      )
    }

    const v = supersede(old, Number(body.hours), String(body.note ?? ''), caller.person.id, now)
    if (!v.ok) {
      return NextResponse.json(
        { error: { code: 'NEEDS_REASON', message: v.says, field: 'note' } },
        { status: 422 }
      )
    }

    const [, added] = await prisma.$transaction([
      prisma.workAssertion.update({ where: { id: old.id }, data: { state: 'SUPERSEDED' } }),
      prisma.workAssertion.create({
        data: {
          timesheetId: t.id,
          companyId,
          role: old.role,
          coversFrom: old.from ? new Date(old.from) : null,
          coversTo: old.to ? new Date(old.to) : null,
          hours: Number(body.hours),
          rateCents: old.rateCents,
          state: 'LIVE',
          byId: caller.person.id,
          auto: false,
          note: String(body.note).trim(),
          supersedesId: old.id,
        },
      }),
    ])

    // The money follows the correction. The old postings are cancelled
    // in the month they belonged to and the new ones written, so a
    // month already reported does not silently change shape.
    await reversePostingsFor(old.id, String(body.note).trim(), caller.person.id)
    await postAssertion(added.id, caller.person.id)

    return NextResponse.json({ data: { assertionId: added.id, says: v.says } })
  }

  // ── Withdrawing ─────────────────────────────────────────────────────
  if (body?.withdraw) {
    const old = all.find((a) => a.id === body.withdraw && a.companyId === companyId)
    if (!old || old.state !== 'LIVE') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No live answer of yours by that id.' } },
        { status: 404 }
      )
    }
    if (String(body?.note ?? '').trim().length < 5) {
      return NextResponse.json(
        {
          error: {
            code: 'NEEDS_REASON',
            message: 'Say why you are withdrawing it. The row stays visible either way.',
            field: 'note',
          },
        },
        { status: 422 }
      )
    }

    await prisma.workAssertion.update({
      where: { id: old.id },
      data: { state: 'WITHDRAWN', note: String(body.note).trim() },
    })

    await reversePostingsFor(old.id, String(body.note).trim(), caller.person.id)

    return NextResponse.json({
      data: { says: `Withdrawn. ${old.companyName} no longer stands behind those hours.` },
    })
  }

  // ── Saying it for the first time ────────────────────────────────────
  const may = mayAssert(companyId, mine.role, walked.legs, all)
  if (!may.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_ASSERT', message: may.says } },
      { status: 409 }
    )
  }

  const from = body?.from ? new Date(String(body.from)) : null
  const to = body?.to ? new Date(String(body.to)) : null
  const covered = record.days
    .filter((d) => (!body?.from || d.on >= String(body.from)) && (!body?.to || d.on <= String(body.to)))
    .reduce((n, d) => n + d.hours, 0)

  const hours = body?.hours != null ? Number(body.hours) : covered

  // Accepting a different number needs a reason, for the same reason a
  // reduction on a payslip does: somebody finds out later and asks.
  if (hours !== covered && String(body?.note ?? '').trim().length < 3) {
    return NextResponse.json(
      {
        error: {
          code: 'NEEDS_REASON',
          message: `Accepting ${hours} against ${covered}. Say why.`,
          field: 'note',
        },
      },
      { status: 422 }
    )
  }

  const created = await prisma.workAssertion.create({
    data: {
      timesheetId: t.id,
      companyId,
      role: mine.role,
      coversFrom: from,
      coversTo: to,
      hours,
      rateCents: mine.rateCents,
      state: 'LIVE',
      byId: caller.person.id,
      auto: false,
      note: body?.note ? String(body.note).trim() : null,
    },
  })

  // Revenue when the client approves, pay and burden when the employer
  // accepts. Posted to the month the work was done rather than the month
  // somebody got round to signing it.
  await postAssertion(created.id, caller.person.id)

  const after = chain(record, walked.legs, [...all, toAssertion(created, names)])
  const reader = readerOf(caller, t.personId)
  const filed: FiledParties = [walked.sell.company.id, walked.sell.clientCompany.id]
  await trailPay(caller, reader, after, filed, t.personId)
  const p = positionAsSeen(reader, position(record, after), after, filed)

  return NextResponse.json({
    data: { assertionId: created.id, ...p, says: p.says },
  })
}
