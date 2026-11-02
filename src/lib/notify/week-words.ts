/**
 * The words for acting on a week, one source for every door.
 *
 * The screen walk, 2026-11-02: Brightmoor's AP & Payroll was offered
 * "Accept timesheet" in Ask Etyme and "Sign anyway…" on its own
 * Timesheets page for the same week. One act, two verbs. The trade's
 * words: the client signs the work; every firm below it accepts what it
 * pays, in turn, the week the client signed (CLAUDE.md, "The signed week
 * travels down the chain").
 *
 * Ask Etyme's card reads these (app/api/conversations/twin/ask.ts,
 * `queueAct`); the Timesheets page is to read the same for a firm that
 * accepts (demand). Pure, so a client page may import it.
 */

export type WeekAct = 'ACCEPT' | 'APPROVE'

export interface WeekWords {
  /** The button on a week nothing is wrong with. */
  button: string
  /** The button on a week the contract check flagged: it asks a reason first. */
  flagged: string
  /** What is said once it is done. */
  done: string
}

export const WEEK_WORDS: Readonly<Record<WeekAct, WeekWords>> = {
  /** A firm below the client, taking the week the client signed. */
  ACCEPT: { button: 'Accept timesheet', flagged: 'Accept anyway…', done: 'Accepted, and recorded under your name.' },
  /** The client, signing the work. Ask Etyme says it as the trade does, "approve a timesheet" (CLAUDE.md, 2026-10-14). */
  APPROVE: { button: 'Approve timesheet', flagged: 'Approve anyway…', done: 'Approved, and recorded under your name.' },
}

/**
 * Which act a week asks of this reader: a firm accepts a week already
 * signed above it; the firm that signs the work approves it.
 */
export function weekActOf(input: { signedAbove: boolean }): WeekAct {
  return input.signedAbove ? 'ACCEPT' : 'APPROVE'
}
