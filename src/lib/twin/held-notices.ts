/**
 * The twin's notices about a held invoice receipt that nothing holds any
 * more. The nightly run tells the paying team when a receipt does not
 * match, or is held on the supplier's bank details
 * (`invoice_receipt.flag_mismatch`, titled by `mismatchTitle`). Once the
 * receipt is paid, voided or cancelled, the line is not carried in "Since
 * you last looked": the greeting withholds it and marks it read with the
 * rest, which closes it (walk 7, 2026-11-08: "PR-2026-0441 … does not
 * match what was accepted" stayed after it was paid).
 *
 * Whether a receipt is still held is `stillHeld` in the twin's invoice
 * rule; a receipt that is settled is never held, whatever the verdict,
 * so only its status is read here. One query, never one per notice.
 */

import { prisma } from '@/lib/db'
import { stillHeld } from '@/lib/twin/rules/invoice'

export const RECEIPT_FLAG_ACT = 'invoice_receipt.flag_mismatch'

interface NoticeRow { id: string; entityId: string | null; data: unknown }

function twinActOf(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const act = (data as Record<string, unknown>).twinAction
  return typeof act === 'string' ? act : null
}

/** The notices among these that are the twin's hold or mismatch line about a receipt. Pure. */
export function receiptFlagNotices<T extends NoticeRow>(rows: readonly T[]): T[] {
  return rows.filter((n) => n.entityId && twinActOf(n.data) === RECEIPT_FLAG_ACT)
}

/**
 * Whether the line about a receipt in this status is closed: settled
 * means nothing holds it. A status nobody can read keeps the line. Pure.
 */
export function flagClosedBy(status: string | null | undefined): boolean {
  if (!status) return false
  // The verdict stands in only so `stillHeld` reads the status; a held
  // receipt that is not settled keeps its line.
  return !stillHeld({ verdict: 'MISMATCH', payable: false, heldOn: null }, status)
}

/** The ids of the notices whose receipt is paid, voided or cancelled since. Never throws. */
export async function closedFlagNotices(rows: readonly NoticeRow[]): Promise<Set<string>> {
  const flagged = receiptFlagNotices(rows)
  if (flagged.length === 0) return new Set()
  try {
    const ids = [...new Set(flagged.map((n) => n.entityId!))]
    const invoices = await prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } })
    const closed = new Set(invoices.filter((i) => flagClosedBy(i.status)).map((i) => i.id))
    return new Set(flagged.filter((n) => closed.has(n.entityId!)).map((n) => n.id))
  } catch {
    return new Set()
  }
}
