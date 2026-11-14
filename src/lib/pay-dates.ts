/**
 * The company's payroll rhythm, as pure arithmetic: how often pay is run,
 * the day it is worked out and the day it is paid.
 *
 * ── What the founder decided, 2026-10-07 ─────────────────────────────
 *
 * "Give choice to businesses when they want to configure payroll." Until
 * then the pay rhythm came only from the template pack. The pack's answer
 * stays the default; a company may change it.
 *
 * - Every other week (the default), every week: pay is worked out a set
 *   number of days after the period's Saturday and paid a set number of
 *   days after it. Default: worked out the Wednesday (Saturday + 4) and
 *   paid the Friday (Saturday + 6).
 * - Twice a month, once a month: pay is paid on set days of the month,
 *   1 to 28, where 28 means the last day of the month (the same reading
 *   as `MEANS_MONTH_END` in lib/cycle-generator), and worked out a set
 *   number of days before. Default: once a month, paid at month end and
 *   worked out on the 25th — today's pack.
 *
 * ── Two choices this file makes, written down ────────────────────────
 *
 * "Worked out N days before" counts back from the day of the month the
 * company chose, not from the date month end resolves to. So the default
 * is worked out on the 25th in every month — 28 − 3 — and paid on the
 * 28th, 30th or 31st. That is exactly today's pack (`dayOfMonth: 25`
 * beside `dayOfMonth: 28`), and it keeps the day pay is worked out the
 * same in every month, which is what a payroll desk plans around.
 *
 * Nothing here moves a date off a weekend or a holiday. That is
 * lib/cycle-shift, with the company's own days off and its pay direction,
 * applied by the generator after these dates are found.
 *
 * This file imports only the date formatter and lib/cycle-shift, neither
 * of which imports the database, so the settings screen may use it for
 * its preview. The door to the row is lib/payroll-settings.
 *
 * ── Where the first pay period starts (2026-11-14) ───────────────────
 *
 * The founder, for Tapin: "W2 first, outside payroll provider, biweekly".
 * Every other week needs a first week, and no date is guessed: the Owner
 * gives it. The week runs Sunday to Saturday and hours are accepted by
 * the week, so a weekly or two-week period is whole weeks and starts on
 * a Sunday. Periods run forward and back from that Sunday without end,
 * so a week worked before the first period still falls in one. A week
 * belongs to the period that holds its Sunday (`payPeriodHolding`).
 */

import { formatDay, formatDayLong, formatRange } from '@/lib/format-date'
import { DEFAULT_CYCLE_SHIFT, localDayKey, shiftToWorkingDay, type ShiftDirection } from '@/lib/cycle-shift'

export type PayPeriod = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY'

/** The four choices, in the order a screen offers them: the default first. */
export const PAY_PERIODS: readonly PayPeriod[] = Object.freeze(['BIWEEKLY', 'WEEKLY', 'SEMIMONTHLY', 'MONTHLY'] as PayPeriod[])

/** What each choice is called on a screen. */
export const PAY_PERIOD_WORDS: Readonly<Record<PayPeriod, string>> = Object.freeze({
  BIWEEKLY: 'Every other week',
  WEEKLY: 'Every week',
  SEMIMONTHLY: 'Twice a month',
  MONTHLY: 'Once a month',
})

/** The answers a company gives about its payroll. */
export interface PayRhythm {
  payPeriod: PayPeriod
  /** Weekly and biweekly: days after the period's Saturday that pay is worked out. */
  payCalcOffsetDays: number
  /** Weekly and biweekly: days after the period's Saturday that pay is paid. */
  payDayOffsetDays: number
  /** Twice a month and monthly: pay days of the month, 1 to 28, ascending; 28 means month end. */
  payDaysOfMonth: number[]
  /** Twice a month and monthly: days before the pay day that pay is worked out. */
  payCalcDaysBefore: number
  /**
   * Every week and every other week: the Sunday the first pay period
   * starts on, as "2026-12-06". Null where nobody has said; then no
   * period is worked out from it. Kept while the company pays by the
   * month, so switching back finds it. Optional only so a caller that
   * builds a rhythm by hand need not name it.
   */
  payFirstPeriodStart?: string | null
}

