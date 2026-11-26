/**
 * Planned, Actual, Target, Variance (records 123, 125). Pure: no database,
 * no words. A missing figure is null and the screen draws a dash; nothing
 * here turns "unknown" into a zero.
 *
 * - Planned is the sum of the agent's own `unitsPlanned`.
 * - Actual is the sum of `unitsDone`, which only the grader writes, over
 *   graded rows only. No graded row, no Actual.
 * - Target is the Owner's own number, null until set.
 * - Variance is Actual minus Target. Var % is Variance over Target,
 *   rounded half away from zero to a whole number.
 * - Completion % is Actual over Planned, the same rounding.
 * - An agent's line is its output skill's line, plus its ledger acts.
 * - A price or a charge is nowhere in it.
 */

import { meterOf, type MeterLine, type MeterRow } from './meter'

export type Period = 'DAY' | 'WEEK' | 'MONTH'
export const PERIODS: readonly Period[] = ['DAY', 'WEEK', 'MONTH']

/** [from, to) in UTC. The week runs Sunday to Saturday; the month is the calendar month. */
export function periodWindow(period: Period, now: Date): { from: Date; to: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (period === 'DAY') return { from: d, to: new Date(d.getTime() + 86_400_000) }
  if (period === 'WEEK') {
    const from = new Date(d.getTime() - d.getUTCDay() * 86_400_000)
    return { from, to: new Date(from.getTime() + 7 * 86_400_000) }
  }
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  }
}

/** a over b as a whole-number percent, half away from zero. Null where b is missing or zero. */
export function percentOf(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null
  const n = Math.round((Math.abs(a) * 100) / Math.abs(b))
  return (a < 0) !== (b < 0) && n !== 0 ? -n : n
}

export const varianceOf = (actual: number | null, target: number | null): number | null =>
  actual === null || target === null ? null : actual - target

export const varPercentOf = (actual: number | null, target: number | null): number | null => {
  const v = varianceOf(actual, target)
  return v === null ? null : percentOf(v, target)
}

export const completionOf = (actual: number | null, planned: number | null): number | null =>
  planned === null || planned <= 0 ? null : percentOf(actual, planned)

export interface PerfRow extends MeterRow {
  unitsPlanned: number | null
  unitsDone: number | null
  /** The grader's verdict on this run; null when it has not been graded. */
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN' | null
}

export interface PerfLine {
  key: string
  planned: number | null
  actual: number | null
  target: number | null
  variance: number | null
  varPct: number | null
  completion: number | null
  passed: number
  failed: number
  /** Runs nobody has verified: not yet graded, or graded unknown. Never counted as passed. */
  notGraded: number
  counts: MeterLine
}

const sum = (xs: (number | null)[]): number | null => {
  const some = xs.filter((x): x is number => x !== null)
  return some.length ? some.reduce((a, b) => a + b, 0) : null
}

/** One line over the rows given. */
export function lineOf(key: string, rows: readonly PerfRow[], target: number | null): PerfLine {
  const graded = rows.filter((r) => r.verdict === 'PASS' || r.verdict === 'FAIL')
  const planned = sum(rows.map((r) => r.unitsPlanned))
  const actual = sum(graded.map((r) => r.unitsDone))
  return {
    key, planned, actual, target,
    variance: varianceOf(actual, target),
    varPct: varPercentOf(actual, target),
    completion: completionOf(actual, planned),
    passed: rows.filter((r) => r.verdict === 'PASS').length,
    failed: rows.filter((r) => r.verdict === 'FAIL').length,
    notGraded: rows.length - graded.length,
    counts: meterOf(rows).total,
  }
}

export interface Targets { skill: Record<string, number>; agent: Record<string, number> }
export interface AgentOutput { agentKey: string; outputSkill: string }

export interface Performance {
  skills: PerfLine[]
  agents: (PerfLine & { outputSkill: string; ledgerActs: number })[]
}

/**
 * Every skill's line, and every given agent's line: the agent's rows of its
 * output skill, with the count of its acts on the ledger beside it.
 */
export function performanceOf(
  rows: readonly PerfRow[], targets: Targets, agents: readonly AgentOutput[], ledgerActs: Record<string, number>,
): Performance {
  const keys = [...new Set(rows.map((r) => r.skillKey).filter((k): k is string => !!k))].sort()
  return {
    skills: keys.map((k) => lineOf(k, rows.filter((r) => r.skillKey === k), targets.skill[k] ?? null)),
    agents: agents.map((a) => ({
      ...lineOf(a.agentKey, rows.filter((r) => r.agentKey === a.agentKey && r.skillKey === a.outputSkill), targets.agent[a.agentKey] ?? null),
      outputSkill: a.outputSkill,
      ledgerActs: ledgerActs[a.agentKey] ?? 0,
    })),
  }
}
