/**
 * The interview chase on skills (record 123, plan step 8), on the database
 * through the real runner and the real grader. `golden-interview-chase.test.ts`
 * proves the rows are unchanged; this proves the plan, the skill runs and
 * what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addInterviewWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { interviewChaseAgent, INTERVIEW_CHASE } from '@/lib/agents/interview-chase'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
let w: GoldenWorld
let sub: { id: string }
const runsOf = (skillKey: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const ungrade = (runId: string) => prisma.check.deleteMany({ where: { runId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  sub = (await addInterviewWorld(w)).submission
  await switchAgent(w, INTERVIEW_CHASE, 'ON')
  registerAgent(INTERVIEW_CHASE, interviewChaseAgent)
  await runAgent(INTERVIEW_CHASE, w.firm.id, GOLDEN_MONDAY)
  const t = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: INTERVIEW_CHASE } })
  await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
  await runAgent(INTERVIEW_CHASE, w.firm.id, GOLDEN_TUESDAY)
  await prisma.submission.update({ where: { id: sub.id }, data: { status: 'SHORTLISTED' } })
  await runAgent(INTERVIEW_CHASE, w.firm.id, GOLDEN_WEDNESDAY)
  unregisterAgent(INTERVIEW_CHASE)
}, 600_000)

describe('the interview chase as skills', () => {
  it('the plan is the proposal of a chase and the closing of it, and the proposal is the line shown for the agent', () => {
    expect(planOf(INTERVIEW_CHASE)).toMatchObject({ skills: ['chase.propose', 'chase.close'], outputSkill: 'chase.propose' })
  })

  it('three days of work write one proposal run and one close run, both rules tier at no cost, and none for the quiet submission nobody can be written to about', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: INTERVIEW_CHASE } })
    expect(all.map((r) => r.skillKey).sort()).toEqual(['chase.close', 'chase.propose'])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS' && r.recordId === sub.id)).toBe(true)
  })

  it('the proposal passes when its task carries the rule’s plan, a card owed by a Recruiter or Account Manager, no letter, and a submission the client had left quiet', async () => {
    const [run] = await runsOf('chase.propose')
    expect(await gradeSkillRun(run.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
  })

  it('the close passes when the task is closed by arrival and the submission shows the client moved it', async () => {
    const [run] = await runsOf('chase.close')
    expect(await gradeSkillRun(run.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
  })

  it('a close fails, saying so, when the record shows the client never moved the submission', async () => {
    const [run] = await runsOf('chase.close')
    await ungrade(run.id)
    await prisma.submission.update({ where: { id: sub.id }, data: { status: 'SUBMITTED' } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/still submitted with no interview and no turn-down/)
  })

  it('a proposal fails when its chase wrote to the client', async () => {
    const [run] = await runsOf('chase.propose')
    await ungrade(run.id)
    const t = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: INTERVIEW_CHASE } })
    await prisma.mailSend.create({ data: { companyId: w.firm.id, agentKey: INTERVIEW_CHASE, agentTaskId: t.id, toAddresses: ['x@example.invalid'], fromAddress: 'f@example.invalid', template: 'x', templateVersion: 'v1', subject: 'x', outcome: 'SENT' } as any })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/wrote to the client/)
  })

  it('a proposal whose task was given another plan fails, naming the plan', async () => {
    const [run] = await runsOf('chase.propose')
    await ungrade(run.id)
    await prisma.mailSend.deleteMany({ where: { companyId: w.firm.id } })
    await prisma.agentTask.updateMany({ where: { companyId: w.firm.id, recordId: sub.id }, data: { plan: { messages: [{ template: 'x' }], retries: 1, daysApart: 1, closesWhen: 'never' } } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/its plan is not the plan the rules give this kind/)
  })
})
