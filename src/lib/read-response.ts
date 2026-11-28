/**
 * Reading a response without losing the reason it failed.
 *
 * Nearly every page in this product does the same two lines:
 *
 *   const body = await res.json()
 *   if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
 *
 * The second line is right and never runs. `res.json()` throws first on
 * any response with no body, which is what a 401 from the middleware, a
 * 500 from a crashed handler and a dropped connection all look like. So
 * the careful message on the second line is replaced by the browser's
 * own: "Failed to execute 'json' on 'Response': Unexpected end of JSON
 * input".
 *
 * That is what a consultant sees when their session ends. Not "sign in
 * again" — a parser error, on a screen with no other explanation and a
 * "Try again" button that will fail the same way.
 *
 * Found by taking one screenshot of one page. Every test passed, because
 * every test calls the route handler directly and never has a session to
 * lose.
 *
 * The fix is to read the body as text first, which cannot throw, and
 * only then to try to make sense of it.
 */

/** What to say when the response carried no message of its own. */
export function statusMeans(status: number): string {
  switch (status) {
    case 401:
      return 'Your session has ended. Sign in again to carry on.'
    case 403:
      return 'You do not have access to this.'
    case 404:
      return 'That is not here any more.'
    case 409:
      return 'Somebody changed this while you had it open. Reload and try again.'
    case 429:
      return 'Too many requests at once. Wait a moment and try again.'
    case 503:
      return 'The service is briefly unavailable. Try again shortly.'
    default:
      return status >= 500
        ? 'Something went wrong at our end. It has been recorded.'
        : `That did not go through (${status}).`
  }
}

/**
 * The error readJson throws: the sentence, and the status and the route's
 * code beside it, so a page can tell a refusal (403) from a fault.
 *
 * Until 2026-11-12 it carried the sentence only, and two pages that drew
 * a refusal on `e.status === 403` (Settings → Owners, Settings →
 * Sign-in) could never reach that branch: a person who answered an
 * ownership ask saw the page replaced by a refusal instead of their own
 * answer (the Owner walk).
 */
/**
 * `field` names the form field the refusal is about, where the route
 * said one (`error.field`), so a form can put the sentence beside it.
 */
export type ReplyError = Error & { status: number; code?: string; field?: string }

function replyError(message: string, status: number, code?: unknown, field?: unknown): ReplyError {
  const e = new Error(message) as ReplyError
  e.status = status
  if (typeof code === 'string' && code) e.code = code
  if (typeof field === 'string' && field) e.field = field
  return e
}

/** True where a thrown error is the server saying no (403), not a fault. */
export function isRefusal(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { status?: unknown }).status === 403
}

/**
 * The JSON body, or a thrown error a person can read.
 *
 * Never throws a parser error. A response with no body, half a body or
 * an HTML error page all end up as the same thing: a sentence saying
 * what happened, which is what the calling page was trying to produce
 * before `res.json()` got there first.
 */
export async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '')

  let body: any = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      // An HTML error page, a proxy timeout, a truncated stream. The
      // text is not shown — it is a stack trace or a gateway's markup,
      // and neither helps anybody.
      body = null
    }
  }

  if (!res.ok) {
    throw replyError(body?.error?.message ?? statusMeans(res.status), res.status, body?.error?.code, body?.error?.field)
  }

  if (body === null) {
    // A 200 with nothing in it is not success, whatever the status line
    // says. Letting it through hands the page `undefined` and moves the
    // failure somewhere harder to read.
    throw replyError('The server sent an empty reply.', res.status)
  }

  return body as T
}
