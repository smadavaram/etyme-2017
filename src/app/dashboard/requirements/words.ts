/**
 * What a role's status is called on the list a supplier reads.
 *
 * The column printed the column: `OPEN`, `FILLED`, raw, in a chip — on
 * the same row a client reads as "Published" three screens away. Two
 * vocabularies for one fact, one of them the database's own.
 *
 * ── Why this is not `lib/requisition-stage` ──────────────────────────
 *
 * That file answers a richer question and needs three columns to do it:
 * the lifecycle status, the approval state and the archive date, which
 * together decide whether a row is a draft, waiting on a desk, handed
 * back, published, called off or put away. `/api/requirements` sends
 * one of those three — the status — so a stage cannot be computed here
 * without the list route growing two columns it does not use for
 * anything else.
 *
 * What it can do, and what was actually wrong, is say the status in
 * English and say it in the same words the client uses for the same row:
 * a published role reads "Published" to both ends of the deal.
 *
 * Beside the page rather than in src/lib because a new lib file needs an
 * owner adding in src/lib/domains.ts, which is the architect's call.
 *
 * ── CLOSED ───────────────────────────────────────────────────────────
 *
 * A closed role is finished, and the trade's word for a role nobody is
 * working any more is "closed". The client's own requisition list puts
 * the same row under Archived — its tabs are the lifecycle, and a
 * settled requisition is taken off the working list rather than given a
 * tab of its own. Both say the role is over; neither says "draft", which
 * is what `stageOf` still answers for CLOSED and is a bug filed against
 * the file that owns it.
 */

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
