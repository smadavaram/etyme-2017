/**
 * The payroll draft agent on skills (record 123, plan step 8), on the
 * database through the real runner and the real grader.
 * `golden-payroll-draft.test.ts` proves the rows are unchanged; this proves
 * the plan, the skill runs and what the checker finds. The skill only reads
 * the run's own calculation: nothing here runs payroll.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addPayrollWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { payrollDraftAgent, PAYROLL_DRAFT } from '@/lib/agents/payroll-draft'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = PAYROLL_DRAFT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addPayrollWorld>>
const runs = () => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey: 'payroll.draft' }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const regrade = async (i: number) => { const r = (await runs())[i]; await prisma.check.deleteMany({ where: { runId: r.id } }); return gradeSkillRun(r.id) }

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addPayrollWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, payrollDraftAgent)
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  await x.moreWeek()
  await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the payroll draft agent as a skill', () => {
  it('the plan is the one payroll draft skill, which is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['payroll.draft'], outputSkill: 'payroll.draft' })
  })

  it('one run is written for each period drafted, Monday’s and Wednesday’s and none on Tuesday, a person for each row, rules tier at no cost', async () => {
    const all = await runs()
    expect(all.map((r) => [r.recordType, r.recordId, r.unitsPlanned])).toEqual([['PayPeriod', '2026-10-01:2026-10-31', 2], ['PayPeriod', '2026-10-01:2026-10-31', 2]])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('the draft still standing passes when the payroll run’s own calculation is worked out again, and no pay day or run is left by checking it', async () => {
    const before = [await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'PAYROLL_RUN' } }), await prisma.cycle.count({ where: { completedAt: { not: null } } })]
    expect(await regrade(1)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 2 })
    expect([await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'PAYROLL_RUN' } }), await prisma.cycle.count({ where: { completedAt: { not: null } } })]).toEqual(before)
  })

  it('the first draft, since replaced by a newer one, is not graded and is never counted as passed', async () => {
    // The two runs were made seconds apart here, so the first is moved a day back, as two real days would have left it.
    const [first] = await runs()
    const day = 86_400_000
    await prisma.agentRun.update({ where: { id: first.id }, data: { at: new Date(first.at.getTime() - day) } })
    const [earlier] = await prisma.payrollDraft.findMany({ where: { companyId: w.firm.id }, orderBy: { createdAt: 'asc' } })
    await prisma.payrollDraft.update({ where: { id: earlier.id }, data: { createdAt: new Date(earlier.createdAt.getTime() - day) } })
    expect(await regrade(0)).toMatchObject({ graded: true, verdict: 'UNKNOWN', unitsDone: null })
  })

  it('a draft whose gross differs from a fresh calculation fails, naming the person', async () => {
    const draft = await prisma.payrollDraft.findFirstOrThrow({ where: { companyId: w.firm.id, state: 'DRAFT' } })
    const rows = (draft.rows as any[]).map((r) => (r.person === 'Leila Farouk' ? { ...r, grossPay: r.grossPay + 100 } : r))
    await prisma.payrollDraft.update({ where: { id: draft.id }, data: { rows } })
    const out = await regrade(1)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 1 })
    expect(out.graded && out.reason).toMatch(/Leila Farouk’s hours, gross or held weeks differ/)
    await prisma.payrollDraft.update({ where: { id: draft.id }, data: { rows: draft.rows as any } })
  })

  it('a draft that leaves a person out fails, naming the person', async () => {
    const draft = await prisma.payrollDraft.findFirstOrThrow({ where: { companyId: w.firm.id, state: 'DRAFT' } })
    await prisma.payrollDraft.update({ where: { id: draft.id }, data: { rows: (draft.rows as any[]).filter((r) => r.person !== 'Mo Ito') } })
    const out = await regrade(1)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/Mo Ito is in a fresh calculation and not in the draft/)
    await prisma.payrollDraft.update({ where: { id: draft.id }, data: { rows: draft.rows as any } })
  })

  it('a draft beside a payroll run logged in the same window fails, because a draft never logs a run', async () => {
    const [, run] = await runs()
    const log = await prisma.automationLog.create({ data: { companyId: w.firm.id, action: 'PAYROLL_RUN', summary: 'run', reason: 'test', reversible: false, payload: {}, at: run.at } })
    const out = await regrade(1)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/never logs a run/)
    await prisma.automationLog.delete({ where: { id: log.id } })
  })

  it('a draft whose card is owed to the Owner and not to AP & Payroll fails', async () => {
    const draft = await prisma.payrollDraft.findFirstOrThrow({ where: { companyId: w.firm.id, state: 'DRAFT' } })
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: draft.decisionId! } })
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade(1)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })
})
