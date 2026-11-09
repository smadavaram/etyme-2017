import { prisma } from '@/lib/db'
import { minorFromWhole } from '@/lib/money'
import { BILL_NOT_SENT, BILL_NEVER_COUNTED } from '@/lib/money/bill-state'

/**
 * What an order authorized, what has been billed on it, and what is left:
 * one definition, read by every screen that shows an order's money.
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The founder's scale audit, 2026-11-08. PO-2026-ADIVD read $466,700 left
 * on the placement's page and $481,600 left on Payables. The $14,900
 * between them was exactly two bills drafted and never sent: the
 * placement's page added every invoice on the order, drafts included,
 * while the order's page and the three-way check added only bills sent.
 * Two readers, two lists of what counts, two figures for one order.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 *   Billed  = bills sent on the order (not drafted, not raised and
 *             unsent, not cancelled or void), plus invoice receipts the
 *             payer typed in against it and has not cancelled. The same
 *             two kinds `drawnOnOrder` counts for the three-way check.
 *   Left    = Authorized − Billed. Negative is overdrawn, said as such.
 *   Drafted, not sent = bills drafted or raised on the order and not
 *             sent. Said apart and never inside Billed: nobody has been
 *             asked for that money yet.
 *
 * Only documents in the order's own currency are added. A document in
 * another currency is named by number and never converted: rupees and
 * dollars are not added. Where one exists, Billed and Left are still the
 * order's own currency's figures and `foreign` says what was left out.
 *
 * The arithmetic is `ledgerOf` and has no database in it; the read is
 * `orderLedgers`, one query per kind of document for any number of orders.
 */

/** A bill on the order, as the ledger needs it. `total` is whole currency, as `Invoice.total` stores it. */
export interface LedgerBill {
  number: string
  status: string
  currency: string | null
  total: { toString(): string } | number
}

/** A typed-in invoice receipt on the order. `totalCents` is minor units, as `VendorBill` stores it. */
export interface LedgerReceipt {
  number: string
  status: string
  currency: string | null
  totalCents: number
}

export interface OrderLedger {
  currency: string
  /** What the order authorized, in minor units of its currency. */
  authorizedMinor: number
  /** Bills sent plus invoice receipts not cancelled, in the order's currency. */
  billedMinor: number
  /** Authorized − Billed. Below zero is overdrawn. */
  leftMinor: number
  /** Bills drafted or raised on the order and not sent: drawing nothing, said apart. */
  draftedNotSentMinor: number
  /** How many such bills. */
  draftedNotSent: number
  /** Documents in another currency, by number, left out of every figure. */
  foreign: string[]
  overdrawn: boolean
}

/** Does this bill status count as billed? Sent from SUBMITTED on (lib/money/bill-state). */
export function billCountsAsBilled(status: string): boolean {
  const s = status.toUpperCase()
  return !BILL_NOT_SENT.includes(s) && !BILL_NEVER_COUNTED.includes(s)
}

/** Does this bill status say drafted or raised, and not sent? */
export function billIsDraftedNotSent(status: string): boolean {
  return BILL_NOT_SENT.includes(status.toUpperCase())
}

/** Does a typed-in invoice receipt in this status count as billed? Every one but a cancelled one. */
export function receiptCountsAsBilled(status: string): boolean {
  return status.toUpperCase() !== 'CANCELLED'
}

/**
 * Pure: an order's three figures, and its drafts said apart.
 * `amount` is the order's ceiling in whole currency, as `WorkOrder.amount` stores it.
 */
export function ledgerOf(order: {
  amount: { toString(): string } | number
  currency: string
  bills: readonly LedgerBill[]
  receipts: readonly LedgerReceipt[]
}): OrderLedger {
  const ccy = order.currency.toUpperCase()
  const authorizedMinor = minorFromWhole(order.amount, ccy)
  let billedMinor = 0
  let draftedNotSentMinor = 0
  let draftedNotSent = 0
  const foreign: string[] = []
  for (const b of order.bills) {
    const counts = billCountsAsBilled(b.status)
    const drafted = billIsDraftedNotSent(b.status)
    if (!counts && !drafted) continue
    if ((b.currency ?? ccy).toUpperCase() !== ccy) { foreign.push(b.number); continue }
    const minor = minorFromWhole(b.total, ccy)
    if (counts) billedMinor += minor
    else { draftedNotSentMinor += minor; draftedNotSent++ }
  }
  for (const r of order.receipts) {
    if (!receiptCountsAsBilled(r.status)) continue
    if ((r.currency ?? ccy).toUpperCase() !== ccy) { foreign.push(r.number); continue }
    billedMinor += r.totalCents
  }
  const leftMinor = authorizedMinor - billedMinor
  return {
    currency: ccy,
    authorizedMinor,
    billedMinor,
    leftMinor,
    draftedNotSentMinor,
    draftedNotSent,
    foreign,
    overdrawn: leftMinor < 0,
  }
}

