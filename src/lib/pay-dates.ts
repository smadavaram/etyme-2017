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
 * This file imports only the date formatter, which imports nothing, so
 * the settings screen may use it for its preview. The door to the row is
 * lib/payroll-settings.
 */

import { formatDay } from '@/lib/format-date'

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
}

export const DEFAULT_PAY_RHYTHM: Readonly<PayRhythm> = Object.freeze({
  payPeriod: 'BIWEEKLY' as PayPeriod,
  payCalcOffsetDays: 4, // Saturday + 4 = Wednesday
  payDayOffsetDays: 6, // Saturday + 6 = Friday
  payDaysOfMonth: [28], // month end
  payCalcDaysBefore: 3, // 28 − 3 = the 25th
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
  const next: PayRhythm = { ...current, payDaysOfMonth: [...current.payDaysOfMonth] }

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
} | null | undefined): PayRhythm {
  // A stored answer that would fail the door reads as the default rather
  // than as a pay day nobody chose. The days of the month are kept even
  // while the company pays by the week, so switching back finds them.
  const days = row?.payDaysOfMonth
  const keptDays = Array.isArray(days) && days.length > 0 && days.every(isDayOfMonth)
    ? Array.from(new Set(days)).sort((a, b) => a - b)
    : [...DEFAULT_PAY_RHYTHM.payDaysOfMonth]
  const check = checkPaySettings(
    {
      payPeriod: row?.payPeriod ?? undefined,
      payCalcOffsetDays: row?.payCalcOffsetDays ?? undefined,
      payDayOffsetDays: row?.payDayOffsetDays ?? undefined,
      payCalcDaysBefore: row?.payCalcDaysBefore ?? undefined,
    },
    { ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: keptDays },
  )
  if (check.ok) return check.rhythm
  return { ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: [...DEFAULT_PAY_RHYTHM.payDaysOfMonth] }
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
