/**
 * A refusal, said with this page's own name. Pure; safe in a page.
 *
 * Round five, problem 14. The one door refuses a seat with no desk before
 * the route runs, and names the page by matching the route against the
 * menu. `/api/program/milestones` and `/api/program/agreements` sit under
 * the client's Dashboard link, so Milestones read "Could not load
 * milestones: Dashboard is not part of your seat…" and Agreements read
 * "Dashboard is not part…". The page knows its own name; the door's
 * sentence is kept whole — the company, the ask — and only the name at
 * its head is the page's.
 *
 * A refusal is drawn alone: no "Could not load", no "Try again" — a retry
 * cannot give somebody a desk.
 */
const NOT_PART = ' is not part of your seat'

export function refusalFor(
  error: { code?: string | null; message?: string | null } | null | undefined,
  pageName: string
): string {
  const message = error?.message?.trim()
  if (!message) return `${pageName}${NOT_PART}. Ask your company’s owner if you need it.`
  const at = message.indexOf(NOT_PART)
  if (error?.code === 'NO_DESK' && at > 0) return pageName + message.slice(at)
  return message
}

/**
 * Read a response, and if it is a refusal, return its sentence in this
 * page's name. Null for anything else — the body is left unread, so the
 * caller reads it as before.
 */
export async function refusedBy(res: Response, pageName: string): Promise<string | null> {
  if (res.status !== 403) return null
  const body = await res.json().catch(() => null)
  return refusalFor(body?.error ?? null, pageName)
}
