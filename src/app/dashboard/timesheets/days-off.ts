/**
 * Which days of a week the timesheet screen expects hours on.
 *
 * The days off are the company's own setting (`lib/days-off`), read on
 * this screen through `GET /api/settings/week`. A Dubai firm with Friday
 * off sees Friday shaded and Sunday expected. A day off is only not
 * expected: it is never refused, and hours entered on it are filed like
 * any other day's.
 *
 * Pure, with no database, so the client screen can use it. Where the
 * answer cannot be read — the route refuses a seat without
 * `settings.manage`, or the network fails — the default week stands,
 * Saturday and Sunday off, which is also what a company that never
 * answered has.
 */

import { DEFAULT_DAYS_OFF, cleanDaysOff } from '@/lib/cycle-shift'

export { DEFAULT_DAYS_OFF }

/** The days off in an answer from `/api/settings/week`, or the default. */
export function daysOffFromAnswer(body: unknown): number[] {
  const data = (body as { data?: { daysOff?: unknown } } | null)?.data
  return cleanDaysOff(data?.daysOff) ?? [...DEFAULT_DAYS_OFF]
}

/** Whether a calendar day (YYYY-MM-DD, read in UTC) is one of the company's days off. */
export function isOffDay(iso: string, daysOff: readonly number[]): boolean {
  return daysOff.includes(new Date(`${iso}T00:00:00Z`).getUTCDay())
}

/** The hours a day is expected to hold, as the placeholder shows it: 8 on a working day, 0 on a day off. */
export function expectedHours(iso: string, daysOff: readonly number[]): number {
  return isOffDay(iso, daysOff) ? 0 : 8
}
