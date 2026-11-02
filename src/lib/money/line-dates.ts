/**
 * The dates on a line, read and refused in a sentence a person says.
 *
 * Recording a placement and adding a line to an order both take the
 * day the person starts and, where known, their last day. The routes
 * refused a last day on or before the start with "endDate must be after
 * startDate" — the right rule in the code's own words (the screen walk,
 * 2026-11-02, at Brightmoor and at Colleen Byrne's firm). This says it
 * with the two days, the way the person who typed them would.
 *
 * The rule does not move here: the last day comes after the first, so a
 * last day on the start day is refused as it always was. Parsing is the
 * routes' own (`new Date(raw)`), so nothing a route accepted before is
 * refused now, and nothing it refused is let through.
 *
 * No database; a browser page may use it to say the same before it posts.
 */

import { formatDay } from '@/lib/format-date'

export type LineDates =
  | { ok: true; start: Date; end: Date | null }
  | { ok: false; field: 'startDate' | 'endDate'; says: string }

const blank = (v: unknown) => v === undefined || v === null || v === ''

/** The start and the last day of a line, or the sentence that refuses them. */
export function lineDates(startRaw: unknown, endRaw: unknown): LineDates {
  if (blank(startRaw)) return { ok: false, field: 'startDate', says: 'Give the day this person starts.' }
  const start = new Date(String(startRaw))
  if (isNaN(start.getTime())) {
    return { ok: false, field: 'startDate', says: `“${String(startRaw)}” is not a day. Give the day this person starts as a date, such as 2026-11-02.` }
  }
  if (blank(endRaw)) return { ok: true, start, end: null }
  const end = new Date(String(endRaw))
  if (isNaN(end.getTime())) {
    return { ok: false, field: 'endDate', says: `“${String(endRaw)}” is not a day. Give the last day as a date, such as 2027-04-30, or leave it empty where it is not known.` }
  }
  if (end.getTime() === start.getTime()) {
    return {
      ok: false, field: 'endDate',
      says: `The last day, ${formatDay(end)}, is the day this person starts. Give a last day after ${formatDay(start)}, or leave it empty where it is not known.`,
    }
  }
  if (end.getTime() < start.getTime()) {
    return {
      ok: false, field: 'endDate',
      says: `The last day, ${formatDay(end)}, is before the start, ${formatDay(start)}. Give a last day after the start, or leave it empty where it is not known.`,
    }
  }
  return { ok: true, start, end }
}
