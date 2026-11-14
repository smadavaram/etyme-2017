/**
 * The company's own weekly or two-week pay periods, as a payroll person
 * lists them: the one holding a day, the ones around it, the ones whose
 * pay day falls in a window, and the pay file for one period.
 *
 * The founder, 2026-11-14, for Tapin: "W2 first, outside payroll
 * provider, biweekly". The Owner gives the Sunday the first period starts
 * on (Settings, Cycles, Payroll). From it the periods run forward and back
 * without end, each whole weeks from a Sunday to a Saturday.
 *
 * ── One period function, not two ─────────────────────────────────────
 *
 * Which period holds a day, and its work-out day and pay day, is
 * `payPeriodHolding` in lib/pay-dates. Its pay day is the period's
 * Saturday plus the company's offset, then moved off a day nobody works
 * by `shiftToWorkingDay` in lib/cycle-shift: the one rule the cycle
 * generator applies to every pay date. This file only walks that function
 * from period to period; it never counts a period itself.
 *
 * Pure: no database, so the Payroll page may read it. The company's
 * rhythm and day-off rule are read by lib/money/company-pay-periods.
 */

import {
  payPeriodHolding, PAY_PERIOD_WORDS,
  type DayOffRule, type PayPeriodOn, type PayRhythm,
} from '@/lib/pay-dates'
import { formatDay, formatRange } from '@/lib/format-date'
import { decimalsFor, wholeFromMinor } from '@/lib/money'

export type { PayPeriodOn, DayOffRule, PayRhythm }

const DAY = 86_400_000

/** "2026-12-06" ± n days, as a calendar day in UTC. */
function plus(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY).toISOString().slice(0, 10)
}

/** A calendar day "YYYY-MM-DD": what the picker sends for a pay period. */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T00:00:00.000Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v
}

/**
 * Whether this company's pay is listed by its own periods: it pays every
 * week or every other week and has said which Sunday the first one starts
 * on. Anything else keeps the calendar month.
 */
export function paysByPeriod(r: PayRhythm): boolean {
  return payPeriodHolding('2000-01-02', r) !== null
}

/** The period that holds this day, with its pay day moved by the one rule. Null where the company lists by month. */
export function periodHolding(day: Date | string, r: PayRhythm, rule: DayOffRule = {}): PayPeriodOn | null {
  return payPeriodHolding(day, r, rule)
}

/** The period after this one, or before it. */
export function periodAfter(p: PayPeriodOn, r: PayRhythm, rule: DayOffRule = {}): PayPeriodOn {
  return payPeriodHolding(plus(p.end, 1), r, rule)!
}
export function periodBefore(p: PayPeriodOn, r: PayRhythm, rule: DayOffRule = {}): PayPeriodOn {
  return payPeriodHolding(plus(p.start, -1), r, rule)!
}

/**
 * The periods a payroll person picks from on a day: the one holding the
 * day first, then the next, then the earlier ones, newest first. Null
 * where the company lists pay by calendar month.
 */
export function periodsAround(
  day: Date | string,
  r: PayRhythm,
  rule: DayOffRule = {},
  { earlier = 6, later = 1 }: { earlier?: number; later?: number } = {},
): PayPeriodOn[] | null {
  const current = payPeriodHolding(day, r, rule)
  if (!current) return null
  const out = [current]
  let next = current
  for (let i = 0; i < later; i++) out.push((next = periodAfter(next, r, rule)))
  let back = current
  for (let i = 0; i < earlier; i++) out.push((back = periodBefore(back, r, rule)))
  return out
}

/**
 * The periods on the picker: the ones around today (`periodsAround`),
 * then every other period that still holds accepted hours nobody paid,
 * newest first, however far back. Without them a week accepted late, or
 * a placement recorded with back hours, sat in a period nobody could
 * open to work out or pay (found by hand, 2026-11-14). `held` is any day
 * inside each such period; `unpaid` marks every period that holds one.
 */
export function pickerPeriods(
  around: readonly PayPeriodOn[],
  held: Iterable<string>,
  r: PayRhythm,
  rule: DayOffRule = {},
): Array<PayPeriodOn & { unpaid: boolean }> {
  const byStart = new Map<string, PayPeriodOn>()
  for (const day of held) {
    const p = payPeriodHolding(day, r, rule)
    if (p && !byStart.has(p.start)) byStart.set(p.start, p)
  }
  const shown = new Set(around.map((p) => p.start))
  const more = [...byStart.values()].filter((p) => !shown.has(p.start)).sort((a, b) => (a.start < b.start ? 1 : -1))
  return [
    ...around.map((p) => ({ ...p, unpaid: byStart.has(p.start) })),
    ...more.map((p) => ({ ...p, unpaid: true })),
  ]
}

