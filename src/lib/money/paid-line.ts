/**
 * The line an invoice receipt is paid on, from either end of the trade.
 *
 * A firm that pays a sub-vendor holds a buy line to it, and a receipt
 * typed in from the sub-vendor's invoice is checked against that line:
 * its rate, its people, the order it draws on and the supplier's own
 * contract below it, where the hours are filed.
 *
 * A client holds no buy line. What it pays is the supplier's sell line
 * whose customer is the client: the rung it pays (lib/chain-top), with
 * the bill rate on it, the person on it and the client's own order
 * behind it. The second screen walk, 2026-11-03: the client's AP clerk
 * was offered "Record an invoice receipt" with a supplier list that was
 * always empty, because the form read buy lines only. That sell line is
 * the client's side of the same line, so the check reads both through
 * this one shape and cannot hold a client to a different rule.
 *
 * Nothing is written. A sell line is offered to the payer only where it
 * is the payer's customer on that line, and to nobody else.
 */

import { prisma } from '@/lib/db'
import { ratePeriods, type RatePeriod } from '@/lib/contract-rate'
import { ladderFor } from '@/lib/work-chain-read'
import { descend } from '@/lib/work-chain'

export interface PaidLine {
  side: 'BUY' | 'SELL'
  id: string
  /** Who pays on it. */
  payerCompanyId: string
  /** Who is paid on it. Null on a buy line with no supplier (a W2). */
  vendorCompanyId: string | null
  /** The order it draws on. */
  workOrderId: string | null
  /** The supplier's contract to the payer: a buy line's `supplierSellContractId`; a sell line is itself. */
  supplierSellContractId: string | null
  /** What an overtime hour is worth on this pair. */
  overtimeMultiplierBps: number
  /** The people paid for on it, at the rate the payer pays and in that currency. */
  candidates: { personId: string; payRate: number; payCurrency: string }[]
  /** The payer's own sell lines a buy line funds. Empty on a sell line. */
  linked: string[]
  /** The agreed rate's history. */
  periods: RatePeriod[]
}

/** "this buy line", or the client's word for its side of it. */
export function lineWord(line: Pick<PaidLine, 'side'> | null): string {
  return line?.side === 'SELL' ? 'this contractor’s line' : 'this buy line'
}

export async function paidBuyLine(buyContractId: string): Promise<PaidLine | null> {
  const b = await prisma.buyContract.findUnique({
    where: { id: buyContractId },
    select: {
      id: true, companyId: true, vendorCompanyId: true, workOrderId: true, supplierSellContractId: true, overtimeMultiplierBps: true,
      candidates: { select: { personId: true, payRate: true, payCurrency: true } },
    },
  })
  if (!b) return null
  const [links, history] = await Promise.all([
    prisma.contractLink.findMany({ where: { buyContractId }, select: { sellContractId: true } }),
    prisma.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: buyContractId },
      select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    }),
  ])
  return {
    side: 'BUY',
    id: b.id,
    payerCompanyId: b.companyId,
    vendorCompanyId: b.vendorCompanyId,
    workOrderId: b.workOrderId,
    supplierSellContractId: b.supplierSellContractId,
    overtimeMultiplierBps: b.overtimeMultiplierBps,
    candidates: b.candidates,
    linked: links.map((l) => l.sellContractId),
    periods: ratePeriods(history),
  }
}

/** A supplier's sell line, as the customer on it pays it. Null where it is not that payer's to pay. */
export async function paidSellLine(sellContractId: string, payerCompanyId: string): Promise<PaidLine | null> {
  const s = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      id: true, companyId: true, clientCompanyId: true, personId: true, workOrderId: true,
      billRate: true, billCurrency: true, overtimeMultiplierBps: true,
    },
  })
  if (!s || s.clientCompanyId !== payerCompanyId || s.companyId === payerCompanyId) return null
  const history = await prisma.rateHistory.findMany({
    where: { contractType: 'SELL', contractId: sellContractId },
    select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  return {
    side: 'SELL',
    id: s.id,
    payerCompanyId,
    vendorCompanyId: s.companyId,
    workOrderId: s.workOrderId,
    supplierSellContractId: s.id,
    overtimeMultiplierBps: s.overtimeMultiplierBps,
    candidates: [{ personId: s.personId, payRate: s.billRate, payCurrency: s.billCurrency }],
    linked: [],
    periods: ratePeriods(history),
  }
}

/**
 * The supplier's sell lines a client pays this supplier on: the rung it
 * pays, never one below it, and never one the payer also holds a buy line
 * against (a prime paying a sub-vendor checks that on its buy line).
 */
export async function clientLinesFrom(payerCompanyId: string, vendorCompanyId: string, workOrderId?: string | null) {
  const ownBuys = await prisma.buyContract.findMany({
    where: { companyId: payerCompanyId, supplierSellContractId: { not: null } },
    select: { supplierSellContractId: true },
  })
  const viaBuy = new Set(ownBuys.map((b) => b.supplierSellContractId!))
  const rows = await prisma.sellContract.findMany({
    where: {
      clientCompanyId: payerCompanyId,
      companyId: vendorCompanyId,
      state: { not: 'DRAFT' },
      ...(workOrderId !== undefined ? { workOrderId } : {}),
    },
    select: { id: true, personId: true, workOrderId: true },
  })
  return rows.filter((r) => !viaBuy.has(r.id))
}

/**
 * Which of the supplier's sell lines a stored receipt with no buy line is
 * for, read off the record: the line whose chain holds the weeks and
 * expenses its lines bill, else — for a total — the one line from that
 * supplier on the order it draws on. Null where the record cannot say,
 * and then the check says so rather than guess.
 *
 * A column naming the line on the receipt would make this a read; it is
 * a schema request for the architect (`VendorBill.sellContractId`). The
 * intake refuses a total where the order holds more than one line from
 * the supplier, so what it lets in can always be read back.
 */
export async function clientLineOf(i: {
  companyId: string
  vendorCompanyId: string
  workOrderId: string | null
  timesheetIds: string[]
  expenseIds: string[]
}): Promise<string | null> {
  const lines = await clientLinesFrom(i.companyId, i.vendorCompanyId)
  if (lines.length === 0) return null
  const filedOn = new Map<string, { sellContractId: string; personId: string }>()
  if (i.timesheetIds.length > 0) {
    for (const t of await prisma.timesheet.findMany({ where: { id: { in: i.timesheetIds } }, select: { id: true, sellContractId: true, personId: true } })) {
      filedOn.set(t.id, t)
    }
  }
  if (i.expenseIds.length > 0) {
    for (const e of await prisma.expense.findMany({ where: { id: { in: i.expenseIds } }, select: { id: true, sellContractId: true, personId: true } })) {
      filedOn.set(e.id, e)
    }
  }
  if (filedOn.size > 0) {
    const rungs = await ladderFor(lines.map((l) => l.id))
    const hit = lines.filter((l) => {
      const below = new Set(descend(l.id, rungs))
      return [...filedOn.values()].some((f) => below.has(f.sellContractId) && f.personId === l.personId)
    })
    return hit.length === 1 ? hit[0].id : null
  }
  const onOrder = lines.filter((l) => l.workOrderId === i.workOrderId)
  return onOrder.length === 1 ? onOrder[0].id : null
}
