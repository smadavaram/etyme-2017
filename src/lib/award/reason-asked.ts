/**
 * Whether a route's refusal is a question, and where the answer goes.
 *
 * Addendum E: BLOCK where legally grounded, WARN everywhere else, and a
 * WARN takes a reason and goes ahead. A route says WARN by refusing the
 * first press with a sentence and naming the field the reason goes in;
 * the second press carries the reason and goes through.
 *
 * The second Tapin walk (2026-10-30) found two buttons that heard the
 * question and drew no box for the answer: "Place" showed the time
 * limit's "Give a reason to go ahead." as a toast that was gone before
 * it was read, and "Activate" did the same with a paperwork warning. A
 * WARN with nowhere to type the reason is a BLOCK in disguise, and the
 * person goes round the product. So every screen that presses one of
 * these acts reads the refusal here, once, and draws the route's own
 * sentence with a box under it.
 *
 * Pure: no database, no React. The screens import it; the tests read it.
 */

/** A question the route asked, in its own words, and the field the answer is sent back in. */
export interface ReasonAsked {
  /** The route's own sentence, drawn above the box word for word. */
  says: string
  /** The request field the reason goes back in. */
  field: string
  /** What the route needs beside the reason for it to count (the under-way tick). */
  with?: Readonly<Record<string, unknown>>
}

/**
 * Every WARN-and-proceed refusal the product makes today, by its code,
 * and the field the route reads the answer from. A code not here still
 * counts where the refusal names a reason field itself, or says it can
 * be overridden.
 */
export const ANSWERED_IN: Readonly<Record<string, { field: string; with?: Readonly<Record<string, unknown>> }>> = {
  // The award, and an extension: a line past the client's time limit,
  // where the client's rule warns rather than blocks.
  TIME_LIMIT_REASON: { field: 'limitReason' },
  // The award: the work started before the award, ticked, and no why.
  NO_REASON: { field: 'underWayReason', with: { workUnderWay: true } },
  // Activation: a paper that warns, and a client rule that warns.
  DOCUMENTS_WARN: { field: 'overrideReason' },
  GOVERNANCE_WARN: { field: 'overrideReason' },
  // An extension: a paper ending before the new last day.
  PAPERS_NEED_A_REASON: { field: 'reason' },
}

/**
 * The refusal's question, or null where it is a plain no.
 *
 * A refusal with no sentence is never a question: a box under nothing
 * asks the person to justify something they were not told.
 */
export function reasonAsked(error: unknown): ReasonAsked | null {
  if (!error || typeof error !== 'object') return null
  const e = error as { code?: unknown; message?: unknown; field?: unknown; overridable?: unknown }
  const says = typeof e.message === 'string' ? e.message.trim() : ''
  if (!says) return null
  // A refusal whose code says it wants a reason, and names the field the
  // route reads it from, is answered in that field: the timesheet's
  // FLAG_NEEDS_REASON and NEEDS_REASON name `note` (Today → Approvals drew
  // no box for it; the screen walk, 2026-11-02).
  // What a known code sends beside its answer travels only where the route
  // named the same field: NO_REASON from a paper's examination names
  // `reason` and is never an award's "work under way".
  if (typeof e.field === 'string' && e.field && typeof e.code === 'string' && /REASON$/.test(e.code)) {
    const known = ANSWERED_IN[e.code]
    return known?.with && known.field === e.field ? { says, field: e.field, with: known.with } : { says, field: e.field }
  }
  const known = typeof e.code === 'string' ? ANSWERED_IN[e.code] : undefined
  if (known) return known.with ? { says, field: known.field, with: known.with } : { says, field: known.field }
  if (typeof e.field === 'string' && /reason$/i.test(e.field)) return { says, field: e.field }
  if (e.overridable === true) return { says, field: 'overrideReason' }
  return null
}

/**
 * The answers to send with the next press: only those whose question has
 * been shown, each beside what its route needs with it. A reason typed
 * for one warning never answers a second the person has not read, so a
 * question with an empty answer is left out, and the route asks again.
 */
export function answersFor(
  asked: Readonly<Record<string, ReasonAsked>>,
  typed: Readonly<Record<string, string>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [field, q] of Object.entries(asked)) {
    const answer = (typed[field] ?? '').trim()
    if (!answer) continue
    Object.assign(out, q.with ?? {}, { [field]: answer })
  }
  return out
}

/** True while any question on the screen has no answer: the button that sends it waits. */
export function unanswered(
  asked: Readonly<Record<string, ReasonAsked>>,
  typed: Readonly<Record<string, string>>
): boolean {
  return Object.keys(asked).some((field) => !(typed[field] ?? '').trim())
}
