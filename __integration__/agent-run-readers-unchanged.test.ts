/**
 * The bar reads agent runs and checks. Skill rows (skillKey set) and SKILL_*
 * checks arrive when agents migrate to the skill layer; they must not move
 * the bar's runs, checks or costs.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as bar from '@/app/api/bar/route'

const tag = `ar${Date.now()}`
const w: Record<string, any> = {}

const read = async () => {
  as(w.owner.primaryEmail)
  const r = await json(await bar.GET(req('GET', '/api/bar?days=14')))
  expect(r.status).toBe(200)
  const d = r.body.data
  return { recurring: d.recurring, cost: d.cost }
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Bar Firm ${tag}`, slug: `bar-firm-${tag}`, kind: 'VENDOR' } })
  const role = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: role.id } as any })
  const run = (extra: Record<string, unknown> = {}) => prisma.agentRun.create({
    data: { companyId: w.firm.id, agent: 'scorer', recordType: 'SUBMISSION', recordId: `s-${Math.random()}`, verdict: 'PASS', costMicros: 40000, ms: 10, consideredCount: 10, scoredCount: 2, ...extra } as any,
  })
  const check = (code: string, recordId: string, verdict: string, runId?: string) => prisma.check.create({
    data: { companyId: w.firm.id, recordType: 'SUBMISSION', recordId, checker: 'RULE', code, verdict, reason: 'because', runId } as any,
  })
  const r1 = await run()
  await run()
  await check('DOCS_PRESENT', 'rec-a', 'FAIL', r1.id)
  await check('DOCS_PRESENT', 'rec-b', 'FAIL', r1.id)
  await check('RATE_IN_RANGE', 'rec-a', 'PASS', r1.id)
  w.before = await read()
  // Skill rows and skill checks, with the UNKNOWN verdict.
  const sk = await run({ skillKey: 'score-fit', agentKey: 'recruiter', costMicros: 900000, consideredCount: 100, scoredCount: 100 })
  await run({ skillKey: 'score-fit', agentKey: 'recruiter', verdict: 'FAIL', costMicros: 900000 })
  await check('SKILL_FIT', 'rec-c', 'FAIL', sk.id)
  await check('SKILL_FIT', 'rec-d', 'UNKNOWN', sk.id)
  await check('SKILL_FIT', 'rec-a', 'FAIL', sk.id)
  w.after = await read()
})

describe('the bar readers', () => {
  it("the bar's runs, checks and costs read the same with and without skill rows and skill checks seeded", () => {
    expect(w.before.cost.filtered).not.toBeNull()
    expect(w.after).toEqual(w.before)
  })
  it('the records checked count ignores records only a skill check looked at', () => {
    expect(w.after.recurring.recordsChecked).toBe(w.before.recurring.recordsChecked)
    expect(w.before.recurring.recordsChecked).toBe(2)
  })
})
