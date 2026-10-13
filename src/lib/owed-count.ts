/**
 * The number on the Ask Etyme mark (founder, 2026-10-13: "place Ask Etyme
 * icon instead of [the bell], and show a number (like 5) which symbolizes
 * 5 decisions or responses expected").
 *
 * What it counts: the rows of the one decisions queue, GET /api/decisions,
 * for the seat reading it — every week waiting for this desk's signature,
 * every expense, rolloff, submission, overdue bill, supplier, contract and
 * start the queue says needs this seat. The route already filters each row
 * by the permission that acts on it, so the length of the list is what this
 * seat owes; nothing is added here and nothing is guessed.
 *
 * No database and no fetch: the shell reads the route, and this says what
 * the body means. Anything that cannot be read is no number, never zero
 * and never a stale figure — a badge that is wrong is worse than none.
 */

/** How often the shell asks again. Never more often than this. */
export const OWED_REFRESH_MS = 60_000

/** The count from a GET /api/decisions body, or null where it cannot be read. */
export function owedFrom(body: unknown): number | null {
  const data = (body as { data?: { total?: unknown; decisions?: unknown } } | null)?.data
  if (!data) return null
  if (typeof data.total === 'number' && Number.isInteger(data.total) && data.total >= 0) return data.total
  if (Array.isArray(data.decisions)) return data.decisions.length
  return null
}

/** What the badge prints: nothing at zero or unknown, "99+" past ninety-nine. */
export function owedBadge(n: number | null): string | null {
  if (n == null || n <= 0) return null
  return n > 99 ? '99+' : String(n)
}

/** What a screen reader hears on the mark. */
export function owedLabel(n: number | null): string {
  if (n == null || n <= 0) return 'Ask Etyme'
  return `Ask Etyme, ${n} ${n === 1 ? 'thing needs' : 'things need'} you`
}

/** Whether a read may go out now: the first one, or a full interval after the last. */
export function mayRefresh(lastAt: number | null, now: number): boolean {
  return lastAt == null || now - lastAt >= OWED_REFRESH_MS
}