export const DEFAULT_PAY_RHYTHM: Readonly<PayRhythm> = Object.freeze({
  payPeriod: 'BIWEEKLY' as PayPeriod,
  payCalcOffsetDays: 4, // Saturday + 4 = Wednesday
  payDayOffsetDays: 6, // Saturday + 6 = Friday
  payDaysOfMonth: [28], // month end
  payCalcDaysBefore: 3, // 28 − 3 = the 25th
  payFirstPeriodStart: null, // nobody has said; never guessed
})

/** The pay days a monthly shape starts from when a screen switches to it. */
export const SUGGESTED_DAYS_OF_MONTH: Readonly<Record<'SEMIMONTHLY' | 'MONTHLY', number[]>> = Object.freeze({
  SEMIMONTHLY: [15, 28],
  MONTHLY: [28],
})

/** At this day of the month, a pay day means the last day of the month. */
export const MEANS_MONTH_END = 28
/** The most days any offset may be. */
export const MAX_OFFSET_DAYS = 30

export const PAY_BEFORE_WORKED_OUT = 'Pay cannot go out before it is worked out.'
export const DAY_OF_MONTH_RANGE =
  'A pay day is from the 1st to the 28th of the month, because every month has a 28th. Pick 28 for the last day of the month.'
/** A fact said beside the twice-a-month and monthly choices. A note, not a refusal. */
export const STATE_PAY_NOTE = 'Some US states require pay at least twice a month.'

const isPeriod = (v: unknown): v is PayPeriod => typeof v === 'string' && (PAY_PERIODS as readonly string[]).includes(v)
const isOffset = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_OFFSET_DAYS
const isDayOfMonth = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MEANS_MONTH_END
const isWeekShape = (p: PayPeriod) => p === 'WEEKLY' || p === 'BIWEEKLY'

export interface PayChanges {
  payPeriod?: unknown
  payCalcOffsetDays?: unknown
  payDayOffsetDays?: unknown
  payDaysOfMonth?: unknown
  payCalcDaysBefore?: unknown
  /** "2026-12-06", or null or "" to clear it. */
  payFirstPeriodStart?: unknown
}

/**
 * Every answer the payroll door takes, by name: the route reads these from
 * the request and the settings screen sends these, so neither can ask for
 * a field the other does not have.
 */
export const PAY_CHANGE_FIELDS = Object.freeze([
  'payPeriod', 'payCalcOffsetDays', 'payDayOffsetDays', 'payDaysOfMonth', 'payCalcDaysBefore', 'payFirstPeriodStart',
] as const) satisfies readonly (keyof PayChanges)[]

/** What the settings screen sends when Save payroll is pressed: every answer on it. */
export function payrollBody(draft: PayRhythm): Record<(typeof PAY_CHANGE_FIELDS)[number], unknown> {
  return {
    payPeriod: draft.payPeriod,
    payCalcOffsetDays: draft.payCalcOffsetDays,
    payDayOffsetDays: draft.payDayOffsetDays,
    payDaysOfMonth: draft.payDaysOfMonth,
    payCalcDaysBefore: draft.payCalcDaysBefore,
    payFirstPeriodStart: draft.payFirstPeriodStart ?? null,
  }
}

export type PayCheck =
  | { ok: true; rhythm: PayRhythm; changed: string[] }
  | { ok: false; field: string; message: string }

const OFFSET_WORDS = {
  payCalcOffsetDays: 'Pay is worked out from 0 to 30 days after the period ends.',
  payDayOffsetDays: 'Pay day is from 0 to 30 days after the period ends.',
  payCalcDaysBefore: 'Pay is worked out from 0 to 30 days before the pay day.',
} as const

/**
 * The answers as they would stand after these changes, or the sentence
 * saying why not. No database: the route, the screen and the tests all
 * ask this.
 *
 * Every week and every other week ignore the days of the month: a change
 * to them is not stored and not reported as changed.
 */
