import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { checkOffCycle, carryLedger, OFF_CYCLE_LABEL, type CarryPeriod } from '@/lib/pay-model'
import { orderFor } from '@/lib/order-postings'

/**
 * Off-cycle payments, and the carry they interact with.
 *
 * ── The promise that was only a sentence ─────────────────────────────
 *
 * `payFor` on a SHARE_OF_BILL_LESS_COSTS model already said the right
 * thing when a filing fee exceeded the month's share: "it carries to the
 * next one rather than being taken from a payslip". It was a string. No
 * period ever read it, the next month started from zero, and the firm
 * quietly absorbed a cost the contract says the consultant carries.
 *
 * `carryLedger` replays the periods in order and derives the carry rather
 * than storing a running total, because a stored total and the postings
 * behind it disagree the first time a run is retried — and when they
 * disagree, the number somebody argues with is the payslip.
 *
 * ── And why an off-cycle payment posts to a period ───────────────────
 *
 * A March underpayment corrected in June is March's cost. Dating it June
 * moves margin between two months for no reason and hides the original
 * error in both. `checkOffCycle` refuses to let the pay date stand in for
 * the period.
 */

/** GET — the carry ledger for one contract, replayed. */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Off-cycle pay')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Payroll belongs to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Seeing the carry needs payroll.run' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const sellContractId = new URL(request.url).searchParams.get('sellContractId')
  if (!sellContractId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which assignment?', field: 'sellContractId' } },
      { status: 422 }
    )
  }

  const sell = await prisma.sellContract.findFirst({
    where: { id: sellContractId, companyId },
    select: {
      id: true, billRate: true, billCurrency: true, personId: true,
      person: { select: { name: true } },
      buyLinks: {
        select: {
          buyContract: {
            select: { id: true, payModel: true, shareBps: true, payCurrency: true },
          },
        },
      },
    },
  })
  if (!sell) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such assignment here' } },
      { status: 404 }
    )
  }

  const buy = sell.buyLinks[0]?.buyContract ?? null
  if (!buy || buy.payModel !== 'SHARE_OF_BILL_LESS_COSTS') {
    return NextResponse.json({
      data: {
        applies: false,
        periods: [],
        outstandingCents: 0,
        note:
          'Nothing carries on this assignment. A carry only exists where somebody is paid ' +
          'a share of the bill less their own costs — on every other model the firm ' +
          'carries the cost and there is nothing to recover.',
      },
    })
  }

  // The periods, from the postings. Revenue says what was billed; the
  // person's own costs are the VISA and EXPENSE postings against them.
  const postings = await prisma.orderPosting.findMany({
    where: {
      companyId,
      sellContractId,
      reversalOfId: null,
      kind: { in: ['REVENUE', 'VISA', 'EXPENSE'] },
    },
    select: { kind: true, amountCents: true, postedAt: true },
    orderBy: { postedAt: 'asc' },
    take: 2_000,
  })

  const byMonth = new Map<string, { revenue: number; cost: number; start: Date }>()
  for (const p of postings) {
    const key = `${p.postedAt.getUTCFullYear()}-${String(p.postedAt.getUTCMonth() + 1).padStart(2, '0')}`
    const cell =
      byMonth.get(key) ??
      { revenue: 0, cost: 0, start: new Date(Date.UTC(p.postedAt.getUTCFullYear(), p.postedAt.getUTCMonth(), 1)) }
    if (p.kind === 'REVENUE') cell.revenue += p.amountCents
    // Costs are negative in the ledger; the carry works in magnitudes.
    else cell.cost += Math.max(0, -p.amountCents)
    byMonth.set(key, cell)
  }

  const periods: CarryPeriod[] = [...byMonth.entries()].map(([label, cell]) => ({
    label,
    periodStart: cell.start,
    // The share is a fraction of what was billed, and the billed amount
    // is already in the revenue posting — so hours and rate are expressed
    // as one hour at the billed amount rather than re-derived, which
    // would disagree with the ledger the moment a rate changed mid-month.
    hours: 1,
    billRateCents: cell.revenue,
    shareBps: buy.shareBps ?? 0,
    personalCostCents: cell.cost,
  }))

  const ledger = carryLedger(periods)

  return NextResponse.json({
    data: {
      applies: true,
      personName: sell.person.name,
      currency: buy.payCurrency,
      periods: ledger.periods,
      outstandingCents: ledger.outstandingCents,
      recoveredCents: ledger.recoveredCents,
      says: ledger.says,
      note:
        'Replayed from the postings rather than stored. A stored running total and the ' +
        'ledger behind it disagree the first time a run is retried, and the number ' +
        'somebody argues with is the payslip.',
    },
  })
}

