/**
 * The words on the Timesheets page for acting on a week, read from the
 * one source every door reads (`WEEK_WORDS`, lib/notify/week-words).
 *
 * The screen walk, 2026-11-02: the same week read "Accept timesheet" in
 * Ask Etyme and "Sign anyway…" on this page. The client approves a
 * timesheet (the founder's words, 2026-10-14) and every firm below it
 * accepts what it pays. Sentences about the record may still say the week
 * was signed; the button says the act. Out of the page so a test can read
 * it.
 */
import { WEEK_WORDS, type WeekAct } from '@/lib/notify/week-words'

const actOf = (act: WeekAct | null | undefined): WeekAct => act ?? 'APPROVE'

/** The button on a week: "Approve timesheet", or "Approve anyway…" where the check flagged it. */
export function weekButton(row: { act?: WeekAct | null; flag: string | null }): string {
  const w = WEEK_WORDS[actOf(row.act)]
  return row.flag ? w.flagged : w.button
}

/** The heading of the box that asks why a flagged week is right. */
export function anywayTitle(act: WeekAct | null | undefined, personName: string): string {
  return `${actOf(act) === 'ACCEPT' ? 'Accept' : 'Approve'} ${personName}’s timesheet anyway?`
}

/** The button under that box. */
export function withReasonButton(act: WeekAct | null | undefined): string {
  return `${actOf(act) === 'ACCEPT' ? 'Accept' : 'Approve'} with this reason`
}