export function checkPaySettings(changes: PayChanges, current: PayRhythm = DEFAULT_PAY_RHYTHM): PayCheck {
  const changed: string[] = []
  const next: PayRhythm = {
    ...current,
    payDaysOfMonth: [...current.payDaysOfMonth],
    payFirstPeriodStart: current.payFirstPeriodStart ?? null,
  }

  if (changes.payPeriod !== undefined) {
    if (!isPeriod(changes.payPeriod)) {
      return {
        ok: false,
        field: 'payPeriod',
        message: 'Pay is run every week, every other week, twice a month or once a month.',
      }
    }
    next.payPeriod = changes.payPeriod
    changed.push('payPeriod')
  }

  for (const field of ['payCalcOffsetDays', 'payDayOffsetDays', 'payCalcDaysBefore'] as const) {
    if (changes[field] === undefined) continue
    if (!isOffset(changes[field])) return { ok: false, field, message: OFFSET_WORDS[field] }
    next[field] = changes[field] as number
    changed.push(field)
  }

  if (changes.payDaysOfMonth !== undefined && !isWeekShape(next.payPeriod)) {
    const v = changes.payDaysOfMonth
    if (!Array.isArray(v) || !v.every(isDayOfMonth)) {
      return { ok: false, field: 'payDaysOfMonth', message: DAY_OF_MONTH_RANGE }
    }
    next.payDaysOfMonth = Array.from(new Set(v as number[])).sort((a, b) => a - b)
    changed.push('payDaysOfMonth')
  }

  // Twice a month and once a month have no weeks to start: the first day
  // is not stored and not reported as changed, as the days of the month
  // are not while the company pays by the week.
  if (changes.payFirstPeriodStart !== undefined && isWeekShape(next.payPeriod)) {
    const first = checkFirstPeriodStart(changes.payFirstPeriodStart)
    if (!first.ok) return first
    next.payFirstPeriodStart = first.day
    changed.push('payFirstPeriodStart')
  }

  if (next.payPeriod === 'SEMIMONTHLY' && next.payDaysOfMonth.length !== 2) {
    return {
      ok: false,
      field: 'payDaysOfMonth',
      message: 'Twice a month needs two different pay days, such as the 15th and the 28th.',
    }
  }
  if (next.payPeriod === 'MONTHLY' && next.payDaysOfMonth.length !== 1) {
    return { ok: false, field: 'payDaysOfMonth', message: 'Once a month needs one pay day, such as the 28th.' }
  }

  if (next.payDayOffsetDays < next.payCalcOffsetDays) {
    return { ok: false, field: 'payDayOffsetDays', message: PAY_BEFORE_WORKED_OUT }
  }

  return { ok: true, rhythm: next, changed }
}

/** What a company row holds, read as answers this build can stand behind. */
export function rhythmFrom(row: {
  payPeriod?: string | null
  payCalcOffsetDays?: number | null
  payDayOffsetDays?: number | null
  payDaysOfMonth?: number[] | null
  payCalcDaysBefore?: number | null
  payFirstPeriodStart?: Date | string | null
} | null | undefined): PayRhythm {
  // A stored answer that would fail the door reads as the default rather
  // than as a pay day nobody chose. The days of the month are kept even
  // while the company pays by the week, so switching back finds them.
  const days = row?.payDaysOfMonth
  const keptDays = Array.isArray(days) && days.length > 0 && days.every(isDayOfMonth)
    ? Array.from(new Set(days)).sort((a, b) => a - b)
    : [...DEFAULT_PAY_RHYTHM.payDaysOfMonth]
  // A stored first day that is not a Sunday reads as nobody having said,
  // never as a period nobody chose. Kept whatever the period is.
  const first = checkFirstPeriodStart(row?.payFirstPeriodStart ?? null)
  const keptFirst = first.ok ? first.day : null
  const check = checkPaySettings(
    {
      payPeriod: row?.payPeriod ?? undefined,
      payCalcOffsetDays: row?.payCalcOffsetDays ?? undefined,
      payDayOffsetDays: row?.payDayOffsetDays ?? undefined,
      payCalcDaysBefore: row?.payCalcDaysBefore ?? undefined,
    },
    { ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: keptDays, payFirstPeriodStart: keptFirst },
  )
  if (check.ok) return check.rhythm
  return { ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: [...DEFAULT_PAY_RHYTHM.payDaysOfMonth], payFirstPeriodStart: keptFirst }
}

