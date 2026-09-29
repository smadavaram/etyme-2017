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
}

export function paidKey(buyContractId: string, personId: string, timesheetId: string, day: string): string {
  return `${buyContractId}|${personId}|${timesheetId}|${day}`
}

export interface PaidBook {
  /** Hours already paid, by `paidKey`. */
  paid: Map<string, number>
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
  const unrecorded = new Map<string, string>()

  for (const run of runs) {
    const p = (run.payload ?? {}) as {
      contracts?: Array<{ buyContractId?: string; paid?: PaidLine[]; refused?: string | null }>
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
      }
    }
  }

  return { paid, unrecorded }
}
