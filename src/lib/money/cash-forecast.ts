/**
 * Cash flow forecast: what is expected in and out over the next 90 days,
 * by week or by month, one currency at a time.
 *
 * The founder, 2026-11-08: "Also add cash flow forecast by week or month
 * for next 90 days." It is the second half of the Cash flow tab, under
 * what happened, and nothing in it is ever added into what happened.
 *
 * Pure: no database. The route (app/api/ap/cash-flow) reads every figure
 * through a reader a money page already uses, and this file only places
 * them on days and adds them up, one currency at a time:
 *
 *   Expected in (a firm that bills):
 *     · bills sent and still owed, at the due date the bill carries;
 *     · bills to send — a bill drafted or raised and not sent, at the due
 *       date it would carry if sent today, and the weeks signed above and
 *       not yet billed, priced by the Bills page's own generator, on the
 *       day after the agreement's period ends, due on the agreement's terms;
 *     · running lines — each sell line still running, at its own rate in
 *       force on each day and its expected hours a week, carried on the
 *       bill dates the cycle generator already wrote for the line, due on
 *       the agreement's terms. Straight time only.
 *   Expected out:
 *     · invoice receipts still owed, at their due date;
 *     · sub-vendors — each buy line paid by invoice receipt, at the line's
 *       own rate and expected hours, on the line's "invoice receipt to
 *       record" dates, due on the line's terms;
 *     · payroll — the Payroll page's own figure for the period it shows,
 *       at its pay date, then each buy line paid by payroll at its own
 *       rate and expected hours on its later pay dates.
 *
 * The rules, each a test sentence:
 *
 *   1. **One currency at a time.** Rupees and dollars are never added.
 *   2. **Refuse rather than fabricate.** A line with no rate, no currency,
 *      a currency its agreement does not bill in, a pay model that is not
 *      an hourly rate, or no dates written is not forecast, and is named.
 *      An amount nobody could stand behind blanks its cell and the net.
 *   3. **Late is not expected.** A bill or a receipt already past its due
 *      date is not put on a day it has no promise for; it is counted in
 *      a sentence, and it is in the age bands above.
 *   4. **No margin.** In less out is a net, and nothing else. A client's
 *      forecast is what it will owe its suppliers.
 *   5. **A forecast never touches the actuals.** It is its own answer.
 */

import { weekStart } from '@/lib/overtime'
import { formatRange } from '@/lib/format-date'
import { rateInForce, type RatePeriod } from '@/lib/contract-rate'
import { dueOn, type TermsAnchor } from '@/lib/billing-cascade'
import { FULL_TIME_WEEK } from '@/lib/program-spend'
import { DEFAULT_DAYS_OFF } from '@/lib/cycle-shift'
import { slotsFor, type CashSide, type Grain, type Slot } from '@/lib/money/cash-flow'

const DAY = 86_400_000

/** How far ahead the forecast reads, today counted. */
export const FORECAST_DAYS = 90

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)

export interface ForecastWindow {
  start: Date
  end: Date
  label: string
}

/** The next ninety days, today among them. */
export function forecastWindow(today: Date): ForecastWindow {
  const start = utcDay(today)
  const end = plusDays(start, FORECAST_DAYS - 1)
  return { start, end, label: formatRange(start, end) }
}

// ── What is handed in ────────────────────────────────────────────────

/**
 * One amount expected on one day, as a reader already holds it.
 *
 * `minor` null is an amount nobody could price; `currency` null is one
 * whose currency is unknown, which blanks its column in every currency.
 */
export interface Expected {
  currency: string | null
  at: Date | null
  minor: number | null
}

/**
 * One running line, as the record holds it, to be carried forward.
 *
 * Every field is the line's own: its rate (and approved rate changes),
 * its currency, its dates, its job's hours a week, the company's days
 * off, and the dates the cycle generator wrote for it. Nothing here is
 * a price this file invents.
 */
