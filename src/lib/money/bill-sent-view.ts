import { formatDay } from '@/lib/format-date'
import { BILL_NOT_SENT } from '@/lib/money/bill-state'
import { hasPermission } from '@/lib/permissions'

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

/**
 * Whether this seat is offered Send (or "Submit for payment") on a bill:
 * only the firm that raised it, only on a bill drafted or raised and not
 * sent, only a seat that sends bills, and never from a seat in another
 * company's book. Walk 9 (2026-11-09): the button was drawn on Northbend's
 * seats over Brightmoor's raised bill, and every press was refused.
 */
export function offersSubmit(a: {
  status: string
  direction: 'RECEIVABLE' | 'PAYABLE' | 'NEITHER' | string
  permissions: readonly string[] | null
  readingInASeat?: boolean
}): boolean {
  if (a.readingInASeat) return false
  if (a.direction !== 'RECEIVABLE') return false
  if (!offersSend(a.status)) return false
  return a.permissions != null && hasPermission(a.permissions, 'invoices.issue')
}

/**
 * The sentence for a seat that is not at the firm that raised a bill and
 * presses Send anyway: who sends it, and that the reader pays it once it
 * is sent. Never a role at the reader's own firm, which cannot send it.
 * Null where the reader's firm raised it.
 */
export function notYoursToSendSays(parties: {
  vendor: { id: string; name?: string | null } | null
  client: { id: string; name?: string | null } | null
}, companyId: string | null | undefined): string | null {
  // Where the agreement and the order name no seller, the send's own
  // check (`mayBeSent`, by the lines) decides; nothing is refused here.
  if (!parties.vendor) return null
  if (companyId && parties.vendor.id === companyId) return null
  const seller = parties.vendor.name?.trim() || 'the firm that raised it'
  if (companyId && parties.client?.id === companyId) {
    return `${seller} sends this bill, not your company. Once ${seller} sends it, it is yours to check and pay.`
  }
  return `A bill is sent by the firm that raised it, ${seller}.`
}
