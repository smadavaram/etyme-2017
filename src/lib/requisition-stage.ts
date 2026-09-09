/**
 * Where a requisition has got to — one row's whole life, in two words.
 *
 * A rule rather than a rendering concern, and it lives here because it
 * was wrong for a release while it sat inside a page component where
 * nothing could test it.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * There were four buckets: draft, awaiting approval, open to suppliers,
 * filled. Cancelling was built, and archiving was built, and neither had
 * anywhere to land — so a cancelled requisition fell through to `DRAFT`.
 * You withdrew a role, told every supplier working it why, and watched it
 * reappear on the working list as though it had never been raised.
 *
 * `CHANGES_REQUESTED` had the same problem from the other end: an
 * approver handed one back and it read as a draft, which is the one state
 * that means nobody has been asked yet.
 */

/** The lifecycle column: DRAFT · OPEN · FILLED · CLOSED · CANCELLED. */
export type RequisitionRow = {
  status: string
  approvalState: string
  archivedAt: string | Date | null
}

export type Stage = 'DRAFT' | 'AWAITING' | 'CHANGES' | 'OPEN' | 'FILLED' | 'CANCELLED'

/** Every bucket, in the order somebody works through them. */
export const STAGES: Array<[Stage, string]> = [
  ['DRAFT', 'Draft'],
  ['AWAITING', 'Awaiting approval'],
  ['CHANGES', 'Needs changes'],
  ['OPEN', 'Open to suppliers'],
  ['FILLED', 'Filled'],
  ['CANCELLED', 'Cancelled'],
]

/**
 * Which bucket a row is in.
 *
 * Order matters and is not arbitrary:
 *
 * - Cancelled outranks everything. A role that was called off is not a
 *   draft and is not open, whatever the other columns still say.
 * - The approval state outranks the lifecycle status next, because a row
 *   can be `OPEN` with its approval still pending — the approval is the
 *   more urgent fact and the one somebody has to act on.
 * - Archiving is deliberately absent. Cancelling says the need went away;
 *   archiving only takes a settled row off the working list, which is a
 *   question about visibility rather than about what happened to it. It
 *   is filed as a date precisely so it cannot overwrite the stage.
 */
export function stageOf(r: RequisitionRow): Stage {
  if (r.status === 'CANCELLED') return 'CANCELLED'
  if (r.approvalState === 'PENDING_APPROVAL') return 'AWAITING'
  if (r.approvalState === 'CHANGES_REQUESTED') return 'CHANGES'
  if (r.status === 'FILLED') return 'FILLED'
  if (r.status === 'OPEN') return 'OPEN'
  return 'DRAFT'
}

/**
 * Whether the person who raised it may still change it.
 *
 * Mirrors the route's own gate rather than guessing at it: a draft, or
 * one an approver handed back. Open to suppliers is not editable on
 * purpose — moving the rate or the headcount underneath vendors already
 * sourcing against it is a different requisition, not an edit.
 */
export function mayEdit(r: RequisitionRow): boolean {
  return r.status === 'DRAFT' || r.approvalState === 'CHANGES_REQUESTED'
}
