import { amount } from '@/lib/money-display'
import { daysSays } from './words'

/**
 * An invoice receipt waiting for this firm to pay it, as a row on its
 * queue.
 *
 * The queue held a receipt only once it was disputed. A supplier's
 * invoice that arrived, was sent through the three-way check and waited
 * to be paid sat on the Invoice receipts page and on nobody's list, so
 * the AP clerk read "Nothing needs you" over money owed (simulation,
 * 2026-10-20). Now the desk that records payments hears it.
 *
 * Whether it may be paid is the payment route's question, through
 * `mayPayInvoiceReceipt` in `lib/invoice-match`; the row only says it is
 * waiting, and opens the receipt where the check is shown. A receipt the
 * twin has already put to this seat as a question is that question's
 * row, never a second one.
 *
 * Pure: no database.
 */

export interface ReceiptToPay {
  id: string
  number: string
  /** The firm that sent it — this firm's own supplier, a name it already knows. */
  vendorName: string
  /** What is still owed on it, in minor units. */
  outstandingCents: number
  currency: string
  dueAt: Date
  /** When it reached this firm, where known. */
  receivedAt: Date | null
}

export interface ReceiptToPayDecision {
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  entityType: 'INVOICE'
  entityId: string
  dueDate: string
  actionUrl: string
  /** Whole dollars, as every other row; null in another currency, which the page's dollar total cannot add. */
  amount: number | null
  createdAt: string
}

const DAY = 86_400_000

/** "due in 3 days", "due today", "due tomorrow", "5 days past due". */
export function dueSays(dueAt: Date, now: Date): string {
  const days = Math.round((Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), dueAt.getUTCDate()) -
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days > 1) return `due in ${daysSays(days)}`
  return `${daysSays(-days)} past due`
}

export function receiptToPayDecision(r: ReceiptToPay, now: Date): ReceiptToPayDecision {
  const currency = (r.currency || 'USD').toUpperCase()
  const daysToDue = Math.floor((r.dueAt.getTime() - now.getTime()) / DAY)
  return {
    title: `Pay invoice receipt — ${r.vendorName}`,
    subtitle: `Invoice ${r.number} · ${amount(r.outstandingCents, currency)} · ${dueSays(r.dueAt, now)}`,
    urgency: daysToDue < 0 ? 'HIGH' : daysToDue <= 7 ? 'MEDIUM' : 'LOW',
    entityType: 'INVOICE',
    entityId: r.id,
    dueDate: r.dueAt.toISOString(),
    actionUrl: `/dashboard/invoices/${r.id}`,
    amount: currency === 'USD' ? r.outstandingCents / 100 : null,
    createdAt: (r.receivedAt ?? r.dueAt).toISOString(),
  }
}
