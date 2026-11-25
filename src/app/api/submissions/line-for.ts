import { mayOpenLine } from '@/app/api/placements/[id]/party'

/**
 * The line a row's "Open" link leads to, for the reader asking (record 119).
 *
 * One job and one person can have several lines: the prime's to the client
 * and the sub-vendor's to the prime. A reader is offered a link only to a
 * line the placement route will open for it (`mayOpenLine`, the route's own
 * rule), so a client is never pointed at the line below its supplier. Where
 * two lines qualify, the one the reader sells is preferred, then the one it
 * buys. Where none does, no link.
 */
export type LineRow = { id: string; requirementId: string | null; personId: string; companyId: string; clientCompanyId: string }

export function lineFor(lines: LineRow[], readerCompanyId: string | null): Map<string, string> {
  const out = new Map<string, string>()
  if (!readerCompanyId) return out
  const rank = (l: LineRow) => (l.companyId === readerCompanyId ? 0 : 1)
  const best = new Map<string, LineRow>()
  for (const l of lines) {
    if (!l.requirementId || !mayOpenLine(readerCompanyId, l)) continue
    const key = `${l.requirementId}:${l.personId}`
    const had = best.get(key)
    if (!had || rank(l) < rank(had)) best.set(key, l)
  }
  for (const [k, l] of best) out.set(k, l.id)
  return out
}
