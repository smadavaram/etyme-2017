/** The performance panel and the Owner's target, through the real routes and database. */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as perf from '@/app/api/decision-items/agents/performance/route'
import * as targets from '@/app/api/decision-items/agents/targets/route'

const tag = `pf${Date.now()}`
const w: Record<string, any> = {}
const mail = (n: string) => `${n}.${tag}@example.invalid`
const get = async (email: string, period = 'WEEK') => { as(email); return json(await perf.GET(req('GET', `/api/decision-items/agents/performance?period=${period}`))) }
const put = async (email: string, body: Record<string, unknown>) => { as(email); return json(await targets.PUT(req('PUT', '/api/decision-items/agents/targets', { actingEntityId: w.entity.id, ...body }))) }
const skill = (r: any, key: string) => r.body.data.skills.find((s: any) => s.key === key)
const agent = (r: any, key: string) => r.body.data.agents.find((s: any) => s.key === key)

async function runWithVerdict(companyId: string, over: Record<string, unknown>, verdict: string | null) {
  const run = await prisma.agentRun.create({ data: { companyId, agent: 'x', recordType: 'COMPANY', recordId: 'r', verdict: 'PASS', ms: 1, tier: 'RULES', costMicros: 0, ...over } as any })
  if (verdict) await prisma.check.create({ data: { companyId, runId: run.id, recordType: 'COMPANY', recordId: 'r', checker: 'RULE', code: 'SKILL_CENSUS_CLASSIFY', verdict, reason: 'Re-read.' } as any })
  return run
}

beforeAll(async () => {
  await resetDatabase()
  const firm = async (n: string) => {
    const c = await prisma.company.create({ data: { name: `Perf ${n} ${tag}`, slug: `perf-${n}-${tag}`, kind: 'VENDOR' } })
    const e = await prisma.legalEntity.create({ data: { companyId: c.id, name: `Perf ${n} LLC`, country: 'US', currency: 'USD' } })
    const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: c.id, name, permissions } })
    const seat = async (name: string, r: any) => {
      const person = await prisma.person.create({ data: { name, primaryEmail: mail(`${n}.${name.toLowerCase().replace(/\s/g, '.')}`) } })
      await prisma.context.create({ data: { personId: person.id, companyId: c.id, type: 'EMPLOYEE', roleId: r.id } as any })
      return person
    }
    return { c, e, role, seat }
  }
  const a = await firm('a'); const b = await firm('b')
  w.firm = a.c; w.entity = a.e
  w.owner = await a.seat('Dana Owner', await a.role('Owner', ['*']))
  w.admin = await a.seat('Ivo Admin', await a.role('Admin', ['settings.manage', 'people.manage']))
  w.rec = await a.seat('Rui Recruiter', await a.role('Recruiter', ['candidates.read']))
  w.ownerB = await b.seat('Bea Owner', await b.role('Owner', ['*']))
  w.b = b.c
  await runWithVerdict(a.c.id, { skillKey: 'census.classify', agentKey: 'census-keeper', unitsPlanned: 40, unitsDone: 36 }, 'PASS')
  await runWithVerdict(a.c.id, { skillKey: 'census.classify', agentKey: 'census-keeper', unitsPlanned: 10, unitsDone: 9 }, 'FAIL')
  await runWithVerdict(a.c.id, { skillKey: 'census.classify', agentKey: 'census-keeper', unitsPlanned: 5, unitsDone: null }, 'UNKNOWN')
  await runWithVerdict(b.c.id, { skillKey: 'census.classify', agentKey: 'census-keeper', unitsPlanned: 1000, unitsDone: 1000 }, 'PASS')
})

