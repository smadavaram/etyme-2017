/**
 * An invoice receipt held on the supplier's bank details, as Ask Etyme says
 * it (walk 7, 2026-11-08: the chat said PR-2026-0441 "waits for you to pay
 * it" and drew Pay over a receipt the payment route refuses until somebody
 * checks the bank).
 *
 * The hold is decided by the decisions queue, never here: its
 * INVOICE_RECEIPT_HELD row carries the hold's own sentence, the one money's
 * `bankHeldSays` writes for this reader ("Bank details not checked. Ask
 * Rosalind Tay to check them, then pay."), and the chat says that sentence.
 * A held line is never a Pay card. For the seat that checks, the card opens
 * the check, which is on the invoice receipt's own page.
 *
 * No database: reads the row and nothing else.
 */

import type { QueueItem } from './ask'
import { bankHoldTitle } from '@/lib/twin/rules/invoice'

/** The words on a held receipt's button for the seat that checks the bank. */
export const CHECK_THE_BANK = 'Check the bank details'
/** The words on a held receipt's button for everybody else. */
export const OPEN_THE_RECEIPT = 'Open the invoice receipt'

const BANK = /\bbank details\b/i

/** The row's parts, as the queue joined them with " · ". */
function partsOf(subtitle: string | null | undefined): string[] {
  return (subtitle ?? '').split(' · ').map((p) => p.trim()).filter(Boolean)
}

/** Whether a queue row is a receipt held on the supplier's bank details. */
export function isBankHeld(d: Pick<QueueItem, 'type' | 'title' | 'subtitle' | 'reason'>): boolean {
  if (d.type !== 'INVOICE_RECEIPT_HELD') return false
  return BANK.test(d.title) || BANK.test(d.reason ?? '') || partsOf(d.subtitle).some((p) => BANK.test(p))
}

/**
 * The hold's own sentence, as the row gives it: its `reason` where the
 * route named one, else the part of its line that speaks of the bank.
 * Ends with a full stop. Null where the row says none.
 */
export function heldReason(d: Pick<QueueItem, 'subtitle' | 'reason'>): string | null {
  const parts = partsOf(d.subtitle)
  // The queue writes money's sentence as the last part of the line; a part
  // naming the bank is preferred where the line carries more after it.
  const said = d.reason?.trim() || [...parts].reverse().find((p) => BANK.test(p)) || (parts.length > 2 ? parts[parts.length - 1] : null) || null
  if (!said) return null
  const s = said[0].toUpperCase() + said.slice(1)
  return /[.!?]$/.test(s) ? s : `${s}.`
}

/** The receipt's number on the row: "Invoice PR-2026-0441 · …". */
export function heldNumber(d: Pick<QueueItem, 'subtitle'>): string | null {
  return (d.subtitle ?? '').match(/^Invoice (\S+)/)?.[1] ?? null
}

/**
 * Whether this seat is the one that checks: the row says so (`mayCheck`),
 * or opens the receipt at the hold (`#pay`), or its sentence speaks to the reader as the checker ("Check them, then
 * pay." / "then you check them and pay"). Never guessed from a role.
 */
export function checksTheBank(d: Pick<QueueItem, 'subtitle' | 'reason' | 'mayCheck' | 'actionUrl'>): boolean {
  if (d.mayCheck === true) return true
  if (d.mayCheck === false) return false
  // The queue opens the check itself, at the hold, for the person who checks.
  if (/#pay$/.test(d.actionUrl ?? '')) return true
  const r = heldReason(d) ?? ''
  return /(^|\.\s)Check them, then pay\b/.test(r) || /\bthen you check them\b/.test(r)
}

/** Where the held card opens: the receipt's own page, where the check is made and the payment then recorded. */
export function heldHref(d: Pick<QueueItem, 'actionUrl' | 'entityId'>, receipts: string): string {
  return d.actionUrl ?? (d.entityId ? `${receipts}/${encodeURIComponent(d.entityId)}` : receipts)
}

/**
 * The held line's name, in the twin's own words for a bank hold, so the
 * notice, the card and the greeting say one thing: "PR-2026-0441 from
 * Pinnacle Resourcing is held: the bank details are not checked".
 */
export function bankHeldName(d: Pick<QueueItem, 'subtitle'>, supplier: string | null): string {
  return bankHoldTitle({ number: heldNumber(d), supplierName: supplier })
}

/**
 * The receipts held on the bank, said after what may be paid: the first by
 * name with the row's own sentence, the rest counted. Null where none is.
 */
export function heldOnBankSays(rows: ReadonlyArray<Pick<QueueItem, 'type' | 'title' | 'subtitle' | 'reason' | 'whose'>>): string | null {
  const held = rows.filter(isBankHeld)
  if (held.length === 0) return null
  const first = held[0]
  const at = first.title.indexOf(' — ')
  const supplier = first.whose?.trim() || (at >= 0 ? first.title.slice(at + 3).trim() : null)
  // The name already says the bank details are not checked; the row's sentence follows without saying it twice.
  const reason = heldReason(first)?.replace(/^Bank details not checked\.\s*/, '') || null
  const more = held.length - 1
  return `${bankHeldName(first, supplier)}.${reason ? ` ${reason}` : ''}` +
    (more > 0 ? ` ${more === 1 ? 'One more is' : `${more} more are`} held on the bank details.` : '')
}
