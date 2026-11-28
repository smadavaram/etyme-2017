/**
 * A link to a person's record on Candidates, and what the page does with
 * it (fix list C4, 2026-11-15).
 *
 * The Bench card of somebody asked and not answered was a dead end: her
 * name was plain text, and nothing led to her record. Now the name is a
 * link to `/dashboard/consultants?open=<consultant id>`, and the
 * Candidates page opens her drawer from it.
 *
 * Two rules hold it:
 *
 *  - The address carries the record's id and nothing else. A name or an
 *    email in an address is kept in browser history, in logs and in a
 *    pasted link, and before her yes the firm reads only what it typed.
 *  - The page opens only a row the list route already returned to this
 *    seat. It reads nothing new, so before her yes the drawer holds only
 *    what the firm typed (`firmReadsAt` in ./before-her-yes). An id that
 *    is not on the list, a stranger's or none at all, reads one sentence
 *    that names nobody and is the same for both.
 *
 * Pure: no database, no fetch.
 */
import type { Route } from 'next'

/** The Candidates page's own address. */
export const CANDIDATES_PATH = '/dashboard/consultants'

/** The link to one record on Candidates. Only the id travels. */
export function candidateRecordHref(consultantId: string): Route {
  return `${CANDIDATES_PATH}?open=${encodeURIComponent(consultantId)}` as Route
}

/** Said where the address names a record this list does not hold. */
export const NOT_ON_THIS_LIST_SAYS = 'That record is not on this list, so there is nothing to open.'

/**
 * What the page does with `?open=<id>` once the seat and the list are in.
 * Null where the address asks for nothing.
 */
export function openFromAddress<T extends { id: string }>(
  rows: readonly T[],
  id: string | null | undefined,
): { open: T } | { says: string } | null {
  if (!id) return null
  const row = rows.find((r) => r.id === id)
  return row ? { open: row } : { says: NOT_ON_THIS_LIST_SAYS }
}
