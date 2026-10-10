import { readJson } from '@/lib/read-response'
import { refusalSentence } from '@/lib/refusal-words'

/**
 * Saving a small form without losing the reason it was refused.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * `readJson` throws on a response that is not OK, with the route's own
 * sentence as the message — which is right, and which a form written as
 *
 *   setBusy(true)
 *   const body = await readJson(res)
 *   setBusy(false)
 *   if (!res.ok) setError(body.error.message)
 *
 * never reaches. The throw skips both lines after it: the refusal the
 * route wrote ("Say why Rosa Delgado should keep the week's overtime…")
 * is never shown, Save stays disabled for good, and the error escapes
 * as an unhandled rejection. Found by a browser walk of the placement
 * page's pay line, where both of its forms were written that way.
 *
 * So the busy flag is reset in a `finally`, whatever happens, and the
 * refusal lands in the form's own error line in the route's own words.
 */

/** What a person sees when the request never reached the server at all. */
export const UNREACHABLE =
  'The server could not be reached. Check your connection and try again.'

export async function saveForm<T = any>(opts: {
  send: () => Promise<Response>
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  /** Said only where the failure carried no sentence of its own. */
  fallback: string
  /** The reader's kind of company, so a refusal carrying a permission key names the desk instead. */
  kind?: string | null
  company?: string | null
}): Promise<T | null> {
  opts.setBusy(true)
  opts.setError(null)
  try {
    const res = await opts.send()
    return await readJson<T>(res)
  } catch (e) {
    // `fetch` rejects with a TypeError when the network is down, and its
    // message ("Failed to fetch") names the browser's API, not the problem.
    const said =
      e instanceof TypeError ? UNREACHABLE : e instanceof Error && e.message ? e.message : opts.fallback
    // A route that still refuses with a permission key is said as the
    // desk that does it (lib/refusal-words); a sentence passes untouched.
    opts.setError(refusalSentence(said, { kind: opts.kind, company: opts.company, what: 'This' }))
    return null
  } finally {
    opts.setBusy(false)
  }
}
