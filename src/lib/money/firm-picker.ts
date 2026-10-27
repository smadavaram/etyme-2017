/**
 * Which firms an agreement's "With" and an order's "From" offer.
 *
 * Second onboarding walk, 2026-10-27: a sub-vendor with no counterparty
 * yet was offered a bare "Choose…" with nothing under it, and no way to
 * learn why. The firms offered are the ones on this firm's Companies
 * list, read through the same route that page reads (GET /api/companies),
 * so a firm linked from Companies (the link request the other side says
 * yes to) appears here with nothing else to do. Where there is nobody,
 * the form says how to get somebody there, with the link, and never an
 * empty picker.
 *
 * No database in here.
 */

export const LINK_FIRST_SAYS = 'Ask the firm to link with you first, from Companies.'
export const LINK_FIRST_HREF = '/dashboard/companies'

export interface FirmRow {
  id: string
  name: string
  onEtyme?: boolean
}

/** The firms to offer: never this firm itself, each once, by name. */
export function firmsToPick<T extends FirmRow>(rows: T[], selfId: string | null | undefined): T[] {
  const seen = new Map<string, T>()
  for (const r of rows) {
    if (!r?.id || r.id === selfId || seen.has(r.id)) continue
    seen.set(r.id, r)
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
