import { prisma } from '@/lib/db'
import { threeWayMatch, decimalToCents, type MatchInput, type MatchResult } from '@/lib/three-way-match'
import { rateInForce } from '@/lib/contract-rate'
import { periodFor, type Terms } from '@/lib/periods'

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
          timesheet: {
            select: {
              id: true, status: true, totalHours: true,
              // Both ends. The engine needs to know when the work was
              // done, not just when to price it from.
              periodStart: true, periodEnd: true,
              sellContractId: true,
              sellContract: {
                select: {
                  billRate: true, startDate: true,
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
  const contractIds = [...new Set(invoice.invoiceLines.map(l => l.sellContractId))]
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
      personName: l.person.name,
      hours: Number(l.hours),
      rateCents: l.rateCents,
      amountCents: l.amountCents,
    })),
    timesheets: Object.fromEntries(
      invoice.invoiceLines
        .filter(l => l.timesheet)
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
              l.sellContractId,
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
    // it will honour; a waiver on a duplicate payment is simply ignored.
    overrides: invoice.matchOverrides.map(o => ({
      code: o.code as any,
      reason: o.reason,
      byName: o.by.name,
      at: o.createdAt,
    })),
  }

  return threeWayMatch(input)
}