/** POST — record a payment made outside the run. */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Off-cycle pay')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Payroll belongs to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Paying somebody outside the run needs payroll.run' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const sellContractId = String(body.sellContractId ?? '')
  const personId = String(body.personId ?? '')

  if (!sellContractId || !personId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Which assignment, and who is being paid?',
          field: sellContractId ? 'personId' : 'sellContractId',
        },
      },
      { status: 422 }
    )
  }

  const sell = await prisma.sellContract.findFirst({
    where: { id: sellContractId, companyId },
    select: {
      id: true, billCurrency: true, clientCompanyId: true, endClientCompanyId: true,
      buyLinks: { select: { buyContract: { select: { id: true, payCurrency: true } } } },
    },
  })
  if (!sell) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such assignment here' } },
      { status: 404 }
    )
  }

  const periodStart = body.periodStart ? new Date(String(body.periodStart)) : new Date(NaN)
  const payOn = body.payOn ? new Date(String(body.payOn)) : new Date()

  const verdict = checkOffCycle({
    amountCents: Math.round(Number(body.amountCents)),
    reason: String(body.reason ?? ''),
    note: body.note ? String(body.note) : null,
    periodStart,
    payOn,
  })

  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: verdict.problems.join(' '), field: 'reason' } },
      { status: 422 }
    )
  }

  const projectOrderId = await orderFor(sellContractId)
  if (!projectOrderId) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_ORDER',
          message:
            'This assignment has no project order, so a payment against it has nowhere to ' +
            'land. A payment in no order is a figure that reconciles against nothing.',
        },
      },
      { status: 422 }
    )
  }

  const buy = sell.buyLinks[0]?.buyContract ?? null
  const amountCents = Math.round(Number(body.amountCents))

  // Deterministic, so a retried request does not pay somebody twice. The
  // pay day is part of the key because two off-cycle payments in one
  // period are legitimate — a correction and then a final settlement.
  const sourceId = `offcycle:${sellContractId}:${personId}:${payOn
    .toISOString()
    .slice(0, 10)}:${String(body.reason)}`

  const written = await prisma.orderPosting.upsert({
    where: { source_sourceId_kind: { source: 'PAYROLL', sourceId, kind: 'PAY' } },
    update: {},
    create: {
      projectOrderId,
      companyId,
      kind: 'PAY',
      // Money out. `signed()` would do this too; written explicitly here
      // because an off-cycle payment is the one place somebody might
      // reasonably expect a positive number to mean "paid".
      amountCents: -Math.abs(amountCents),
      currency: sell.billCurrency,
      txCurrency: buy?.payCurrency ?? sell.billCurrency,
      txAmountCents: -Math.abs(amountCents),
      fxToOrder: 1,
      personId,
      clientCompanyId: sell.endClientCompanyId ?? sell.clientCompanyId,
      sellContractId,
      buyContractId: buy?.id ?? null,
      // The period the money belongs to, never the day it was made.
      postedAt: verdict.postedAt!,
      source: 'PAYROLL',
      sourceId,
      says:
        `Off cycle — ${OFF_CYCLE_LABEL[String(body.reason) as keyof typeof OFF_CYCLE_LABEL]}` +
        (body.note ? `: ${String(body.note)}` : '') +
        `. Paid ${payOn.toISOString().slice(0, 10)}.`,
      createdById: realPersonId(caller),
    },
    select: { id: true, amountCents: true, postedAt: true, says: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PAYROLL_OFF_CYCLE',
      summary: `Off-cycle payment of ${(Math.abs(amountCents) / 100).toFixed(2)}`,
      reason: verdict.says,
      payload: {
        sellContractId, personId, amountCents,
        reason: String(body.reason),
        periodStart: verdict.postedAt!.toISOString(),
        payOn: payOn.toISOString(),
      },
      reversible: true,
    },
  })

  return NextResponse.json(
    { data: { posting: written, note: verdict.says } },
    { status: 201 }
  )
}
