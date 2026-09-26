/**
 * What a role's status is called on the list a supplier reads.
 *
 * The column printed the column: `OPEN`, `FILLED`, raw, in a chip — on
 * the same row a client reads as "Published" three screens away. Two
 * vocabularies for one fact, one of them the database's own.
 *
 * ── This file and `lib/requisition-stage` ────────────────────────────
 *
 * That file answers a richer question and needs three columns to do it:
 * the lifecycle status, the approval state and the archive date, which
 * together decide whether a row is a draft, waiting on a desk, handed
 * back, published, called off or put away.
 *
 * This file used to say `/api/requirements` sent only one of those three
 * and that a stage therefore could not be computed on a supplier's list.
 * That was true and is not any more: the list route loads the whole row
 * and now sends `archivedAt`, `headcount` and `cancelReason` to
 * everybody and `approvalState` to the company that raised the role
 * (`app/api/requirements/visible.ts`). So `stageWordFor` below reads the
 * stage and this file does what it always did — says it in the reader's
 * word rather than the column's.
 *
 * Beside the page rather than in src/lib because a new lib file needs an
 * owner adding in src/lib/domains.ts, which is the architect's call.
 *
 * ── CLOSED, and the two lists ────────────────────────────────────────
 *
 * A closed role is finished, and the trade's word for a role nobody is
 * working any more is "closed". The client's own requisition list puts
 * the same row under a tab called Archived — its tabs are the lifecycle,
 * and a settled requisition is taken off the working list rather than
 * given a tab of its own — but the chip **on the row** there reads
 * `closedBecause`, which for a CLOSED role is "closed without being
 * filled". So the two lists already agree where it matters, on the row:
 * one says "Closed" and the other says "closed without being filled",
 * and "Archived" is the name of a drawer rather than a word about this
 * role. Renaming CLOSED to "Archived" here would be worse than the
 * disagreement it was meant to end — a filled role is archived too, so
 * the supplier's Filled and Closed tabs would become Filled and
 * Archived, two words at different levels sitting side by side.
 *
 * What was genuinely wrong, and is fixed by `stageWordFor`: a role the
 * client put away by hand while it was still OPEN read "Published" to
 * every supplier, because the status column was the only thing being
 * looked at and archiving deliberately does not touch it.
 */

import { stageOf, type RequisitionRow } from '@/lib/requisition-stage'

/** Every status the column can hold, in the order a role passes through them. */
export const STATUS_WORDS: Array<[string, string]> = [
  ['DRAFT', 'Draft'],
  ['OPEN', 'Published'],
  ['FILLED', 'Filled'],
  ['CLOSED', 'Closed'],
  ['CANCELLED', 'Cancelled'],
]

const BY_STATUS: Record<string, string> = Object.fromEntries(STATUS_WORDS)

/**
 * The word, or the status itself where somebody has added one nobody
 * has given a word to.
 *
 * Falling back to the raw value is deliberate and it is not a licence:
 * the alternative is a row that reads "—" or "Unknown", and a status the
 * product writes and cannot name is worth seeing on the screen until
 * somebody names it. `__tests__/invariants/requirement-words.test.ts`
 * reads the statuses the schema lists and fails when one of them has no
 * word here, so the fallback is never reached for a status the product
 * actually writes.
 */
export function statusWord(status: string): string {
  return BY_STATUS[String(status ?? '').toUpperCase()] ?? String(status ?? '')
}

/** The same word inside a sentence: "No published requirements." */
export function statusWordLower(status: string): string {
  return statusWord(status).toLowerCase()
}

/** A row as the list route now sends it. */
export type RequirementRow = RequisitionRow & {
  /** Published, but refusing submissions while the money is re-approved. */
  paused?: boolean
}

/**
 * The word for where a role has actually got to, not for the column.
 *
 * Four of the six stages map onto a status word somebody already reads.
 * The two that do not are the reason this exists:
 *
 * - **Put away while still open.** Archiving is a date and never
 *   overwrites the status, on purpose, so a role the client filed away
 *   still says OPEN and read "Published" to every supplier looking at
 *   it. It reads "Closed": the role is over and "closed" is the word the
 *   trade uses for that.
 * - **Paused.** A published role whose money went back through approval
 *   refuses submissions at the door, in that word
 *   (`POST /api/submissions`). Saying it on the list is the same fact an
 *   afternoon earlier. A supplier is never told whose desk it is on —
 *   `approvalState` does not leave the client — so this reads off the
 *   derived `paused` flag for them and off the stage for the company
 *   that raised the role, which does need to know which desk.
 */
export function stageWordFor(r: RequirementRow): string {
  switch (stageOf(r)) {
    // Filled keeps its own word — it is the one settled ending that is
    // good news, and the row's tone is verified rather than passive.
    case 'ARCHIVED':  return statusWord(r.status === 'FILLED' ? 'FILLED' : 'CLOSED')
    case 'CANCELLED': return statusWord('CANCELLED')
    // Only ever reached by the company that raised it; a supplier's
    // approvalState is '' and falls past both of these branches.
    case 'AWAITING':  return 'Awaiting approval'
    case 'CHANGES':   return 'Needs changes'
    case 'OPEN':      return r.paused ? 'Paused' : statusWord('OPEN')
    default:          return statusWord('DRAFT')
  }
}

/**
 * Why a settled role stopped, in a few words, or null while it is live.
 *
 * Only the cancel reason, and only when there is one. The rest of what
 * `closedBecause` returns — "the seat filled", "closed without being
 * filled" — is already the chip, and printing it twice on one row is the
 * duplicate class the founder has reported three times. A withdrawal
 * reason is the one thing the chip cannot carry and the one thing a
 * recruiter needs: it is the difference between "this client's budget
 * was cut" and "we lost this to somebody".
 */
export function stageReason(r: RequirementRow): string | null {
  if (stageOf(r) !== 'CANCELLED') return null
  return r.cancelReason?.trim() || null
}
