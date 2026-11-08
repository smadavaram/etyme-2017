/**
 * An invoice receipt that did not match, as a row on somebody's queue.
 *
 * Two kinds of mismatch, and they belong to two different desks.
 *
 *   - **Waivable.** The rate, the hours, the order's ceiling — a check
 *     somebody with authority may override with a reason (Addendum E:
 *     warn, capture a reason, proceed). The AP desk decides, so it goes
 *     to whoever may record a payment, and it says the bill is held out
 *     of payment runs until somebody says why it should go in.
 *
 *   - **Blocked by a week the paying firm has not accepted.** The founder,
 *     2026-09-28 (CLAUDE.md, "The signed week travels down the chain"):
 *     no rung pays on a week it has not accepted, and there is no
 *     "approve anyway". Nobody can say why it should go in, so offering
 *     that to the AP clerk would be offering a button the payment route
 *     refuses. The only way forward is to accept the week, so the row
 *     goes to the desk that accepts weeks and carries money's own
 *     sentence (`notAcceptedSays` in `lib/money/payers-acceptance`),
 *     never a second wording of it.
 *
 * Pure: the route reads the bill and asks money which weeks are waiting;
 * this decides who hears and what the row says.
 */

import { amount as money } from '@/lib/money-display'

export interface DisputedBill {
  id: string
  number: string
  vendorName: string
  totalCents: number
  /** The currency the receipt is in; dollars where a caller does not say. */
  currency?: string
  dueAt: Date | null
  receivedAt: Date
}

/** The row, less its category, which the queue's own list of types sets. */
export interface DisputedBillDecision {
  title: string
  subtitle: string
  urgency: 'HIGH'
  entityType: 'VENDOR_BILL'
  entityId: string
  dueDate: string | null
  actionUrl: string
  /** Whole dollars, as every other row; null in another currency, which the page's dollar total cannot add. */
  amount: number | null
  createdAt: string
}

/**
 * The row for one disputed invoice receipt, or null where the reader is
 * not the desk that can move it.
 *
 * `notAccepted` is money's sentence naming the weeks the paying firm has
 * not accepted — empty or null where every week is accepted and the
 * mismatch is one somebody may waive.
 */
export function disputedBillDecision(
  bill: DisputedBill,
  notAccepted: string | null,
  desk: { mayRecordPayment: boolean; mayAcceptWeeks: boolean }
): DisputedBillDecision | null {
  const blocked = Boolean(notAccepted && notAccepted.trim())
  if (blocked ? !desk.mayAcceptWeeks : !desk.mayRecordPayment) return null

  const currency = (bill.currency || 'USD').toUpperCase()
  // In the receipt's own currency, with that currency's own decimals.
  const amount = money(bill.totalCents, currency)
  return {
    title: blocked
      ? `Invoice receipt ${bill.number} from ${bill.vendorName} waits on a week you have not accepted`
      : `Invoice receipt ${bill.number} from ${bill.vendorName} does not match`,
    subtitle: blocked
      ? `${amount} · ${notAccepted!.trim()}`
      : `${amount} · held out of payment runs until somebody says why it should go in`,
    urgency: 'HIGH',
    entityType: 'VENDOR_BILL',
    entityId: bill.id,
    dueDate: bill.dueAt?.toISOString() ?? null,
    actionUrl: blocked ? '/dashboard/timesheets' : '/dashboard/ap',
    amount: currency === 'USD' ? bill.totalCents / 100 : null,
    createdAt: bill.receivedAt.toISOString(),
  }
}
