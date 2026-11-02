import { roundAsks, type Outcome } from '@/lib/interviews'

/**
 * What the interviews page posts to a round (`POST /api/interviews/:id`),
 * as a pure function of what each of its controls holds, so a test can
 * fill in every field the page draws, post exactly this, and run the
 * route's own rule on it (`roundAsks` in lib/interviews). The founder's
 * I-9 bug, 2026-11-01: a route asked for a field no screen offered, and a
 * test of the rule alone and a test of the screen alone both passed.
 */
export type RoundTyped =
  /** A supplier picks one of the times offered, answering for its candidate too. */
  | { act: 'CONFIRM'; slotStart: string }
  /** "Nobody turned up": the candidate missed it. */
  | { act: 'NO_SHOW' }
  /** "Say what came of it": the button pressed, and the box above them. */
  | { act: 'OUTCOME'; outcome: Outcome; feedback: string }
  /** The panel: one name added from the box, or one taken off with its ×. */
  | { act: 'PANEL_ADD'; name: string }
  | { act: 'PANEL_REMOVE'; name: string }
  /** "Call off this round": the reason box. */
  | { act: 'CANCEL'; reason: string }

/** The body the page posts for an act. */
export function roundBody(t: RoundTyped): Record<string, unknown> {
  switch (t.act) {
    case 'CONFIRM': return { action: 'confirm', slotStart: t.slotStart, forConsultant: true }
    case 'NO_SHOW': return { action: 'outcome', noShowBy: 'CONSULTANT' }
    case 'OUTCOME': return { action: 'outcome', outcome: t.outcome, feedback: t.feedback }
    case 'PANEL_ADD': return { action: 'interviewers', add: [t.name.trim()] }
    case 'PANEL_REMOVE': return { action: 'interviewers', remove: [t.name] }
    case 'CANCEL': return { action: 'cancel', reason: t.reason.trim() }
  }
}

/**
 * Whether a button may be pressed with what its box holds: exactly where
 * the route's own rule would take the body, so the page never offers a
 * press the route refuses for a missing answer.
 */
export function mayPress(t: RoundTyped): boolean {
  return roundAsks(roundBody(t)) === null
}

/**
 * Every field the round route reads that this page never sends, and why
 * it need not.
 */
export const ROUND_FIELDS_NOT_SENT: Readonly<Record<string, string>> = {
  interviewers: 'The page adds and takes off one name at a time; the whole panel is set when the round is proposed.',
}
