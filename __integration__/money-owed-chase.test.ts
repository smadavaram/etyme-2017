/**
 * Chain 5 of record 112, "Money loop": chasing money owed with evidence,
 * through the real runner, the real task record and the real mail ledger.
 * Builds its own firm on reserved domains. The provider is a stub; the
 * door's rules are the real ones.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import * as agents from '@/app/api/decision-items/agents/route'
import { sendMail } from '@/lib/notify/mail-door'
import { moneyOwedChaseStep, PROPOSED_MONEY_CHASE_PLAN, MONEY_OWED_CHASE_AGENT as KEY, closeChaseOnPayment } from '@/lib/money/money-owed-chase'

const tag = `mo${Date.now()}`
const w: Record<string, any> = {}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const sent: { to: unknown; text: string }[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => { sent.push({ to: e.to, text: e.text ?? e.body ?? JSON.stringify(e) }); return { provider: 'Resend' as const, messageId: 'm' } },
}
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const setSwitch = (state: string) => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey: KEY } },
  update: { state: state as any }, create: { companyId: w.firm.id, agentKey: KEY, state: state as any, changedById: w.owner.id },
})
const register = () => registerAgent(KEY, { ruleVersion: 't', step: (ctx) => moneyOwedChaseStep(ctx, { send: (m) => sendMail(m, deps as any) }) })
const run = () => runAgent(KEY, w.firm.id, new Date())
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const tasks = () => prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY }, orderBy: { createdAt: 'asc' } })
const taskFor = async (billId: string) => (await tasks()).find((t) => t.recordId === billId)!
const letters = (taskId: string) => prisma.mailSend.count({ where: { agentTaskId: taskId, outcome: 'SENT' } })
const aged = () => prisma.mailSend.updateMany({ where: { companyId: w.firm.id, outcome: 'SENT' }, data: { createdAt: day(8) } })
let n = 0
async function newBill(opts: { dueInDays?: number; total?: string; status?: string } = {}) {
  const person = await prisma.person.create({ data: { name: `Worker ${++n}`, primaryEmail: `worker${n}.${tag}@example.invalid` } })
  const line = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: person.id, engagementId: w.engagement.id, billRate: 10_000, state: 'IN_PROGRESS', startDate: day(90) } })
  const ts = await prisma.timesheet.create({ data: { sellContractId: line.id, personId: person.id, periodStart: day(50), periodEnd: day(44), days: {}, totalHours: '40.00', clientApprovedAt: day(40) } })
  return prisma.invoice.create({
    data: {
      engagementId: w.engagement.id, number: `IN-${n}-${tag}`, currency: 'USD', total: opts.total ?? '1000.00', periodStart: day(50), periodEnd: day(44),
      dueAt: day(-(opts.dueInDays ?? -22)), status: opts.status ?? 'SUBMITTED',
      invoiceLines: { create: [{ sellContractId: line.id, personId: person.id, timesheetId: ts.id, hours: '40.00', rateCents: 2500, amountCents: 100_000 }] },
    },
    include: { invoiceLines: true },
  })
}
const pay = (invoiceId: string, amount: string) => prisma.payment.create({ data: { invoiceId, amount, receivedByCompanyId: w.firm.id, appliedAt: new Date() } as any })

beforeAll(async () => {
  process.env.NEXTAUTH_URL ||= 'https://etyme.example'
  process.env.NEXTAUTH_SECRET ||= 'test-secret-for-bill-links'
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Owed Firm ${tag}`, slug: `owed-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Owed Client ${tag}`, slug: `owed-client-${tag}`, kind: 'CLIENT' } })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Owed Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const ownerRole = await role('Owner', ['*']); const arRole = await role('Accounts Receivable', [])
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  w.ar = await prisma.person.create({ data: { name: 'Rita Receivable', primaryEmail: `rita.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  await prisma.context.create({ data: { personId: w.ar.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: arRole.id } as any })
  await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: w.client.id, name: 'Omar Payables', email: `omar.${tag}@example.invalid`, kind: 'AP' } as any })
  const msa = await prisma.masterAgreement.create({ data: { vendorId: w.firm.id, clientId: w.client.id } as any })
  w.engagement = await prisma.engagement.create({ data: { title: `Owed ${tag}`, msaId: msa.id }, select: { id: true } })
})
afterEach(() => { unregisterAgent(KEY); sent.length = 0 })

describe('chasing money owed, on the database', () => {
  it('a bill past due with money owed opens one chase task with a card, and a second run opens no second', async () => {
    await setSwitch('ON'); register()
    const b = await newBill()
    await run(); await run()
    const t = await tasks()
    expect(t).toHaveLength(1)
    expect([t[0].kind, t[0].recordType, t[0].recordId, t[0].state]).toEqual(['MONEY_OWED_CHASE', 'Invoice', b.id, 'PROPOSED'])
    expect(t[0].plan).toEqual(PROPOSED_MONEY_CHASE_PLAN)
    w.bill = b
  })

  it('the card is owed by Accounts Receivable and says the customer, the bill, the amount, the due date and that the plan is a proposal', async () => {
    const [t] = await tasks()
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t.decisionId } })
    expect(card.ownerPersonId).toBe(w.ar.id)
    expect(card.question).toContain(`Owed Client ${tag} owes $1,000.00 on bill ${w.bill.number}`)
    expect(card.question).toMatch(/22 days past it/)
    expect(card.question).toMatch(/one letter, then up to 2 reminders, 5 working days apart, closing when the bill is paid in full/)
    expect(card.question).toMatch(/proposals; the Owner can change them in Agent control/)
  })

  it('nothing is sent before a yes', async () => {
    register(); await run()
    expect(sent).toHaveLength(0)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id, agentKey: KEY } })).toBe(0)
  })

  it('after a yes the letter names the bill, the amount owed and the due date, and carries the bill and its signed timesheets', async () => {
    const [t] = await tasks()
    await say(t.decisionId, 'APPROVE'); register(); await run()
    expect(await letters(t.id)).toBe(1)
    const row = await prisma.mailSend.findFirstOrThrow({ where: { agentTaskId: t.id } })
    expect(row.subject).toContain(w.bill.number); expect(row.subject).toContain('$1,000.00')
    expect(row.toAddresses).toEqual([`omar.${tag}@example.invalid`])
    const text = sent[0].text
    expect(text).toMatch(/is still owed/); expect(text).toMatch(/It was due on/)
    expect(text).toContain('/answer/bill/')
    expect(text).toMatch(/Worker \d+, .* 40 hours, signed /)
  })

  it('a reminder waits five working days and then goes', async () => {
    const [t] = await tasks()
    register(); await run()
    expect(await letters(t.id)).toBe(1)
    await aged(); await run()
    expect(await letters(t.id)).toBe(2)
    expect((await prisma.mailSend.findMany({ where: { agentTaskId: t.id }, orderBy: { createdAt: 'asc' } }))[1].subject).toMatch(/^Reminder: /)
  })

  it('a part payment reduces what is owed and the chase goes on', async () => {
    const [t] = await tasks()
    await pay(w.bill.id, '400.00')
    await aged(); register(); await run()
    expect(await letters(t.id)).toBe(3)
    expect(sent[0].text).toContain('$600.00 is still owed')
  })

  it('reminders spent end the task with no answer and open nothing further', async () => {
    const [t] = await tasks()
    register(); await aged(); await run(); await run()
    expect(await letters(t.id)).toBe(3)
    const done = await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })
    expect(done.state).toBe('DONE'); expect(done.closedReason).toMatch(/No answer/)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, OR: [{ kind: 'ESCALATION' }, { parentTaskId: { not: null } }] } })).toBe(0)
    await run()
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, agentKey: KEY, recordId: w.bill.id } })).toBe(1)
  })

  it('a bill paid in full closes its chase at once and no further letter goes', async () => {
    const b = await newBill()
    register(); await run()
    const t = await taskFor(b.id)
    await say(t.decisionId, 'APPROVE'); await run()
    expect(await letters(t.id)).toBe(1)
    await pay(b.id, '1000.00')
    await closeChaseOnPayment(b.id)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('CLOSED_BY_ARRIVAL')
    await aged(); sent.length = 0; await run()
    expect(sent).toHaveLength(0)
  })

  it('a payment found by the nightly run, with no hook, also closes the chase', async () => {
    const b = await newBill()
    register(); await run()
    const t = await taskFor(b.id)
    await say(t.decisionId, 'APPROVE')
    await pay(b.id, '1000.00'); await run()
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('CLOSED_BY_ARRIVAL')
    expect(await letters(t.id)).toBe(0)
  })

  it('a bill with an open short-pay decision is not chased until that decision is recorded', async () => {
    const b = await newBill()
    await pay(b.id, '900.00')
    const decision = await prisma.decisionItem.create({
      data: { companyId: w.firm.id, question: 'Short pay', proof: 'short', ownerPersonId: w.ar.id, state: 'OPEN', proofLinks: [{ recordType: 'Invoice', recordId: b.id }], openedOn: new Date() } as any,
    }).catch(async () => null)
    if (!decision) throw new Error('could not open the stand-in decision; the test needs the real shape')
    register(); await run()
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, recordId: b.id } })).toBe(0)
    await prisma.decisionItem.update({ where: { id: decision.id }, data: { state: 'APPROVED', decidedAt: new Date(), decidedByPersonId: w.owner.id } })
    await run()
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, recordId: b.id } })).toBe(1)
  })

  it('a bill not yet due is not chased', async () => {
    const b = await newBill({ dueInDays: 10 })
    register(); await run()
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, recordId: b.id } })).toBe(0)
  })

  it('a bill the customer holds or disputes is not chased', async () => {
    const b = await newBill({ status: 'DISPUTED' })
    register(); await run()
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, recordId: b.id } })).toBe(0)
  })

  it('on drafts only it proposes and sends nothing, even after a yes', async () => {
    const b = await newBill()
    await setSwitch('DRAFT_ONLY'); register(); await run()
    const t = await taskFor(b.id)
    await say(t.decisionId, 'APPROVE'); await run()
    expect(sent).toHaveLength(0)
    await setSwitch('ON')
  })

  it('the chase never writes off, holds pay or sends a final notice, and changes no bill', async () => {
    const before = await prisma.invoice.findMany({ where: { number: { contains: tag } }, select: { id: true, status: true, total: true, paid: true, dueAt: true } })
    register(); await aged(); await run()
    const after = await prisma.invoice.findMany({ where: { number: { contains: tag } }, select: { id: true, status: true, total: true, paid: true, dueAt: true } })
    expect(after).toEqual(before)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, kind: { not: 'MONEY_OWED_CHASE' } } })).toBe(0)
    const templates = await prisma.mailSend.findMany({ where: { companyId: w.firm.id, agentKey: KEY }, select: { template: true } })
    expect(new Set(templates.map((x) => x.template))).toEqual(new Set(['money-owed-chase']))
    for (const s of sent) expect(s.text.toLowerCase()).not.toMatch(/final notice|write.?off|payroll hold/)
  })

  it('a letter that could not leave counts as an attempt, and the chase is never tried more times than its plan', async () => {
    const b = await newBill()
    await setSwitch('ON'); register(); await run()
    const t = await taskFor(b.id)
    await say(t.decisionId, 'APPROVE')
    const failing = { ...deps, hand: async () => { throw new Error('The mailbox is full.') } }
    unregisterAgent(KEY)
    registerAgent(KEY, { ruleVersion: 't', step: (ctx) => moneyOwedChaseStep(ctx, { send: (m) => sendMail(m, failing as any) }) })
    for (let i = 0; i < 6; i++) { await run(); await prisma.mailSend.updateMany({ where: { agentTaskId: t.id }, data: { createdAt: day(8) } }) }
    expect(await prisma.mailSend.count({ where: { agentTaskId: t.id } })).toBe(3)
    expect(await letters(t.id)).toBe(0)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('DONE')
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: 'Failed delivery' } } })
    expect(cards.length).toBeGreaterThan(0)
  })

  it('with no mail sender set up, the chase ends saying no letter could leave, never "no answer", and one card asks a person to follow up', async () => {
    const b = await newBill()
    await setSwitch('ON'); register(); await run()
    const t = await taskFor(b.id)
    await say(t.decisionId, 'APPROVE')
    const noSender = { ...deps, env: {} }
    unregisterAgent(KEY)
    registerAgent(KEY, { ruleVersion: 't', step: (ctx) => moneyOwedChaseStep(ctx, { send: (m) => sendMail(m, noSender as any) }) })
    for (let i = 0; i < 6; i++) { await run(); await prisma.mailSend.updateMany({ where: { agentTaskId: t.id }, data: { createdAt: day(8) } }) }
    expect(await prisma.mailSend.count({ where: { agentTaskId: t.id } })).toBe(3)
    const done = await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })
    expect(done.state).toBe('DONE')
    expect(done.closedReason).toMatch(/No letter could leave/)
    expect(done.closedReason).not.toMatch(/No answer/)
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { contains: `no letter about bill ${b.number} could leave` } } })
    expect(cards).toHaveLength(1)
  })
})

describe('a customer nobody can write to, and the numbers the Owner sets', () => {
  async function lonelyBill() {
    const client = await prisma.company.create({ data: { name: `Lonely Client ${++n} ${tag}`, slug: `lonely-${n}-${tag}`, kind: 'CLIENT' } })
    const msa = await prisma.masterAgreement.create({ data: { vendorId: w.firm.id, clientId: client.id } as any })
    const engagement = await prisma.engagement.create({ data: { title: `Lonely ${n} ${tag}`, msaId: msa.id }, select: { id: true } })
    const person = await prisma.person.create({ data: { name: `Lonely Worker ${n}`, primaryEmail: `lonely${n}.${tag}@example.invalid` } })
    const line = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: client.id, personId: person.id, engagementId: engagement.id, billRate: 10_000, state: 'IN_PROGRESS', startDate: day(90) } })
    const bill = await prisma.invoice.create({
      data: {
        engagementId: engagement.id, number: `LN-${n}-${tag}`, currency: 'USD', total: '500.00', periodStart: day(50), periodEnd: day(44), dueAt: day(10), status: 'SUBMITTED',
        invoiceLines: { create: [{ sellContractId: line.id, personId: person.id, hours: '20.00', rateCents: 2500, amountCents: 50_000 }] },
      },
    })
    return { client, bill }
  }
  const noCards = (clientName: string) => prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: `${clientName} has no one recorded to receive bills` } } })
  const notSent = () => prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY, action: 'MONEY_CHASE_NOT_SENT' } })

  it('a customer with nobody to receive bills raises one card naming the fix, and no line every night', async () => {
    await setSwitch('ON'); register()
    const linesBefore = await notSent()
    const { client, bill } = await lonelyBill()
    await run()
    const t = await taskFor(bill.id)
    await say(t.decisionId, 'APPROVE')
    await run(); await run(); await run()
    const cards = await noCards(client.name)
    expect(cards).toHaveLength(1)
    expect(cards[0].question).toBe(`${client.name} has no one recorded to receive bills, so bill ${bill.number} cannot be chased. Add a billing contact on the customer’s page?`)
    expect(cards[0].ownerPersonId).toBe(w.ar.id)
    expect(cards[0].proofLinks).toEqual([{ recordType: 'Company', recordId: client.id }])
    expect((await notSent()) - linesBefore).toBe(1)
    expect(sent).toHaveLength(0)
  })

  it('once the billing contact is added the chase goes ahead as planned, with no further card', async () => {
    const before = await notSent()
    const t = (await tasks()).find((x) => x.state === 'APPROVED' || x.state === 'RUNNING')!
    const bill = await prisma.invoice.findUniqueOrThrow({ where: { id: t.recordId }, include: { engagement: { include: { msa: true } } } })
    await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: bill.engagement.msa!.clientId, name: 'Pat Payables', email: `pat.${tag}@example.invalid`, kind: 'AP' } as any })
    register(); await run()
    expect(await letters(t.id)).toBe(1)
    expect(await notSent()).toBe(before)
  })

  it('a deployment with no lasting web address raises one card, then stays quiet', async () => {
    const was = { a: process.env.NEXTAUTH_URL, b: process.env.NEXT_PUBLIC_APP_URL, c: process.env.APP_URL }
    try {
      await setSwitch('ON'); register()
      const { client, bill } = await lonelyBill()
      await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: client.id, name: 'Quinn Payables', email: `quinn.${tag}@example.invalid`, kind: 'AP' } as any })
      await run()
      await say((await taskFor(bill.id)).decisionId, 'APPROVE')
      delete process.env.NEXTAUTH_URL; delete process.env.NEXT_PUBLIC_APP_URL; delete process.env.APP_URL
      await run(); await run(); await run()
      const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: 'Bills cannot be chased' } } })
      expect(cards).toHaveLength(1)
      expect(cards[0].question).toMatch(/does not know its own web address/)
    } finally {
      if (was.a) process.env.NEXTAUTH_URL = was.a
      if (was.b) process.env.NEXT_PUBLIC_APP_URL = was.b
      if (was.c) process.env.APP_URL = was.c
    }
  })

  const patch = (email: string, body: unknown) => { as(email); return agents.PATCH(req('PATCH', '/api/decision-items/agents', body)) }

  it('the Owner sets a chase’s reminders and spacing, and the next card proposes them', async () => {
    await setSwitch('ON'); register()
    const res = await patch(w.owner.primaryEmail, { agentKey: KEY, chaseNumbers: { retries: 4, daysApart: 3 } })
    expect(res.status).toBe(200)
    const ledger = await prisma.recordAction.findFirst({ where: { companyId: w.firm.id, recordType: 'AgentSwitch', summary: { contains: 'up to 4 reminders, 3 working days apart' } } })
    expect(ledger).not.toBeNull()
    const { bill } = await lonelyBill()
    await run()
    const t = await taskFor(bill.id)
    expect(t.plan).toMatchObject({ retries: 4, daysApart: 3 })
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t.decisionId } })
    expect(card.question).toMatch(/one letter, then up to 4 reminders, 3 working days apart/)
    expect(card.question).toMatch(/numbers the Owner set in Agent control/)
  })

  it('a task already approved keeps the plan it was approved with', async () => {
    register()
    await patch(w.owner.primaryEmail, { agentKey: KEY, chaseNumbers: { retries: 2, daysApart: 5 } })
    const { bill } = await lonelyBill()
    await run()
    const t = await taskFor(bill.id)
    await say(t.decisionId, 'APPROVE')
    await patch(w.owner.primaryEmail, { agentKey: KEY, chaseNumbers: { retries: 5, daysApart: 1 } })
    await run()
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).plan).toMatchObject({ retries: 2, daysApart: 5 })
  })

  it('an Admin cannot change them', async () => {
    const adminRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Admin', permissions: ['settings.manage', 'people.manage'] } })
    const admin = await prisma.person.create({ data: { name: 'Ada Admin', primaryEmail: `ada.${tag}@example.invalid` } })
    await prisma.context.create({ data: { personId: admin.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: adminRole.id } as any })
    const res = await patch(admin.primaryEmail, { agentKey: KEY, chaseNumbers: { retries: 1, daysApart: 1 } })
    expect(res.status).toBe(403)
    expect(JSON.stringify(await json(res))).toMatch(/Only the firm’s Owner/)
  })

  it('numbers outside the allowed range are refused in a sentence', async () => {
    for (const [chaseNumbers, says] of [
      [{ retries: 6, daysApart: 5 }, /Letters after the first is a whole number from 0 to 5/],
      [{ retries: 2, daysApart: 0 }, /Working days apart is a whole number from 1 to 15/],
      [{ retries: 2, daysApart: 16 }, /Working days apart is a whole number from 1 to 15/],
      [{ retries: 1.5, daysApart: 5 }, /Letters after the first/],
    ] as const) {
      const res = await patch(w.owner.primaryEmail, { agentKey: KEY, chaseNumbers })
      expect(res.status).toBe(422)
      expect(JSON.stringify(await json(res))).toMatch(says)
    }
  })
})
