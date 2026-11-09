import { formatDay } from '@/lib/format-date'
import { BILL_NOT_SENT } from '@/lib/money/bill-state'

/**
 * A bill on a screen, the moment it is sent.
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The founder's tester, 2026-11-08 (P6): after Send, the bill went on
 * reading Draft and "Nothing has been sent" until a manual reload, and the
 * button beside it invited a second press. The route refuses a second
 * sending in a sentence (`mayBeSent` in lib/money/bill-send: "has already
 * been sent … so it cannot be sent again"); the page did not say so,
 * because it waited for a fresh read before it changed a word.
 *
 * So a page applies the route's own reply at once: the status the route
 * wrote, the day it was sent, and whom it reached. The fresh read after it
 * only confirms. Pure: no database, no React.
 */

/** Send is offered only on a bill nobody has been sent: drafted or raised. */
export function offersSend(status: string): boolean {
  return BILL_NOT_SENT.includes(status.toUpperCase())
}

/** "Sent to Northbend Athletic on Nov 9, 2026." Where the delivery said its own sentence, that sentence. */
export function sentSays(payerName: string | null | undefined, submittedAt: string | Date, delivery?: string | null): string {
  if (delivery && delivery.trim()) return delivery.trim()
  return `Sent to ${payerName?.trim() || 'the customer'} on ${formatDay(submittedAt)}.`
}

export interface SentReply {
  invoice?: { status?: string | null; submittedAt?: string | null } | null
  delivery?: string | null
}

/**
 * A bill row with the route's reply applied: its new status, the day it
 * was sent, and the sentence that says so. A reply that names no status
 * leaves the row as it was, so a page never claims a sending the route
 * did not report.
 */
export function sentInPlace<T extends { status: string; submittedAt?: string | null; deliverySays?: string | null }>(
  row: T,
  reply: SentReply,
  payerName: string | null | undefined,
): T {
  const status = reply.invoice?.status
  if (!status || offersSend(status)) return row
  const at = reply.invoice?.submittedAt ?? new Date().toISOString()
  return { ...row, status, submittedAt: at, deliverySays: sentSays(payerName, at, reply.delivery) }
}

/** The bulk Send's results applied to a list, row by row. Rows not sent are left as they were. */
export function sentRowsInPlace<T extends { id: string; status: string; submittedAt?: string | null; deliverySays?: string | null }>(
  rows: readonly T[],
  results: readonly ({ invoiceId: string; status: string } & SentReply)[],
  payerOf: (row: T) => string | null | undefined,
): T[] {
  const sent = new Map(results.filter((r) => r.status === 'submitted').map((r) => [r.invoiceId, r]))
  return rows.map((row) => {
    const r = sent.get(row.id)
    return r ? sentInPlace(row, r, payerOf(row)) : row
  })
}
