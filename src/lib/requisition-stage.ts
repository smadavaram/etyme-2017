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
 *
 *
 * ── Filled is a placement's word ─────────────────────────────────────
 *
 * There was a "Filled" tab. A person is placed; a seat is filled; and
 * the founder's point was that the requirement's own cycle ends at
 * published — what happens after is the submission cycle, and it is
 * read there (Submissions → Placed). So a requirement whose seats are
 * all filled is put away: archived the moment the last award lands,
 * with "all 2 seats filled" as the reason on its row. Archived became a
 * tab for the same reason: nothing may disappear without a place to
 * find it. Cancelled stays its own tab until it is put away too.
 */

/** The lifecycle column: DRAFT · OPEN · FILLED · CLOSED · CANCELLED. */
export type RequisitionRow = {
  status: string
  approvalState: string
  archivedAt: string | Date | null
  /** For the reason a settled row was put away. */
  headcount?: number | null
  cancelReason?: string | null
}

export type Stage = 'DRAFT' | 'AWAITING' | 'CHANGES' | 'OPEN' | 'CANCELLED' | 'ARCHIVED'

/** Every bucket, in the order somebody works through them. */
export const STAGES: Array<[Stage, string]> = [
  ['DRAFT', 'Draft'],
  ['AWAITING', 'Awaiting approval'],
  ['CHANGES', 'Needs changes'],
  ['OPEN', 'Published'],
  ['CANCELLED', 'Cancelled'],
  ['ARCHIVED', 'Archived'],
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
 * - Put away outranks even that. A row that was archived — by hand, or
 *   because its last seat was filled — is off the working list, and the
 *   reason it closed is read off the row (closedBecause), not off the
 *   tab. Archiving is still a date, not a status, so what actually
 *   happened to the row is never overwritten.
 */
export function stageOf(r: RequisitionRow): Stage {
  if (r.archivedAt || r.status === 'FILLED') return 'ARCHIVED'
  if (r.status === 'CANCELLED') return 'CANCELLED'
  if (r.approvalState === 'PENDING_APPROVAL') return 'AWAITING'
  if (r.approvalState === 'CHANGES_REQUESTED') return 'CHANGES'
  if (r.status === 'OPEN') return 'OPEN'
  return 'DRAFT'
}

/**
 * Why a settled row is where it is — on the row, in a few words.
 *
 * "all 2 seats filled" · "cancelled — the project was pulled" ·
 * "archived". Null while the row is still working.
 */
export function closedBecause(r: RequisitionRow): string | null {
  if (r.status === 'FILLED') {
    const n = r.headcount && r.headcount > 0 ? r.headcount : 1
    return n === 1 ? 'the seat filled' : `all ${n} seats filled`
  }
  if (r.status === 'CANCELLED') return `cancelled${r.cancelReason ? ` — ${r.cancelReason}` : ''}`
  if (r.archivedAt) return 'archived'
  return null
}

/**
 * Whether the person who raised it may still change it.
 *
 * Mirrors the route's own gate rather than guessing at it: a draft, or
 * one an approver handed back. Published is not editable on
 * purpose — moving the rate or the headcount underneath vendors already
 * sourcing against it is a different requisition, not an edit.
 */
export function mayEdit(r: RequisitionRow): boolean {
  return r.status === 'DRAFT' || r.approvalState === 'CHANGES_REQUESTED'
}