/**
 * Every order's ledger, by order id, in one read per kind of document.
 * An order that does not exist is absent from the map.
 */
export async function orderLedgers(orderIds: readonly string[]): Promise<Map<string, OrderLedger>> {
  const ids = [...new Set(orderIds)]
  const out = new Map<string, OrderLedger>()
  if (ids.length === 0) return out
  const [orders, bills, receipts] = await Promise.all([
    prisma.workOrder.findMany({ where: { id: { in: ids } }, select: { id: true, amount: true, currency: true } }),
    prisma.invoice.findMany({
      where: { workOrderId: { in: ids }, status: { notIn: [...BILL_NEVER_COUNTED] as any } },
      select: { workOrderId: true, number: true, status: true, currency: true, total: true },
    }),
    prisma.vendorBill.findMany({
      where: { workOrderId: { in: ids }, status: { not: 'CANCELLED' } },
      select: { workOrderId: true, number: true, status: true, currency: true, totalCents: true },
    }),
  ])
  for (const o of orders) {
    out.set(o.id, ledgerOf({
      amount: o.amount,
      currency: o.currency,
      bills: bills.filter((b) => b.workOrderId === o.id),
      receipts: receipts.filter((r) => r.workOrderId === o.id),
    }))
  }
  return out
}

/** One order's ledger, or null where there is no such order. */
export async function orderLedger(orderId: string): Promise<OrderLedger | null> {
  return (await orderLedgers([orderId])).get(orderId) ?? null
}

/**
 * What each sell line has billed, by line: invoice lines on bills sent,
 * and apart from them the lines on bills drafted or raised and not sent.
 * Hours and money both, money in the bill's own currency per line (a line
 * bills in one currency; a line in two is said by `currencies`).
 *
 * The order's page, the placement's page and the line's own figure read
 * this, so "billed" on a line is the same sent-only figure as on its order.
 */
export interface LineBilled {
  billedHours: number
  billedMinor: number
  draftedHours: number
  draftedMinor: number
  /** Every currency a counted bill on this line was in. One, almost always. */
  currencies: string[]
}

export async function linesBilled(sellContractIds: readonly string[]): Promise<Map<string, LineBilled>> {
  const ids = [...new Set(sellContractIds)]
  const out = new Map<string, LineBilled>()
  for (const id of ids) out.set(id, { billedHours: 0, billedMinor: 0, draftedHours: 0, draftedMinor: 0, currencies: [] })
  if (ids.length === 0) return out
  const rows = await prisma.invoiceLine.findMany({
    where: { sellContractId: { in: ids }, invoice: { status: { notIn: [...BILL_NEVER_COUNTED] as any } } },
    select: { sellContractId: true, hours: true, amountCents: true, invoice: { select: { status: true, currency: true } } },
  })
  for (const r of rows) {
    const at = r.sellContractId ? out.get(r.sellContractId) : undefined
    if (!at) continue
    const ccy = r.invoice.currency.toUpperCase()
    if (!at.currencies.includes(ccy)) at.currencies.push(ccy)
    const hours = Number(r.hours ?? 0)
    if (billCountsAsBilled(r.invoice.status)) { at.billedHours += hours; at.billedMinor += r.amountCents }
    else if (billIsDraftedNotSent(r.invoice.status)) { at.draftedHours += hours; at.draftedMinor += r.amountCents }
  }
  for (const v of out.values()) {
    v.billedHours = Math.round(v.billedHours * 100) / 100
    v.draftedHours = Math.round(v.draftedHours * 100) / 100
  }
  return out
}