export interface RunningLine {
  /** The person, for the sentence when the line cannot be forecast. */
  name: string
  currency: string | null
  /** The line's own rate, minor units an hour. */
  rateMinor: number | null
  /** Approved and proposed rate changes; only approved ones are read. */
  rates: RatePeriod[]
  /** The job's hours a week. Null reads as full time, as every money page reads it. */
  hoursPerWeek: number | null
  startDate: Date
  endDate: Date | null
  /** Days of the week (0 Sunday … 6 Saturday) the company does not expect work. */
  daysOff?: readonly number[]
  /**
   * The first day nothing else in the forecast or the books already
   * counts: the day after the last week signed or billed, or after the
   * period the Payroll page already shows.
   */
  from: Date | null
  /** Only dates after this one carry days: the Payroll page's own next pay date. */
  datesAfter?: Date | null
  /** The dates the cycle generator wrote: bills to raise, receipts to record, pay days. */
  cycleDates: Date[]
  /**
   * How the money follows the date: on the agreement's terms (a bill or
   * an invoice receipt), or on the date itself (a pay day), null.
   */
  terms: { anchor: TermsAnchor; days: number } | null
  /** Why this line is not forecast, where the route already knows. */
  refused?: string | null
}

export type ForecastFigure = 'billsDue' | 'toBill' | 'running' | 'receiptsDue' | 'subVendors' | 'payroll'

export const IN_FIGURES: readonly ForecastFigure[] = ['billsDue', 'toBill', 'running']
export const OUT_FIGURES: readonly ForecastFigure[] = ['receiptsDue', 'subVendors', 'payroll']

/** The column words, the trade's, read by the screen. */
export const FORECAST_WORD: Record<ForecastFigure | 'in' | 'out' | 'net', string> = {
  billsDue: 'Bills due',
  toBill: 'Bills to send',
  running: 'Running lines',
  receiptsDue: 'Invoice receipts due',
  subVendors: 'Sub-vendors’ invoices',
  payroll: 'Payroll',
  in: 'Expected in',
  out: 'Expected out',
  net: 'Net',
}

/** For a client, the running lines are what its suppliers will bill it. */
export const CLIENT_FORECAST_WORD: Partial<Record<ForecastFigure, string>> = {
  subVendors: 'Suppliers’ invoices to come',
}

export interface ForecastInputs {
  side: CashSide
  /** Bills sent and still owed, at their due date. Ignored for a client. */
  billsDue: Expected[]
  /** Bills drafted or raised and not sent, and signed weeks not yet billed. Ignored for a client. */
  toBill: Expected[]
  /** Sell lines still running. Ignored for a client. */
  running: RunningLine[]
  /** Invoice receipts still owed, at their due date. */
  receiptsDue: Expected[]
  /**
   * Lines paid by invoice receipt. For a client: the lines its suppliers
   * bill it on, at the rate the client pays.
   */
  subVendors: RunningLine[]
  /** Null: this seat does not read payroll. */
  payroll: { pending: Expected[]; lines: RunningLine[] } | null
}

// ── Carrying a running line forward ──────────────────────────────────

export interface Carried {
  expected: Expected[]
  /** Why the line is not forecast, or null where it is. */
  says: string | null
}

/**
 * One running line, carried onto the dates already written for it.
 *
 * Each date carries every working day since the one before it, from the
 * first day nothing else counts and never before this week (a week
 * nobody signed is not forecast). Each day is priced at the rate in
 * force that day times the expected hours a working day, straight time,
 * and the bill is rounded once. A day past the line's own last day is
 * never carried: nothing ends early and nothing runs late.
 */
export function carryLine(line: RunningLine, today: Date): Carried {
  if (line.refused) return { expected: [], says: line.refused }
  if (!line.currency) return { expected: [], says: `${line.name}’s line has no currency, so it is not forecast.` }
  if (line.rateMinor == null || line.rateMinor <= 0) {
    return { expected: [], says: `${line.name}’s line has no rate, so it is not forecast.` }
  }
  const daysOff = line.daysOff ?? DEFAULT_DAYS_OFF
  const working = 7 - new Set(daysOff).size
  if (working <= 0) return { expected: [], says: `Every day of the week is a day off, so ${line.name}’s line is not forecast.` }
  const hoursPerWeek = line.hoursPerWeek && line.hoursPerWeek > 0 ? line.hoursPerWeek : FULL_TIME_WEEK
  const perDay = hoursPerWeek / working

  const thisWeek = new Date(`${weekStart(iso(utcDay(today)))}T00:00:00.000Z`)
  const floor = [thisWeek, utcDay(line.startDate), line.from ? utcDay(line.from) : thisWeek]
  let cursor = new Date(Math.max(...floor.map((d) => d.getTime())))
  const last = line.endDate ? utcDay(line.endDate) : null
  const after = line.datesAfter ? utcDay(line.datesAfter) : null

  const dates = [...new Set(line.cycleDates.map((d) => utcDay(d).getTime()))]
    .sort((a, b) => a - b)
    .map((t) => new Date(t))
    .filter((d) => d > cursor && (!after || d > after))

  if (dates.length === 0) {
    if (last && last < cursor) return { expected: [], says: null }
    return { expected: [], says: `${line.name}’s line has no dates written after today, so it is not forecast.` }
  }

  const out: Expected[] = []
  for (const on of dates) {
    if (last && cursor > last) break
    let exact = 0
    let lastCarried: Date | null = null
    for (let d = cursor; d < on; d = plusDays(d, 1)) {
      if (last && d > last) break
      lastCarried = d
      if (daysOff.includes(d.getUTCDay())) continue
      exact += rateInForce(line.rateMinor, line.rates, d).rateCents * perDay
    }
    cursor = on
    const minor = Math.round(exact)
    if (minor <= 0 || !lastCarried) continue
    const at = line.terms
      ? dueOn({ anchor: line.terms.anchor, days: line.terms.days, periodEnd: lastCarried, issuedAt: on }).dueAt
      : on
    out.push({ currency: line.currency, at, minor })
  }
  return { expected: out, says: null }
}