// ── Dates ──────────────────────────────────────────────────────────────

/** The day pay for one period is worked out and the day it is paid. */
export interface PayDates {
  /** The day pay is worked out. UTC midnight. */
  calcOn: Date
  /** The day pay is paid. UTC midnight, never before `calcOn`. */
  payOn: Date
}

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const lastDayOf = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()

/** One pay day of the month, resolved: 28 and past is the last day. */
function payDayIn(year: number, month0: number, nominal: number, before: number): PayDates {
  const day = nominal >= MEANS_MONTH_END ? lastDayOf(year, month0) : nominal
  // Counted back from the day chosen, not from the day month end resolves
  // to, so the default works out on the 25th in every month.
  const calcFrom = Math.min(nominal, MEANS_MONTH_END)
  return {
    calcOn: new Date(Date.UTC(year, month0, calcFrom - before)),
    payOn: new Date(Date.UTC(year, month0, day)),
  }
}

/**
 * Every pay day in one calendar month, for twice a month and once a
 * month, in date order. `month` is 1 to 12. Every week and every other
 * week have no days of the month and return nothing: use `payDatesFor`
 * with the period's Saturday.
 */
export function payDatesInMonth(year: number, month: number, s: PayRhythm): PayDates[] {
  if (isWeekShape(s.payPeriod)) return []
  return s.payDaysOfMonth.map((d) => payDayIn(year, month - 1, d, s.payCalcDaysBefore))
}

/**
 * When pay for the period ending on `periodEnd` is worked out and paid.
 *
 * - Every week and every other week: `periodEnd` is the period's
 *   Saturday; pay is worked out and paid the company's offsets after it.
 * - Twice a month and once a month: the period ends on a pay day, and
 *   this is the first pay day on or after `periodEnd`. Hand it the 15th or
 *   the month end and it returns that pay day.
 *
 * Read in UTC. No weekend or holiday shift is applied here.
 */
export function payDatesFor(periodEnd: Date, s: PayRhythm): PayDates {
  const end = utcDay(periodEnd)
  if (isWeekShape(s.payPeriod)) {
    return { calcOn: new Date(end + s.payCalcOffsetDays * DAY), payOn: new Date(end + s.payDayOffsetDays * DAY) }
  }
  const y = periodEnd.getUTCFullYear()
  const m = periodEnd.getUTCMonth()
  for (const [year, month0] of [[y, m], [m === 11 ? y + 1 : y, (m + 1) % 12]]) {
    for (const d of s.payDaysOfMonth) {
      const dates = payDayIn(year, month0, d, s.payCalcDaysBefore)
      if (dates.payOn.getTime() >= end) return dates
    }
  }
  // Unreachable while a monthly shape holds at least one pay day.
  return payDayIn(y, m, MEANS_MONTH_END, s.payCalcDaysBefore)
}

// ── Words for a screen ─────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * An offset after the period's Saturday, said as a day: 4 is "Wednesday
 * after the period ends", 11 "Wednesday, a week later", 0 "Saturday, the
 * day the period ends".
 */
export function offsetWords(offset: number): string {
  if (offset === 0) return 'Saturday, the day the period ends'
  const name = WEEKDAYS[(6 + offset) % 7]
  const weeks = Math.floor((offset - 1) / 7)
  if (weeks === 0) return `${name} after the period ends`
  return weeks === 1 ? `${name}, a week later` : `${name}, ${weeks} weeks later`
}

/** A day of the month said plainly: 1 is "1st", 28 is "28th (month end)". */
export function dayOfMonthWords(d: number): string {
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'
  return d >= MEANS_MONTH_END ? `${d}${suffix} (month end)` : `${d}${suffix}`
}

