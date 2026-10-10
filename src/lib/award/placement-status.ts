/**
 * One placement, one word, on every screen.
 *
 * The outside audit of 2026-10-05 read Northbend's contractor list saying
 * Marisol Quintero was "on site, nothing needs you" while its program
 * page, six inches away, said she "cannot start without proof of right to
 * work". Both were computed, both from real rows, and each screen had its
 * own idea of what a placement that has not started is.
 *
 * So there are five words and one function, and every screen that names
 * a placement's state asks it:
 *
 *   Awarded, terms pending — the person's own terms are not on record
 *   Papers pending         — terms agreed; nobody has cleared the start
 *   Ready to start         — cleared, and the first day has not come
 *   On site                — working
 *   Ended                  — finished, or called off
 *
 * The state machine underneath is money's (`SellContractState`), and the
 * terms are `lib/award/hire-terms`. This only reads both and names the
 * result. No database, no clock of its own.
 */

export type PlacementStatus = 'TERMS_PENDING' | 'PAPERS_PENDING' | 'READY' | 'ON_SITE' | 'ENDED'

export const PLACEMENT_WORDS: Record<PlacementStatus, string> = {
  TERMS_PENDING: 'Awarded, terms pending',
  PAPERS_PENDING: 'Papers pending',
  READY: 'Ready to start',
  ON_SITE: 'On site',
  ENDED: 'Ended',
}

export interface PlacementFacts {
  /** `SellContract.state` on the line the reader sees. */
  state: string
  startDate: Date
  endDate: Date | null
  /** From `hopZero` — the person's own terms are on record. */
  termsOnRecord: boolean
  /**
   * Whether the start paperwork clears, where the screen ran the same
   * checklist activation runs. Null where it did not; then an un-started
   * line reads "Papers pending", because nobody has cleared it.
   */
  papersClear?: boolean | null
}

export interface PlacementWord {
  status: PlacementStatus
  word: string
}

const STARTED = ['IN_PROGRESS', 'PAUSED']
const OVER = ['ENDED', 'CANCELLED']

export function placementStatus(f: PlacementFacts, now: Date): PlacementWord {
  const say = (status: PlacementStatus): PlacementWord => ({ status, word: PLACEMENT_WORDS[status] })

  if (OVER.includes(f.state)) return say('ENDED')
  if (STARTED.includes(f.state)) {
    if (f.endDate && f.endDate.getTime() < now.getTime()) return say('ENDED')
    return f.startDate.getTime() > now.getTime() ? say('READY') : say('ON_SITE')
  }
  // Not started: DRAFT, PENDING_VERIFICATION or VERIFIED. Terms first,
  // because papers for a person who has not agreed to the work are
  // papers for a placement that may not happen.
  if (!f.termsOnRecord) return say('TERMS_PENDING')
  if (f.state === 'VERIFIED' || f.papersClear === true) return say('READY')
  return say('PAPERS_PENDING')
}
