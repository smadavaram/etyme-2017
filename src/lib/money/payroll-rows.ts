/**
 * Which rows the payroll screen shows for a period, what each says its
 * status is, and whose client it names.
 *
 * Found by a browser walk of the seeded world on 2026-09-30:
 *
 * - The screen read active contracts only. Karthik Menon worked June to
 *   August for Teleworld, was paid for all three months, and the screen
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
