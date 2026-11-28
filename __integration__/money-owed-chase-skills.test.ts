/**
 * The money-owed chase on skills (record 123, plan step 8), on the database
 * through the real runner and the real grader. `golden-money-owed-chase.test.ts`
 * proves the rows are unchanged; this proves the plan, the skill runs and
 * what each checker finds when it works the bill, its payments, the mail
 * ledger and the cards out again. Nothing here sends: the final notice stays
 * a draft a person sends.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addMoneyChaseWorld, GOLDEN_WEDNESDAY, goldenDay } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { moneyOwedChaseStep, MONEY_OWED_CHASE_AGENT, MONEY_OWED_CHASE_RULES, NO_CONTACT_CARD, FAILED_DELIVERY_CARD } from '@/lib/money/money-owed-chase'
import { sendMail } from '@/lib/notify/mail-door'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = MONEY_OWED_CHASE_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addMoneyChaseWorld>>
const door = (hand: (e: any) => Promise<unknown>) => ({ env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false, hand })
const agentWith = (hand: (e: any) => Promise<unknown>) => ({ ruleVersion: MONEY_OWED_CHASE_RULES, step: (ctx: any) => moneyOwedChaseStep(ctx, { send: (m) => sendMail(m, door(hand) as any) }) })
const goes = async () => ({ provider: 'Resend' as const, messageId: 'm' })
const runsOf = (skillKey: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const runFor = async (skillKey: string, recordId: string) => (await runsOf(skillKey)).find((r) => r.recordId === recordId)!
const regrade = async (skillKey: string, recordId: string) => { const r = await runFor(skillKey, recordId); await prisma.check.deleteMany({ where: { runId: r.id } }); return gradeSkillRun(r.id) }
const yes = async (taskId: string) => {
  const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
}
const taskOf = (billId: string, kind = 'MONEY_OWED_CHASE') => prisma.agentTask.findFirstOrThrow({ where: { companyId: w.firm.id, agentKey: KEY, kind, recordId: billId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addMoneyChaseWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, agentWith(goes))
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  for (const t of await prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY, state: 'PROPOSED' } })) await yes(t.id)
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  await x.payB()
  await runAgent(KEY, w.firm.id, GOLDEN_WEDNESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the money-owed chase as skills', () => {
  it('the plan is propose, send, close and open a card, and the proposal is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['chase.propose', 'chase.send', 'chase.close', 'card.open'], outputSkill: 'chase.propose' })
  })

  it('one run is written for each chase proposed, the final notice drafted, letter sent, chase closed and card opened, all rules tier at no cost', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    const by = (k: string) => all.filter((r) => r.skillKey === k).map((r) => r.recordId).sort()
    expect(by('chase.propose')).toEqual([x.partPaid.id, x.payInFull.id, x.nobodyBill.id, x.lastBill.id].sort())
    expect(by('chase.send')).toEqual([x.partPaid.id, x.payInFull.id].sort())
    expect(by('chase.close')).toEqual([x.payInFull.id])
    expect(by('card.open')).toEqual([x.noContact.id])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every skill run passes when the bill, its payments, the letters and the cards are worked out again and nothing has been touched', async () => {
    for (const k of ['chase.propose', 'chase.send', 'chase.close', 'card.open']) {
      for (const r of await runsOf(k)) expect(await gradeSkillRun(r.id), `${k} ${r.recordId}`).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    }
  })

  it('the final notice sent nothing: no letter on the mail ledger belongs to it', async () => {
    const notice = await taskOf(x.lastBill.id, 'ESCALATION')
    expect(await prisma.mailSend.count({ where: { agentTaskId: notice.id } })).toBe(0)
    expect(notice.state).toBe('DONE')
  })

  it('a chase proposed for a bill the payments already covered when it was written fails, naming that', async () => {
    await prisma.payment.create({ data: { id: 'pay-golden-cover', invoiceId: x.partPaid.id, amount: '600.00', receivedByCompanyId: w.firm.id, receivedAt: goldenDay('2026-11-12'), appliedAt: goldenDay('2026-11-12') } as any })
    const out = await regrade('chase.propose', x.partPaid.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/payments on the bill already covered it/)
    await prisma.payment.delete({ where: { id: 'pay-golden-cover' } })
  })

  it('a chase whose card is owed to the Owner and not to Accounts Receivable fails', async () => {
    const t = await taskOf(x.partPaid.id)
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t.decisionId } })
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade('chase.propose', x.partPaid.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })

  it('a chase proposed while a payment question about the bill was open fails', async () => {
    const t = await taskOf(x.nobodyBill.id)
    const q = await prisma.decisionItem.create({
      data: { companyId: w.firm.id, question: 'Short pay on GOLD-OWED-C', proof: 'short', ownerPersonId: x.ar.id, state: 'OPEN', proofLinks: [{ recordType: 'Invoice', recordId: x.nobodyBill.id }], openedOn: goldenDay('2026-11-12'), createdAt: new Date(t.createdAt.getTime() - 60_000) } as any,
    })
    const out = await regrade('chase.propose', x.nobodyBill.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/payment question about the bill was open/)
    await prisma.decisionItem.delete({ where: { id: q.id } })
  })

  it('a final notice with a letter on the ledger fails, because a final notice is only ever drafted for a person to send', async () => {
    const notice = await taskOf(x.lastBill.id, 'ESCALATION')
    const row = await prisma.mailSend.create({
      data: { companyId: w.firm.id, agentKey: KEY, agentTaskId: notice.id, recordType: 'Invoice', recordId: x.lastBill.id, fromAddress: 'hello@etyme.example', toAddresses: ['ap@example.invalid'], bccAddresses: [], subject: 'Final notice', template: 'money-owed-final-notice', templateVersion: '1', outcome: 'SENT' } as any,
    })
    const out = await regrade('chase.propose', x.lastBill.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/only ever drafted for a person to send/)
    await prisma.mailSend.delete({ where: { id: row.id } })
  })

  it('a final notice whose chase never had a letter leave fails, because it did not end with no answer', async () => {
    const chase = await taskOf(x.lastBill.id)
    await prisma.mailSend.updateMany({ where: { agentTaskId: chase.id }, data: { outcome: 'FAILED_DELIVERY' } })
    const out = await regrade('chase.propose', x.lastBill.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/did not end with no answer/)
    await prisma.mailSend.updateMany({ where: { agentTaskId: chase.id }, data: { outcome: 'SENT' } })
  })

  it('a letter whose task is the final notice fails, because only the chase may send', async () => {
    const mail = await prisma.mailSend.findFirstOrThrow({ where: { companyId: w.firm.id, recordId: x.partPaid.id, agentTaskId: { not: null } } })
    const notice = await taskOf(x.lastBill.id, 'ESCALATION')
    await prisma.mailSend.update({ where: { id: mail.id }, data: { agentTaskId: notice.id } })
    const out = await regrade('chase.send', x.partPaid.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/not one this skill may send under|about another record/)
    await prisma.mailSend.update({ where: { id: mail.id }, data: { agentTaskId: mail.agentTaskId } })
  })

  it('a chase closed because the bill was paid fails when the payments on it no longer cover it', async () => {
    const pay = await prisma.payment.findFirstOrThrow({ where: { invoiceId: x.payInFull.id } })
    await prisma.payment.delete({ where: { id: pay.id } })
    const out = await regrade('chase.close', x.payInFull.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/do not cover it/)
    await x.payB()
  })

  it('the card asking for a contact at a customer nobody is recorded at is unknown, not passed, once a contact with an address was on file by then', async () => {
    const c = await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: x.noContact.id, name: 'Late Lena', email: 'late.lena@example.invalid', kind: 'AP' } as any })
    const out = await regrade('card.open', x.noContact.id)
    expect(out).toMatchObject({ graded: true, verdict: 'UNKNOWN', unitsDone: null })
    await prisma.companyContact.delete({ where: { id: c.id } })
  })

  it('the card asking for a contact, owed to the Owner and not to Accounts Receivable, fails', async () => {
    const card = await prisma.decisionItem.findFirstOrThrow({ where: { companyId: w.firm.id, question: { contains: 'has no one recorded to receive bills' } } })
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade('card.open', x.noContact.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })

  it('a reminder that cannot leave opens one card to Accounts Receivable, the run passes, and a card with no failed letter behind it fails', async () => {
    // The mail door holds a second reminder about one record for a day of real time: the first letters are moved back a fortnight, so the reminder is due and the day is one that has happened.
    await prisma.mailSend.updateMany({ where: { companyId: w.firm.id, outcome: 'SENT' }, data: { createdAt: goldenDay('2026-11-12') } })
    registerAgent(KEY, agentWith(async () => { throw new Error('The mailbox is full.') }))
    await runAgent(KEY, w.firm.id, goldenDay('2026-11-26'))
    unregisterAgent(KEY)
    const t = await taskOf(x.partPaid.id)
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: 'Failed delivery' } } })
    expect(cards).toHaveLength(1)
    expect(cards[0].ownerPersonId).toBe(x.ar.id)
    expect(await regrade('card.open', t.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    const failed = (await prisma.mailSend.findMany({ where: { agentTaskId: t.id }, orderBy: { createdAt: 'asc' } }))
    expect(failed.map((m) => m.outcome)).toEqual(['SENT', 'FAILED_DELIVERY'])
    expect(await prisma.agentRun.count({ where: { companyId: w.firm.id, skillKey: 'card.open', recordType: FAILED_DELIVERY_CARD } })).toBe(1)
    await prisma.mailSend.update({ where: { id: failed[1].id }, data: { outcome: 'SENT' } })
    const out = await regrade('card.open', t.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/Every letter of the task left/)
    expect(NO_CONTACT_CARD).toBe('MoneyChaseNoContact')
  })
})
