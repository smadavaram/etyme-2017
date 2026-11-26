/**
 * The words of the performance panel (records 123, 125). Every cell on the
 * panel is a number, a dash, or a label from this file. A label is three
 * words or fewer, has no verb, no punctuation but the middle dot (and the
 * percent sign on the two percent column heads), ASCII digits, no thousands
 * separator, and the signs - and +. No sentence is ever built here.
 * No price, charge or rate appears: the rate card (record 127) is not
 * published to code.
 */

import type { PerfLine, Period } from './performance'

export const DASH = '—'
export const MIDDLE_DOT = '·'

export const COLUMNS = {
  planned: 'Planned', actual: 'Actual', target: 'Target', variance: 'Variance', varPct: 'Var %', completion: 'Completion %',
} as const

export const COUNT_LABELS = {
  passed: 'Passed', failed: 'Failed', notGraded: 'Not graded',
  rules: 'Rules', low: 'Low tier', high: 'High tier', fallback: 'Fallback', escalated: 'Escalated',
  ownModel: 'Own model', ledgerActs: 'Ledger acts',
} as const

export const CHIPS = { above: 'Above target', on: 'On target', below: 'Below target', none: 'No target' } as const

export const MISSING = { noTarget: 'No target', nothingPlanned: 'Nothing planned', notGraded: 'Not graded' } as const

export const PERIOD_LABELS: Record<Period, string> = { DAY: 'Day', WEEK: 'Week', MONTH: 'Month' }

/** Every label the panel may print, for the constraint test and nobody else. */
export const ALL_LABELS: readonly string[] = [
  ...Object.values(COLUMNS), ...Object.values(COUNT_LABELS), ...Object.values(CHIPS),
  ...Object.values(MISSING), ...Object.values(PERIOD_LABELS),
]

const whole = (n: number): n is number => Number.isSafeInteger(n)

/** 36 -> "36", -2 -> "-2". ASCII digits, no thousands separator. */
export const numberText = (n: number | null): string => (n === null || !whole(n) ? DASH : String(n))
/** 2 -> "+2", -2 -> "-2", 0 -> "0". */
export const signedText = (n: number | null): string => (n === null || !whole(n) ? DASH : n > 0 ? `+${n}` : String(n))

export interface Cell { text: string; /** Why the cell is a dash: a label from MISSING; null when it holds a number. */ why: string | null }
const cell = (text: string, why: string): Cell => (text === DASH ? { text, why } : { text, why: null })

export const chipFor = (l: Pick<PerfLine, 'target' | 'variance'>): string =>
  l.target === null ? CHIPS.none : l.variance === null ? MISSING.notGraded : l.variance > 0 ? CHIPS.above : l.variance < 0 ? CHIPS.below : CHIPS.on

export interface Cells { planned: Cell; actual: Cell; target: Cell; variance: Cell; varPct: Cell; completion: Cell; chip: string }

export function cellsOf(l: PerfLine): Cells {
  const noTarget = l.target === null ? MISSING.noTarget : MISSING.notGraded
  return {
    planned: cell(numberText(l.planned), MISSING.nothingPlanned),
    actual: cell(numberText(l.actual), MISSING.notGraded),
    target: cell(numberText(l.target), MISSING.noTarget),
    variance: cell(signedText(l.variance), noTarget),
    varPct: cell(signedText(l.varPct), l.target === 0 ? MISSING.noTarget : noTarget),
    completion: cell(numberText(l.completion), l.planned === null || l.planned <= 0 ? MISSING.nothingPlanned : MISSING.notGraded),
    chip: chipFor(l),
  }
}

/** "Passed 34 · Failed 2 · Not graded 0" */
export const gradedLine = (l: Pick<PerfLine, 'passed' | 'failed' | 'notGraded'>): string =>
  [`${COUNT_LABELS.passed} ${l.passed}`, `${COUNT_LABELS.failed} ${l.failed}`, `${COUNT_LABELS.notGraded} ${l.notGraded}`].join(` ${MIDDLE_DOT} `)

/** "Rules 120 · Low tier 12 · High tier 2 · Fallback 1 · Escalated 2" */
export const tierLine = (c: PerfLine['counts']): string =>
  [`${COUNT_LABELS.rules} ${c.rules}`, `${COUNT_LABELS.low} ${c.low}`, `${COUNT_LABELS.high} ${c.high}`,
   `${COUNT_LABELS.fallback} ${c.fallback}`, `${COUNT_LABELS.escalated} ${c.escalated}`].join(` ${MIDDLE_DOT} `)
