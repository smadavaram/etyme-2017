/**
 * The timesheet chase on skills (record 123, plan step 8), on the database
 * through the real runner and the real grader.
 * `golden-timesheet-chase.test.ts` proves the rows are unchanged; this
 * proves the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addTimesheetWorld, GOLDEN_WEDNESDAY, goldenDay } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { planOf } from '@/lib/agents/plans'
import { timesheetChaseStep, TIMESHEET_CHASE_AGENT, TIMESHEET_CHASE_RULES } from '@/lib/notify/timesheet-chase-agent'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = TIMESHEET_CHASE_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addTimesheetWorld>>
let sheetId = ''
const runsOf = (skillKey: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const regrade = async (skillKey: string) => { const [run] = await runsOf(skillKey); await prisma.check.deleteMany({ where: { runId: run.id } }); return gradeSkillRun(run.id) }

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addTimesheetWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, { ruleVersion: TIMESHEET_CHASE_RULES, step: (ctx) => timesheetChaseStep(ctx) })
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
  await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.owner.id, decidedAt: new Date() } })
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  const sheet = await prisma.timesheet.create({
    data: { sellContractId: x.ana.line.id, personId: x.ana.p.id, periodStart: goldenDay('2026-11-15'), periodEnd: goldenDay('2026-11-21'), days: { '2026-11-16': 40 }, totalHours: 40, status: 'SUBMITTED', submittedAt: new Date() } as any,
  })
  sheetId = sheet.id
  await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the timesheet chase as skills', () => {
  it('the plan is propose, send and close, and the proposal is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['chase.propose', 'chase.send', 'chase.close'], outputSkill: 'chase.propose' })
  })

  it('one run is written for the week proposed, the letter tried and the chase closed, all rules tier at no cost, and none for the older week, the filed week or the sub-vendor’s worker', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    const by = (k: string) => all.filter((r) => r.skillKey === k).map((r) => r.recordId)
    expect(by('chase.propose')).toEqual([x.anaWeek.id])
    expect(by('chase.send')).toEqual([x.anaWeek.id])
    expect(by('chase.close')).toEqual([x.anaWeek.id])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every skill run passes when the week, the hours, the letters and the card are re-read and nothing has been touched', async () => {
    for (const k of ['chase.propose', 'chase.send', 'chase.close']) {
      for (const r of await runsOf(k)) expect(await gradeSkillRun(r.id), k).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    }
  })

  it('a chase proposed for a week that was already filed when it was written fails, naming that', async () => {
    const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
    await prisma.timesheet.update({ where: { id: sheetId }, data: { submittedAt: new Date(task.createdAt.getTime() - 1000) } })
    const out = await regrade('chase.propose')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/already filed when it was written/)
    await prisma.timesheet.update({ where: { id: sheetId }, data: { submittedAt: new Date() } })
  })

  it('a chase proposed for a worker the firm does not employ fails, because that chase is her employer’s', async () => {
    await prisma.context.deleteMany({ where: { personId: x.ana.p.id, companyId: w.firm.id } })
    const out = await regrade('chase.propose')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/not the firm’s own/)
    await prisma.context.create({ data: { personId: x.ana.p.id, companyId: w.firm.id, type: 'EMPLOYEE' } as any })
  })

  it('a chase whose card is owed to somebody other than the AP and payroll seat or the Owner fails', async () => {
    const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
    await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { ownerPersonId: w.am.id } })
    const out = await regrade('chase.propose')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { ownerPersonId: w.owner.id } })
  })

  it('a chase carrying a plan that is neither the proposed one nor the Owner’s numbers fails', async () => {
    const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
    await prisma.agentTask.update({ where: { id: task.id }, data: { plan: { ...(task.plan as object), retries: 5 } } })
    const out = await regrade('chase.propose')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/not the plan the rules give/)
    await prisma.agentTask.update({ where: { id: task.id }, data: { plan: task.plan as any } })
  })

  it('a letter on the ledger with the agent switched off fails, because only On sends', async () => {
    await switchAgent(w, KEY, 'OFF')
    const out = await regrade('chase.send')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/switch reads OFF/)
    await switchAgent(w, KEY, 'ON')
  })

  it('a letter sent for a week that was already filed fails', async () => {
    const mail = await prisma.mailSend.findFirstOrThrow({ where: { companyId: w.firm.id, recordType: 'Cycle', recordId: x.anaWeek.id } })
    await prisma.timesheet.update({ where: { id: sheetId }, data: { submittedAt: new Date(mail.createdAt.getTime() - 1000) } })
    const out = await regrade('chase.send')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/already filed when it was sent/)
    await prisma.timesheet.update({ where: { id: sheetId }, data: { submittedAt: new Date() } })
  })

  it('a chase closed because the week was filed, with no hours on the record, fails', async () => {
    await prisma.timesheet.delete({ where: { id: sheetId } })
    const out = await regrade('chase.close')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/no hours filed that cover it/)
  })
})
