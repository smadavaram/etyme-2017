/**
 * The confirmation tracker and its submission chase on skills (record 123,
 * plan step 8), on the database through the real runner and the real grader.
 * `golden-confirmation-tracker.test.ts` proves the rows are unchanged; this
 * proves the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addConfirmationWorld, GOLDEN_WEDNESDAY } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { confirmationTrackerAgent, recordConfirmation } from '@/lib/agents/confirmation-tracker'
import { CONFIRMATION_AGENT } from '@/lib/agents/confirmation-rules'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = CONFIRMATION_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addConfirmationWorld>>
const runsOf = (skillKey: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const ungrade = (runId: string) => prisma.check.deleteMany({ where: { runId } })
const regrade = async (skillKey: string) => { const [run] = await runsOf(skillKey); await ungrade(run.id); return gradeSkillRun(run.id) }

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addConfirmationWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, confirmationTrackerAgent)
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
  await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  await recordConfirmation({ companyId: w.firm.id, submissionId: x.waiting.id, personId: w.am.id, heldAs: 'Account Manager', actingEntityId: w.entity.id, channel: 'PHONE', now: GOLDEN_WEDNESDAY })
  await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the confirmation tracker as skills', () => {
  it('the plan is the match, the hold, the card, and the three chase skills, and the match is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({
      skills: ['confirmation.match', 'dual-auth.block', 'card.open', 'chase.propose', 'chase.send', 'chase.close'],
      outputSkill: 'confirmation.match',
    })
  })

  it('one run is written for each reply matched, pair held, bounced letter, chase proposed, letter sent and chase closed, all rules tier at no cost', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    const by = (k: string) => all.filter((r) => r.skillKey === k).map((r) => r.recordId)
    expect(by('confirmation.match')).toEqual([x.replied.id])
    expect(by('dual-auth.block')).toEqual([x.dualA.id])
    expect(by('card.open')).toEqual([x.bounced.id])
    expect(by('chase.propose')).toEqual([x.waiting.id])
    expect(by('chase.send')).toEqual([x.waiting.id])
    expect(by('chase.close')).toEqual([x.waiting.id])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every skill run passes when the record is re-read and nothing has been touched', async () => {
    for (const k of ['confirmation.match', 'dual-auth.block', 'card.open', 'chase.propose', 'chase.send', 'chase.close']) {
      for (const r of await runsOf(k)) expect(await gradeSkillRun(r.id), k).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    }
  })

  it('a matched reply whose message is no interview or rate fails, because plain text proves nothing', async () => {
    const thread = await prisma.conversation.findFirstOrThrow({ where: { topic: 'SUBMISSION', topicId: x.replied.id } })
    await prisma.message.updateMany({ where: { conversationId: thread.id }, data: { type: 'TEXT' } })
    const out = await regrade('confirmation.match')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/No interview or rate message/)
    await prisma.message.updateMany({ where: { conversationId: thread.id }, data: { type: 'INTERVIEW' } })
  })

  it('a matched reply with no ledger line saying the agent matched it fails', async () => {
    const conf = await prisma.submissionConfirmation.findFirstOrThrow({ where: { submissionId: x.replied.id } })
    await prisma.recordAction.updateMany({ where: { recordId: conf.id, action: 'CONFIRMATION_MATCHED' }, data: { action: 'CONFIRMATION_RECORDED' } })
    const out = await regrade('confirmation.match')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/no line saying the agent matched it/)
    await prisma.recordAction.updateMany({ where: { recordId: conf.id, action: 'CONFIRMATION_RECORDED' }, data: { action: 'CONFIRMATION_MATCHED' } })
  })

  it('a held pair whose two cards are owed by one person fails, because a hold lifts only when two different people say yes', async () => {
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: 'Two authorizations for ' } } })
    expect(cards).toHaveLength(2)
    const was = cards[1].ownerPersonId
    await prisma.decisionItem.update({ where: { id: cards[1].id }, data: { ownerPersonId: cards[0].ownerPersonId } })
    const out = await regrade('dual-auth.block')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/owed by one person/)
    await prisma.decisionItem.update({ where: { id: cards[1].id }, data: { ownerPersonId: was } })
  })

  it('a hold on a person with only one submission for the job fails, because the record shows no pair', async () => {
    await prisma.submission.update({ where: { id: x.dualB.id }, data: { status: 'WITHDRAWN', rejectedAt: new Date() } })
    const out = await regrade('dual-auth.block')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/no second submission/)
    await prisma.submission.update({ where: { id: x.dualB.id }, data: { status: 'SUBMITTED', rejectedAt: null } })
  })

  it('the card for a bounced letter owed to the Owner and not to the Account Manager fails', async () => {
    const card = await prisma.decisionItem.findFirstOrThrow({ where: { companyId: w.firm.id, question: { startsWith: 'Failed delivery: ' } } })
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade('card.open')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })

  it('a chase proposed for a submission that already had a confirmation when it was written fails, naming that', async () => {
    const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
    const conf = await prisma.submissionConfirmation.findFirstOrThrow({ where: { submissionId: x.waiting.id } })
    await prisma.submissionConfirmation.update({ where: { id: conf.id }, data: { createdAt: new Date(task.createdAt.getTime() - 1000) } })
    const out = await regrade('chase.propose')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/a confirmation was already recorded when it was written/)
    await prisma.submissionConfirmation.update({ where: { id: conf.id }, data: { createdAt: conf.createdAt } })
  })

  it('a chase whose card is owed to somebody other than the Account Manager fails', async () => {
    const task = await prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY } })
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: task.decisionId } })
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade('chase.propose')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })

  it('a chase letter on the ledger with the agent switched off fails, because only On sends', async () => {
    await switchAgent(w, KEY, 'OFF')
    const out = await regrade('chase.send')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/switch reads OFF/)
    await switchAgent(w, KEY, 'ON')
  })

  it('a chase closed by arrival with no confirmation on the record fails, naming it', async () => {
    const conf = await prisma.submissionConfirmation.findFirstOrThrow({ where: { submissionId: x.waiting.id } })
    await prisma.submissionConfirmation.delete({ where: { id: conf.id } }).catch(async () => {
      await prisma.submissionConfirmation.updateMany({ where: { id: conf.id }, data: { mailSendId: 'none' } })
    })
    const out = await regrade('chase.close')
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/no confirmation that counts/)
  })
})
