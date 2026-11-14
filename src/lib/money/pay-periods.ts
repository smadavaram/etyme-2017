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
import { formatDay, formatDayLong, formatRange } from '@/lib/format-date'
import { decimalsFor, wholeFromMinor } from '@/lib/money'
import type { Straddle, Terms } from '@/lib/periods'

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

// ── The worker's own page, on the company's periods ──────────────────

/**
 * A pay line's periods and pay days, as the company's own payroll counts
 * them, for a reader that asks the line's period engine (`periodFor` in
 * lib/periods) and the line's pay days.
 *
 * Found by hand, 2026-11-14: a W-2 line carries the shipped monthly
 * rhythm, so the worker's page put the weeks of Dec 6 and Dec 13 in
 * December and read "pay day, Jan 8". The company pays every other week
 * from Sunday Dec 6, so Payroll and the forecast read Dec 24. Writing
 * "every other week" on the line is not the answer: a line's fortnights
 * count from the Sunday before the person's own start, which is a week
 * off the company's for half its people, and a line awarded carries no
 * rhythm at all.
 *
 * So the reader is given the company's periods instead: fortnights (or
 * weeks) counted from the company's first Sunday, which `periodFor`
 * cuts exactly as `payPeriodHolding` does, and every pay day from `from`
 * to `to`, moved by the one rule. An open-ended line has no pay cycles
 * written, and still reads its pay day here. Null where the company
 * lists pay by calendar month: the line's own answer stands.
 */
export interface WorkerPayCalendar {
  terms: Terms
  payDates: Array<{ kind: 'SALARY_PAY'; dueOn: Date; completedAt: null }>
}

export function workerPayCalendar(
  r: PayRhythm,
  rule: DayOffRule,
  straddle: Straddle,
  window: { from: string; to: string },
): WorkerPayCalendar | null {
  if (!paysByPeriod(r) || !r.payFirstPeriodStart) return null
  return {
    terms: {
      frequency: r.payPeriod === 'WEEKLY' ? 'WEEKLY' : 'BIWEEKLY',
      anchor: 'CONTRACT',
      straddle,
      // The company's first Sunday, never the person's start: the periods
      // are the company's, and a person's start never cuts one.
      startedOn: new Date(`${r.payFirstPeriodStart}T00:00:00.000Z`),
    },
    payDates: periodsPayingBetween(window.from, window.to, r, rule).map((p) => ({
      kind: 'SALARY_PAY' as const,
      dueOn: new Date(`${p.payOn}T00:00:00.000Z`),
      completedAt: null,
    })),
  }
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

/**
 * Whether a new payroll line may be recorded on this company's pay
 * calendar, and the sentence where it may not (walk, 2026-11-14).
 *
 * A W-2 line's pay days count from the company's first pay period. A
 * company that chose to pay every week or every other week and has not
 * set that first day has no pay days to give the line, and a date counted
 * from the line's own start would disagree with the Payroll page. So the
 * line is refused with the Owner's step. A company that never chose its
 * payroll keeps the template pack's dates, as before, and a line paid on
 * an invoice receipt has no pay days at all.
 */
export function firstDayNeededSays(args: {
  /** True where this firm pays the person through payroll (`paidByPayroll`). */
  payroll: boolean
  /** The company's own payroll choice; null where it never chose one. */
  chosen: PayRhythm | null
}): string | null {
  if (!args.payroll || !args.chosen) return null
  if (args.chosen.payPeriod !== 'WEEKLY' && args.chosen.payPeriod !== 'BIWEEKLY') return null
  if (paysByPeriod(args.chosen)) return null
  return `Pay days for a W-2 line count from your first pay period, and that day is not set yet. ${WHERE_FIRST_DAY_IS_SET}`
}

/** A period that holds nothing to pay. */
export function nothingToPaySays(p: PayPeriodOn): string {
  return `Nothing is owed for ${periodLabel(p)}. No accepted hours fall in it, so there is nothing to work out or pay.`
}

/**
 * Pay never goes out before it is worked out. The pay file for a period
 * is refused, and its button replaced by this sentence, while anybody with
 * hours in it still to pay has not been worked out (status pending).
 *
 * A person part paid used to keep the file whatever its status. Walk,
 * 2026-11-14: week two was accepted after week one was paid, nobody
 * worked it out, and the file was offered. Now a part-paid person holds
 * the file back too while what is still to pay is not worked out; once it
 * is, the file carries what is still to pay, with what was paid already.
 * Null where the file may be offered.
 */
export function payFileWaits(rows: readonly PayFileRow[]): string | null {
  const waiting = rows.filter((r) =>
    r.totalApprovedHours > 0 && r.payStatus === 'PENDING' &&
    (r.toPay == null || r.toPay.hours > 0 || r.toPay.grossCents > 0))
  if (waiting.length === 0) return null
  const names = waiting.map((r) => r.person.name)
  const who = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  return `Pay for ${who} is not worked out yet, so there is no pay file yet. Press Calculate first.`
}

/**
 * On a company that pays by its own periods, said in the pay file
 * button's place on a calendar month or the view of every period. A
 * month's file could hand a provider hours a period run already paid.
 */
export const MONTH_HAS_NO_PAY_FILE =
  'A pay file comes from one of your pay periods, so no hour is paid twice. Pick a pay period above.'

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
  /** The row's own pay period, read where the file is for a calendar month. */
  payPeriod?: { start: string; end: string } | null
  /**
   * The pay day of the row's own pay period, read where the file is for a
   * calendar month (`periodPayDay` in lib/money/payroll-rows); null where
   * the line has none. Never the row's next pay day from today, which
   * belongs to whatever month comes next.
   */
  periodPayDay?: string | null
  /**
   * Each week held off this pay because nobody has said whether the person
   * is exempt from overtime: the Sunday it began and its hours. Its pay is
   * on no total; the file names it on the person's line.
   */
  heldWeeks?: ReadonlyArray<{ weekOf: string; hours: number }> | null
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
  'Period start', 'Period end', 'Pay day', 'Status', 'Held off this pay',
] as const)

