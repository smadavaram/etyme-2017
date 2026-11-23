/**
 * The reconciliation half of the chase-and-reconciliation agent (record 112,
 * chain 5), on the database through the real runner. Builds its own firm on
 * reserved domains.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { reconciliationAgent, CHASE_AND_RECONCILIATION as KEY } from '@/lib/agents/reconciliation'
import { openChain, advanceChain } from '@/lib/money/money-chain'
import { recordTimeline } from '@/lib/record-ledger'

const tag = `rc${Date.now()}`
const w: Record<string, any> = {}
const NOW = new Date('2026-11-23T12:00:00Z')
const OCT = { start: new Date('2026-10-01'), end: new Date('2026-10-31') }
const usd = (cents: number) => ({ cents, currency: 'USD' })
const mail = (n: string) => `${n}.${tag}@example.invalid`

async function person(name: string) {
  return prisma.person.create({ data: { name, primaryEmail: mail(name.toLowerCase().replace(/\s/g, '.')) } })
}
async function placement(who: any, billRate = 10_000) {
  return prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: who.id, billRate, startDate: new Date('2026-09-01'), engagementId: w.engagement.id } })
}
async function bill(number: string, line: any, total: string, lineRate = line.billRate, currency = 'USD') {
  const ts = await prisma.timesheet.create({ data: { sellContractId: line.id, personId: line.personId, periodStart: OCT.start, periodEnd: OCT.end, days: {}, totalHours: '10.00' } })
  return prisma.invoice.create({
    data: {
      engagementId: w.engagement.id, number: `${number}-${tag}`, currency, total, periodStart: OCT.start, periodEnd: OCT.end, dueAt: new Date('2026-11-30'), status: 'ISSUED',
      invoiceLines: { create: [{ sellContractId: line.id, personId: line.personId, timesheetId: ts.id, hours: '10.00', rateCents: lineRate, amountCents: Math.round(Number(total) * 100) }] },
    },
  })
}
async function monthAtPaymentPending(line: any, cents: number) {
  const s = { companyId: w.firm.id, actingEntityId: w.entity.id, personId: w.clerk.id, heldAs: 'AP & Payroll' }
  const c = await openChain({ ...s, sellContractId: line.id, periodStart: OCT.start, periodEnd: OCT.end }, new Date('2026-11-01'))
  for (const [to, stated] of [['TIMESHEET_RECEIVED', usd(cents)], ['RECONCILED'], ['INVOICED', usd(cents)], ['PAYMENT_PENDING']] as const) {
    await advanceChain({ ...s, chainId: c.id, to, stated: stated as any, disputeOwnerPersonId: w.owner.id })
  }
  return c
}
const setSwitch = (state: 'OFF' | 'DRAFT_ONLY' | 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey: KEY } },
  update: { state }, create: { companyId: w.firm.id, agentKey: KEY, state, changedById: w.owner.id },
})
const decisions = () => prisma.decisionItem.findMany({ where: { companyId: w.firm.id }, orderBy: { createdAt: 'asc' } })
const chainOf = (id: string) => prisma.moneyChain.findUniqueOrThrow({ where: { id } })

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Recon Firm ${tag}`, slug: `recon-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Recon Client ${tag}`, slug: `recon-client-${tag}`, kind: 'CLIENT' } as any })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Recon Firm LLC', country: 'US', currency: 'USD' } })
  w.engagement = await prisma.engagement.create({ data: { title: `Recon ${tag}` } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const [ownerRole, arRole, apRole] = [await role('Owner', ['*']), await role('Accounts Receivable', []), await role('AP & Payroll', [])]
  w.owner = await person('Dana Owner'); w.ar = await person('Rita Receivable'); w.clerk = await person('Ravi Payroll')
  for (const [p, r] of [[w.owner, ownerRole], [w.ar, arRole], [w.clerk, apRole]] as const) {
    await prisma.context.create({ data: { personId: p.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: r.id } as any })
  }
  const [ana, ben, cy, di] = [await person('Ana Rao'), await person('Ben Ito'), await person('Cy Lund'), await person('Di Roy')]
  w.exactLine = await placement(ana); w.shortLine = await placement(ben); w.driftLine = await placement(cy); w.fxLine = await placement(di)
  w.exactBill = await bill('EXACT', w.exactLine, '1000.00')
  w.shortBill = await bill('SHORT', w.shortLine, '1000.00')
  w.driftBill = await bill('DRIFT', w.driftLine, '1050.00', 10_500)
  w.fxBill = await bill('FX', w.fxLine, '1000.00')
  w.exactChain = await monthAtPaymentPending(w.exactLine, 100_000)
  w.shortChain = await monthAtPaymentPending(w.shortLine, 100_000)
  const pay = (invoiceId: string | null, amount: string, extra: Record<string, unknown> = {}) =>
    prisma.payment.create({ data: { invoiceId, amount, receivedByCompanyId: w.firm.id, receivedAt: new Date('2026-11-10'), appliedAt: invoiceId ? new Date('2026-11-11') : null, ...extra } as any })
  w.exactPay = await pay(w.exactBill.id, '1000.00', { reference: 'WIRE-1' })
  w.shortPay = await pay(w.shortBill.id, '900.00', { reference: 'WIRE-2' })
  w.fxPay = await pay(w.fxBill.id, '1000.00', { currency: 'EUR', reference: 'WIRE-3' })
  w.loosePay = await pay(null, '123.45', { reference: 'WIRE-4' })
})
afterEach(() => unregisterAgent(KEY))
const run = (n = NOW) => { registerAgent(KEY, reconciliationAgent); return runAgent(KEY, w.firm.id, n) }

describe('the reconciliation agent, on the database', () => {
  it('an agent that is off reconciles nothing and opens nothing', async () => {
    const out = await run()
    expect(out.ran).toBe(false)
    expect(await decisions()).toHaveLength(0)
    expect((await chainOf(w.exactChain.id)).state).toBe('PAYMENT_PENDING')
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY, recordType: 'Payment' } })).toBe(0)
  })

  it('on drafts only it opens its decisions and moves no month, even for a payment that matches to the cent', async () => {
    await setSwitch('DRAFT_ONLY')
    const out = await run()
    expect(out.ran).toBe(true)
    expect((await decisions()).length).toBe(4)
    expect((await chainOf(w.exactChain.id)).state).toBe('PAYMENT_PENDING')
  })

  it('a short pay opens one decision with both figures, owed by the receivables seat, and moves nothing', async () => {
    const d = (await decisions()).filter((x) => x.question.includes(`SHORT-${tag}`))
    expect(d).toHaveLength(1)
    expect(d[0].ownerPersonId).toBe(w.ar.id)
    expect(d[0].question).toBe(`Bill SHORT-${tag} was paid $900.00 of $1,000.00. Accept the short pay?`)
    expect(d[0].proof).toMatch(/\$1,000\.00.*\$900\.00.*\$100\.00 short/)
    expect(d[0].proofLinks).toEqual([{ recordType: 'Invoice', recordId: w.shortBill.id }])
    expect((await chainOf(w.shortChain.id)).state).toBe('PAYMENT_PENDING')
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: w.shortBill.id } })).status).toBe('ISSUED')
  })

  it('a payment that matches no bill opens one decision', async () => {
    const d = (await decisions()).filter((x) => x.question.includes('matches no bill'))
    expect(d).toHaveLength(1)
    expect(d[0].question).toBe('A payment of $123.45 matches no bill. Place it by hand?')
    expect(d[0].proofLinks).toEqual([{ recordType: 'Payment', recordId: w.loosePay.id }])
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: w.loosePay.id } })).invoiceId).toBeNull()
  })

  it('a payment in another currency than its bill opens one decision and is compared with nothing', async () => {
    const d = (await decisions()).filter((x) => x.question.includes(`FX-${tag}`))
    expect(d).toHaveLength(1)
    expect(d[0].proof).toMatch(/different currencies, so nothing was compared or converted/)
  })

  it('a bill whose rate differs from its contract line opens one drift decision with both rates', async () => {
    const d = (await decisions()).filter((x) => x.question.includes(`DRIFT-${tag}`))
    expect(d).toHaveLength(1)
    expect(d[0].question).toBe(`Bill DRIFT-${tag} charges Cy Lund $105.00 an hour and the contract says $100.00. Is the bill wrong?`)
    expect(d[0].ownerPersonId).toBe(w.ar.id)
  })

  it('a payment that matches its bill to the cent marks the month paid, not confirmed, and never closes it', async () => {
    await setSwitch('ON')
    await run()
    const c = await chainOf(w.exactChain.id)
    expect([c.state, c.paidAmountCents, c.paidCurrency]).toEqual(['PAID_UNCONFIRMED', 100_000, 'USD'])
    await run(new Date('2026-11-24T12:00:00Z'))
    expect((await chainOf(w.exactChain.id)).state).toBe('PAID_UNCONFIRMED')
  })

  it('the match is on the ledger as the agent, on the payment and on the month', async () => {
    const onPayment = await recordTimeline(w.firm.id, 'Payment', w.exactPay.id)
    expect(onPayment.map((r) => [r.action, r.agentKey, r.heldAs, r.ruleVersion])).toEqual([['PAYMENT_MATCHED', KEY, 'agent', 'reconcile-v1']])
    expect(onPayment[0].summary).toMatch(/Matched to bill EXACT-.*to the cent.*paid, not confirmed.*a person’s/)
    const onMonth = await recordTimeline(w.firm.id, 'MoneyChain', w.exactChain.id)
    expect(onMonth.at(-1)).toMatchObject({ action: 'ADVANCED', heldAs: 'agent' })
  })

  it('running again opens no second decision for the same thing, whoever has not yet answered', async () => {
    const before = (await decisions()).length
    await run(new Date('2026-11-25T12:00:00Z'))
    expect((await decisions()).length).toBe(before)
    expect(before).toBe(4)
  })

  it('a thing decided on the same figures is not opened again', async () => {
    const d = (await decisions()).find((x) => x.question.includes('matches no bill'))!
    await prisma.decisionItem.update({ where: { id: d.id }, data: { state: 'APPROVED', decidedAt: NOW, decidedByPersonId: w.ar.id } })
    await prisma.recordAction.deleteMany({ where: { companyId: w.firm.id, recordType: 'Payment', recordId: w.loosePay.id } })
    await run(new Date('2026-11-26T12:00:00Z'))
    expect((await decisions()).length).toBe(4)
  })

  it('the reconciliation agent sends nothing', async () => {
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id } })).toBe(0)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id } })).toBe(0)
  })
})
