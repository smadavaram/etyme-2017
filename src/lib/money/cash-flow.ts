/**
 * Cash flow: what came in and what went out, by week or by month.
 *
 * The founder, 2026-11-08: "Reports is nothing but cashflow and
 * profitability margin analysis tools." This is the first of the two.
 *
 * Pure: no database. Every figure handed in is read by the route through
 * the readers the money pages already use, so this file adds nothing up
 * that a page computes another way:
 *
 *   · billed and received   — the receivable book Accounts receivable
 *                              reads (`loadBook` in app/api/ar/book), the
 *                              bills sent and the payments on them, and the
 *                              cash received that names no bill yet;
 *   · invoice receipts       — what the firm owes its suppliers
 *                              (`whatWeOwe`'s two halves), due by their due
 *                              date, and the payments made against them;
 *   · payroll                — what the Payroll page lists as not yet paid,
 *                              at its next pay date, and what processed runs
 *                              paid (`paidRunHours` in lib/payroll-paid).
 *
 * Four rules, each the money domain's own and each a test sentence:
 *
 *   1. **One currency at a time.** Rupees and dollars are never added: a
 *      currency is its own table, its own totals and its own age bands.
 *   2. **Refuse rather than fabricate.** A payment whose amount was not
 *      recorded blanks its column for that period — and the net beside it
 *      — rather than being read as nought. A nought would make the period
 *      look better than it was, and nobody audits good news.
 *   3. **A figure the reader may not read is not a nought either.** A seat
 *      that does not read payroll is shown no payroll figure and no net,
 *      with the reason, because a net without payroll is cash that has
 *      already gone.
 *   4. **No margin.** Cash flow is money in and money out. What a
 *      placement earns is the Profitability tab's, and a client never sees
 *      either side's margin: a client's cash flow is what it owes its
 *      suppliers, paid and due, and nothing else.
 */

import { BUCKETS, bucketOf, daysOverdue, type Bucket } from '@/lib/ar-ageing'
import { weekStart } from '@/lib/overtime'
import { formatDay, formatMonth, formatRange } from '@/lib/format-date'

const DAY = 86_400_000

// ── The period and its rows ──────────────────────────────────────────

/** The periods the screen offers: this month, this quarter, the last 90 days. */
export const CASH_PERIODS = ['month', 'quarter', '90d'] as const
export type CashPeriod = (typeof CASH_PERIODS)[number]

export const CASH_PERIOD_WORD: Record<CashPeriod, string> = {
  month: 'This month',
  quarter: 'This quarter',
  '90d': 'Last 90 days',
}

/** How the period is cut into rows. */
export const GRAINS = ['week', 'month'] as const
export type Grain = (typeof GRAINS)[number]

export const GRAIN_WORD: Record<Grain, string> = { week: 'By week', month: 'By month' }

export function isCashPeriod(v: unknown): v is CashPeriod {
  return typeof v === 'string' && (CASH_PERIODS as readonly string[]).includes(v)
}
export function isGrain(v: unknown): v is Grain {
  return typeof v === 'string' && (GRAINS as readonly string[]).includes(v)
}

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const iso = (d: Date) => d.toISOString().slice(0, 10)

export interface Window {
  period: CashPeriod
  /** First day, UTC midnight. */
  start: Date
  /** Last day, UTC midnight; the day is counted whole. */
  end: Date
  label: string
}

/**
 * The days a period covers, both ends counted.
 *
 * This month runs from the 1st to its last day and this quarter from its
 * first month's 1st to its last month's last day, so a bill falling due
 * later this month is on the screen as due. The last 90 days end today,
 * and are ninety days with today among them.
 */
export function windowFor(period: CashPeriod, today: Date): Window {
  const t = utcDay(today)
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth()
  if (period === 'month') {
    const start = new Date(Date.UTC(y, m, 1))
    const end = new Date(Date.UTC(y, m + 1, 0))
    return { period, start, end, label: formatMonth(start) }
  }
  if (period === 'quarter') {
    const q = Math.floor(m / 3)
    const start = new Date(Date.UTC(y, q * 3, 1))
    const end = new Date(Date.UTC(y, q * 3 + 3, 0))
    return { period, start, end, label: formatRange(start, end) }
  }
  const start = new Date(t.getTime() - 89 * DAY)
  return { period, start, end: t, label: formatRange(start, t) }
}

