/**
 * The forward route's refusal, read off whatever came back, so the Send on
 * dialog says the route's own sentence and never a blank or a status line.
 * Out of the page so a test can read it (a page exports nothing else).
 */
export function sendOnRefusalSays(body: unknown): string | null {
  const e = (body as { error?: unknown } | null | undefined)?.error
  if (typeof e === 'string' && e.trim()) return e
  const m = (e as { message?: unknown } | null | undefined)?.message
  return typeof m === 'string' && m.trim() ? m : null
}
