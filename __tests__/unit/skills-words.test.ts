import { describe, it, expect } from 'vitest'
import { ALL_LABELS, CHIPS, DASH, cellsOf, chipFor, gradedLine, numberText, signedText, tierLine } from '@/lib/skills/performance-words'
import { lineOf, type PerfRow } from '@/lib/skills/performance'

const VOCABULARY = new Set([
  'planned', 'actual', 'target', 'variance', 'var', '%', 'completion', 'passed', 'failed', 'not', 'graded', 'rules', 'low', 'tier', 'high',
  'fallback', 'escalated', 'own', 'model', 'ledger', 'acts', 'above', 'on', 'below', 'no', 'nothing', 'day', 'week', 'month',
])
const VERBS = ['is', 'are', 'was', 'were', 'be', 'has', 'have', 'will', 'can', 'set', 'send', 'add', 'see', 'open', 'click', 'press', 'save', 'ask', 'wait', 'try', 'check', 'read', 'run']

const row = (over: Partial<PerfRow> = {}): PerfRow => ({
  skillKey: 's', agentKey: 'a', tier: 'RULES', byTenantModel: false, fallbackFrom: null, escalatedFrom: null,
  unitsPlanned: 40, unitsDone: 36, verdict: 'PASS', ...over,
})

describe('the words on the performance panel', () => {
  it('every performance label is three words or fewer, has no verb, and uses plain digits and signs', () => {
    for (const label of ALL_LABELS) {
      const words = label.split(' ')
      expect(words.length, label).toBeLessThanOrEqual(3)
      for (const w of words) {
        expect(VOCABULARY.has(w.toLowerCase()), `${label}: ${w}`).toBe(true)
        expect(VERBS.includes(w.toLowerCase()), `${label}: ${w}`).toBe(false)
      }
      // No punctuation but the middle dot; the percent sign is the unit on the two percent heads.
      expect(label.replace(/%/g, '')).toMatch(/^[A-Za-z0-9 ]+$/)
      expect(label).not.toMatch(/\d[,.\s]\d{3}/)
    }
  })

  it('the four chips are Above target, On target, Below target and No target', () => {
    expect(Object.values(CHIPS)).toEqual(['Above target', 'On target', 'Below target', 'No target'])
    expect(chipFor({ target: 38, variance: 2 })).toBe('Above target')
    expect(chipFor({ target: 38, variance: 0 })).toBe('On target')
    expect(chipFor({ target: 38, variance: -2 })).toBe('Below target')
    expect(chipFor({ target: null, variance: null })).toBe('No target')
  })

  it('numbers print in ASCII digits with no thousands separator and a plain minus or plus', () => {
    expect(numberText(12345)).toBe('12345')
    expect(signedText(-2)).toBe('-2')
    expect(signedText(2)).toBe('+2')
    expect(signedText(0)).toBe('0')
    expect(signedText(-2)).not.toContain('−')
  })

  it('with no target set the target cell shows a dash and No target, never a zero', () => {
    const c = cellsOf(lineOf('s', [row()], null))
    expect([c.target.text, c.target.why, c.chip]).toEqual([DASH, 'No target', 'No target'])
    expect([c.variance.text, c.varPct.text]).toEqual([DASH, DASH])
  })

  it('with nothing planned completion shows a dash and Nothing planned', () => {
    const c = cellsOf(lineOf('s', [row({ unitsPlanned: 0, unitsDone: 0 })], 5))
    expect([c.completion.text, c.completion.why]).toEqual([DASH, 'Nothing planned'])
  })

  it('a run nobody graded shows Not graded in the actual cell, never a zero', () => {
    const c = cellsOf(lineOf('s', [row({ verdict: null, unitsDone: null })], 5))
    expect([c.actual.text, c.actual.why, c.chip]).toEqual([DASH, 'Not graded', 'Not graded'])
  })

  it('the example line reads Planned 40, Actual 36, Target 38, Variance -2, Var % -5, Completion % 90', () => {
    const c = cellsOf(lineOf('s', [row()], 38))
    expect([c.planned.text, c.actual.text, c.target.text, c.variance.text, c.varPct.text, c.completion.text])
      .toEqual(['40', '36', '38', '-2', '-5', '90'])
    expect(c.chip).toBe('Below target')
  })

  it('the graded line and the tier line use only counts and the middle dot', () => {
    const l = lineOf('s', [row(), row({ tier: 'LOW' })], null)
    expect(gradedLine(l)).toBe('Passed 2 · Failed 0 · Not graded 0')
    expect(tierLine(l.counts)).toBe('Rules 1 · Low tier 1 · High tier 0 · Fallback 0 · Escalated 0')
  })

  it('no price or charge word is on the panel', () => {
    expect(ALL_LABELS.join(' ')).not.toMatch(/price|cost|charge|rate|\$/i)
  })
})