const STATUS_WORDS: Record<string, string> = {
  PENDING: 'Not worked out yet',
  CALCULATED: 'Worked out, not paid',
  PROCESSED: 'Paid',
  HELD: 'Paid',
}

// ── A week held off pay, on the status and the file ────────────────────
//
// Found by hand, 2026-11-14: after Process, a person whose 46-hour week was
// held (nobody had said whether she is exempt) read "Processed" on her row,
// and the pay file listed her as "Paid" with nothing about the week. A clerk
// reading the status, or a provider paying from the file, was not told a
// week was missing. Now the status says a week is held for as long as one
// is, and the file names the week and its hours on her line.

/**
 * The row's status where a week is held: a period whose every other hour
 * is paid reads HELD, never PROCESSED. Pending and calculated stay as they
 * are, so Calculate and Process are still offered for the other hours.
 */
export function statusWithHeld(status: string, heldHours: number): string {
  return heldHours > 0 && status === 'PROCESSED' ? 'HELD' : status
}

const SCREEN_STATUS: Record<string, string> = {
  PENDING: 'Pending',
  CALCULATED: 'Calculated',
  PROCESSED: 'Processed',
  HELD: 'Processed',
  NO_HOURS: 'No hours',
}

/**
 * The status as the row's chip reads it: "Pending", "Calculated",
 * "Processed", and ", week held" after it while any week is held.
 */
export function payStatusSays(status: string, heldHours: number): string {
  const base = SCREEN_STATUS[status] ?? status
  return heldHours > 0 || status === 'HELD' ? `${base}, week held` : base
}

/**
 * The file's "Held off this pay" cell: each held week, its Sunday and its
 * hours, "Week of November 8, 2026, 46 hours, overtime answer not
 * recorded". Empty where nothing is held.
 */
