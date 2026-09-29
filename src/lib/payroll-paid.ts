/**
 * Which hours a payroll run has already paid.
 *
 * ── Why this reads the automation log ─────────────────────────────────
 *
 * Nothing in the schema records what a payroll run paid. `Cycle` says a
 * pay date was reached and not for which hours; `OrderPosting` carries a
 * PAY row only where a placement has a master contract to post to, and
 * one row per week rather than per day, so a week split across two pay
 * periods cannot say which of its days were settled. So until a table
 * exists (described in the report that came with this file, and below),
 * a run that pays writes the days it paid — person, sheet, day, hours,
 * rate — into its own `PAYROLL_RUN` log row, and the next run reads
 * them back and pays only what is not on one.
 *
 * What it cannot do, said plainly: two runs pressed in the same second
 * can both read "nothing paid" and both pay, because a JSON column
 * carries no unique constraint. And a run written before 2026-09-29
 * recorded only a total, so which hours it paid is unknowable — a
 * contract with one of those behind it is refused rather than guessed
 * at, because that run paid every approved hour on the contract at the
 * rate of the day it ran.
 *
 * The table this stands in for:
 *
 *   PayrollLine { id, runId, companyId, buyContractId, personId,
 *     timesheetId, day (Date), hours (Decimal), rateCents, currency,
 *     paidAt, reversalOfId?, @@unique([buyContractId, personId,
 *     timesheetId, day]) }  — and a PayrollRun header { id, companyId,
 *     periodStart, periodEnd, action, runById, runAt }.
 *
 * The unique key is what makes "never pay an hour twice" something the
 * database enforces rather than something this file hopes.
 */

import { prisma } from '@/lib/db'

export const PAYROLL_RUN = 'PAYROLL_RUN'

/** One day's hours as a run paid them. */
export interface PaidLine {
  personId: string
  timesheetId: string
  day: string
  hours: number
  rateCents: number
  /**
   * Of the day's hours, how many were over the weekly line and had their
   * premium paid with this line — and the premium, exact, before the run
   * rounded its total. Absent on a line written before overtime was
   * priced by the run, which paid no premium at all.
   */
  overtimeHours?: number
  premiumCents?: number
}

export function paidKey(buyContractId: string, personId: string, timesheetId: string, day: string): string {
  return `${buyContractId}|${personId}|${timesheetId}|${day}`
}

/** What a day has been paid in all, by every run and every back payment. */
export interface PaidEntry {
  hours: number
  /** Exact cents for the straight time on `hours`, back pay included. */
  straightCents: number
  /** Hours over the line whose premium was paid. */
  premiumHours: number
  /** Exact cents of premium on them, back pay included. */
  premiumCents: number
  /**
   * False where a run paid this day before the run priced overtime at
   * all, so it paid no premium — and what premium the day should have
   * carried is not a rate change's back pay to work out.
   */
  premiumRecorded: boolean
}

/** One day's back pay as a desk approved it, in the off-cycle log row. */
export interface BackPaidLine {
  buyContractId: string
  personId: string
  timesheetId: string
  day: string
  straightCents: number
  premiumCents: number
}

export const PAYROLL_OFF_CYCLE = 'PAYROLL_OFF_CYCLE'

export interface PaidBook {
  /** Hours already paid, by `paidKey`. */
  paid: Map<string, number>
  /** Overtime hours whose premium was already paid, by `paidKey`. */
  premiumHours: Map<string, number>
  /** What each paid day has been paid in all, by `paidKey`. */
  entries: Map<string, PaidEntry>
  /** Contracts with a run behind them that recorded no lines, and when it ran. */
  unrecorded: Map<string, string>
}

/**
 * What earlier processed runs paid, for these buy contracts.
 *
 * Only `process` pays. `calculate` and `approve` move a cycle and write
 * a log row, and neither is money leaving.
 */
export async function paidBook(companyId: string, buyContractIds: string[]): Promise<PaidBook> {
  const wanted = new Set(buyContractIds)
  const runs = await prisma.automationLog.findMany({
    where: { companyId, action: PAYROLL_RUN, payload: { path: ['action'], equals: 'process' } },
    select: { payload: true, at: true },
    orderBy: { at: 'asc' },
  })

  const paid = new Map<string, number>()
  const premiumHours = new Map<string, number>()
  const entries = new Map<string, PaidEntry>()
  const unrecorded = new Map<string, string>()
  const entry = (k: string) => {
    if (!entries.has(k)) entries.set(k, { hours: 0, straightCents: 0, premiumHours: 0, premiumCents: 0, premiumRecorded: true })
    return entries.get(k)!
  }

  for (const run of runs) {
    const p = (run.payload ?? {}) as {
      contracts?: Array<{ buyContractId?: string; paid?: PaidLine[]; refused?: string | null; premiumsPriced?: boolean }>
    }
    for (const c of p.contracts ?? []) {
      if (!c.buyContractId || !wanted.has(c.buyContractId)) continue
      // A row the run refused paid nothing, and says so.
      if (c.refused) continue
      if (!Array.isArray(c.paid)) {
        if (!unrecorded.has(c.buyContractId)) unrecorded.set(c.buyContractId, run.at.toISOString().slice(0, 10))
        continue
      }
      for (const l of c.paid) {
        const k = paidKey(c.buyContractId, l.personId, l.timesheetId, l.day)
        paid.set(k, (paid.get(k) ?? 0) + Number(l.hours))
        if (l.overtimeHours) premiumHours.set(k, (premiumHours.get(k) ?? 0) + Number(l.overtimeHours))
        const e = entry(k)
        e.hours += Number(l.hours)
        e.straightCents += Number(l.hours) * Number(l.rateCents)
        e.premiumHours += Number(l.overtimeHours ?? 0)
        e.premiumCents += Number(l.premiumCents ?? 0)
        if (!c.premiumsPriced) e.premiumRecorded = false
      }
    }
  }

  // Back pay a desk approved, as off-cycle payments. It raised what those
  // days have been paid, so the next change is measured from here and
  // the same difference is never proposed twice.
  const backPaid = await prisma.automationLog.findMany({
    where: { companyId, action: PAYROLL_OFF_CYCLE },
    select: { payload: true },
    orderBy: { at: 'asc' },
  })
  for (const row of backPaid) {
    const lines = ((row.payload ?? {}) as { backPay?: BackPaidLine[] }).backPay
    if (!Array.isArray(lines)) continue
    for (const l of lines) {
      if (!wanted.has(l.buyContractId)) continue
      const e = entry(paidKey(l.buyContractId, l.personId, l.timesheetId, l.day))
      e.straightCents += Number(l.straightCents) || 0
      e.premiumCents += Number(l.premiumCents) || 0
    }
  }

  return { paid, premiumHours, entries, unrecorded }
}
