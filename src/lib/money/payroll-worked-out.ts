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
 * ── And what it covered (walk, 2026-11-14) ───────────────────────────
 *
 * A calculation used to count for the period whatever happened after it.
 * Week one of a two-week period was worked out and paid; week two was
 * accepted late; the row read "Calculated" and offered the pay file and
 * Process, though nobody had worked week two out. Each calculated row now
 * carries `covers`: every day it worked out, with the hours and the
 * overtime hours still to pay on it (`payCovers`). The latest calculation
 * for the line, person and period counts only while what is still to pay
 * is exactly what it covered. A late week, a cut changed after the
 * calculation, or a new day sends the period back to Calculate. Two
 * weeks of 40 hours at one rate are told apart, because the days differ.
 * A row written before this carries no `covers`. It cannot show what it
 * covered, so where what is still to pay is known it does not count, and
 * the period goes back to Calculate once (found by hand, 2026-11-14). A
 * period already paid in full reads "Paid" whatever its calculations say.
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
  /** What the calculation covered (`payCovers`). Absent on a row written before 2026-11-14. */
  covers?: string | null
}

/** One day still to pay: the sheet, the day, its hours and its overtime hours. */
export interface CoveredDay {
  timesheetId: string
  day: string
  hours: number
  overtimeHours?: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * What a calculation covers, as one string the next press can compare:
 * every day still to pay, sorted, with its hours and overtime hours. Two
 * readers that hold the same days to pay write the same string.
 */
export function payCovers(days: ReadonlyArray<CoveredDay>): string {
  const by = new Map<string, { hours: number; ot: number }>()
  for (const d of days) {
    const k = `${d.timesheetId}|${d.day.slice(0, 10)}`
    const prev = by.get(k) ?? { hours: 0, ot: 0 }
    by.set(k, { hours: prev.hours + (Number(d.hours) || 0), ot: prev.ot + (Number(d.overtimeHours) || 0) })
  }
  return [...by.entries()]
    .map(([k, v]) => ({ k, hours: r2(v.hours), ot: r2(v.ot) }))
    .filter((x) => x.hours > 0 || x.ot > 0)
    .sort((a, b) => a.k.localeCompare(b.k))
    .map((x) => `${x.k}|${x.hours}|${x.ot}`)
    .join(';')
}

/**
 * The days a Payroll row still has to pay, in the shape `payCovers` reads:
 * each priced day less what the runs paid on it, each premium less the
 * premium paid. The screen's half of the run's own subtraction.
 */
export function coversLeft(
  days: ReadonlyArray<{ key: string; hours: number }>,
  premiums: ReadonlyArray<{ key: string; hours: number }>,
  book: { paid: ReadonlyMap<string, number>; premiumHours: ReadonlyMap<string, number> },
): CoveredDay[] {
  const out: CoveredDay[] = []
  const split = (key: string) => {
    const parts = key.split('|')
    return { timesheetId: parts[2] ?? '', day: parts[3] ?? '' }
  }
  for (const d of days) {
    const left = r2(d.hours - (book.paid.get(d.key) ?? 0))
    if (left > 0) out.push({ ...split(d.key), hours: left, overtimeHours: 0 })
  }
  for (const p of premiums) {
    const unpaid = r2(p.hours - (book.premiumHours.get(p.key) ?? 0))
    if (unpaid > 0 && p.hours > 0) out.push({ ...split(p.key), hours: 0, overtimeHours: unpaid })
  }
  return out
}

/** The calculations on record: a key, and what the latest one for it covered (null where it did not say). */
export type WorkedOut = ReadonlySet<string> | ReadonlyMap<string, string | null>

const ANY = '*'

function key(buyContractId: string, candidateId: string, start: string, end: string): string {
  return `${buyContractId}|${candidateId}|${start.slice(0, 10)}|${end.slice(0, 10)}`
}

/**
 * Every pay line, person and period the `calculate` runs worked out, and
 * what the latest of them covered. Read the runs oldest first: a later
 * calculation of the same period replaces an earlier one.
 */
export function workedOutKeys(
  runs: ReadonlyArray<{ contracts?: ReadonlyArray<CalculatedRow> | null } | null | undefined>
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const run of runs) {
    for (const row of run?.contracts ?? []) {
      // A row the run refused worked nothing out.
      if (row.refused) continue
      if (!row.buyContractId || !row.payPeriod?.start || !row.payPeriod?.end) continue
      out.set(
        key(row.buyContractId, row.buyContractCandidateId ?? ANY, row.payPeriod.start, row.payPeriod.end),
        typeof row.covers === 'string' ? row.covers : null
      )
    }
  }
  return out
}

/**
 * Whether this person's pay on this line for this period was worked out
 * by a `calculate` run. Given `covers` (what is still to pay now, by
 * `payCovers`), it holds only while the latest calculation covered
 * exactly that.
 */
export function isWorkedOut(
  keys: WorkedOut,
  ask: { buyContractId: string; buyContractCandidateId: string; start: string; end: string },
  covers?: string
): boolean {
  const own = key(ask.buyContractId, ask.buyContractCandidateId, ask.start, ask.end)
  const any = key(ask.buyContractId, ANY, ask.start, ask.end)
  const hit = keys.has(own) ? own : keys.has(any) ? any : null
  if (!hit) return false
  if (covers === undefined || !(keys instanceof Map)) return true
  const said = (keys as ReadonlyMap<string, string | null>).get(hit)
  // A calculation written before it said what it covered cannot show it
  // covered what is still to pay, so it does not count: Calculate again.
  // Found by hand, 2026-11-14: such a row stayed "Calculated" after a late
  // week was accepted, and Process paid the late week unworked.
  if (said == null) return false
  return said === covers
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
