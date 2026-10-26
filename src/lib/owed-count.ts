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

// ── Read again after an act ───────────────────────────────────────────
//
// Found on the walk, 2026-10-22: Today said "Two things need you" while
// the mark beside it still said 3, because the mark read once a minute
// and an approval in between changed nothing on it until a reload. So
// the mark reads again shortly after any act this seat makes, on either
// screen: a card answered in Ask Etyme, a week approved on Today, an
// invoice receipt paid, a supplier passed.
//
// Which calls are acts is decided here, once, rather than by every
// screen remembering to say so. The screens that act belong to five
// domains, and a rule each of them has to remember is how the mark went
// stale in the first place. A successful write to this app's own API is
// an act, because any of them can change what a seat owes; the list
// below names the few writes that never can. Missing an act leaves a
// wrong number on screen; reading once too often costs one request.

/** The event a screen may fire itself, for an act that is not a call to /api. */
export const OWED_CHANGED_EVENT = 'etyme:owed-changed'

/** How long after the last act the mark reads, so a burst of acts is one read. */
export const OWED_SETTLE_MS = 800

/** Writes that never change what anybody owes: an error report, a sign-in. */
const NOT_AN_ACT: readonly RegExp[] = [/^\/api\/incidents(\/|$)/, /^\/api\/auth\//]

/**
 * Whether a call that came back is an act that may change what this seat
 * owes: a write (not GET, HEAD or OPTIONS) to this app's own /api, that
 * succeeded. A refusal changed nothing, so it is not one. `origin` is the
 * page's own, so a call to another site never counts.
 */
export function isAct(method: string | undefined, url: string, status: number, origin = 'http://localhost'): boolean {
  const m = (method ?? 'GET').toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  if (status < 200 || status >= 300) return false
  let u: URL
  try { u = new URL(url, origin) } catch { return false }
  if (u.origin !== new URL(origin).origin) return false
  if (!u.pathname.startsWith('/api/')) return false
  return !NOT_AN_ACT.some((re) => re.test(u.pathname))
}

/**
 * Tell the mark this seat just did something that changes what it owes.
 * For an act the call watcher cannot see; a call to /api needs nothing.
 */
export function announceOwedChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OWED_CHANGED_EVENT))
}
