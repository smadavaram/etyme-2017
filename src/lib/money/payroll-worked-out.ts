/**
 * Pay is never sent before it is worked out.
 *
 * ── The founder, 2026-10-07, reaffirmed 2026-10-20 ───────────────────
 *
 * "Pay can never go out before it is worked out." A payroll run moves
 * through three presses — calculate, approve, process — and only the
 * last one pays. The run route took `process` on its own, so a period
 * nobody had calculated could be paid in one press. The simulation of
 * 2026-10-20 did exactly that, on every run, and nothing refused it.
 *
 * ── What "worked out" means here ─────────────────────────────────────
 *
 * A `calculate` run that covered this pay line, this person and this
 * exact pay period, and did not refuse them. That run is on the record
 * already: each run writes its rows into its own `PAYROLL_RUN` log entry
 * (lib/payroll-paid), with the period each person was worked out for.
 * A row written before 2026-10-20 carries no person, so it covers every
 * person on its line for that period, which is what it worked out.
 *
 * What this does not do, said once: it does not compare the figure the
 * calculation reached with the figure the payment reaches. A week
 * accepted between the two presses is paid with the rest. Holding the
 * payment to the calculated figure needs a run header with its own
 * totals (the `PayrollRun` table described in lib/payroll-paid).
 *
 * Pure: no database.
 */

import { PAYROLL_RUN } from '@/lib/payroll-paid'

export { PAYROLL_RUN }

/** One row of a `calculate` run, as its log entry wrote it. */
export interface CalculatedRow {
  buyContractId?: string | null
  /** Absent on a row written before 2026-10-20: it covers every person on its line. */
  buyContractCandidateId?: string | null
  payPeriod?: { start?: string | null; end?: string | null } | null
  refused?: string | null
}

const ANY = '*'

function key(buyContractId: string, candidateId: string, start: string, end: string): string {
  return `${buyContractId}|${candidateId}|${start.slice(0, 10)}|${end.slice(0, 10)}`
}

/** Every pay line, person and period the `calculate` runs worked out. */
export function workedOutKeys(runs: ReadonlyArray<{ contracts?: ReadonlyArray<CalculatedRow> | null } | null | undefined>): Set<string> {
  const out = new Set<string>()
  for (const run of runs) {
    for (const row of run?.contracts ?? []) {
      // A row the run refused worked nothing out.
      if (row.refused) continue
      if (!row.buyContractId || !row.payPeriod?.start || !row.payPeriod?.end) continue
      out.add(key(row.buyContractId, row.buyContractCandidateId ?? ANY, row.payPeriod.start, row.payPeriod.end))
    }
  }
  return out
}

/** Whether this person's pay on this line for this period was worked out by a `calculate` run. */
export function isWorkedOut(
  keys: ReadonlySet<string>,
  ask: { buyContractId: string; buyContractCandidateId: string; start: string; end: string }
): boolean {
  return (
    keys.has(key(ask.buyContractId, ask.buyContractCandidateId, ask.start, ask.end)) ||
    keys.has(key(ask.buyContractId, ANY, ask.start, ask.end))
  )
}

/** One person whose pay would go out unworked. */
export interface NotWorkedOut {
  personName: string
  /** The period as a person reads it, "July 2026". */
  periodLabel: string
}

/**
 * The refusal, in one sentence a payroll clerk acts on: whose pay, for
 * which period, and the press that comes first.
 */
export function notWorkedOutSays(rows: ReadonlyArray<NotWorkedOut>): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const r of rows) {
    const p = `${r.personName} for ${r.periodLabel}`
    if (seen.has(p)) continue
    seen.add(p)
    parts.push(p)
  }
  const shown = parts.length > 3 ? [...parts.slice(0, 3), `${parts.length - 3} more`] : parts
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return (
    `Pay for ${list} has not been worked out yet, and pay never goes out before it is worked out. ` +
    `Calculate ${parts.length === 1 ? 'that period' : 'those periods'} first, then pay.`
  )
}