/**
 * One line saying when the next pay is worked out and paid, from `today`:
 * "A period ending Sat, Oct 10 is worked out Wed, Oct 14 and paid Fri,
 * Oct 16." For the monthly shapes, the next pay day on or after today.
 * Computed with `payDatesFor`, so the screen promises what the generator
 * will write, before any weekend or holiday move.
 */
export function payPreview(s: PayRhythm, today: Date): string {
  const day = new Date(utcDay(today))
  const short = (d: Date) => formatDay(d, { weekday: true, year: false })
  if (isWeekShape(s.payPeriod)) {
    const saturday = new Date(day.getTime() + ((6 - day.getUTCDay() + 7) % 7) * DAY)
    const { calcOn, payOn } = payDatesFor(saturday, s)
    return `A period ending ${short(saturday)} is worked out ${short(calcOn)} and paid ${short(payOn)}.`
  }
  const { calcOn, payOn } = payDatesFor(day, s)
  return `The next pay day, ${short(payOn)}, is worked out ${short(calcOn)}.`
}

// ── The first pay period, and the period any day falls in ──────────────

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** What the setting is called on the screen. */
export const FIRST_PERIOD_LABEL = 'First pay period starts on'

/** The one line under the field, saying what it does. */
export const FIRST_PERIOD_HELP =
  'Pay periods are whole weeks, Sunday to Saturday, counted forward and back from this Sunday.'

/** Said where a weekly or two-week company has not set the day. */
export const FIRST_PERIOD_UNSET =
  'Until this is set, the Payroll page lists pay by calendar month.'

export const FIRST_PERIOD_NOT_A_DAY = 'Enter the first pay period’s first day as a date, such as Dec 6, 2026.'

/** Midnight UTC of a calendar day "YYYY-MM-DD", or null where it is not a real day. */
function dayMs(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [y, m, d] = key.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  const back = new Date(ms)
  // "2026-02-30" is not a day; Date.UTC would quietly make it March 2.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null
  return ms
}

const keyOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * A calendar day as "YYYY-MM-DD". A `Date` is read in UTC, because every
 * stored day in this product is midnight UTC; a string is taken as the
 * day it names. Never the reader's time zone, which moves a day.
 */
function dayKeyOf(day: Date | string): string | null {
  if (day instanceof Date) return Number.isNaN(day.getTime()) ? null : day.toISOString().slice(0, 10)
  return dayMs(day) === null ? null : day
}

/**
 * The sentence for a day that is not a Sunday: "December 9, 2026 is a
 * Wednesday. A pay period starts on a Sunday: pick December 6, 2026 or
 * December 13, 2026."
 */
export function notASundaySays(key: string): string {
  const ms = dayMs(key)
  if (ms === null) return FIRST_PERIOD_NOT_A_DAY
  const wd = new Date(ms).getUTCDay()
  const before = keyOfMs(ms - wd * DAY)
  const after = keyOfMs(ms + (7 - wd) * DAY)
  return `${formatDayLong(key)} is a ${WEEKDAY_NAMES[wd]}. A pay period starts on a Sunday: ` +
    `pick ${formatDayLong(before)} or ${formatDayLong(after)}.`
}

export type FirstPeriodCheck =
  | { ok: true; day: string | null }
  | { ok: false; field: 'payFirstPeriodStart'; message: string }

/**
 * Whether a day may be the first day of the first pay period: a real
 * calendar day that is a Sunday. Null, or an empty box, clears it.
 */
export function checkFirstPeriodStart(value: unknown): FirstPeriodCheck {
  if (value === null || value === '') return { ok: true, day: null }
  const key = typeof value === 'string' ? dayKeyOf(value.trim()) : value instanceof Date ? dayKeyOf(value) : null
  if (!key) return { ok: false, field: 'payFirstPeriodStart', message: FIRST_PERIOD_NOT_A_DAY }
  if (new Date(dayMs(key)!).getUTCDay() !== 0) {
    return { ok: false, field: 'payFirstPeriodStart', message: notASundaySays(key) }
  }
  return { ok: true, day: key }
}

