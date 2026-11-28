/**
 * The census keeper and its dormant outreach on skills (record 123, plan
 * step 8), on the database through the real runner and the real grader.
 * `golden-census-keeper.test.ts` proves the rows are unchanged; this proves
 * the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { censusKeeperAgent } from '@/lib/agents/census-keeper'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = 'census-keeper'
let w: GoldenWorld
const runsOf = (skillKey: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const verdicts = async (skillKey: string) => {
  const out = []
  for (const r of await runsOf(skillKey)) out.push(await gradeSkillRun(r.id))
  return out
}

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, censusKeeperAgent)
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  for (const t of await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })) {
    await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
  }
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the census keeper as skills', () => {
  it('the plan is the census, the proposal of a check-in and the sending of it, and the census is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['census.classify', 'chase.propose', 'chase.send'], outputSkill: 'census.classify' })
  })

  it('a week of work writes one census run, one proposal run per letter drafted and one send run per letter tried, all rules tier at no cost', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    expect(all.map((r) => r.skillKey).sort()).toEqual(['census.classify', 'chase.propose', 'chase.propose', 'chase.send', 'chase.send'])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
    expect((await runsOf('census.classify'))[0]).toMatchObject({ unitsPlanned: 6, unitsDone: null })
  })

  it('the census checker re-classifies the register and passes a line whose counts and dormant names agree', async () => {
    const out = await verdicts('census.classify')
    expect(out).toMatchObject([{ graded: true, verdict: 'PASS', unitsDone: 6 }])
  })

  it('each proposal passes when its task carries the rule’s plan and a card owed by the Account Manager for a company that reads dormant', async () => {
    expect(await verdicts('chase.propose')).toMatchObject([{ verdict: 'PASS', unitsDone: 1 }, { verdict: 'PASS', unitsDone: 1 }])
  })

  it('each letter tried passes when its mail row ties to a task a person approved before it was sent, within its plan, with the agent On', async () => {
    expect(await verdicts('chase.send')).toMatchObject([{ verdict: 'PASS', unitsDone: 1 }, { verdict: 'PASS', unitsDone: 1 }])
  })

  it('when the register moves after the census line was written the census checker fails it and names the count that is wrong', async () => {
    const run = (await runsOf('census.classify'))[0]
    await prisma.check.deleteMany({ where: { runId: run.id } })
    await prisma.counterparty.updateMany({ where: { companyId: w.firm.id, otherCompany: { name: 'Golden Quiet Customer' } }, data: { status: 'BLOCKED' } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/customers: the line says 4, the record says 3/)
  })

  it('a proposal whose task was given another plan fails, naming the plan', async () => {
    const run = (await runsOf('chase.propose'))[0]
    await prisma.check.deleteMany({ where: { runId: run.id } })
    await prisma.agentTask.updateMany({ where: { companyId: w.firm.id, recordId: run.recordId }, data: { plan: { messages: [{ template: 'x' }, { template: 'y' }], retries: 2, daysApart: 1, closesWhen: 'never' } } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/its plan is not the plan the rules give this kind/)
  })

  it('a letter whose task was never approved fails, saying nobody had said yes', async () => {
    const run = (await runsOf('chase.send'))[0]
    await prisma.check.deleteMany({ where: { runId: run.id } })
    await prisma.agentTask.updateMany({ where: { companyId: w.firm.id, recordId: run.recordId }, data: { approvedAt: null } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/no person had said yes/)
  })

  it('a letter run with no row on the mail ledger fails, saying the row is missing', async () => {
    const run = (await runsOf('chase.send'))[1]
    await prisma.check.deleteMany({ where: { runId: run.id } })
    await prisma.mailSend.deleteMany({ where: { companyId: w.firm.id, recordId: run.recordId } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/no row for it is on the mail ledger/)
  })
})
