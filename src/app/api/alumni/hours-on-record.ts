/**
 * Hours a past contractor has on record at this client, or null where
 * there is no week to count.
 *
 * Sign-up walk round seven, 14: Past contractors printed HOURS 0 beside
 * Kwame Mensah's twenty-four months on site, because no week of his was
 * ever filed here — the seed wrote none, and a contractor brought in from
 * a spreadsheet will have none either. A zero beside two years reads as
 * "worked nothing". With no week on record the answer is not zero, it is
 * not known, and the row says so.
 *
 * Pure: the route hands it the approved weeks, grouped however it likes.
 */

/** What the row says where there is no week to count. */
export const NO_WEEKS_SAYS = 'no weeks on record here'

export interface HoursTally {
  /** Approved weeks counted, each with its hours. */
  weeks: number
  /** Their hours, unrounded. */
  hours: number
}

export const EMPTY_TALLY: HoursTally = { weeks: 0, hours: 0 }

/**
 * Adds approved weeks to a tally. A week with no hours figure is not
 * counted as a week of zero hours: it is not counted at all.
 */
export function addWeeks(tally: HoursTally, weeks: { totalHours: unknown }[]): HoursTally {
  let { weeks: n, hours } = tally
  for (const w of weeks) {
    if (w.totalHours == null) continue
    const h = Number(w.totalHours)
    if (!Number.isFinite(h)) continue
    n += 1
    hours += h
  }
  return { weeks: n, hours }
}

/** The figure the row shows: whole hours, or null with no week behind it. */
export function hoursOnRecord(tally: HoursTally): number | null {
  if (tally.weeks === 0) return null
  return Math.round(tally.hours)
}
