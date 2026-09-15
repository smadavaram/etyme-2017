import { prisma } from '@/lib/db'
import { threeWayMatch, decimalToCents, type MatchInput, type MatchResult } from '@/lib/three-way-match'
import { rateInForce } from '@/lib/contract-rate'
import { bandsOf, billableInPeriod, periodFor, type Band, type Period, type Terms } from '@/lib/periods'
import { policyOf, type Decision } from '@/lib/overtime'

/**
 * A line as this file needs to read it: the money on it, and the records
 * it was priced from.
 *
 * Deliberately structural rather than a Prisma type — two callers load
 * it, and a shape they both satisfy is what stops them drifting apart.
 */
export interface PricedLine {
  hours: unknown
  rateCents: number
  amountCents: number
  sellContractId: string | null
  timesheet: {
    id: string
    periodStart: Date
    periodEnd: Date
    totalHours: unknown
    days: unknown
    leaveDays: unknown
    sellContractId: string
    overtimeDecisions: {
      sellContractId: string
      weekOf: Date
      treatment: string
      appliedBps: number
      overtimeHours: unknown
      accrualBps: number
    }[]
    sellContract: {
      overtimeAfterHours: number | null
      overtimeMultiplierBps: number
      billStraddle: string
    }
  } | null
}

export interface Working {
  /** The two or three lines a paper invoice would have printed. */
  bands: Band[]
  /** What the line is worth above plain hours × rate. */
  premiumCents: number
}

/**
 * Price a line again from the approval records, and cut the answer into
 * the bands a person would expect to read.
 *
 * One function, two readers. The three-way match asks it whether the
 * line's arithmetic stands up, and the invoice screen asks it what to
 * print under the amount — and because it is the same call, a client
 * cannot be shown a working the match disagrees with.
 *
 * Null where there is nothing to recompute from: no timesheet behind the
 * line, no decision on this leg, or straight-time work. Then the line is
 * hours × rate and always was, which is what every invoice raised before
 * overtime became a decision looks like.
 */
export function recompute(line: PricedLine, period: Period): Working | null {
  const ts = line.timesheet
  if (!ts) return null

  // The answers on the leg being billed, or — in a chain, where approval
  // records one decision per timesheet — the ones on the leg the hours
  // live on. Same rule the invoice priced by.
  const ownLeg = ts.overtimeDecisions.filter(
    (d) => d.sellContractId === (line.sellContractId ?? ts.sellContractId)
  )
  const answering = ownLeg.length > 0 ? ownLeg : ts.overtimeDecisions
  if (answering.length === 0) return null

  const decisions: Decision[] = answering.map((d) => ({
    weekOf: d.weekOf.toISOString().slice(0, 10),
    treatment: d.treatment as Decision['treatment'],
    appliedBps: d.appliedBps,
    overtimeHours: Number(d.overtimeHours),
    accrualBps: d.accrualBps,
  }))

  const billable = billableInPeriod(
    {
      id: ts.id,
      periodStart: ts.periodStart,
      periodEnd: ts.periodEnd,
      days: (ts.days as Record<string, number>) ?? {},
      leaveDays: (ts.leaveDays as Record<string, number>) ?? {},
      totalHours: Number(ts.totalHours),
    },
    period,
    ts.sellContract.billStraddle as Terms['straddle'],
    line.rateCents,
    policyOf(ts.sellContract),
    decisions
  )
  if (!billable) return null

  const bands = bandsOf(billable.split, line.rateCents)

  return {
    // Shown only where they add up to what was actually billed. A
    // working a cent out of the amount beside it is the same fault as a
    // line that does not multiply out, and the honest answer is to print
    // the amount and say what it is made of in words instead.
    bands: bands.reduce((n, b) => n + b.amountCents, 0) === line.amountCents ? bands : [],
    premiumCents: billable.value.totalCents - Math.round(Number(line.hours) * line.rateCents),
  }
}


/**
 * Load the three records and match them.
 *
 * Kept apart from any route because more than one path needs the same
 * answer — reviewing an invoice, submitting it, approving it for payment —
 * and a control that each caller re-implements is a control that eventually
 * disagrees with itself.
 */
