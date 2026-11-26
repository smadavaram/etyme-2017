import { describe, it, expect, afterEach } from 'vitest'
import { planGaps, registerPlan, unregisterPlan, planOf, plannedAgents, type AgentPlan } from '@/lib/agents/plans'

const ok: AgentPlan = { agentKey: 'fake-agent', skills: ['census.classify', 'weekly.summary'], outputSkill: 'weekly.summary' }
afterEach(() => unregisterPlan('fake-agent'))

describe('an agent is a plan of skills', () => {
  it('a plan of registered skills with its output skill inside it stands', () => {
    expect(planGaps(ok)).toEqual([])
  })

  it('a plan that names a skill nobody registered is named', () => {
    expect(planGaps({ ...ok, skills: ['census.classify', 'made.up'], outputSkill: 'census.classify' })).toEqual([
      'Agent fake-agent names made.up, which is not a registered skill.',
    ])
  })

  it('a plan whose output skill is not in its own plan is named', () => {
    expect(planGaps({ ...ok, outputSkill: 'tenure.watch' })[0]).toMatch(/not in its own plan/)
  })

  it('a plan with no skills, or a skill twice, is named', () => {
    expect(planGaps({ ...ok, skills: [], outputSkill: '' }).length).toBeGreaterThan(0)
    expect(planGaps({ ...ok, skills: ['census.classify', 'census.classify'], outputSkill: 'census.classify' })).toEqual(['Agent fake-agent names a skill twice.'])
  })

  it('no agent has a plan until its owner migrates it', () => {
    expect(plannedAgents()).toEqual([])
    registerPlan(ok)
    expect(planOf('fake-agent')).toEqual(ok)
  })
})
