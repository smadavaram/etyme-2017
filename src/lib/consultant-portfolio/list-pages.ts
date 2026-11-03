/**
 * Consultants reads every record the firm has, not the route's first page
 * (the third screen walk, 2026-11-03, S1).
 *
 * The page asked `GET /api/consultants` once, got its default 25 of 32,
 * and searched, sorted and paged only those: a person the firm had just
 * added (alphabetically after the 25th) was missing, search said nothing
 * matched, and Next was disabled. So the page reads the route's pages in
 * turn until it holds `total` rows, and the count, the search and the
 * paging all stand on the same rows.
 *
 * Pure: no database, safe in the browser.
 */

/** The largest page the route serves (`limit` is capped at 100 there). */
export const CONSULTANTS_PAGE = 100

/** The address of one page of the list. */
export function consultantsPageUrl(page: number): string {
  return `/api/consultants?limit=${CONSULTANTS_PAGE}&page=${page}`
}

/**
 * The pages still to read after the first, from the route's own
 * `pagination.pages`. Nothing more where the first page was the whole list
 * or the route did not say.
 */
export function pagesAfterFirst(pages: unknown): number[] {
  const n = typeof pages === 'number' && Number.isFinite(pages) ? Math.floor(pages) : 1
  const out: number[] = []
  for (let p = 2; p <= n; p++) out.push(p)
  return out
}
