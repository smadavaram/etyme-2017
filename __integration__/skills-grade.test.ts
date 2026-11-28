/**
 * The grader against the real database with a fake checker: PASS, FAIL and
 * UNKNOWN, and the two rules behind them: Actual is written only by the
 * grader, and a checker reads the record, never the agent's report.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { registerPlan, unregisterPlan } from '@/lib/agents/plans'
import { runSkill } from '@/lib/skills/runner'
import { gradeSkillRun } from '@/lib/skills/grade'
import type { SkillChecker } from '@/lib/skills/checker'

const tag = `gr${Date.now()}`
const w: Record<string, any> = {}
const KEY = 'census-keeper'

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Grade Firm ${tag}`, slug: `grade-firm-${tag}`, kind: 'VENDOR' } })
  await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Grade Firm LLC', country: 'US', currency: 'USD' } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.agentSwitch.create({ data: { companyId: w.firm.id, agentKey: KEY, state: 'ON', changedById: w.owner.id } as any })
})
afterEach(() => { unregisterAgent(KEY); unregisterPlan(KEY) })

/** An agent that runs census.classify once and reports its own result; returns the run's id. */
async function theRun(unitsPlanned = 5): Promise<string> {
  registerPlan({ agentKey: KEY, skills: ['census.classify'], outputSkill: 'census.classify' })
  let id: string | null = null
  registerAgent(KEY, { ruleVersion: 'v1', step: async (ctx) => {
    id = (await runSkill(ctx, 'census.classify', { recordType: 'COMPANY', recordId: ctx.companyId, unitsPlanned }, async () => ({ result: 'AGENT_REPORT_NINETY_NINE' }))).runId
  } })
  await runAgent(KEY, w.firm.id)
  return id!
}
const row = (id: string) => prisma.agentRun.findUniqueOrThrow({ where: { id } })
const checks = (id: string) => prisma.check.findMany({ where: { runId: id } })
const named = (fn: SkillChecker<any>) => ({ 'census.classify': fn })

describe('the grader', () => {
  it('a passing check writes the verdict and the count the checker found, and the run keeps what the agent planned', async () => {
    const id = await theRun(5)
    const out = await gradeSkillRun(id, { checkers: named(async () => ({ verdict: 'PASS', reason: 'Counts agree.', evidence: '4 and 4', unitsFound: 4 })) })
    expect(out).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 4 })
    expect(await row(id)).toMatchObject({ unitsPlanned: 5, unitsDone: 4 })
    const c = await checks(id)
    expect(c.map((x) => [x.code, x.verdict, x.checker, x.reason, x.evidence])).toEqual([['SKILL_CENSUS_CLASSIFY', 'PASS', 'RULE', 'Counts agree.', '4 and 4']])
  })

  it('a failing check writes the reason and evidence and still records what it found on the record', async () => {
    const id = await theRun(5)
    await gradeSkillRun(id, { checkers: named(async () => ({ verdict: 'FAIL', reason: 'The record says 3 dormant and the readers say 4.', evidence: '3 vs 4', unitsFound: 2 })) })
    expect((await checks(id)).map((x) => [x.verdict, x.reason])).toEqual([['FAIL', 'The record says 3 dormant and the readers say 4.']])
    expect((await row(id)).unitsDone).toBe(2)
  })

  it('a checker that cannot read its key is not graded, with a reason, and is never counted as passed', async () => {
    const id = await theRun(5)
    await gradeSkillRun(id, { checkers: named(async () => ({ verdict: 'UNKNOWN', reason: 'No census row for the week.', evidence: null, unitsFound: null })) })
    expect((await checks(id)).map((x) => [x.verdict, x.reason])).toEqual([['UNKNOWN', 'No census row for the week.']])
    expect((await row(id)).unitsDone).toBeNull()
  })

  it('a checker that throws, or answers nonsense, is not graded and says so', async () => {
    const a = await theRun()
    await gradeSkillRun(a, { checkers: named(async () => { throw new Error('reader down') }) })
    expect((await checks(a))[0]).toMatchObject({ verdict: 'UNKNOWN' })
    expect((await checks(a))[0].reason).toMatch(/could not read: reader down/)
    const b = await theRun()
    await gradeSkillRun(b, { checkers: named((async () => ({ verdict: 'PASS' })) as any) })
    expect((await checks(b))[0].verdict).toBe('UNKNOWN')
  })

  it('a skill with no checker built yet is not graded and nobody has verified it', async () => {
    const id = await theRun()
    const out = await gradeSkillRun(id, { checkers: {} })
    expect(out).toMatchObject({ graded: true, verdict: 'UNKNOWN' })
    expect((await checks(id))[0].reason).toMatch(/No checker is built/)
  })

  it('a checker re-reads the record and is never handed what the agent reported', async () => {
    const id = await theRun(5)
    let seen: unknown[] = []
    await gradeSkillRun(id, { checkers: named(async (...args) => { seen = args.slice(0, 4); return { verdict: 'PASS', reason: 'ok', evidence: null, unitsFound: 1 } }) })
    expect(seen[0]).toBe(w.firm.id)
    expect(seen[1]).toBe('census.classify')
    expect(seen[3]).toEqual([{ recordType: 'COMPANY', recordId: w.firm.id }])
    expect(JSON.stringify(seen)).not.toMatch(/AGENT_REPORT_NINETY_NINE/)
  })

  it('a checker that tries to write is stopped and the run is not graded', async () => {
    const id = await theRun()
    await gradeSkillRun(id, { checkers: named(async (_c, _s, _w, _r, read: any) => { await read.agentRun.deleteMany({}); return { verdict: 'PASS', reason: 'x', evidence: null, unitsFound: 1 } }) })
    expect((await checks(id))[0]).toMatchObject({ verdict: 'UNKNOWN' })
    expect(await prisma.agentRun.count({ where: { id } })).toBe(1)
  })

  it('a run is graded once, and a second grading changes nothing', async () => {
    const id = await theRun()
    const pass: SkillChecker<any> = async () => ({ verdict: 'PASS', reason: 'ok', evidence: null, unitsFound: 3 })
    await gradeSkillRun(id, { checkers: named(pass) })
    const again = await gradeSkillRun(id, { checkers: named(async () => ({ verdict: 'FAIL', reason: 'no', evidence: null, unitsFound: 0 })) })
    expect(again).toEqual({ graded: false, why: 'This run was graded already.' })
    expect(await checks(id)).toHaveLength(1)
    expect((await row(id)).unitsDone).toBe(3)
  })

  it('grading adds no run row of its own, so run counts do not move', async () => {
    const id = await theRun()
    const before = await prisma.agentRun.count({ where: { companyId: w.firm.id } })
    await gradeSkillRun(id, { checkers: named(async () => ({ verdict: 'PASS', reason: 'ok', evidence: null, unitsFound: 1 })) })
    expect(await prisma.agentRun.count({ where: { companyId: w.firm.id } })).toBe(before)
  })
})
