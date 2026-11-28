import { answersFor, type ReasonAsked } from '@/lib/award/reason-asked'

/**
 * What the Place dialog posts to the award, as a pure function of what it
 * draws, so a test can fill in every field the dialog draws, post exactly
 * this, and run the route's own rules on it (the founder's I-9 bug,
 * 2026-11-01: a route asked for a field no screen offered, and a test of
 * the rule alone and a test of the screen alone both passed).
 */

/** What the dialog's fields hold when Place is pressed. */
export interface AwardTyped {
  /** The bill rate, already read through the one rate reader, in cents. */
  cents: number
  /** "YYYY-MM-DD", from the date field. */
  startDate: string
  /** The day is before today, so the dialog draws the under-way tick and its box. */
  before: boolean
  underWay: boolean
  why: string
}

/** The body the dialog posts. */
export function awardBody(
  t: AwardTyped,
  asked: Readonly<Record<string, ReasonAsked>>,
  typed: Readonly<Record<string, string>>
): Record<string, unknown> {
  return {
    rate: t.cents,
    startDate: t.startDate,
    ...(t.before && t.underWay ? { workUnderWay: true, underWayReason: t.why.trim() } : {}),
    // Only the answers to questions the route has asked and the person has read.
    ...answersFor(asked, typed),
  }
}

/**
 * Every field the award reads that this dialog never sends, and why it
 * need not: the route answers it itself, or refuses it from a buyer.
 */
export const AWARD_FIELDS_NOT_SENT: Readonly<Record<string, string>> = {
  endDate: 'The last day is worked out from the job’s months where none is given.',
  payRate: 'What the supplier pays its person is the supplier’s business; the award refuses a pay rate from the buyer.',
}