export function heldWeeksCell(weeks: ReadonlyArray<{ weekOf: string; hours: number }> | null | undefined): string {
  if (!weeks || weeks.length === 0) return ''
  return [...weeks]
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
    .map((w) => `Week of ${formatDayLong(w.weekOf.slice(0, 10))}, ${Math.round(w.hours * 100) / 100} hours, overtime answer not recorded`)
    .join('; ')
}

/**
 * One sentence above the Payroll table: who has a week held, by name where
 * three or fewer, and that the answer is recorded on the row. Null where
 * nobody has a week held.
 */
export function heldAboveTableSays(rows: ReadonlyArray<{ person: { name: string }; heldHours?: number | null }>): string | null {
  const names = [...new Set(rows.filter((r) => (r.heldHours ?? 0) > 0).map((r) => r.person.name))]
  if (names.length === 0) return null
  if (names.length === 1) {
    return `${names[0]} has a week held off this pay until you record on the row whether the person is exempt from overtime.`
  }
  const who = names.length > 3
    ? `${names.length} people`
    : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names[2]}`
  return `${who} have a week held off this pay until you record on each row whether the person is exempt from overtime.`
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
 * hour. With no company period (a calendar month, on a company that pays
 * by the month), each line carries its row's own period and that period's
 * own pay day, blank where the line has none.
 */
export function payFileCsv(rows: readonly PayFileRow[], p: PayPeriodOn | null): string {
  const lines = [PAY_FILE_COLUMNS.join(',')]
  for (const r of rows) {
    // A person whose only week is held is still on the file, so the
    // provider sees the week is owed and not yet paid.
    const held = heldWeeksCell(r.heldWeeks)
    if (!(r.totalApprovedHours > 0) && !held) continue
    const ccy = r.payCurrency || 'USD'
    const left = r.toPay ?? {
      hours: r.totalApprovedHours, grossCents: r.grossPay, overtimeHours: r.overtimeHours ?? 0,
      premiumCents: r.premiumCents ?? 0, rates: r.rates ?? null, rateCents: null,
    }
    const rate = left.rates && left.rates.length > 1
      ? left.rates.map((x) => `${major(x.rateCents, ccy)} for ${x.hours} hours`).join('; ')
      : major(left.rateCents ?? r.payRate, ccy)
    const paid = r.paidSoFar?.grossCents ?? 0
    const base = paid > 0 && left.grossCents > 0 ? 'Part paid' : (STATUS_WORDS[r.payStatus] ?? r.payStatus)
    // Never "Paid" alone while a week is held.
    const status = held ? `${base}, week held` : base
    lines.push([
      cell(r.person.name),
      String(left.hours),
      cell(rate),
      String(left.overtimeHours ?? 0),
      major(left.premiumCents ?? 0, ccy),
      major(left.grossCents, ccy),
      major(paid, ccy),
      ccy,
      // A company period's own days; on a calendar month, each row's own
      // pay period and that period's own pay day, blank where it has none.
      p ? p.start : (r.payPeriod?.start ?? '').slice(0, 10),
      p ? p.end : (r.payPeriod?.end ?? '').slice(0, 10),
      p ? p.payOn : cell(r.periodPayDay ?? ''),
      cell(status),
      cell(held),
    ].join(','))
  }
  return lines.join('\n') + '\n'
}

/** "payroll-2026-06.csv", the pay file for a calendar month. */
export function monthPayFileName(month: string): string {
  return `payroll-${month}.csv`
}

/**
 * On a company that pays by the month, said in the pay file button's
 * place on the view of every period: the file is a month's.
 */
export const PICK_A_MONTH_FOR_PAY_FILE = 'A pay file comes from one month, so no hour is paid twice. Pick a month above.'

/**
 * Said where the older export is asked for a file. It lists accepted
 * hours whether or not a run paid them, so it is no longer a pay file.
 */
export const EXPORT_IS_NOT_A_PAY_FILE =
  'This list shows accepted hours whether or not they were paid. Download the pay file from the Payroll page instead.'

/** "payroll-2026-12-06-to-2026-12-19.csv" */
export function payFileName(p: PayPeriodOn): string {
  return `payroll-${p.start}-to-${p.end}.csv`
}
