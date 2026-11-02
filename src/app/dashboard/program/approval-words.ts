/**
 * The words on an Approvals row, out of the page so they can be read by a
 * test (a page may export nothing but itself).
 *
 * A week's figure is its hours and a claim's is its money. The row used to
 * print both as dollars, so a 45-hour week read "$45.00" (the screen walk,
 * 2026-11-02): the queue carries `totalHours` for a week and `total` for an
 * expense in the one `amount` field, and only the kind says which.
 */
import type { ReasonAsked } from '@/lib/award/reason-asked'

/** What the page's approve hands back to the row: done, or the route's own question. */
export type Approved = { ok: boolean; asked?: ReasonAsked }

export function approvalAmountSays(item: { kind: 'timesheet' | 'expense'; amount: number | null }): string {
  if (item.amount == null) return ''
  if (item.kind === 'timesheet') {
    const h = Number.isInteger(item.amount) ? String(item.amount) : item.amount.toFixed(2)
    return ` · ${h} hour${item.amount === 1 ? '' : 's'}`
  }
  // An expense carries no currency of its own on the record; the queue's
  // claims are in the client's own dollars, as the page has always read them.
  return ` · $${item.amount.toFixed(2)}`
}
