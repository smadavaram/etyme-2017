/**
 * Printing an order number beside the word the reader calls it by.
 *
 * The trade writes "PO PO-2026-K6KU1" nowhere. It writes either
 * "PO-2026-K6KU1", because the number carries its own prefix, or
 * "PO 4471", because it does not. Four screens composed the label the
 * same wrong way — the reader's short word, then the number, with no
 * check that the number already opened with it — and the founder read
 * "POPO-2026-K6KU1" on the contracts page and "SOSO-F8L1U" beside it.
 *
 * So the decision is made once, here, and every screen asks it.
 *
 * ── What counts as "already carries it" ──────────────────────────────
 *
 * The number opens with the reader's own short word, upper or lower
 * case, and the next character is a separator or the number ends. That
 * last clause is what keeps "POWERGRID-4471" prefixed — a number that
 * merely starts with the same two letters is not a number carrying a
 * prefix.
 *
 * ── Why only the reader's own word ───────────────────────────────────
 *
 * A number issued as PO-2026-K6KU1 and read by the seller is its
 * counterparty's number, quoted as-is. The seller's word is SO, the
 * number says PO, and the two disagreeing is a fact about the document
 * rather than a display bug: it is the buyer's number and it says so.
 * Suppressing "SO" there and leaving "PO-2026-K6KU1" bare would lose
 * which end of the deal the reader is standing at. So the prefix is
 * dropped only where it would be a repetition of itself.
 */

/** The separators a document number uses after its own prefix. */
const SEPARATORS = ['-', '_', '/', ' ', '.']

export interface OrderReferenceLabel {
  /**
   * The word to print in front of the number, or null where the number
   * already carries it and a screen must print nothing.
   */
  prefix: string | null
  /** The number, unchanged. It is never rewritten. */
  reference: string
  /** The whole label as one string, for a sentence or a title. */
  text: string
}

/**
 * Whether a document number already opens with a given short word.
 *
 * Exported because a test reads it directly and because a screen that
 * only wants the yes-or-no should not have to build a label to get it.
 */
export function carriesPrefix(reference: string, short: string): boolean {
  const ref = reference.trim()
  if (short.length === 0) return false
  if (ref.length < short.length) return false
  if (ref.slice(0, short.length).toUpperCase() !== short.toUpperCase()) return false

  const next = ref.slice(short.length, short.length + 1)
  // "PO" on its own is the prefix and the whole number, which is not a
  // number anybody has, and "PO-2026" is. A letter or a digit next
  // means the match was a coincidence — POWERGRID, SOLAR-4 — and the
  // word is printed.
  return next === '' || SEPARATORS.includes(next)
}

/**
 * The label a screen prints for one order number.
 *
 * `short` is the reader's own word for the document — PO, SO, WO —
 * from `orderNoun`. The number is never altered; only whether the word
 * goes in front of it is decided here.
 */
export function orderReferenceLabel(
  reference: string | null | undefined,
  short: string
): OrderReferenceLabel | null {
  if (reference == null) return null
  const ref = reference.trim()
  if (ref === '') return null

  if (carriesPrefix(ref, short)) {
    return { prefix: null, reference: ref, text: ref }
  }
  return { prefix: short, reference: ref, text: `${short} ${ref}` }
}
