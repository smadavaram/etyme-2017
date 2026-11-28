/**
 * The cohort board and the ranking (record 133). The mentor reads her
 * cohort's board. A learner reads her own place only where the Owner turned
 * it on, and only within her own cohort: never public, never global, never
 * another person's name.
 */
export interface BoardRow { personId: string; name: string; points: number; weeks: number; badges: number; percent: number }

export const cohortBoard = (rows: BoardRow[]): BoardRow[] =>
  [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))

export function mayReadRanking(o: { rankingOn: boolean; cohortId: string | null }): { ok: true } | { ok: false; message: string } {
  if (!o.rankingOn) return { ok: false, message: 'Your firm has not turned the ranking on.' }
  if (!o.cohortId) return { ok: false, message: 'A place is read within a cohort, and you are not in one.' }
  return { ok: true }
}

/** Her place among her cohort and the size of it. Equal points share a place. */
export function myPlace(rows: BoardRow[], personId: string): { place: number; of: number } | null {
  const me = rows.find((r) => r.personId === personId)
  if (!me) return null
  return { place: 1 + rows.filter((r) => r.points > me.points).length, of: rows.length }
}
