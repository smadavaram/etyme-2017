/**
 * Which rows the payroll screen shows for a period, what each says its
 * status is, and whose client it names.
 *
 * Found by a browser walk of the seeded world on 2026-09-30:
 *
 * - The screen read active contracts only. Karthik Menon worked June to
 *   August for Tellisford, was paid for all three months, and the screen
 *   said "W-2 employees 0" for every one of them, because his placement
 *   had ended by the time anybody looked. A placement that ended is still
 *   on the runs for the periods it worked.
 * - A row's status was the contract's earliest open date, not the
 *   month's own, so a month whose pay day the run had settled read
 *   "Pending" because an older calculate date was never marked.
 * - A corp-to-corp worker's hours are filed on the supplier's contract,
 *   whose client is the employer itself, so the "Client" column named the
 *   employer.
 *
 * Pure: no database.
 */

import type { Period } from '@/lib/periods'
import { periodPaidBy, type PayDayCycle } from '@/lib/money/pay-day-period'

const DAY = 86_400_000
const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/** Placements that are working, or paid between assignments. On the screen whatever the period. */
export const ACTIVE_PAY_STATES = ['IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING'] as const
/** Placements that stopped. On the screen for the periods they worked, and for hours still owed. */
export const STOPPED_PAY_STATES = ['ENDED', 'PAUSED'] as const

export interface PayPlacement {
  state: string
  startDate: Date
  endDate: Date | null
}

export interface PayView {
  /** The pay period this row is for. Null where there is no work to anchor one. */
  period: Period | null
  /** True where the reader asked for this period; false on the view of every period. */
  asked: boolean
  /** Hours the period would pay this person. */
  hours: number
  /** Whether this period's own pay day has been settled by a run. */
  settled: boolean
}

/**
 * Whether a placement is on the payroll for a period.
 *
 * Working placements always are, as before. A stopped one is on the
 * period it overlaps, and on any period it still has hours in. On the
 * view of every period, where each row shows its latest work, a stopped
 * placement stays only while that last period is not yet paid — so a
 * placement that ended three years ago is not a row forever.
 */
export function onPayrollFor(p: PayPlacement, v: PayView): boolean {
  if ((ACTIVE_PAY_STATES as readonly string[]).includes(p.state)) return true
  if (!(STOPPED_PAY_STATES as readonly string[]).includes(p.state)) return false
  if (!v.period) return false
  if (!v.asked) return v.hours > 0 && !v.settled
  if (v.hours > 0) return true
  const start = dayOf(p.startDate).getTime()
  const end = p.endDate ? dayOf(p.endDate).getTime() : Infinity
  return start <= dayOf(v.period.end).getTime() && end >= dayOf(v.period.start).getTime()
}

/**
 * The earliest end date a stopped placement can have and still be on a
 * run for this month. Loose on purpose — a pay period may begin before
 * the 1st — and `onPayrollFor` decides exactly.
 */
export function stoppedSince(month: string | null): Date | null {
  if (!month) return null
  const first = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(first.getTime())) return null
  return new Date(first.getTime() - 31 * DAY)
}

export interface PayCycle extends PayDayCycle {
  kind: string
}

/**
 * The status of one period, read off that period's own pay day.
 *
 * PROCESSED where every pay day paying this period is settled;
 * CALCULATED where its calculate dates are and its pay day is not;
 * PENDING where neither. Null where the line has no pay day for the
 * period at all, and the caller keeps what it said before.
 */
export function periodPayStatus(
  cycles: readonly PayCycle[],
  period: Period,
  periodOf: (d: Date) => Period,
  startedOn?: Date | null
): 'PROCESSED' | 'CALCULATED' | 'PENDING' | null {
  const key = (p: Period) => p.start.toISOString().slice(0, 10)
  const want = key(period)
  const of = (kind: string) => {
    const all = cycles.filter((c) => c.kind === kind)
    return all.filter((c) => key(periodPaidBy(c, all, periodOf, startedOn)) === want)
  }
  const pays = of('SALARY_PAY')
  if (pays.length === 0) return null
  if (pays.every((c) => c.completedAt != null)) return 'PROCESSED'
  const calcs = of('SALARY_CALCULATE')
  if (calcs.length > 0 && calcs.every((c) => c.completedAt != null)) return 'CALCULATED'
  return 'PENDING'
}