/** A period on the picker that holds accepted hours nobody paid. */
export function unpaidPeriodWords(p: PayPeriodOn): string {
  return `${periodWords(p)} · accepted hours not paid`
}

/**
 * Every period whose pay day, after the move, falls from `from` to `to`
 * inclusive, oldest first. What cash flow asks: the pay due inside its
 * window, each on its own period's pay day.
 */
export function periodsPayingBetween(from: string, to: string, r: PayRhythm, rule: DayOffRule = {}): PayPeriodOn[] {
  if (!isDayKey(from) || !isDayKey(to) || to < from) return []
  // A pay day is never more than the offset (at most 30 days) and a move
  // after the period's Saturday, so start a little over five weeks back.
  let p = payPeriodHolding(plus(from, -45), r, rule)
  if (!p) return []
  const out: PayPeriodOn[] = []
  while (p.start <= to) {
    if (p.payOn >= from && p.payOn <= to) out.push(p)
    p = periodAfter(p, r, rule)
  }
  return out
}

// ── Words ──────────────────────────────────────────────────────────────

const day = (k: string) => formatDay(k, { weekday: true })

/** A period on the picker: "Dec 6 – Dec 19, 2026 · paid Thu, Dec 24, 2026". */
export function periodWords(p: PayPeriodOn): string {
  return `${formatRange(p.start, p.end)} · paid ${day(p.payOn)}`
}

/** The period as the run and the row name it: "Dec 6 – Dec 19, 2026". */
export function periodLabel(p: PayPeriodOn): string {
  return formatRange(p.start, p.end)
}

/**
 * The sentence over the rows, for a period the company counts itself:
 * "Tapin pays every other week. This period is Dec 6 – Dec 19, 2026. Its
 * pay is worked out Wed, Dec 23, 2026 and paid Thu, Dec 24, 2026." Where
 * the pay day moved off a day off or a holiday, one more sentence says so.
 */
export function periodShownSays(companyName: string, r: PayRhythm, p: PayPeriodOn): string {
  const moved = p.payOn !== p.payOnUnmoved ? ` It moved from ${day(p.payOnUnmoved)}, a day off or a holiday.` : ''
  return `${companyName} pays ${PAY_PERIOD_WORDS[r.payPeriod].toLowerCase()}. ` +
    `This period is ${periodLabel(p)}. Its pay is worked out ${day(p.calcOn)} and paid ${day(p.payOn)}.${moved}` +
    (payDayInsidePeriod(p) ? ` ${payDayInsideSays(p)}` : '')
}

/**
 * Whether the pay day falls on or before the period's last day. A "Paid
 * on" offset of 0 with the working day before lands on the period's own
 * Friday. The rule is left alone; the period's line says so.
 */
export function payDayInsidePeriod(p: PayPeriodOn): boolean {
  return p.payOn <= p.end
}

/** Said on the period's line where its pay day is on or before its last day. */
export function payDayInsideSays(p: PayPeriodOn): string {
  return `This pay day is on or before the period's last day, ${day(p.end)}. ` +
    '"Paid on" is set in Settings, under Cycles, then Payroll.'
}

/**
 * Said beside the company's pay periods where its own holiday calendar is
 * empty. The one rule moves a pay day only off a holiday on that calendar,
 * so Christmas stays a pay day. No holiday is added for anybody here.
 */
export function noHolidaysSays(companyName: string, rule: DayOffRule): string | null {
  if ([...(rule.holidays ?? [])].length > 0) return null
  return `No holidays are on ${companyName}'s calendar, so a pay day on a public holiday is not moved. ` +
    'Add them in Settings, under Holidays.'
}

/** Where the Owner sets the first day, said once on the Payroll page. */
export const WHERE_FIRST_DAY_IS_SET =
  'The Owner sets it in Settings, under Cycles, then Payroll: "First pay period starts on".'

/**
 * The sentence over a calendar month. A weekly or two-week company that
 * has not set its first day is told where to set it; a company that pays
 * by the month is told nothing more.
 */
export function calendarMonthSays(companyName: string, r: PayRhythm): string {
  const pays = `${companyName} pays ${PAY_PERIOD_WORDS[r.payPeriod].toLowerCase()}`
  if (r.payPeriod === 'WEEKLY' || r.payPeriod === 'BIWEEKLY') {
    return `${pays}, but this page lists pay by calendar month until the first pay period's first day is set. ` +
      WHERE_FIRST_DAY_IS_SET
  }
  return `${pays}, so this page lists pay by calendar month.`
}

/** A period that holds nothing to pay. */
export function nothingToPaySays(p: PayPeriodOn): string {
  return `Nothing is owed for ${periodLabel(p)}. No accepted hours fall in it, so there is nothing to work out or pay.`
}

