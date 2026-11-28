/**
 * The outreach batch on skills (record 123, plan step 8), on the database
 * through the real runner and the real grader. `golden-outreach-batch.test.ts`
 * proves the rows are unchanged; this proves the plan, the skill runs and what
 * the checker finds when it re-reads each letter.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addOutreachBatchWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { planOf } from '@/lib/agents/plans'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { createBatch } from '@/lib/outreach/batch'
import { OUTREACH_BATCH_AGENT, OUTREACH_BATCH_RULE } from '@/lib/outreach/batch-rules'
import { sendMail } from '@/lib/notify/mail-door'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-batch-skills'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = OUTREACH_BATCH_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addOutreachBatchWorld>>
let taskId = ''
const deps = { env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false, hand: async () => ({ provider: 'Resend' as const, messageId: 'm' }) }
const runs = () => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey: 'chase.send' }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const regrade = async (recordId: string) => { const run = (await runs()).find((r) => r.recordId === recordId)!; await prisma.check.deleteMany({ where: { runId: run.id } }); return gradeSkillRun(run.id) }
const letterOf = (contactId: string) => prisma.outreachLetter.findFirstOrThrow({ where: { agentTaskId: taskId, contactId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
  x = await addOutreachBatchWorld(w)
  const made = await createBatch({ companyId: w.firm.id, personId: w.owner.id }, {
    audience: 'ALL_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'Spark, SQL', availability: 'from December 8' }] },
    subject: 'Golden Firm: people available', body: 'Two data engineers are free from December 8.',
  }, GOLDEN_MONDAY)
  taskId = (made as { id: string }).id
  const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
  registerAgent(KEY, { ruleVersion: OUTREACH_BATCH_RULE, step: (ctx) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) })
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the outreach batch as skills', () => {
  it('the plan is send alone, because the batch is raised by a person’s own request and ends when its letters are done', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['chase.send'], outputSkill: 'chase.send' })
  })

  it('one send run is written for each letter tried, all rules tier at no cost', async () => {
    const all = await runs()
    const letters = await prisma.outreachLetter.findMany({ where: { agentTaskId: taskId } })
    expect(all.map((r) => r.recordId).sort()).toEqual(letters.map((l) => l.id).sort())
    expect(all.every((r) => r.recordType === 'OutreachLetter' && r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every send run passes when the letter, its contact, its task and its yes are re-read and nothing has been touched', async () => {
    for (const r of await runs()) expect(await gradeSkillRun(r.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
  })

  it('a letter sent to a contact who had already unsubscribed fails, naming that', async () => {
    const l = await letterOf(x.bea.id)
    const mail = await prisma.mailSend.findFirstOrThrow({ where: { companyId: w.firm.id, recordId: l.id } })
    await prisma.companyContact.update({ where: { id: x.bea.id }, data: { outreachOptOutAt: new Date(mail.createdAt.getTime() - 1000) } })
    const out = await regrade(l.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/had unsubscribed when it was sent/)
    await prisma.companyContact.update({ where: { id: x.bea.id }, data: { outreachOptOutAt: null } })
  })

  it('a letter sent after the contact said she was interested fails', async () => {
    const l = await letterOf(x.gus.id)
    const mail = await prisma.mailSend.findFirstOrThrow({ where: { companyId: w.firm.id, recordId: l.id } })
    await prisma.outreachLetter.update({ where: { id: l.id }, data: { interestedAt: new Date(mail.createdAt.getTime() - 1000) } })
    const out = await regrade(l.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/said she was interested when it was sent/)
    await prisma.outreachLetter.update({ where: { id: l.id }, data: { interestedAt: null } })
  })

  it('a letter sent to an address other than the one drafted for it fails', async () => {
    const l = await letterOf(x.bea.id)
    await prisma.outreachLetter.update({ where: { id: l.id }, data: { email: 'someone.else@example.invalid' } })
    const out = await regrade(l.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/not the address it was drafted for/)
    await prisma.outreachLetter.update({ where: { id: l.id }, data: { email: x.bea.email as string } })
  })

  it('a letter whose batch had no yes when it was sent fails', async () => {
    const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
    await prisma.agentTask.update({ where: { id: taskId }, data: { approvedAt: new Date(Date.now() + 3600_000) } })
    const out = await regrade((await letterOf(x.bea.id)).id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/no person had said yes/)
    await prisma.agentTask.update({ where: { id: taskId }, data: { approvedAt: t.approvedAt } })
  })

  it('a letter on the ledger with the agent switched off fails, because only On sends', async () => {
    await switchAgent(w, KEY, 'OFF')
    const out = await regrade((await letterOf(x.bea.id)).id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/switch reads OFF/)
    await switchAgent(w, KEY, 'ON')
  })

  it('a letter sent while Outreach was off fails', async () => {
    await prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: [] } })
    const out = await regrade((await letterOf(x.bea.id)).id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/Outreach is off/)
    await prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: ['OUTREACH'] } })
  })
})
