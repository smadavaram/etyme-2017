import { acceptWith } from '@/lib/timesheet-signatures'

/**
 * Accepting fewer hours than were filed: what the form posts, and the
 * one check the approve route runs on it.
 *
 * Walk 8, 9 November 2026: no screen could accept fewer hours. The tick
 * on the Timesheets row accepted every hour, and no screen sent
 * `acceptedHours`; called directly, the route took 38 of Helena Marsh's
 * 40 with a reason. So the row gains "Accept fewer hours", and the route
 * and the form read this file, so every refusal the route can give names
 * a field the form draws ("every question a route asks, its screen has a
 * field for"). Pure: no database, no clock, safe to import on a screen.
 *
 * What is refused, each under its field:
 *   - no number, or a number below zero, under the hours;
 *   - more hours than were filed, under the hours: only the worker files
 *     the week (the founder, 2026-09-28), so a firm that would add hours
 *     sends the week back for the worker to file again;
 *   - fewer hours with no reason, under the reason, in the sentence that
 *     says why it matters (`acceptWith`, the rule every signature reads).
 */

/** The two fields the form draws, by the names the route reads them under. */
export const ACCEPT_FEWER_FIELDS = { hours: 'acceptedHours', reason: 'note' } as const

export type AcceptFewerField = (typeof ACCEPT_FEWER_FIELDS)[keyof typeof ACCEPT_FEWER_FIELDS]

/** What the form posts: the hours as typed, so a word typed there is refused, never read as every hour. */
export function acceptFewerBody(typed: { hours: string; reason: string }): { acceptedHours: string; note: string } {
  return { acceptedHours: typed.hours.trim(), note: typed.reason.trim() }
}

export type AcceptedHoursCheck =
  | { ok: true; hours: number | null; reason: string }
  | {
      ok: false
      code: 'HOURS_NOT_A_NUMBER' | 'NEGATIVE_HOURS' | 'MORE_THAN_FILED' | 'NEEDS_REASON'
      field: AcceptFewerField
      message: string
    }

/** Hours are kept to two decimals; compare at that precision. */
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * The hours this press accepts, read from the body the way the route reads
 * it. `hours: null` is every hour filed, which needs no reason.
 */
export function checkAcceptedHours(
  filed: number,
  body: { acceptedHours?: unknown; note?: unknown } | null | undefined,
  personName: string
): AcceptedHoursCheck {
  const raw = body?.acceptedHours
  const note = typeof body?.note === 'string' ? body.note : null
  if (raw === undefined || raw === null) {
    const all = acceptWith(filed, null, note)
    return { ok: true, hours: null, reason: all.reason }
  }

  const n =
    typeof raw === 'number' ? raw
    : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim())
    : Number.NaN
  if (!Number.isFinite(n)) {
    return {
      ok: false, code: 'HOURS_NOT_A_NUMBER', field: ACCEPT_FEWER_FIELDS.hours,
      message: 'Enter the hours you accept as a number, for example 38.',
    }
  }
  const hours = r2(n)
  if (hours < 0) {
    return { ok: false, code: 'NEGATIVE_HOURS', field: ACCEPT_FEWER_FIELDS.hours, message: 'Hours cannot be below zero.' }
  }
  if (hours > r2(filed) + 0.005) {
    return {
      ok: false, code: 'MORE_THAN_FILED', field: ACCEPT_FEWER_FIELDS.hours,
      message:
        `${personName} filed ${filed} hours for this week, so you can accept up to ${filed}. ` +
        `Only ${personName} files hours: to add any, send the week back.`,
    }
  }

  // Every hour filed is the ordinary press, with no reason asked.
  const accepted = acceptWith(filed, Math.abs(hours - filed) < 0.005 ? null : hours, note)
  if (!accepted.ok) {
    return { ok: false, code: 'NEEDS_REASON', field: ACCEPT_FEWER_FIELDS.reason, message: accepted.reason }
  }
  return { ok: true, hours: accepted.hours, reason: accepted.reason }
}
