import { describe, it, expect } from 'vitest'
import { lineOf, percentOf, periodWindow, performanceOf, varPercentOf, varianceOf, type PerfRow } from '@/lib/skills/performance'

const row = (over: Partial<PerfRow> = {}): PerfRow => ({
  skillKey: 'census.classify', agentKey: 'census-keeper', tier: 'RULES', byTenantModel: false, fallbackFrom: null, escalatedFrom: null,
  unitsPlanned: 10, unitsDone: 9, verdict: 'PASS', ...over,
})

describe('performance arithmetic', () => {
  it('variance is actual minus target and var percent is of the target, rounded to a whole number', () => {
    expect(varianceOf(36, 38)).toBe(-2)
    expect(varPercentOf(36, 38)).toBe(-5)
    expect(varPercentOf(40, 38)).toBe(5)
  })

  it('var percent rounds half away from zero in both directions', () => {
    expect(varPercentOf(21, 20)).toBe(5)
    expect(varPercentOf(19, 20)).toBe(-5)
    expect(percentOf(1, 8)).toBe(13)
    expect(percentOf(-1, 8)).toBe(-13)
    expect(varPercentOf(205, 200)).toBe(3)
    expect(varPercentOf(195, 200)).toBe(-3)
  })

  it('with no target set the variance, var percent and target are all missing, never zero', () => {
    const l = lineOf('census.classify', [row()], null)
    expect([l.target, l.variance, l.varPct]).toEqual([null, null, null])
  })

  it('a target of zero gives a variance and no var percent', () => {
    const l = lineOf('x', [row({ unitsDone: 3 })], 0)
    expect([l.variance, l.varPct]).toEqual([3, null])
  })

  it('completion is actual over planned and is missing when nothing was planned', () => {
    expect(lineOf('x', [row({ unitsPlanned: 40, unitsDone: 36 })], 38).completion).toBe(90)
    expect(lineOf('x', [row({ unitsPlanned: 0, unitsDone: 0 })], null).completion).toBeNull()
    expect(lineOf('x', [row({ unitsPlanned: null, unitsDone: 4 })], null).completion).toBeNull()
  })

  it('actual comes from graded rows only, and a run nobody verified is not graded and not passed', () => {
    const l = lineOf('x', [
      row({ unitsDone: 5 }), row({ unitsDone: 4, verdict: 'FAIL' }),
      row({ unitsDone: 99, verdict: null }), row({ unitsDone: null, verdict: 'UNKNOWN' }),
    ], 10)
    expect([l.actual, l.passed, l.failed, l.notGraded]).toEqual([9, 1, 1, 2])
  })

  it('with nothing graded actual is missing, not zero', () => {
    const l = lineOf('x', [row({ verdict: null, unitsDone: null })], 10)
    expect([l.actual, l.variance, l.completion]).toEqual([null, null, null])
  })

  it('the line counts calls by tier with fallbacks and escalations, and carries no price', () => {
    const l = lineOf('x', [row({ tier: 'LOW', fallbackFrom: 'a' }), row({ tier: 'HIGH', escalatedFrom: 'LOW' }), row()], null)
    expect([l.counts.rules, l.counts.low, l.counts.high, l.counts.fallback, l.counts.escalated]).toEqual([1, 1, 1, 1, 1])
    expect(Object.keys(l).join(' ') + Object.keys(l.counts).join(' ')).not.toMatch(/price|cost|charge|rate/i)
  })

  it('an agent’s line equals its output skill’s line and carries its ledger acts count', () => {
    const rows = [
      row({ skillKey: 'census.classify', unitsPlanned: 10, unitsDone: 8 }),
      row({ skillKey: 'weekly.summary', unitsPlanned: 1, unitsDone: 1 }),
    ]
    const p = performanceOf(rows, { skill: { 'census.classify': 9 }, agent: { 'census-keeper': 9 } },
      [{ agentKey: 'census-keeper', outputSkill: 'census.classify' }], { 'census-keeper': 12 })
    const skill = p.skills.find((s) => s.key === 'census.classify')!
    const agent = p.agents[0]
    expect([agent.planned, agent.actual, agent.target, agent.variance, agent.varPct, agent.completion])
      .toEqual([skill.planned, skill.actual, skill.target, skill.variance, skill.varPct, skill.completion])
    expect(agent.ledgerActs).toBe(12)
  })

  it('an agent with no runs reads missing figures and zero ledger acts', () => {
    const p = performanceOf([], { skill: {}, agent: {} }, [{ agentKey: 'census-keeper', outputSkill: 'census.classify' }], {})
    expect([p.agents[0].planned, p.agents[0].actual, p.agents[0].ledgerActs, p.agents[0].notGraded]).toEqual([null, null, 0, 0])
  })

  it('the week is the company’s Sunday to Saturday', () => {
    const wed = new Date('2026-11-25T15:00:00Z')
    const w = periodWindow('WEEK', wed)
    expect(w.from.toISOString()).toBe('2026-11-22T00:00:00.000Z')
    expect(w.from.getUTCDay()).toBe(0)
    expect(w.to.toISOString()).toBe('2026-11-29T00:00:00.000Z')
    const sun = periodWindow('WEEK', new Date('2026-11-22T00:00:00Z'))
    expect(sun.from.toISOString()).toBe('2026-11-22T00:00:00.000Z')
    const sat = periodWindow('WEEK', new Date('2026-11-28T23:59:00Z'))
    expect(sat.from.toISOString()).toBe('2026-11-22T00:00:00.000Z')
  })

  it('the day and the month are the calendar day and month', () => {
    const now = new Date('2026-12-31T10:00:00Z')
    expect(periodWindow('DAY', now).to.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(periodWindow('MONTH', now).from.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(periodWindow('MONTH', now).to.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