describe('the performance panel route', () => {
  it('the Owner and an Admin read the panel and a recruiter is refused in a sentence', async () => {
    expect((await get(w.owner.primaryEmail)).status).toBe(200)
    expect((await get(w.admin.primaryEmail)).status).toBe(200)
    const r = await get(w.rec.primaryEmail)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/Owner and Admins/)
  })

  it('a refused reader is on the access log before the refusal is sent', async () => {
    const n = await prisma.accessLog.count({ where: { actorPersonId: w.rec.id } })
    expect(n).toBeGreaterThan(0)
  })

  it('every agent reads Not graded before any agent is moved onto skills', async () => {
    const r = await get(w.owner.primaryEmail)
    expect(r.body.data.agents).toHaveLength(14)
    const ag = agent(r, 'weekly-summary')
    expect([ag.cells.actual.text, ag.cells.actual.why, ag.cells.target.text, ag.cells.target.why]).toEqual(['—', 'Not graded', '—', 'No target'])
    expect(ag.outputSkill).toBeNull()
  })

  it('actual is counted from graded runs only, and a run graded unknown is Not graded', async () => {
    const s = skill(await get(w.owner.primaryEmail), 'census.classify')
    expect([s.cells.planned.text, s.cells.actual.text, s.cells.completion.text]).toEqual(['55', '45', '82'])
    expect(s.graded).toBe('Passed 1 · Failed 1 · Not graded 1')
  })

  it('one company never reads another company’s figures', async () => {
    const s = skill(await get(w.ownerB.primaryEmail), 'census.classify')
    expect([s.cells.planned.text, s.cells.actual.text]).toEqual(['1000', '1000'])
  })

  it('a period other than day, week or month is refused', async () => {
    expect((await get(w.owner.primaryEmail, 'YEAR')).status).toBe(422)
  })

  it('no price, cost or charge is anywhere in the answer', async () => {
    const r = await get(w.owner.primaryEmail)
    expect(JSON.stringify(r.body)).not.toMatch(/price|cost|charge|\$/i)
  })
})

describe('the Owner’s target, through its route', () => {
  it('only the Owner sets a target; an Admin is refused in a sentence and nothing is written', async () => {
    const r = await put(w.admin.primaryEmail, { subjectKind: 'SKILL', subjectKey: 'census.classify', period: 'WEEK', target: 50 })
    expect(r.status).toBe(403)
    expect(await prisma.skillTarget.count({ where: { companyId: w.firm.id } })).toBe(0)
  })

  it('a target the Owner sets shows beside the figures as variance, var percent and a chip, and is on the ledger', async () => {
    const r = await put(w.owner.primaryEmail, { subjectKind: 'SKILL', subjectKey: 'census.classify', period: 'WEEK', target: 50 })
    expect(r.status).toBe(200)
    const s = skill(await get(w.admin.primaryEmail), 'census.classify')
    expect([s.cells.target.text, s.cells.variance.text, s.cells.varPct.text, s.cells.chip]).toEqual(['50', '-5', '-10', 'Below target'])
    const row = await prisma.recordAction.findFirst({ where: { companyId: w.firm.id, action: 'TARGET_SET' } })
    expect(row?.summary).toMatch(/Set the target for .* to 50 over a week/)
    expect(row?.personId).toBe(w.owner.id)
  })

  it('a week target is not a day target, and another company’s panel never shows it', async () => {
    expect(skill(await get(w.owner.primaryEmail, 'DAY'), 'census.classify').cells.target.text).toBe('—')
    expect(skill(await get(w.ownerB.primaryEmail), 'census.classify').cells.target.text).toBe('—')
  })

  it('changing a target keeps one row and clearing it brings the dash back, each on the ledger', async () => {
    await put(w.owner.primaryEmail, { subjectKind: 'SKILL', subjectKey: 'census.classify', period: 'WEEK', target: 45 })
    expect(await prisma.skillTarget.count({ where: { companyId: w.firm.id } })).toBe(1)
    const cleared = await put(w.owner.primaryEmail, { subjectKind: 'SKILL', subjectKey: 'census.classify', period: 'WEEK', target: null })
    expect(cleared.status).toBe(200)
    expect(skill(await get(w.owner.primaryEmail), 'census.classify').cells.target.text).toBe('—')
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, action: 'TARGET_SET' } })).toBe(3)
  })

  it('clearing a target that was never set is refused in a sentence', async () => {
    const r = await put(w.owner.primaryEmail, { subjectKind: 'AGENT', subjectKey: 'census-keeper', period: 'DAY', target: null })
    expect(r.status).toBe(422)
  })

  it('a bad number is refused with the field named', async () => {
    const r = await put(w.owner.primaryEmail, { subjectKind: 'SKILL', subjectKey: 'census.classify', period: 'WEEK', target: 2.5 })
    expect([r.status, r.body.error.field]).toEqual([422, 'target'])
  })
})