/**
 * The pay day of one period, read off that period's own pay days by the
 * rule `periodPayStatus` reads its status by, so the day and the status
 * on a row never disagree. YYYY-MM-DD; two pay days for one period are
 * both said, earliest first, "2026-07-03; 2026-07-17". Null where the
 * line has no pay day for the period: the file leaves the cell blank
 * rather than name a day that pays another period.
 *
 * Found by hand, 2026-11-14: the month's pay file copied the row's next
 * open pay day from today, so the June file, paid on Jul 7, read Pay day
 * 2026-12-07.
 */
export function periodPayDay(
  cycles: readonly PayCycle[],
  period: Period,
  periodOf: (d: Date) => Period,
  startedOn?: Date | null
): string | null {
  const key = (p: Period) => p.start.toISOString().slice(0, 10)
  const want = key(period)
  const all = cycles.filter((c) => c.kind === 'SALARY_PAY')
  const days = [...new Set(
    all
      .filter((c) => key(periodPaidBy(c, all, periodOf, startedOn)) === want)
      .map((c) => dayOf(c.dueOn).toISOString().slice(0, 10))
  )].sort()
  return days.length ? days.join('; ') : null
}

/**
 * The status of a period that has no pay day of its own, read off what
 * the runs recorded: processed only where a run paid every hour in it,
 * worked out where a calculate run covered it, else pending.
 *
 * Found on a walk on 2026-11-14: an open-ended placement has no pay days,
 * and its months read "Processed" before anybody had paid her. Nothing
 * saying it was paid must never read as paid.
 */
export function periodStatusFromRuns(args: {
  /** Every day the period pays, by `paidKey`, with its hours. */
  days: ReadonlyArray<{ key: string; hours: number }>
  /** Hours already paid, by `paidKey` (`paidBook`). */
  paid: ReadonlyMap<string, number>
  /** Whether a calculate run worked this person's period out. */
  workedOut: boolean
  /**
   * True where overtime is still owed on days whose straight time a run
   * paid: a week paid at straight time before the person was recorded as
   * not exempt. Such a period is not processed until the premium is paid.
   */
  premiumOwed?: boolean
}): 'PROCESSED' | 'CALCULATED' | 'PENDING' {
  const allPaid =
    args.days.length > 0 && args.days.every((d) => (args.paid.get(d.key) ?? 0) + 0.005 >= d.hours)
  if (allPaid && !args.premiumOwed) return 'PROCESSED'
  return args.workedOut ? 'CALCULATED' : 'PENDING'
}

/**
 * A week filed inside the pay period and not accepted yet, said on the
 * payroll row. It is not paid in this period, and the row says so rather
 * than reading as the whole period.
 */
export function notAcceptedSays(w: {
  personName: string
  /** The week as a person reads it, "Nov 1 – Nov 7, 2026". */
  week: string
  hours: number
  clientApproved: boolean
  clientName: string | null
  employerName: string | null
}): string {
  const hours = Math.round(w.hours * 100) / 100
  const employer = w.employerName ?? 'your firm'
  const until = w.clientApproved
    ? `${employer} accepts it`
    : `${w.clientName ?? 'the client'} approves it and ${employer} accepts it`
  return `${w.personName}'s week of ${w.week}, ${hours} hours, is not in this pay until ${until}.`
}

/**
 * The pay file for the period shown: one of the company's own pay
 * periods, by its first day, or a calendar month. Both are the Payroll
 * page's own rows (GET /api/payroll?format=csv), which take off what
 * earlier runs paid, so no hour is handed to a provider twice. The
 * older export (/api/payroll/export) never read what was paid and gives
 * no file now (found by hand, 2026-11-14). The view of every period has
 * no file: the route refuses it in a sentence and the page shows that
 * sentence in the button's place.
 */
export function payFileHref(month: string): string {
  const params = new URLSearchParams()
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(month)) params.set('period', month)
  params.set('format', 'csv')
  return `/api/payroll?${params}`
}

export interface Named {
  id: string
  name: string
}

export interface ClientSide {
  clientCompany: Named | null
  endClientCompany: Named | null
}

/**
 * The client a pay row names: the one the work is for.
 *
 * The employer's own sell line answers first — its end client where it
 * names one, else the firm it bills. Where the employer has no sell line,
 * the supplier's contract may name the end client; its `clientCompany`
 * is the employer itself and is never shown as the client. Null where
 * nothing names one, and the screen says so rather than naming a firm
 * that is not the client.
 */
export function payrollClientFor(args: {
  employerId: string
  own: readonly ClientSide[]
  supplier: ClientSide | null
}): Named | null {
  for (const s of args.own) {
    const c = s.endClientCompany ?? s.clientCompany
    if (c && c.id !== args.employerId) return c
  }
  const end = args.supplier?.endClientCompany
  if (end && end.id !== args.employerId) return end
  return null
}
