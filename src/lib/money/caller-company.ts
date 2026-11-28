/**
 * The caller's company, read off the `/api/me` reply the way every other
 * dashboard page reads it: the seat in use (`activeContext`), else the
 * first seat. `/api/me` returns `person`, `credentials`, `contexts` and
 * `activeContext`, never a bare `companyId`; reading one that is not there
 * made "Record a placement" refuse every firm with "Could not determine
 * your company" (the Tapin walk, 2026-10-29).
 *
 * Null where the person holds no company seat, and the form then says so.
 */
export function callerCompanyIdFromMe(body: unknown): string | null {
  const data = (body as { data?: any } | null)?.data
  if (!data) return null
  const id = data.activeContext?.company?.id ?? data.contexts?.[0]?.company?.id ?? null
  return typeof id === 'string' && id.length > 0 ? id : null
}
