/**
 * What Settings says after a payroll or a day-off change is saved, in a
 * payroll person's words.
 *
 * The walk, 2026-11-14: saving the payroll setting said "Pay dates
 * already set keep their dates; this applies from the next contract."
 * That stopped being true. The Payroll page and a worker's own page read
 * the company's pay periods live (lib/money/company-pay-periods, and
 * `workerPayCalendar` in lib/money/pay-periods), so an existing W-2 line
 * follows a new first Sunday at once. What keeps its dates is only what
 * is already written on a placement's own "What is due" list (its stored
 * cycles), because nothing rewrites them.
 *
 * A company that pays by the month, or has no first Sunday set, is still
 * listed by calendar month, and its lines are read off their written pay
 * days; there the change reaches placements recorded after it. Pure.
 */

import { paysByPeriod, type PayRhythm } from '@/lib/money/pay-periods'

/** Said of the dates nothing rewrites. */
export const WRITTEN_KEEP = 'Pay days already written on a placement’s “What is due” list keep their dates.'

/** After Save payroll. */
export function paySavedSays(r: PayRhythm): string {
  return paysByPeriod(r)
    ? `Saved. The Payroll page and each worker’s own page use these pay periods now. ${WRITTEN_KEEP}`
    : `Saved. Placements recorded from now on take these pay dates. ${WRITTEN_KEEP}`
}

/** After a change to which way dates move off a day nobody works. */
export function shiftSavedSays(i: { payChanged: boolean; byPeriod: boolean }): string {
  const base = 'Saved. Dates already written on a placement’s “What is due” list keep their dates. Placements recorded from now on take the new rule.'
  return i.payChanged && i.byPeriod
    ? `${base} Pay days on the Payroll page and each worker’s own page move by it now.`
    : base
}
