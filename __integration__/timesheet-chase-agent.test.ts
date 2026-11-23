/**
 * Chain 4 of record 112, "Run the week": the timesheet chase agent, through
 * the real runner, the real task record and the real mail ledger. Builds its
 * own firm. The provider is a stub; the door's rules are the real ones.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as agents from '@/app/api/decision-items/agents/route'
import * as item from '@/app/api/decision-items/[id]/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { sendMail } from '@/lib/notify/mail-door'
import {
  timesheetChaseStep, TIMESHEET_CHASE_AGENT as KEY, PROPOSED_CHASE_PLAN, closeChaseOnFiling, firmsChasing,
} from '@/lib/notify/timesheet-chase-agent'

const tag = `tc${Date.now()}`
const w: Record<string, any> = {}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const sent: string[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async () => { sent.push('x'); return { provider: 'Resend' as const, messageId: 'm' } },
}
const day = (n: number) => new Date(Date.now() - n * 86_400_000)

const switchTo = async (state: string) => {
  as(w.owner.primaryEmail)
  return json(await agents.PATCH(req('PATCH', '/api/decision-items/agents', { agentKey: 'digest-scanner', state, actingEntityId: w.entity.id })))
}
const setSwitch = (state: string) => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey: KEY } },
  update: { state: state as any }, create: { companyId: w.firm.id, agentKey: KEY, state: state as any, changedById: w.owner.id },
})
const run = (now = new Date()) => runAgent(KEY, w.firm.id, now)
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const tasks = () => prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: KEY }, orderBy: { createdAt: 'asc' } })
const letters = (taskId: string) => prisma.mailSend.count({ where: { agentTaskId: taskId, outcome: 'SENT' } })
const attempts = (taskId: string) => prisma.mailSend.count({ where: { agentTaskId: taskId } })
/** Make the letters already sent read as sent four days ago, so the next retry is due. */
const aged = () => prisma.mailSend.updateMany({ where: { companyId: w.firm.id }, data: { createdAt: day(4) } })

async function newWeek(name: string) {
  const person = await prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` } })
  const msa = await prisma.masterAgreement.create({ data: { vendorId: w.firm.id, clientId: w.client.id } as any })
  const engagement = await prisma.engagement.create({ data: { title: `${name} work`, msaId: msa.id }, select: { id: true } })
  await prisma.context.create({ data: { personId: person.id, companyId: w.firm.id, type: 'EMPLOYEE' } as any })
  const line = await prisma.sellContract.create({
    data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: person.id, engagementId: engagement.id, billRate: 9000, state: 'IN_PROGRESS', startDate: day(60) },
  })
  const cycle = await prisma.cycle.create({
    data: { sellContractId: line.id, kind: 'TIMESHEET_SUBMIT', dueOn: day(3), periodStart: day(10), periodEnd: day(4) },
  })
  return { person, line, cycle }
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Chase Firm ${tag}`, slug: `chase-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Chase Client ${tag}`, slug: `chase-client-${tag}`, kind: 'CLIENT' } })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Chase Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const ownerRole = await role('Owner', ['*'])
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
})
afterEach(() => { unregisterAgent(KEY); sent.length = 0 })
void switchTo

const register = () => registerAgent(KEY, { ruleVersion: 't', step: (ctx) => timesheetChaseStep(ctx, { send: (m) => sendMail(m, deps) }) })