// ── What comes out ───────────────────────────────────────────────────

export interface ForecastRow {
  key: string
  label: string
  start: string
  end: string
  /** Minor units of this row's currency; null where it cannot be stood behind. */
  figures: Partial<Record<ForecastFigure, number | null>>
  /** Null for a client, which expects nothing in. */
  expectedIn: number | null
  expectedOut: number | null
  /** Expected in less expected out. Null where any part is, or payroll is not read. */
  net: number | null
}

export interface CurrencyForecast {
  currency: string
  rows: ForecastRow[]
  totals: ForecastRow
}

export interface Forecast {
  side: CashSide
  window: { start: string; end: string; label: string }
  grain: Grain
  /** The columns this reader has, in the order they are read. */
  figures: ForecastFigure[]
  /** One per currency, never added across. */
  currencies: CurrencyForecast[]
  /** What the forecast assumes, said once, in plain words. */
  assumptions: string[]
  /** Every blank and every line left out, said once, in words. */
  says: string[]
}

const NOT_READ_PAYROLL =
  'Payroll is not in the forecast, and so neither is the net, because your role does not read payroll.'

/** What the forecast assumes, in the words the tab says once. */
export function assumptionsFor(side: CashSide, readsPayroll: boolean): string[] {
  const out = [
    'Each running line works the hours a week its job says, or 40 where the job says none.',
    'No overtime: every expected hour is at the line’s own rate.',
    'Every bill and invoice receipt is paid on the day it is due.',
    'Nothing new starts, and each line runs to its own last day.',
    'Each bill date, and each pay day, carries the working days since the one before it.',
    'Weeks before this one that nobody has signed are not counted.',
  ]
  if (side === 'SELLER') out.splice(4, 0, 'A bill drafted and not sent is sent today.')
  if (side === 'SELLER' && readsPayroll) out.push('Payroll is the Payroll page’s own figure for the period it shows, then each line’s rate and hours.')
  return out
}

/**
 * The forecast for the next ninety days, cut by week or by month.
 */
