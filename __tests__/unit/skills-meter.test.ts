import { describe, it, expect } from 'vitest'
import { meterOf, type MeterRow } from '@/lib/skills/meter'

const row = (over: Partial<MeterRow> = {}): MeterRow => ({
  skillKey: 'census.classify', agentKey: 'census-keeper', tier: 'RULES', byTenantModel: false, fallbackFrom: null, escalatedFrom: null, ...over,
})

describe('the meter counts skill calls', () => {
  it('counts calls by skill, by agent and by tier', () => {
    const m = meterOf([
      row(), row(),
      row({ skillKey: 'bio.write', agentKey: 'consultant-portfolio', tier: 'LOW' }),
      row({ skillKey: 'bio.write', agentKey: 'consultant-portfolio', tier: 'HIGH' }),
    ])
    expect(m.bySkill.map((l) => [l.key, l.calls, l.rules, l.low, l.high])).toEqual([['bio.write', 2, 0, 1, 1], ['census.classify', 2, 2, 0, 0]])
    expect(m.byAgent.map((l) => [l.key, l.calls])).toEqual([['census-keeper', 2], ['consultant-portfolio', 2]])
    expect([m.total.calls, m.total.rules, m.total.low, m.total.high]).toEqual([4, 2, 1, 1])
  })

  it('counts fallbacks, escalations and calls on the tenant’s own model', () => {
    const m = meterOf([
      row({ tier: 'LOW', fallbackFrom: 'model-a' }),
      row({ tier: 'HIGH', escalatedFrom: 'LOW' }),
      row({ tier: 'LOW', byTenantModel: true }),
      row({ tier: 'LOW' }),
    ])
    expect([m.total.fallback, m.total.escalated, m.total.ownModel, m.total.calls]).toEqual([1, 1, 1, 4])
  })

  it('a run with no skill, or no tier, is not in the meter', () => {
    const m = meterOf([row({ skillKey: null }), row({ tier: null }), row({ tier: 'MEDIUM' }), row()])
    expect(m.total.calls).toBe(1)
  })

  it('an empty window is all zeros and no lines, never a blank', () => {
    const m = meterOf([])
    expect(m.bySkill).toEqual([])
    expect(m.total).toMatchObject({ calls: 0, rules: 0, low: 0, high: 0, fallback: 0, escalated: 0, ownModel: 0 })
  })

  it('no price or charge appears on the meter', () => {
    const m = meterOf([row({ tier: 'LOW' })])
    expect(JSON.stringify(m)).not.toMatch(/cost|price|charge|micros|\$/i)
  })
})