export interface Slot {
  key: string
  label: string
  /** The slot's own first and last day, clipped to the window. */
  start: Date
  end: Date
}

/**
 * The rows a window is cut into.
 *
 * A week runs Sunday to Saturday, the week every timesheet, every
 * overtime line and every pay period is counted in (`weekStart` in
 * lib/overtime); the first and last week are clipped to the window, so a
 * figure is never counted in a day the period does not hold.
 */
export function slotsFor(w: Pick<Window, 'start' | 'end'>, grain: Grain): Slot[] {
  const out: Slot[] = []
  if (grain === 'week') {
    let s = new Date(`${weekStart(iso(w.start))}T00:00:00.000Z`)
    while (s <= w.end) {
      const e = new Date(s.getTime() + 6 * DAY)
      const start = s < w.start ? w.start : s
      const end = e > w.end ? w.end : e
      out.push({ key: iso(s), label: `Week of ${formatDay(s)}`, start, end })
      s = new Date(s.getTime() + 7 * DAY)
    }
    return out
  }
  let y = w.start.getUTCFullYear()
  let m = w.start.getUTCMonth()
  for (;;) {
    const s = new Date(Date.UTC(y, m, 1))
    if (s > w.end) break
    const e = new Date(Date.UTC(y, m + 1, 0))
    out.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: formatMonth(s),
      start: s < w.start ? w.start : s,
      end: e > w.end ? w.end : e,
    })
    m += 1
    if (m === 12) { m = 0; y += 1 }
  }
  return out
}

function slotOf(slots: Slot[], at: Date): Slot | null {
  const d = utcDay(at)
  return slots.find((s) => d >= s.start && d <= s.end) ?? null
}

// ── What is handed in ────────────────────────────────────────────────

/**
 * One movement of money, as a reader already holds it.
 *
 * `minor` null is an amount nobody recorded — a payroll run that wrote
 * hours and no rate. `currency` null is a movement whose currency is not
 * known, which blanks its column in every currency in its period, since
 * it could belong to any of them.
 */
export interface Flow {
  currency: string | null
  at: Date | null
  minor: number | null
}

/** One currency's open documents, read into the five age bands. */
export interface OpenDoc {
  currency: string
  dueAt: Date
  outstandingMinor: number
}

/** The five age bands of a book, as `ageBook` in lib/ar-ageing counts them. */
export type Bands = Record<Bucket, { count: number; minor: number }>

export interface AgedBook {
  currency: string
  buckets: Bands
}

export type CashSide = 'SELLER' | 'CLIENT'

export interface CashInputs {
  /** A firm that bills somebody, or a client, which bills nobody. */
  side: CashSide
  /** Bills sent, at the day each was sent. Ignored for a client. */
  billed: Flow[]
  /** Payments received, on bills or not yet placed. Ignored for a client. */
  received: Flow[]
  /** Invoice receipts still owed, at their due date. */
  receiptsDue: Flow[]
  /** Payments made to suppliers. */
  receiptsPaid: Flow[]
  /** Payroll not yet paid, at its pay date. Null: this seat does not read payroll. */
  payrollDue: Flow[] | null
  /** What processed payroll runs paid. Null: this seat does not read payroll. */
  payrollPaid: Flow[] | null
  /** The receivable book's age bands, one per currency (`book.byCurrency`). */
  owedToUs: AgedBook[]
  /** What the firm owes its suppliers, open, to be aged with the same bands. */
  weOwe: OpenDoc[]
}

// ── What comes out ───────────────────────────────────────────────────

export const FIGURES = ['billed', 'received', 'receiptsDue', 'receiptsPaid', 'payrollDue', 'payrollPaid'] as const
export type Figure = (typeof FIGURES)[number]

