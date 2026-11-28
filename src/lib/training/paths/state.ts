/**
 * A path's states. The agent proposes; the mentor's yes makes it live.
 * Pure (record 133).
 */
export type PathState = 'PROPOSED' | 'APPROVED' | 'ACTIVE' | 'COMPLETE'
export type PathMove = 'approve' | 'start' | 'complete' | 'adjust'

type Refusal = { ok: false; message: string }

export function pathNext(state: string, move: PathMove): { ok: true; state: PathState } | Refusal {
  if (move === 'adjust') return state === 'PROPOSED' || state === 'APPROVED' ? { ok: true, state: 'PROPOSED' } : { ok: false, message: 'A path that has started is not adjusted; ask the mentor for a new one.' }
  if (move === 'approve') return state === 'PROPOSED' ? { ok: true, state: 'APPROVED' } : { ok: false, message: 'Only a proposed path is approved.' }
  if (move === 'start') return state === 'APPROVED' ? { ok: true, state: 'ACTIVE' } : { ok: false, message: state === 'PROPOSED' ? 'This path waits for its mentor’s yes.' : 'This path is already under way.' }
  return state === 'ACTIVE' ? { ok: true, state: 'COMPLETE' } : { ok: false, message: 'Only a path under way is completed.' }
}

/** Only the named mentor says yes, and never to her own path. */
export function mayDecide(o: { deciderPersonId: string; mentorPersonId: string | null; learnerPersonId: string }): { ok: true } | Refusal {
  if (!o.mentorPersonId) return { ok: false, message: 'This path has no mentor yet. Name one first.' }
  if (o.deciderPersonId === o.learnerPersonId) return { ok: false, message: 'Nobody approves their own path.' }
  if (o.deciderPersonId !== o.mentorPersonId) return { ok: false, message: 'Only the path’s mentor says yes to it.' }
  return { ok: true }
}

/** Only an approved or active path is shown to the learner as hers to follow. */
export const pathIsLive = (state: string): boolean => state === 'APPROVED' || state === 'ACTIVE' || state === 'COMPLETE'
