/**
 * Adopting a course, pure (record 133). The creator keeps the course; the
 * adopter's learners live on the adopter's record; the creator reads
 * counts, and names only where the adoption grants it.
 */
type Refusal = { ok: false; message: string }

export function mayAdopt(o: { creatorCompanyId: string; adopterCompanyId: string; alreadyAdopted: boolean; creatorPluginOn: boolean }): { ok: true } | Refusal {
  if (o.creatorCompanyId === o.adopterCompanyId) return { ok: false, message: 'This course is already yours. Assign it to a team instead.' }
  if (!o.creatorPluginOn) return { ok: false, message: 'That course is not offered right now.' }
  if (o.alreadyAdopted) return { ok: false, message: 'Your firm has already adopted this course.' }
  return { ok: true }
}

export interface AdoptedRow { personId: string; name: string; status: string; completedAt: Date | null }
export type CreatorReading =
  | { named: false; started: number; completed: number }
  | { named: true; started: number; completed: number; learners: { personId: string; name: string; status: string; completedAt: Date | null }[] }

/** Counts only, unless the adoption grants named evidence. No name or id leaves in the counts reading. */
export function creatorReading(rows: AdoptedRow[], grantsNamedEvidence: boolean): CreatorReading {
  const started = rows.length
  const completed = rows.filter((r) => r.status === 'COMPLETED').length
  return grantsNamedEvidence ? { named: true, started, completed, learners: rows.map((r) => ({ ...r })) } : { named: false, started, completed }
}

/** Provenance of a course made from another's content: both ids kept; a course is never made from one's own. */
export function fromSource(o: { sourceCourseId: string; sourceCompanyId: string; ownCompanyId: string }): { ok: true; sourceCourseId: string; sourceCompanyId: string } | Refusal {
  if (o.sourceCompanyId === o.ownCompanyId) return { ok: false, message: 'That course is already yours.' }
  return { ok: true, sourceCourseId: o.sourceCourseId, sourceCompanyId: o.sourceCompanyId }
}
