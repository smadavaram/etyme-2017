/**
 * One way to print a calendar day on a screen.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * On 2026-10-06, 88 files under `src/` called `toLocaleDateString`
 * directly, in more than a dozen shapes: bare calls that print in the
 * reader's browser locale and time zone, `en-GB` beside `en-US`, long
 * months beside short ones, with the year and without it. Two screens
 * could print the same `periodEnd` as two different days, because a day
 * stored at midnight UTC, read in Los Angeles, is the evening before.
 *
 * Every stored day in this product is midnight UTC (see `lib/seed-days`
 * and `lib/plain-date`), so a day is read in UTC and nowhere else. The
 * year is shown unless the caller says otherwise, because a date with no
 * year on a contract or a bill is the ambiguity this file exists to end.
 *
 * ── What this is not for ─────────────────────────────────────────────
 *
 * A moment — a message sent at 9:14, an interview at 2pm Pacific — is not
 * a calendar day, and it is printed in somebody's own zone with the zone
 * named. That is `lib/when`. This file is for days.
 *
 * `__tests__/invariants/one-date-formatter.test.ts` fails on any new file
 * under `src/` that formats a date some other way. Like `lib/plain-date`,
 * this file imports nothing, so a browser page may use it.
 */

/** A `Date` (including a Prisma `DateTime`) or an ISO day, "2026-10-06". */
export type DayInput = Date | string

export interface DayOptions {
  /** Show the year. On by default; turn off only where the year is said nearby. */
  year?: boolean
  /** Lead with the day of the week: "Tue, Oct 6, 2026". Off by default. */
  weekday?: boolean
}

/**
 * The instant a day input names. An ISO day is midnight UTC; a full ISO
 * timestamp is read as written. A number is refused, because a bare
 * `Date.now()` is a moment, and printing it as a day is how a screen ends
 * up a day out.
 */
function toDate(d: DayInput): Date {
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) throw new RangeError('An invalid date was handed to the date formatter.')
    return d
  }
  if (typeof d === 'string') {
    const s = d.trim()
    const parsed =
      /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`)
        : /^\d{4}-\d{2}$/.test(s) ? new Date(`${s}-01T00:00:00.000Z`)
          : new Date(s)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  throw new RangeError(
    `${JSON.stringify(d)} is not a day the date formatter can read. ` +
    'Pass a Date or an ISO day such as "2026-10-06".',
  )
}

function print(d: DayInput, month: 'short' | 'long', o: DayOptions): string {
  return toDate(d).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month,
    day: 'numeric',
    ...(o.year === false ? {} : { year: 'numeric' }),
    ...(o.weekday ? { weekday: month } : {}),
  })
}

/**
 * "Oct 6, 2026". Null stays null, so a missing date is never printed as a
 * made-up one; a screen decides what its blank looks like.
 */
export function formatDay(d: DayInput, opts?: DayOptions): string
export function formatDay(d: DayInput | null | undefined, opts?: DayOptions): string | null
export function formatDay(d: DayInput | null | undefined, opts: DayOptions = {}): string | null {
  return d == null ? null : print(d, 'short', opts)
}

/** "October 6, 2026" — for letters and sentences, where a short month reads clipped. */
export function formatDayLong(d: DayInput, opts?: DayOptions): string
export function formatDayLong(d: DayInput | null | undefined, opts?: DayOptions): string | null
export function formatDayLong(d: DayInput | null | undefined, opts: DayOptions = {}): string | null {
  return d == null ? null : print(d, 'long', opts)
}

/** "Oct 2026". Accepts "2026-10" as well as a day or a `Date`. */
export function formatMonth(d: DayInput): string
export function formatMonth(d: DayInput | null | undefined): string | null
export function formatMonth(d: DayInput | null | undefined): string | null {
  return d == null ? null : toDate(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
}

/**
 * Two days: "Oct 6 – Oct 10, 2026" inside one year, the year said once;
 * "Dec 29, 2025 – Jan 2, 2026" across two; one day alone where both are
 * the same day. An en dash with a space either side.
 */
export function formatRange(a: DayInput, b: DayInput): string {
  const start = toDate(a)
  const end = toDate(b)
  const key = (x: Date) => x.toISOString().slice(0, 10)
  if (key(start) === key(end)) return print(start, 'short', {})
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  return `${print(start, 'short', { year: !sameYear })} – ${print(end, 'short', {})}`
}
