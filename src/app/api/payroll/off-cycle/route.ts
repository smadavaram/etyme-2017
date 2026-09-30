import { NextRequest, NextResponse } from 'next/server'
import { paidByPayroll, notPayrollSays } from '@/lib/money/paid-through'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { theLinkFor } from '@/lib/contract-links'

/**
 * The buy contract in force on a date, or nothing.
 *
 * Null rather than a guess where there are none or several — an
 * off-cycle payment posted against the wrong contract is a payment to
 * the wrong company, and it reconciles cleanly on both sides.
 */
function pickBuy<T extends { buyContractId?: string; sellContractId?: string; effectiveFrom: Date; effectiveTo: Date | null; buyContract: any }>(
  links: T[],
  on: Date
): any | null {
  const chosen = theLinkFor(
    links.map((l) => ({
      buyContractId: l.buyContract?.id ?? l.buyContractId ?? '',
      sellContractId: l.sellContractId ?? '',
      effectiveFrom: l.effectiveFrom,
      effectiveTo: l.effectiveTo,
    })),
    on,
    on
  )
  if (!chosen) return null
  return links.find((l) => (l.buyContract?.id ?? l.buyContractId) === chosen.buyContractId)?.buyContract ?? null
}
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { checkOffCycle, carryLedger, OFF_CYCLE_LABEL, type CarryPeriod } from '@/lib/pay-model'
import { orderFor } from '@/lib/order-postings'
import { proposeBackPay, type BackPayLine } from '@/lib/money/back-pay'
import { amount } from '@/lib/money-display'

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
        // effectiveFrom/To, so the pick below is not "whatever Postgres
        // returned first".
        select: {
          buyContractId: true, sellContractId: true, effectiveFrom: true, effectiveTo: true,
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

  // `buyLinks[0]` was the first link in whatever order Postgres
  // returned. A consultant who changed sub-vendor has two, and which
  // one carries a share of the bill is not a coin toss.
  const asOf = new Date()
  const buy = pickBuy(sell.buyLinks, asOf)
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
      buyLinks: {
        select: {
          sellContractId: true, buyContractId: true, effectiveFrom: true, effectiveTo: true,
          buyContract: {
            select: {
              id: true, payCurrency: true, contractType: true, vendorCompanyId: true, supplierSellContractId: true,
              vendorCompany: { select: { name: true } },
            },
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

  const periodStart = body.periodStart ? new Date(String(body.periodStart)) : new Date(NaN)
  const payOn = body.payOn ? new Date(String(body.payOn)) : new Date()

  // ── Back pay a pay change proposed ───────────────────────────────
  //
  // Paid only as proposed. The figure is worked out again here from the
  // books, and a desk paying a different number — or a period that owes
  // nothing any more because it was paid — is refused in a sentence,
  // because a back payment typed in by hand is how the same difference
  // gets paid twice.
  const rateHistoryId = body.rateHistoryId ? String(body.rateHistoryId) : null
  let backPayLines: BackPayLine[] | null = null
  if (rateHistoryId) {
    const proposal = await proposeBackPay(rateHistoryId)
    const payerOk = proposal?.applies
      ? (await prisma.buyContract.findFirst({ where: { id: proposal.buyContractId, companyId }, select: { id: true } })) != null
      : false
    if (!proposal || !proposal.applies || !payerOk) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_BACK_PAY',
            message: proposal && !proposal.applies ? proposal.says : 'There is no back pay proposed on a line your company pays.',
          },
        },
        { status: 409 }
      )
    }
    const day = Number.isNaN(periodStart.getTime()) ? '' : periodStart.toISOString().slice(0, 10)
    const payment = proposal.figure.periods.find(
      (p) => p.periodStart === day && p.sellContractId === sellContractId && p.personId === personId
    )
    if (!payment) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_BACK_PAY',
            message:
              `No back pay is owed for the period starting ${day || 'on that day'} on this change any more — ` +
              `it may already have been paid. ${proposal.says}`,
          },
        },
        { status: 409 }
      )
    }
    if (Math.round(Number(body.amountCents)) !== payment.amountCents) {
      return NextResponse.json(
        {
          error: {
            code: 'BACK_PAY_MOVED',
            message:
              `The back pay for ${payment.label} is ${amount(payment.amountCents, proposal.currency)}, not ` +
              `${amount(Math.round(Number(body.amountCents)), proposal.currency)}. Pay what the books say, or ` +
              `record a correction for the difference with its own reason.`,
          },
        },
        { status: 409 }
      )
    }
    if (String(body.reason ?? 'RATE_AMENDMENT_LATE') !== 'RATE_AMENDMENT_LATE') {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Back pay for a pay change is paid as a rate change that landed after the cut-off.', field: 'reason' } },
        { status: 422 }
      )
    }
    body.reason = 'RATE_AMENDMENT_LATE'
    backPayLines = payment.lines
  }

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

  const buy = pickBuy(sell.buyLinks, payOn)
  // An off-cycle payment is payroll. A line paid through a supplier, the
  // worker's own company or a 1099 invoice is settled on the invoice
  // receipt instead, never here as well (lib/money/paid-through).
  if (buy && !paidByPayroll(buy)) {
    const person = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
    return NextResponse.json(
      {
        error: {
          code: 'NOT_PAYROLL',
          message: notPayrollSays({
            personName: person?.name ?? 'This worker',
            contractType: buy.contractType,
            vendorName: buy.vendorCompany?.name ?? null,
          }),
        },
      },
      { status: 422 }
    )
  }
  const amountCents = Math.round(Number(body.amountCents))

  // Deterministic, so a retried request does not pay somebody twice. The
  // pay day is part of the key because two off-cycle payments in one
  // period are legitimate — a correction and then a final settlement.
  const sourceId =
    `offcycle:${sellContractId}:${personId}:${payOn.toISOString().slice(0, 10)}:${String(body.reason)}` +
    // Back pay for two changes, or two periods, paid on one day is two
    // payments, never one.
    (rateHistoryId ? `:${rateHistoryId}:${periodStart.toISOString().slice(0, 10)}` : '')

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
        // The days this back pay settles and by how much, exact — what
        // the paid book reads so the next change is measured from here
        // (lib/payroll-paid).
        ...(backPayLines
          ? {
              rateHistoryId,
              approvedById: realPersonId(caller),
              backPay: backPayLines.map((l) => ({
                buyContractId: l.buyContractId, personId: l.personId, timesheetId: l.timesheetId,
                day: l.day, straightCents: l.straightCents, premiumCents: l.premiumCents,
              })),
            }
          : {}),
      },
      reversible: true,
    },
  })

  return NextResponse.json(
    { data: { posting: written, note: verdict.says } },
    { status: 201 }
  )
}