/** A client bills nobody and employs no contractor, so it has only these. */
export const CLIENT_FIGURES: readonly Figure[] = ['receiptsDue', 'receiptsPaid']

/** The column words, the trade's, read by the screen. */
export const FIGURE_WORD: Record<Figure | 'net', string> = {
  billed: 'Billed',
  received: 'Payments in',
  receiptsDue: 'Invoice receipts due',
  receiptsPaid: 'Payments out',
  payrollDue: 'Payroll due',
  payrollPaid: 'Payroll paid',
  net: 'Net',
}

export interface CashRow {
  key: string
  label: string
  start: string
  end: string
  /** Minor units of this row's currency; null where it cannot be stood behind. */
  figures: Partial<Record<Figure, number | null>>
  /** Payments in less payments out and payroll paid. Null where any part is. */
  net: number | null
}

export interface CurrencyFlow {
  currency: string
  rows: CashRow[]
  totals: CashRow
  /** Owed to the firm, in the five bands. Null for a client, which is owed nothing. */
  owedToUs: Bands | null
  /** What the firm owes, in the same five bands. */
  weOwe: Bands
}

export interface CashFlow {
  side: CashSide
  window: { period: CashPeriod; start: string; end: string; label: string }
  grain: Grain
  /** The columns this reader has, in the order they are read. */
  figures: Figure[]
  /** One per currency, never added across. */
  currencies: CurrencyFlow[]
  /** Every blank, said once, in words. */
  says: string[]
}

export function emptyBands(): Bands {
  return Object.fromEntries(BUCKETS.map((b) => [b, { count: 0, minor: 0 }])) as Bands
}

/** What the firm owes, aged by the receivable book's own five bands, one book per currency. */
export function ageOpen(docs: OpenDoc[], now: Date): Map<string, Bands> {
  const out = new Map<string, Bands>()
  for (const d of docs) {
    if (d.outstandingMinor <= 0) continue
    const cur = d.currency.toUpperCase()
    const bands = out.get(cur) ?? emptyBands()
    const b = bands[bucketOf(daysOverdue(d.dueAt, now))]
    b.count += 1
    b.minor += d.outstandingMinor
    out.set(cur, bands)
  }
  return out
}

const NOT_READ_PAYROLL =
  'Payroll is not shown, and so neither is the net, because your role does not read payroll. ' +
  'A net without payroll would count as kept the wages that have already gone.'

/**
 * Cash flow for one window, cut by week or by month, per currency.
 */