describe('the timesheet chase agent', () => {
  it('a missing week opens one chase task with a card, and a second run opens no second task', async () => {
    await setSwitch('ON'); register()
    const a = await newWeek('Priya Shah')
    await run(); await run()
    const t = await tasks()
    expect(t).toHaveLength(1)
    expect([t[0].kind, t[0].recordType, t[0].recordId, t[0].state]).toEqual(['TIMESHEET_CHASE', 'Cycle', a.cycle.id, 'PROPOSED'])
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t[0].decisionId } })
    expect(card.ownerPersonId).toBe(w.owner.id)
    expect(card.proof).toMatch(/up to 2 reminders, 2 working days apart/)
    expect(card.proof).toMatch(/the agent sends a timesheet reminder/)
    expect(card.proof).not.toMatch(/timesheet-chase/)
    expect(card.proof).toMatch(/closes the task when the week is filed/)
  })

  it('the card says the proposed defaults are proposals the owner may change', async () => {
    const [t] = await tasks()
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t.decisionId } })
    expect(card.question).toMatch(/Priya Shah has not filed the week of/)
    expect(card.question).toMatch(/one letter, then up to 2 reminders, 2 working days apart, closing when the week is filed/)
    expect(card.question).toMatch(/These numbers are proposals; the Owner can change them in Agent control/)
    expect(t.plan).toEqual(PROPOSED_CHASE_PLAN)
  })

  it('nothing is sent before a person says yes', async () => {
    register(); await run()
    expect(sent).toHaveLength(0)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id, agentKey: KEY } })).toBe(0)
  })

  it('after a yes the first letter goes at once, and each retry goes only when its working days have passed', async () => {
    const [t] = await tasks()
    await say(t.decisionId, 'APPROVE')
    register()
    await run()
    expect([sent.length, await letters(t.id)]).toEqual([1, 1])
    await run()
    expect(await letters(t.id)).toBe(1) // the same day: the retry waits
    await aged(); await run()
    expect(await letters(t.id)).toBe(2)
    const rows = await prisma.mailSend.findMany({ where: { agentTaskId: t.id }, orderBy: { createdAt: 'asc' } })
    expect(rows.every((r) => r.agentKey === KEY && r.template === 'timesheet-chase')).toBe(true)
    expect(rows[0].subject).toMatch(/^Your timesheet for/)
    expect(rows[0].subject).not.toMatch(/Reminder/)
  })

  it('a retry beyond the plan is never sent, and the retries spent with no week marks the task done and opens no escalation', async () => {
    const [t] = await tasks()
    register(); await aged(); await run() // third and last letter
    expect(await letters(t.id)).toBe(3)
    await aged(); await run() // nothing more to send: the task ends
    await run()
    expect(await letters(t.id)).toBe(3)
    const done = await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })
    expect(done.state).toBe('DONE')
    expect(done.closedReason).toMatch(/No answer/)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, kind: 'ESCALATION' } })).toBe(0)
  })

  it('a week that was refused or finished is never opened again the next morning', async () => {
    register(); await run(); await run()
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, agentKey: KEY } })).toBe(1)
  })

  it('filing the week closes its chase at once and no further letter goes', async () => {
    const b = await newWeek('Tomas Reyes')
    register(); await run()
    const t = (await tasks()).find((x) => x.recordId === b.cycle.id)!
    await say(t.decisionId, 'APPROVE'); await run()
    expect(await letters(t.id)).toBe(1)
    await prisma.cycle.update({ where: { id: b.cycle.id }, data: { completedAt: new Date() } })
    await closeChaseOnFiling(b.line.id)
    const closed = await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })
    expect([closed.state, closed.closedReason]).toEqual(['CLOSED_BY_ARRIVAL', 'The week was filed, so the chase is closed.'])
    await aged(); await run()
    expect(await letters(t.id)).toBe(1)
  })

  it('a week filed by another route closes its chase on the next run', async () => {
    const c = await newWeek('Mei Lin')
    register(); await run()
    const t = (await tasks()).find((x) => x.recordId === c.cycle.id)!
    await say(t.decisionId, 'APPROVE')
    await prisma.timesheet.create({ data: { sellContractId: c.line.id, personId: c.person.id, periodStart: c.cycle.periodStart!, periodEnd: c.cycle.periodEnd!, days: {}, totalHours: 40, status: 'SUBMITTED' } })
    await run()
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('CLOSED_BY_ARRIVAL')
    expect(await letters(t.id)).toBe(0)
  })

  it('a week the old reminder told her about today gets no second letter the same day', async () => {
    const d = await newWeek('Omar Aziz')
    register(); await run()
    const t = (await tasks()).find((x) => x.recordId === d.cycle.id)!
    await say(t.decisionId, 'APPROVE')
    await prisma.notification.create({ data: { personId: d.person.id, companyId: w.firm.id, type: 'CYCLE_DUE', title: 'Your hours are due', body: 'x', data: { cycleId: d.cycle.id } } as any })
    await run()
    expect(await letters(t.id)).toBe(0)
  })

  it('drafts only proposes the task and sends nothing even after a yes', async () => {
    await setSwitch('DRAFT_ONLY')
    const e = await newWeek('Lena Fox')
    register(); await run()
    const t = (await tasks()).find((x) => x.recordId === e.cycle.id)!
    expect(t.state).toBe('PROPOSED')
    await say(t.decisionId, 'APPROVE'); await run()
    expect(await letters(t.id)).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('the old reminder is quiet only for a firm whose chase agent is on', async () => {
    await setSwitch('ON')
    expect([...(await firmsChasing([w.firm.id, w.client.id]))]).toEqual([w.firm.id])
    await setSwitch('DRAFT_ONLY')
    expect((await firmsChasing([w.firm.id])).size).toBe(0)
    await setSwitch('OFF')
    expect((await firmsChasing([w.firm.id])).size).toBe(0)
  })
  it('a letter that could not leave counts as an attempt, and the chase is never tried more times than its plan', async () => {
    await setSwitch('ON')
    const f = await newWeek('Ines Park')
    const failing = { ...deps, hand: async () => { throw new Error('The mailbox is full.') } }
    unregisterAgent(KEY)
    registerAgent(KEY, { ruleVersion: 't', step: (ctx) => timesheetChaseStep(ctx, { send: (m) => sendMail(m, failing as any) }) })
    await run()
    const t = (await tasks()).find((x) => x.recordId === f.cycle.id)!
    await say(t.decisionId, 'APPROVE')
    for (let i = 0; i < 6; i++) { await run(); await prisma.mailSend.updateMany({ where: { agentTaskId: t.id }, data: { createdAt: day(4) } }) }
    expect(await attempts(t.id)).toBe(3)
    expect(await letters(t.id)).toBe(0)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('DONE')
    const said = await prisma.recordAction.findMany({ where: { recordId: t.id, action: 'CHASE_NOT_SENT' }, orderBy: { createdAt: 'asc' } })
    expect(said[0].summary).toMatch(/^Letter 1 could not be sent: /)
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: 'Failed delivery' } } })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].ownerPersonId).toBe(w.owner.id)
  })

  it('a firm never chases a worker it does not employ', async () => {
    await setSwitch('ON')
    const g = await newWeek('Sub Worker')
    await prisma.context.deleteMany({ where: { personId: g.person.id } })
    register(); await run()
    expect((await tasks()).some((x) => x.recordId === g.cycle.id)).toBe(false)
  })

  it('a week filed on the employer’s own line closes the chase on the line above it', async () => {
    await setSwitch('ON')
    const h = await newWeek('Rosa Vega')
    register(); await run()
    const t = (await tasks()).find((x) => x.recordId === h.cycle.id)!
    await say(t.decisionId, 'APPROVE')
    const other = await prisma.company.create({ data: { name: `Employer ${tag}`, slug: `employer-${tag}`, kind: 'VENDOR' } })
    const below = await prisma.sellContract.create({ data: { companyId: other.id, clientCompanyId: w.firm.id, endClientCompanyId: w.client.id, personId: h.person.id, billRate: 5000, state: 'IN_PROGRESS', startDate: day(60) } })
    await prisma.timesheet.create({ data: { sellContractId: below.id, personId: h.person.id, periodStart: h.cycle.periodStart!, periodEnd: h.cycle.periodEnd!, days: {}, totalHours: 40, status: 'SUBMITTED' } })
    await closeChaseOnFiling(below.id)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })).state).toBe('CLOSED_BY_ARRIVAL')
  })

  it('a worker whose filed weeks overlap the due period is not chased', async () => {
    await setSwitch('ON')
    const k = await newWeek('Noor Haddad')
    await prisma.timesheet.create({ data: { sellContractId: k.line.id, personId: k.person.id, periodStart: day(12), periodEnd: day(2), days: {}, totalHours: 40, status: 'SUBMITTED' } })
    register(); await run()
    expect((await tasks()).some((x) => x.recordId === k.cycle.id)).toBe(false)
  })

  it('a backlog of old weeks is one card for a person, not one chase each', async () => {
    await setSwitch('ON')
    const before = (await tasks()).length
    const mk = async (name: string, n: number) => {
      const o = await newWeek(name)
      await prisma.cycle.update({ where: { id: o.cycle.id }, data: { dueOn: day(n), periodStart: day(n + 7), periodEnd: day(n + 1) } })
      return o
    }
    const o1 = await mk('Old One', 40); const o2 = await mk('Old Two', 50)
    register(); await run(); await run()
    expect((await tasks()).length).toBe(before)
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { contains: 'older weeks' } } })
    expect(cards).toHaveLength(1)
    expect(cards[0].question).toMatch(/Old One/); expect(cards[0].question).toMatch(/Old Two/)
    void o1; void o2
  })

  it('the Owner sets a chase’s reminders and spacing, and the next card proposes them while an approved task keeps its plan', async () => {
    await setSwitch('ON'); register()
    const first = await newWeek('Early Bird'); await run()
    const early = (await tasks()).find((t) => t.recordId === first.cycle.id)!
    await say(early.decisionId, 'APPROVE')
    as(w.owner.primaryEmail)
    const res = await agents.PATCH(req('PATCH', '/api/decision-items/agents', { agentKey: KEY, chaseNumbers: { retries: 1, daysApart: 6 } }))
    expect(res.status).toBe(200)
    const later = await newWeek('Late Comer'); await run()
    const t = (await tasks()).find((x) => x.recordId === later.cycle.id)!
    expect(t.plan).toMatchObject({ retries: 1, daysApart: 6 })
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t.decisionId } })
    expect(card.question).toMatch(/up to 1 reminder, 6 working days apart/)
    expect(card.question).toMatch(/numbers the Owner set in Agent control/)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: early.id } })).plan).toEqual(PROPOSED_CHASE_PLAN)
  })
})