export function cashForecast(input: ForecastInputs, grain: Grain, today: Date): Forecast {
  const w = forecastWindow(today)
  const slots: Slot[] = slotsFor(w, grain)
  const client = input.side === 'CLIENT'
  const readsPayroll = !client && input.payroll != null
  const figures: ForecastFigure[] = client
    ? ['receiptsDue', 'subVendors']
    : [...IN_FIGURES, 'receiptsDue', 'subVendors', ...(readsPayroll ? ['payroll' as const] : [])]

  const says: string[] = []
  if (client) {
    says.push('A client bills nobody and runs no contractor payroll, so its forecast is what it will owe its suppliers.')
  } else if (!readsPayroll) {
    says.push(NOT_READ_PAYROLL)
  }

  const carry = (lines: RunningLine[]): Expected[] => {
    const got: Expected[] = []
    for (const l of lines) {
      const c = carryLine(l, today)
      if (c.says) says.push(c.says)
      got.push(...c.expected)
    }
    return got
  }

  const flowsOf: Record<ForecastFigure, Expected[]> = {
    billsDue: client ? [] : input.billsDue,
    toBill: client ? [] : input.toBill,
    running: client ? [] : carry(input.running),
    receiptsDue: input.receiptsDue,
    subVendors: carry(input.subVendors),
    payroll: readsPayroll ? [...input.payroll!.pending, ...carry(input.payroll!.lines)] : [],
  }

  type Cell = Partial<Record<ForecastFigure, number | null>>
  const sums = new Map<string, Map<string, Cell>>()
  const blankEverywhere = new Map<string, Set<ForecastFigure>>()
  const currencies = new Set<string>()
  const late = { in: 0, out: 0 }
  let undated = 0
  let unpriced = 0

  const cellOf = (cur: string, key: string): Cell => {
    if (!sums.has(cur)) sums.set(cur, new Map())
    const m = sums.get(cur)!
    if (!m.has(key)) m.set(key, {})
    return m.get(key)!
  }

  for (const f of figures) {
    for (const e of flowsOf[f]) {
      if (e.at == null) { undated += 1; continue }
      const day = utcDay(e.at)
      if (day < w.start) {
        // Already past its due day: no promise puts it on a day ahead.
        if (e.minor == null || e.minor > 0) late[IN_FIGURES.includes(f) ? 'in' : 'out'] += 1
        continue
      }
      const slot = slots.find((s) => day >= s.start && day <= s.end)
      if (!slot) continue
      if (e.currency == null) {
        unpriced += 1
        if (!blankEverywhere.has(slot.key)) blankEverywhere.set(slot.key, new Set())
        blankEverywhere.get(slot.key)!.add(f)
        continue
      }
      const cur = e.currency.toUpperCase()
      currencies.add(cur)
      const cell = cellOf(cur, slot.key)
      if (e.minor == null) { unpriced += 1; cell[f] = null; continue }
      if (cell[f] === null) continue
      cell[f] = (cell[f] ?? 0) + e.minor
    }
  }

  if (late.in) {
    says.push(
      `${late.in} ${late.in === 1 ? 'bill is' : 'bills are'} already past due, so ${late.in === 1 ? 'it is' : 'they are'} ` +
      'not put on a day ahead. They are in "Owed to you, by how late" above.',
    )
  }
  if (late.out) {
    says.push(
      `${late.out} ${late.out === 1 ? 'invoice receipt or pay day is' : 'invoice receipts or pay days are'} already past due, ` +
      'so not put on a day ahead.',
    )
  }
  if (undated) {
    says.push(`${undated} expected ${undated === 1 ? 'amount has' : 'amounts have'} no date on the record, so ${undated === 1 ? 'it is' : 'they are'} in no period here.`)
  }
  if (unpriced) {
    says.push(
      `${unpriced} expected ${unpriced === 1 ? 'amount has' : 'amounts have'} no amount or no currency on the record, ` +
      'so the column for that period is blank, and the net beside it, rather than read as nought.',
    )
  }

  const sumOf = (cell: Cell, parts: readonly ForecastFigure[]): number | null => {
    let n = 0
    for (const p of parts) {
      if (!figures.includes(p)) continue
      if (cell[p] === null) return null
      n += cell[p] ?? 0
    }
    return n
  }
  const rowOf = (key: string, label: string, start: Date, end: Date, cell: Cell): ForecastRow => {
    const expectedIn = client ? null : sumOf(cell, IN_FIGURES)
    const expectedOut = sumOf(cell, OUT_FIGURES)
    const net = !client && !readsPayroll
      ? null
      : expectedOut == null || (!client && expectedIn == null) ? null : (expectedIn ?? 0) - expectedOut
    return { key, label, start: iso(start), end: iso(end), figures: cell, expectedIn, expectedOut, net }
  }

  const result: CurrencyForecast[] = [...currencies].sort().map((cur) => {
    const total: Cell = Object.fromEntries(figures.map((f) => [f, 0])) as Cell
    const rows = slots.map((s) => {
      const got = sums.get(cur)?.get(s.key) ?? {}
      const blanked = blankEverywhere.get(s.key)
      const cell: Cell = {}
      for (const f of figures) {
        const v = blanked?.has(f) ? null : got[f] === null ? null : got[f] ?? 0
        cell[f] = v
        total[f] = total[f] === null || v === null ? null : (total[f] as number) + v
      }
      return rowOf(s.key, s.label, s.start, s.end, cell)
    })
    return { currency: cur, rows, totals: rowOf('total', 'Next 90 days', w.start, w.end, total) }
  })

  return {
    side: input.side,
    window: { start: iso(w.start), end: iso(w.end), label: w.label },
    grain,
    figures,
    currencies: result,
    assumptions: assumptionsFor(input.side, readsPayroll),
    says: [...new Set(says)],
  }
}