export function cashFlow(input: CashInputs, period: CashPeriod, grain: Grain, now: Date): CashFlow {
  const w = windowFor(period, now)
  const slots = slotsFor(w, grain)
  const client = input.side === 'CLIENT'
  const readsPayroll = !client && input.payrollDue != null && input.payrollPaid != null
  const figures: Figure[] = client
    ? [...CLIENT_FIGURES]
    : FIGURES.filter((f) => readsPayroll || (f !== 'payrollDue' && f !== 'payrollPaid'))

  const flowsOf: Record<Figure, Flow[]> = {
    billed: client ? [] : input.billed,
    received: client ? [] : input.received,
    receiptsDue: input.receiptsDue,
    receiptsPaid: input.receiptsPaid,
    payrollDue: readsPayroll ? input.payrollDue! : [],
    payrollPaid: readsPayroll ? input.payrollPaid! : [],
  }

  const says: string[] = []
  if (client) {
    says.push('A client bills nobody and runs no contractor payroll, so its cash flow is what it owes its suppliers: paid and due.')
  } else if (!readsPayroll) {
    says.push(NOT_READ_PAYROLL)
  }

  // sums[currency][slotKey][figure] = minor | null (null: blanked)
  type Cell = Partial<Record<Figure, number | null>>
  const sums = new Map<string, Map<string, Cell>>()
  /** A movement whose currency is unknown blanks its column, per slot, in every currency. */
  const blankEverywhere = new Map<string, Set<Figure>>()
  const currencies = new Set<string>()
  let undated = 0
  let unpriced = 0

  const cellOf = (cur: string, key: string): Cell => {
    if (!sums.has(cur)) sums.set(cur, new Map())
    const m = sums.get(cur)!
    if (!m.has(key)) m.set(key, {})
    return m.get(key)!
  }

  for (const f of figures) {
    for (const flow of flowsOf[f]) {
      if (flow.at == null) { undated += 1; continue }
      const slot = slotOf(slots, flow.at)
      if (!slot) continue
      if (flow.currency == null) {
        unpriced += 1
        if (!blankEverywhere.has(slot.key)) blankEverywhere.set(slot.key, new Set())
        blankEverywhere.get(slot.key)!.add(f)
        continue
      }
      const cur = flow.currency.toUpperCase()
      currencies.add(cur)
      const cell = cellOf(cur, slot.key)
      if (flow.minor == null) {
        unpriced += 1
        cell[f] = null
        continue
      }
      if (cell[f] === null) continue
      cell[f] = (cell[f] ?? 0) + flow.minor
    }
  }

  const owedToUs = new Map<string, Bands>()
  if (!client) {
    for (const b of input.owedToUs) {
      const cur = b.currency.toUpperCase()
      owedToUs.set(cur, b.buckets)
      if (BUCKETS.some((k) => b.buckets[k].minor > 0)) currencies.add(cur)
    }
  }
  const weOwe = ageOpen(input.weOwe, now)
  for (const cur of weOwe.keys()) currencies.add(cur)

  if (undated) {
    says.push(
      `${undated} ${undated === 1 ? 'movement has' : 'movements have'} no date on the record, ` +
      'so they are in no period here.',
    )
  }
  if (unpriced) {
    says.push(
      `${unpriced} ${unpriced === 1 ? 'payment has' : 'payments have'} no amount or no currency on the record, ` +
      'so the column for that period is blank, and the net beside it, rather than read as nought.',
    )
  }

  const netOf = (cell: Cell): number | null => {
    if (!client && !readsPayroll) return null
    const inn = client ? 0 : cell.received ?? 0
    if (!client && cell.received === null) return null
    const parts: Figure[] = client ? ['receiptsPaid'] : ['receiptsPaid', 'payrollPaid']
    let out = 0
    for (const p of parts) {
      if (cell[p] === null) return null
      out += cell[p] ?? 0
    }
    return inn - out
  }

  const result: CurrencyFlow[] = [...currencies].sort().map((cur) => {
    const total: Cell = Object.fromEntries(figures.map((f) => [f, 0])) as Cell
    const rows: CashRow[] = slots.map((s) => {
      const got = sums.get(cur)?.get(s.key) ?? {}
      const blanked = blankEverywhere.get(s.key)
      const cell: Cell = {}
      for (const f of figures) {
        const v = blanked?.has(f) ? null : got[f] === null ? null : got[f] ?? 0
        cell[f] = v
        total[f] = total[f] === null || v === null ? null : (total[f] as number) + v
      }
      return { key: s.key, label: s.label, start: iso(s.start), end: iso(s.end), figures: cell, net: netOf(cell) }
    })
    return {
      currency: cur,
      rows,
      totals: { key: 'total', label: 'Total', start: iso(w.start), end: iso(w.end), figures: total, net: netOf(total) },
      owedToUs: client ? null : owedToUs.get(cur) ?? emptyBands(),
      weOwe: weOwe.get(cur) ?? emptyBands(),
    }
  })

  return {
    side: input.side,
    window: { period, start: iso(w.start), end: iso(w.end), label: w.label },
    grain,
    figures,
    currencies: result,
    says,
  }
}

/**
 * Whether a list of values is worth a chart: only where they differ.
 *
 * Eight bars all of length one is the list in disguise (CLAUDE.md, "a
 * chart's colors are computed"), so where nothing varies the list is
 * the honest form and no bar is drawn.
 */
export function varies(values: ReadonlyArray<number | null>): boolean {
  const nums = values.filter((v): v is number => v != null && v !== 0)
  if (nums.length < 2) return false
  return nums.some((v) => v !== nums[0])
}