export async function matchInvoice(invoiceId: string): Promise<MatchResult | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      invoiceLines: {
        include: {
          person: { select: { name: true } },
          expense: { select: { id: true, status: true, total: true } },
          milestone: { select: { id: true, status: true, amountCents: true } },
          timesheet: {
            select: {
              id: true, status: true, totalHours: true,
              // Both ends. The engine needs to know when the work was
              // done, not just when to price it from.
              periodStart: true, periodEnd: true,
              sellContractId: true,
              // The daily hours and the answers given about the weeks
              // that went over the line, so the extension check can add
              // up a premium somebody signed instead of calling it bad
              // arithmetic.
              days: true, leaveDays: true,
              overtimeDecisions: true,
              sellContract: {
                select: {
                  billRate: true, startDate: true,
                  overtimeAfterHours: true, overtimeMultiplierBps: true,
                  billFrequency: true, billAnchor: true, billStraddle: true,
                },
              },
            },
          },
        },
      },
      purchaseOrder: true,
      matchOverrides: { include: { by: { select: { name: true } } } },
      engagement: {
        select: { sellContracts: { select: { purchaseOrderId: true }, take: 1 } },
      },
    },
  })

  if (!invoice) return null
  // Narrowed once, so the helpers below can read it without TypeScript
  // re-asking whether the invoice exists.
  const inv = invoice

  // What else has drawn on this purchase order. Computed rather than stored:
  // a denormalised balance drifts, and a drifted ceiling is worse than none.
  let consumedCents = 0
  if (invoice.purchaseOrderId) {
    const others = await prisma.invoice.findMany({
      where: {
        purchaseOrderId: invoice.purchaseOrderId,
        id: { not: invoice.id },
        status: { notIn: ['VOID', 'CANCELLED', 'DRAFT'] },
      },
      select: { total: true },
    })
    consumedCents = others.reduce((s, i) => s + decimalToCents(i.total), 0)
  }

  // The rate the contract carried on the day the work was done. Amendments
  // are effective-dated and approved, so a rate that genuinely changed is
  // expressed on the contract rather than argued about on the invoice.
  const contractIds = [...new Set(invoice.invoiceLines.flatMap(l => (l.sellContractId ? [l.sellContractId] : [])))]
  const rateRows = contractIds.length
    ? await prisma.rateHistory.findMany({
        where: { contractType: 'SELL', contractId: { in: contractIds } },
        select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
      })
    : []

  function contractedRateFor(contractId: string, fallbackCents: number, asOf: Date): number {
    return rateInForce(
      fallbackCents,
      rateRows
        .filter(r => r.contractId === contractId)
        .map(r => ({
          id: r.id, rateCents: r.rate, fromDate: r.fromDate,
          toDate: r.toDate, approvalState: r.approvalState,
        })),
      asOf
    ).rateCents
  }

  // What the contract says this invoice should be billing.
  //
  // Read from the first line's contract: an invoice consolidates people on
  // one engagement, and an engagement carries one billing cycle. Null when
  // no line has a contract to ask, in which case the check stays silent
  // rather than inventing an opinion.
  const terms = invoice.invoiceLines.find(l => l.timesheet)?.timesheet?.sellContract
  const contractPeriod = terms
    ? periodFor(invoice.periodStart, {
        frequency: terms.billFrequency as Terms['frequency'],
        anchor: terms.billAnchor as Terms['anchor'],
        straddle: terms.billStraddle as Terms['straddle'],
        startedOn: terms.startDate,
      })
    : null

  const premiumOn = (line: PricedLine): number | null =>
    recompute(line, { start: inv.periodStart, end: inv.periodEnd, label: '' })?.premiumCents ?? null

  const input: MatchInput = {
    invoice: {
      id: invoice.id,
      totalCents: decimalToCents(invoice.total),
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      contractPeriod,
    },
    lines: invoice.invoiceLines.map(l => ({
      id: l.id,
      timesheetId: l.timesheetId,
      expenseId: l.expenseId,
      milestoneId: l.milestoneId,
      personName: l.person?.name ?? (l.milestone ? 'Milestone' : 'Expense'),
      hours: Number(l.hours),
      rateCents: l.rateCents,
      amountCents: l.amountCents,
      premiumCents: premiumOn(l),
    })),
    milestones: Object.fromEntries(
      invoice.invoiceLines
        .flatMap(l => (l.milestone ? [l.milestone] : []))
        .map(m => [m.id, { id: m.id, status: m.status, amountCents: m.amountCents }])
    ),
    expenses: Object.fromEntries(
      invoice.invoiceLines
        .flatMap(l => (l.expense ? [l.expense] : []))
        .map(e => [e.id, { id: e.id, status: e.status, totalCents: decimalToCents(e.total) }])
    ),
    timesheets: Object.fromEntries(
      invoice.invoiceLines
        // An expense line has no timesheet behind it; the engine reads
        // its amount and checks nothing about hours.
        .flatMap(l => (l.timesheet ? [{ ...l, timesheet: l.timesheet }] : []))
        .map(l => [
          l.timesheet.id,
          {
            id: l.timesheet.id,
            status: l.timesheet.status,
            approvedHours: Number(l.timesheet.totalHours),
            periodStart: l.timesheet.periodStart,
            periodEnd: l.timesheet.periodEnd,
            // Resolved as of the work period, not "whatever the contract
            // says today" — otherwise amending a rate retroactively breaks
            // every invoice already paid.
            contractRateCents: contractedRateFor(
              l.sellContractId ?? l.timesheet.sellContractId,
              l.timesheet.sellContract.billRate,
              l.timesheet.periodStart
            ),
            // The unique constraint on InvoiceLine.timesheetId means a
            // timesheet reachable from THIS invoice cannot also be on
            // another, so this is always self-referential here. It stays in
            // the engine's input because the engine is also used to check
            // an invoice before its lines are written.
            alreadyBilledOnInvoiceId: invoice.id,
          },
        ])
    ),
    po: invoice.purchaseOrder
      ? {
          id: invoice.purchaseOrder.id,
          number: invoice.purchaseOrder.number,
          status: invoice.purchaseOrder.status,
          amountCents: decimalToCents(invoice.purchaseOrder.amount),
          consumedCents,
          startDate: invoice.purchaseOrder.startDate,
          endDate: invoice.purchaseOrder.endDate,
        }
      : null,
    // A PO is required once the contract being billed was raised against one.
    poRequired: Boolean(invoice.engagement.sellContracts[0]?.purchaseOrderId),
    // Exceptions an AP clerk has recorded. The engine decides which of them
    // it will honor; a waiver on a duplicate payment is simply ignored.
    overrides: invoice.matchOverrides.map(o => ({
      code: o.code as any,
      reason: o.reason,
      byName: o.by.name,
      at: o.createdAt,
    })),
  }

  return threeWayMatch(input)
}
