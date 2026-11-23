/** How a confirmation came in, in the words a person reads; the keys are the route's. Pure. */
export const CONFIRM_CHANNELS = [
  { key: 'PHONE', words: 'By phone' },
  { key: 'EMAIL', words: 'By email' },
  { key: 'PORTAL', words: 'In their portal' },
  { key: 'MANUAL', words: 'Some other way' },
] as const

/** What the dialog posts to /api/bench/submission-confirmations. A firm with one legal entity sends none. Pure. */
export function confirmationBody(f: { submissionId: string; channel: string; note: string; entity: string }) {
  return {
    submissionId: f.submissionId, channel: f.channel,
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
    ...(f.entity ? { actingEntityId: f.entity } : {}),
  }
}
