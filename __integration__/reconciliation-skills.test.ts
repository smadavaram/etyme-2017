/**
 * The reconciliation agent on skills (record 123, plan step 8), on the
 * database through the real runner and the real grader.
 * `golden-reconciliation.test.ts` proves the rows are unchanged; this proves
 * the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addReconciliationWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { reconciliationAgent, CHASE_AND_RECONCILIATION } from '@/lib/agents/reconciliation'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = CHASE_AND_RECONCILIATION
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addReconciliationWorld>>
const runFor = async (skillKey: string, recordId: string) => prisma.agentRun.findFirstOrThrow({ where: { companyId: w.firm.id, skillKey, recordId } })
const regrade = async (skillKey: string, recordId: string) => { const r = await runFor(skillKey, recordId); await prisma.check.deleteMany({ where: { runId: r.id } }); return gradeSkillRun(r.id) }
const cardFor = (question: string) => prisma.decisionItem.findFirstOrThrow({ where: { companyId: w.firm.id, question: { contains: question } } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addReconciliationWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, reconciliationAgent)
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the reconciliation agent as skills', () => {
  it('the plan is the payment match and the rate drift flag, and the payment match is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['payment.match', 'drift.flag'], outputSkill: 'payment.match' })
  })

  it('one payment match run is written for each of the six payments looked at and one drift run for the bill line, all rules tier at no cost, and Tuesday adds none', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    expect(all.filter((r) => r.skillKey === 'payment.match').map((r) => r.recordId).sort()).toEqual([x.exactPay, x.shortPay, x.overPay, x.fxPay, x.loosePay, x.strayPay].map((p) => p.id).sort())
    expect(all.filter((r) => r.skillKey === 'drift.flag')).toHaveLength(1)
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every run passes when the payments, the bills and the cards are read again', async () => {
    for (const r of await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })) {
      expect(await gradeSkillRun(r.id), `${r.skillKey} ${r.recordId}`).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    }
  })

  it('a payment said to match its bill, where the bill is now for another amount, fails', async () => {
    await prisma.invoice.update({ where: { id: x.exactBill.id }, data: { total: '1200.00' } })
    const out = await regrade('payment.match', x.exactPay.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/does not show it equal to the bill to the cent/)
    await prisma.invoice.update({ where: { id: x.exactBill.id }, data: { total: '1000.00' } })
  })

  it('a loose payment said to match the one bill owed that amount fails when that bill is owed another amount', async () => {
    await prisma.invoice.update({ where: { id: x.looseBill.id }, data: { total: '800.00' } })
    const out = await regrade('payment.match', x.loosePay.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    await prisma.invoice.update({ where: { id: x.looseBill.id }, data: { total: '777.77' } })
  })

  it('a short pay whose card is owed to the Owner and not to the receivables seat fails', async () => {
    const card = await cardFor('was paid $900.00 of $1,000.00')
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade('payment.match', x.shortPay.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })

  it('an overpay with no card carrying both figures fails, naming that no card is on the record', async () => {
    const card = await cardFor('was paid $1,100.00 against $1,000.00')
    await prisma.decisionItem.update({ where: { id: card.id }, data: { question: 'Bill GOLD-OVER was paid something.' } })
    const out = await regrade('payment.match', x.overPay.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/No card is on the record/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { question: card.question } })
  })

  it('a payment in another currency that is later put right is not graded, and is never counted as passed', async () => {
    await prisma.payment.update({ where: { id: x.fxPay.id }, data: { currency: 'USD' } })
    const out = await regrade('payment.match', x.fxPay.id)
    expect(out).toMatchObject({ graded: true, verdict: 'UNKNOWN' })
    await prisma.payment.update({ where: { id: x.fxPay.id }, data: { currency: 'EUR' } })
  })

  it('a payment with two lines on the ledger saying what became of it fails', async () => {
    await prisma.recordAction.create({ data: { companyId: w.firm.id, recordType: 'Payment', recordId: x.strayPay.id, action: 'PAYMENT_FLAGGED', summary: 'again', personId: w.owner.id, heldAs: 'agent', agentKey: KEY } })
    const out = await regrade('payment.match', x.strayPay.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/2 lines on the ledger/)
  })

  it('the rate drift flag passes while the bill line is still above its contract and fails when its card is owed to the wrong seat', async () => {
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: x.driftBill.id } })
    expect(await regrade('drift.flag', line.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    const card = await cardFor('GOLD-DRIFT')
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await regrade('drift.flag', line.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: card.ownerPersonId } })
  })

  it('a rate drift flag on a line since put right is not graded', async () => {
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: x.driftBill.id } })
    await prisma.invoiceLine.update({ where: { id: line.id }, data: { rateCents: 10000 } })
    expect(await regrade('drift.flag', line.id)).toMatchObject({ graded: true, verdict: 'UNKNOWN' })
  })
})
