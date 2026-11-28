/**
 * A candidate's own yes to updates (record 117, lead ruling 2026-11-27).
 *
 * The yes is a timestamp on her own Person row, given by her and revocable.
 * A bench yes is consent to be put forward, never to be marketed to: this is
 * a separate fact. Until she has said yes, no update letter goes to her.
 * One reader decides, so a letter and a screen cannot disagree.
 */
export type UpdatesYes = { updatesYesAt: Date | null | undefined; updatesRevokedAt: Date | null | undefined }

/** Pure: does she have a standing yes to updates. A revoke newer than the yes ends it; a newer yes after a revoke restores it. */
export function saidYesToUpdates(p: UpdatesYes): boolean {
  if (!p.updatesYesAt) return false
  if (p.updatesRevokedAt && p.updatesRevokedAt.getTime() >= p.updatesYesAt.getTime()) return false
  return true
}

/** The sentence her page and the Candidates tab read. */
export function updatesSays(p: UpdatesYes): string {
  return saidYesToUpdates(p)
    ? 'You said yes to updates. You can stop them at any time.'
    : 'No updates will be sent to you until you say yes.'
}
