/**
 * runSkill, proven with a fake agent against the real database: the plan
 * gate, the one run row per call with its tier, rules at cost zero, and
 * Actual never written by the agent.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { registerPlan, unregisterPlan } from '@/lib/agents/plans'
import { runSkill, SkillRefused } from '@/lib/skills/runner'

const tag = `sk${Date.now()}`
const w: Record<string, any> = {}
const KEY = 'census-keeper'

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Skill Firm ${tag}`, slug: `skill-firm-${tag}`, kind: 'VENDOR' } })
  await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Skill Firm LLC', country: 'US', currency: 'USD' } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.agentSwitch.create({ data: { companyId: w.firm.id, agentKey: KEY, state: 'ON', changedById: w.owner.id } as any })
})
afterEach(() => { unregisterAgent(KEY); unregisterPlan(KEY) })

const runs = () => prisma.agentRun.findMany({ where: { companyId: w.firm.id }, orderBy: { at: 'asc' } })
const clear = () => prisma.agentRun.deleteMany({ where: { companyId: w.firm.id } })

describe('an agent runs skills through its plan', () => {
  it('an agent cannot run a skill that is not in its own plan', async () => {
    await clear()
    registerPlan({ agentKey: KEY, skills: ['census.classify'], outputSkill: 'census.classify' })
    let refusal = ''
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      try { await runSkill(ctx, 'tenure.watch', { recordType: 'COMPANY', recordId: ctx.companyId }, async () => ({ result: 1 })) } catch (e) { refusal = (e as Error).message; throw e }
    } })
    const out = await runAgent(KEY, w.firm.id)
    expect(out.ran).toBe(false)
    expect(refusal).toMatch(/Tenure limit watch is not in the plan of census-keeper/)
    expect(await runs()).toHaveLength(0)
  })

  it('an agent with no plan runs no skill, and a skill nobody registered is refused', async () => {
    await clear()
    const ctx: any = { agentKey: KEY, companyId: w.firm.id }
    await expect(runSkill(ctx, 'census.classify', { recordType: 'COMPANY', recordId: 'x' }, async () => ({ result: 1 }))).rejects.toBeInstanceOf(SkillRefused)
    registerPlan({ agentKey: KEY, skills: ['census.classify'], outputSkill: 'census.classify' })
    await expect(runSkill(ctx, 'not.a.skill', { recordType: 'COMPANY', recordId: 'x' }, async () => ({ result: 1 }))).rejects.toThrow(/not a registered skill/)
    expect(await runs()).toHaveLength(0)
  })

  it('every skill call writes one run row with its tier, including rules calls at zero cost', async () => {
    await clear()
    registerPlan({ agentKey: KEY, skills: ['census.classify', 'weekly.summary'], outputSkill: 'weekly.summary' })
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      await runSkill(ctx, 'census.classify', { recordType: 'COMPANY', recordId: ctx.companyId, unitsPlanned: 7 }, async (c) => {
        await c.act({ recordType: 'Company', recordId: c.companyId, action: 'CENSUS_WEEKLY', summary: 'Counted 7 companies.' })
        return { result: 7 }
      })
      await runSkill(ctx, 'weekly.summary', { recordType: 'COMPANY', recordId: ctx.companyId, unitsPlanned: 1 }, async () => ({ result: 'line' }))
    } })
    const out = await runAgent(KEY, w.firm.id)
    expect(out).toMatchObject({ ran: true, why: null, acts: 1 })
    const rows = await runs()
    expect(rows.map((r) => [r.skillKey, r.agentKey, r.tier, r.costMicros, r.model, r.unitsPlanned, r.verdict])).toEqual([
      ['census.classify', KEY, 'RULES', 0, null, 7, 'PASS'],
      ['weekly.summary', KEY, 'RULES', 0, null, 1, 'PASS'],
    ])
  })

  it('an act a skill does is one ledger row under the agent, written through the agent context', async () => {
    const acts = await prisma.recordAction.findMany({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' } })
    expect(acts.map((a) => [a.agentKey, a.heldAs])).toEqual([[KEY, 'agent']])
  })

  it('actual is written only by the grader, never by the agent', async () => {
    const rows = await runs()
    expect(rows.every((r) => r.unitsDone === null)).toBe(true)
  })

  it('a skill that throws still writes its run row as an error and the error goes on', async () => {
    await clear()
    registerPlan({ agentKey: KEY, skills: ['census.classify'], outputSkill: 'census.classify' })
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      await runSkill(ctx, 'census.classify', { recordType: 'COMPANY', recordId: ctx.companyId }, async () => { throw new Error('reader down') })
    } })
    const out = await runAgent(KEY, w.firm.id)
    expect(out.why).toMatch(/reader down/)
    const rows = await runs()
    expect(rows.map((r) => [r.verdict, r.failReason, r.tier])).toEqual([['ERROR', 'reader down', 'RULES']])
  })

  it('a rules skill that calls a model is refused and recorded', async () => {
    await clear()
    registerPlan({ agentKey: KEY, skills: ['census.classify'], outputSkill: 'census.classify' })
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      await runSkill(ctx, 'census.classify', { recordType: 'COMPANY', recordId: ctx.companyId }, async () => ({ result: 1, model: 'claude-haiku-5-5', usage: { input_tokens: 10 } }))
    } })
    await runAgent(KEY, w.firm.id)
    const rows = await runs()
    expect(rows.map((r) => [r.verdict, r.model])).toEqual([['ERROR', null]])
    expect(rows[0].failReason).toMatch(/rules skill and called a model/)
  })

  it('a model skill writes its tier, tokens and cost, and a model with no price records cost as not set', async () => {
    await clear()
    // The price is the register's (record 125), set as a deployment sets it.
    const was = process.env.ETYME_MODEL_REGISTER
    process.env.ETYME_MODEL_REGISTER = JSON.stringify([{ id: 'a-model-somebody-priced', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'K', price: { in: 1, out: 5 } }])
    registerPlan({ agentKey: KEY, skills: ['bio.write'], outputSkill: 'bio.write' })
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      await runSkill(ctx, 'bio.write', { recordType: 'CONSULTANT', recordId: 'p1', unitsPlanned: 1 }, async () => ({ result: 'bio', model: 'a-model-somebody-priced', usage: { input_tokens: 1000, output_tokens: 100 }, fallbackFrom: 'other-model' }))
      await runSkill(ctx, 'bio.write', { recordType: 'CONSULTANT', recordId: 'p2' }, async () => ({ result: 'bio', model: 'a-model-nobody-priced', usage: { input_tokens: 1000 }, byTenantModel: true }))
    } })
    try { await runAgent(KEY, w.firm.id) } finally {
      if (was === undefined) delete process.env.ETYME_MODEL_REGISTER; else process.env.ETYME_MODEL_REGISTER = was
    }
    const rows = await runs()
    expect(rows.map((r) => [r.tier, r.model, r.inputTokens, r.costMicros !== null && r.costMicros > 0, r.fallbackFrom, r.byTenantModel])).toEqual([
      ['LOW', 'a-model-somebody-priced', 1000, true, 'other-model', false],
      ['LOW', 'a-model-nobody-priced', 1000, false, null, true],
    ])
    expect(rows[1].costMicros).toBeNull()
  })

  it('a step that claims a tier its skill does not allow is recorded as an error', async () => {
    await clear()
    registerPlan({ agentKey: KEY, skills: ['census.classify', 'bio.write'], outputSkill: 'bio.write' })
    const tries: Array<[string, any]> = [['census.classify', 'HIGH'], ['bio.write', 'HIGH'], ['bio.write', 'MEDIUM']]
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      for (const [k, t] of tries) {
        await runSkill(ctx, k, { recordType: 'COMPANY', recordId: ctx.companyId }, async () => ({ result: 1, tier: t, escalatedFrom: 'LOW' })).catch(() => {})
      }
    } })
    await runAgent(KEY, w.firm.id)
    const rows = await runs()
    expect(rows.map((r) => [r.skillKey, r.verdict, r.tier, r.escalatedFrom])).toEqual([
      ['census.classify', 'ERROR', 'RULES', null], ['bio.write', 'ERROR', 'LOW', null], ['bio.write', 'ERROR', 'LOW', null],
    ])
    expect(rows[0].failReason).toMatch(/rules skill and reported the HIGH tier/)
    expect(rows[1].failReason).toMatch(/may not change its tier/)
  })

  it('a step may escalate only from low to high, and only where its skill allows it', async () => {
    await clear()
    registerPlan({ agentKey: KEY, skills: ['match.rank'], outputSkill: 'match.rank' })
    registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
      const mk = (tier?: any, escalatedFrom?: string) => async () => ({ result: 1, tier, escalatedFrom, model: 'claude-haiku-5-5', usage: { input_tokens: 10 } })
      const c = { recordType: 'COMPANY', recordId: ctx.companyId }
      await runSkill(ctx, 'match.rank', c, mk('HIGH', 'nonsense'))
      await runSkill(ctx, 'match.rank', c, mk(undefined, 'HIGH'))
      await runSkill(ctx, 'match.rank', c, mk('RULES')).catch(() => {})
    } })
    await runAgent(KEY, w.firm.id)
    const rows = await runs()
    expect(rows.map((r) => [r.verdict, r.tier, r.escalatedFrom])).toEqual([['PASS', 'HIGH', 'LOW'], ['PASS', 'LOW', null], ['ERROR', 'LOW', null]])
  })
})
