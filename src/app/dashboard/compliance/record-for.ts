import type { RecordFor } from './record-check'

/**
 * Where Record the I-9 opens for a person on the Compliance page: a held
 * start of somebody this firm employs, else a line on which this firm
 * owes their I-9 as their employer (`recordI9` on the owed row, from
 * GET /api/compliance). Null where this firm records nothing for them,
 * so the page never offers a form the route will refuse.
 *
 * Found by the screen walk of 2026-11-01: the form was offered only while
 * a start was listed as held, so Pinnacle could not record Nikhil
 * Fairweather's I-9 from any screen. Pure.
 */
export function i9RecordFor(
  data: {
    startsHeld?: { contractId: string; personId: string; name: string; own?: boolean }[]
    owes?: { lineId: string; personId?: string | null; aboutName: string | null; recordI9?: boolean }[]
  } | null,
  personId: string
): RecordFor | null {
  const start = (data?.startsHeld ?? []).find((s) => s.personId === personId && s.own)
  if (start) return { contractId: start.contractId, personId, name: start.name }
  const owed = (data?.owes ?? []).find((o) => o.recordI9 && o.personId === personId)
  return owed ? { contractId: owed.lineId, personId, name: owed.aboutName ?? 'this person' } : null
}