/**
 * Pay never goes out before it is worked out. The pay file for a period
 * is refused, and its button replaced by this sentence, while anybody with
 * hours in it still to pay has not been worked out (status pending). A
 * person part paid keeps the file: it carries what is still to pay, with
 * what was paid already. Null where the file may be offered.
 */
export function payFileWaits(rows: readonly PayFileRow[]): string | null {
  const waiting = rows.filter((r) =>
    r.totalApprovedHours > 0 && r.payStatus === 'PENDING' && !((r.paidSoFar?.hours ?? 0) > 0))
  if (waiting.length === 0) return null
  const names = waiting.map((r) => r.person.name)
  const who = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  return `Pay for ${who} is not worked out yet, so there is no pay file yet. Press Calculate first.`
}

/** Said once beside "Download pay file". */
export const PAY_FILE_NOTE =
  'Your payroll provider collects each person’s W-4, bank details and tax number. This file carries hours and gross pay.'

// ── The pay file for one period ────────────────────────────────────────

/** What the file reads from one row of the Payroll page. */
export interface PayFileRow {
  person: { name: string }
  totalApprovedHours: number
  /** The rate in force at the end of the period, in minor units. */
  payRate: number
  /** Each rate and its hours, where the rate changed inside the period. */
  rates?: ReadonlyArray<{ rateCents: number; hours: number }> | null
  overtimeHours?: number
  premiumCents?: number
  grossPay: number
  payCurrency: string
  payStatus: string
  /** What earlier runs paid in the period; null where nothing was. */
  paidSoFar?: { hours: number; grossCents: number } | null
  /** What a run would pay now (lib/money/period-pay-left). */
  toPay?: {
    hours: number
    grossCents: number
    overtimeHours: number
    premiumCents: number
    rates: ReadonlyArray<{ rateCents: number; hours: number }> | null
    rateCents: number | null
  } | null
}

/**
 * The file's columns. Hours, overtime and gross pay are what is still to
 * pay, so a provider paying from the file never pays a week twice; what
 * earlier runs paid in the period is its own column beside them.
 */
export const PAY_FILE_COLUMNS = Object.freeze([
  'Name', 'Hours', 'Pay rate', 'Overtime hours', 'Overtime premium', 'Gross pay', 'Paid already', 'Currency',
  'Period start', 'Period end', 'Pay day', 'Status',
] as const)

const STATUS_WORDS: Record<string, string> = {
  PENDING: 'Not worked out yet',
  CALCULATED: 'Worked out, not paid',
  PROCESSED: 'Paid',
}

const major = (minor: number, ccy: string) => wholeFromMinor(minor, ccy).toFixed(decimalsFor(ccy))
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * The pay file for one period, from the Payroll page's own rows: one line
 * a person, in whole currency, never cents. A person with no hours in the
 * period is not on it. Hours, overtime and gross pay are what is still to
 * pay; "Paid already" is what earlier runs paid in the period; a person
 * part paid reads "Part paid", and one paid in full reads "Paid" with
 * nothing left to pay. The figures are the row's; nothing here prices an
 * hour.
 */
export function payFileCsv(rows: readonly PayFileRow[], p: PayPeriodOn): string {
  const lines = [PAY_FILE_COLUMNS.join(',')]
  for (const r of rows) {
    if (!(r.totalApprovedHours > 0)) continue
    const ccy = r.payCurrency || 'USD'
    const left = r.toPay ?? {
      hours: r.totalApprovedHours, grossCents: r.grossPay, overtimeHours: r.overtimeHours ?? 0,
      premiumCents: r.premiumCents ?? 0, rates: r.rates ?? null, rateCents: null,
    }
    const rate = left.rates && left.rates.length > 1
      ? left.rates.map((x) => `${major(x.rateCents, ccy)} for ${x.hours} hours`).join('; ')
      : major(left.rateCents ?? r.payRate, ccy)
    const paid = r.paidSoFar?.grossCents ?? 0
    const status = paid > 0 && left.grossCents > 0 ? 'Part paid' : (STATUS_WORDS[r.payStatus] ?? r.payStatus)
    lines.push([
      cell(r.person.name),
      String(left.hours),
      cell(rate),
      String(left.overtimeHours ?? 0),
      major(left.premiumCents ?? 0, ccy),
      major(left.grossCents, ccy),
      major(paid, ccy),
      ccy,
      p.start,
      p.end,
      p.payOn,
      cell(status),
    ].join(','))
  }
  return lines.join('\n') + '\n'
}

/** "payroll-2026-12-06-to-2026-12-19.csv" */
export function payFileName(p: PayPeriodOn): string {
  return `payroll-${p.start}-to-${p.end}.csv`
}
