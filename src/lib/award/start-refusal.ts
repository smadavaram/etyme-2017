/**
 * What Activate says after a press the start refused, whatever the code.
 *
 * The founder's tester on production, 2026-11-08: pressing Activate on a
 * placement whose papers were not held showed "Starting…" and then the
 * button again with no sentence, in the client's seat and the supplier's.
 * The 2026-11-03 fix drew the route's words only for a seat that may not
 * start (FORBIDDEN). So, for every refusal the route can give — papers
 * that block, terms pending, a client rule, a warning that asks a reason,
 * a placement already started — and for a server that did not answer or
 * answered with an error page, a sentence is always drawn, and it is kept
 * across the page's reload for a minute, the way the started sentence is.
 *
 * Pure: no React, no database. Money's Activate panel draws it; a test
 * reads every branch.
 */

/** Said where the route could not be reached or did not answer in words. */
export const START_NOT_CHECKED = 'The start could not be checked. Try again.'

/**
 * The sentence for a refused press. `status` is the HTTP status, or null
 * where the request never came back (no network). `error` is the body's
 * `error`, as the route wrote it, or whatever came back instead.
 */
export function startRefusalSays(status: number | null, error: unknown): string {
  if (status === null || status >= 500) return START_NOT_CHECKED
  const e = error && typeof error === 'object' ? (error as { message?: unknown; fix?: unknown }) : null
  const message = typeof e?.message === 'string' ? e.message.trim() : ''
  const fix = typeof e?.fix === 'string' ? e.fix.trim() : ''
  if (!message && !fix) return START_NOT_CHECKED
  if (!message) return fix
  return fix && !message.includes(fix) ? `${message} ${fix}` : message
}

/** The key a refusal is kept under in the browser, one per contract. */
export const refusalKey = (contractId: string) => `etyme:start-refused:${contractId}`

/** How long a kept refusal is shown after a reload: a minute, as the started sentence. */
export const REFUSAL_KEPT_MS = 60_000

/** What is written to the browser for a refusal said at `at`. */
export function keepRefusal(says: string, at: number): string {
  return JSON.stringify({ says, at })
}

/** The kept refusal, where it was said less than a minute ago; null otherwise. */
export function keptRefusal(raw: string | null, now: number): string | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { says?: unknown; at?: unknown }
    if (typeof v.says !== 'string' || !v.says.trim() || typeof v.at !== 'number') return null
    return now - v.at >= 0 && now - v.at < REFUSAL_KEPT_MS ? v.says : null
  } catch {
    return null
  }
}