/**
 * The company's rule for a pay date on a day nobody works: its days off,
 * its holiday calendar as "YYYY-MM-DD" keys, and its pay direction. Each
 * left out reads as the shipped default: Saturday and Sunday off, no
 * holidays, and the working day before.
 */
export interface DayOffRule {
  holidays?: Iterable<string>
  direction?: ShiftDirection
  daysOff?: readonly number[]
}

/** One weekly or two-week pay period, with the days its pay is worked out and paid. */
export interface PayPeriodOn {
  /** The period's Sunday, "YYYY-MM-DD". */
  start: string
  /** The period's Saturday. */
  end: string
  /** The day pay is worked out, after the day-off rule. */
  calcOn: string
  /** The day pay is paid, after the day-off rule. */
  payOn: string
  /** The Saturday plus the company's offset, before any move. */
  calcOnUnmoved: string
  payOnUnmoved: string
}

/**
 * A day moved off a day nobody works by the one rule the cycle generator
 * uses (`shiftToWorkingDay` in lib/cycle-shift). That rule reads the
 * weekday and the holiday key in the server's own zone, so the day is
 * built there at its own midnight and read back the same way: no time
 * zone can move it.
 */
function movedOff(key: string, rule: DayOffRule): string {
  const [y, m, d] = key.split('-').map(Number)
  const local = new Date(y, m - 1, d)
  const moved = shiftToWorkingDay(local, new Set(rule.holidays ?? []), rule.direction ?? DEFAULT_CYCLE_SHIFT.pay, rule.daysOff)
  return localDayKey(moved)
}

/**
 * The weekly or two-week pay period that holds this day, counted from the
 * company's first period: period n starts on the first day plus 7 or 14
 * days times n, for any whole n, before the first period as well as
 * after it. A week belongs to the period that holds its Sunday, which is
 * the period that holds every day of it, because a period never splits a
 * week.
 *
 * Pay is worked out on the period's Saturday plus `payCalcOffsetDays` and
 * paid on the Saturday plus `payDayOffsetDays`, each then moved off a day
 * nobody works by the company's own rule.
 *
 * Null where the company pays twice a month or once a month, or has not
 * said which Sunday its first period starts on: nothing is guessed.
 */
export function payPeriodHolding(day: Date | string, s: PayRhythm, rule: DayOffRule = {}): PayPeriodOn | null {
  if (!isWeekShape(s.payPeriod) || !s.payFirstPeriodStart) return null
  const first = dayMs(s.payFirstPeriodStart)
  if (first === null || new Date(first).getUTCDay() !== 0) return null
  const key = dayKeyOf(day)
  if (!key) return null
  const step = (s.payPeriod === 'WEEKLY' ? 7 : 14) * DAY
  const n = Math.floor((dayMs(key)! - first) / step)
  const start = first + n * step
  const saturday = start + step - DAY
  const { calcOn, payOn } = payDatesFor(new Date(saturday), s)
  const calcOnUnmoved = keyOfMs(calcOn.getTime())
  const payOnUnmoved = keyOfMs(payOn.getTime())
  return {
    start: keyOfMs(start),
    end: keyOfMs(saturday),
    calcOn: movedOff(calcOnUnmoved, rule),
    payOn: movedOff(payOnUnmoved, rule),
    calcOnUnmoved,
    payOnUnmoved,
  }
}

/**
 * The first period said in a payroll person's words: "The first period
 * is Dec 6 – Dec 19, 2026. Its pay is worked out Wed, Dec 23, 2026 and
 * paid Thu, Dec 24, 2026." Where the pay day moved, one more sentence
 * says from which day.
 */
export function firstPeriodSays(p: PayPeriodOn): string {
  const day = (k: string) => formatDay(k, { weekday: true })
  const moved = p.payOn !== p.payOnUnmoved
    ? ` The pay day moved from ${day(p.payOnUnmoved)}, a day off or a holiday.`
    : ''
  return `The first period is ${formatRange(p.start, p.end)}. ` +
    `Its pay is worked out ${day(p.calcOn)} and paid ${day(p.payOn)}.${moved}`
}
