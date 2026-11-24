/**
 * Chain 1 of record 112, "Drafts of outreach and chases", on the database
 * through the real runner, the real task record and the real mail ledger:
 * the submission chase (a task, one yes, one letter and one reminder) and
 * the dormant outreach (a card holding a draft; Etyme sends nothing).
 * Builds its own firm on reserved domains. The provider is a stub; the
 * door's rules are the real ones.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { sendMail } from '@/lib/notify/mail-door'
import { confirmationTrackerStep, recordConfirmation, trackerItems } from '@/lib/agents/confirmation-tracker'
import { censusKeeperAgent } from '@/lib/agents/census-keeper'

const tag = `oc${Date.now()}`
const w: Record<string, any> = {}
const TRACK = 'confirmation-tracker'
const CENSUS = 'census-keeper'
const KIND = 'SUBMISSION_CHASE'
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const sent: { to: unknown; text: string }[] = []
let handFails = false
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => {
    if (handFails) throw new Error('Mailbox does not exist')
    sent.push({ to: e.to, text: e.text ?? e.body ?? JSON.stringify(e) }); return { provider: 'Resend' as const, messageId: 'm' }
  },
}
const setSwitch = (agentKey: string, state: 'OFF' | 'DRAFT_ONLY' | 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey } },
  update: { state }, create: { companyId: w.firm.id, agentKey, state, changedById: w.owner.id },
})
const track = (when = new Date()) => {
  registerAgent(TRACK, { ruleVersion: 't', step: (ctx) => confirmationTrackerStep(ctx, { send: (m) => sendMail(m, deps as any) }) })
  return runAgent(TRACK, w.firm.id, when)
}
const census = (when: Date) => { registerAgent(CENSUS, censusKeeperAgent); return runAgent(CENSUS, w.firm.id, when) }
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const tasks = () => prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: TRACK, kind: KIND }, orderBy: { createdAt: 'asc' } })
const taskFor = async (submissionId: string) => (await tasks()).find((t) => t.recordId === submissionId)!
const chaseLetters = (submissionId: string) => prisma.mailSend.findMany({ where: { companyId: w.firm.id, recordId: submissionId, template: 'submission-chase', outcome: 'SENT' }, orderBy: { createdAt: 'asc' } })
const age = (submissionId: string, days: number) => prisma.mailSend.updateMany({ where: { companyId: w.firm.id, recordId: submissionId, template: 'submission-chase' }, data: { createdAt: day(days) } })
let n = 0
async function newSubmission(opts: { waitedDays?: number; letter?: 'SENT' | 'FAILED_DELIVERY' | 'NONE'; job?: string; person?: any } = {}) {
  n++
  const person = opts.person ?? await prisma.person.create({ data: { name: `Candidate ${n}`, primaryEmail: `cand${n}.${tag}@example.invalid` } })
  const job = await prisma.requirement.create({ data: { companyId: w.client.id, title: opts.job ?? `Job ${n}`, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: day(-30) } })
  const s = await prisma.submission.create({ data: { requirementId: job.id, personId: person.id, fromCompanyId: w.firm.id, toCompanyId: w.client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: day(opts.waitedDays ?? 5) } })
  const letter = opts.letter ?? 'SENT'
  if (letter !== 'NONE') {
    await prisma.mailSend.create({ data: { companyId: w.firm.id, recordType: 'Submission', recordId: s.id, fromAddress: 'hello@etyme.example', toAddresses: [`hiring${n}.${tag}@example.invalid`], bccAddresses: [], subject: `Candidate ${n}`, template: 'submission', templateVersion: '1', outcome: letter, createdAt: day(opts.waitedDays ?? 5) } })
  }
  return { ...s, person, to: `hiring${n}.${tag}@example.invalid` }
}
/** A submission proposed, approved and ready to send. */
async function released(opts: Parameters<typeof newSubmission>[0] = {}) {
  const s = await newSubmission(opts)
  await track()
  await say((await taskFor(s.id)).decisionId, 'APPROVE')
  return s
}

beforeAll(async () => {
  await resetDatabase()
  const co = (name: string, kind: string) => prisma.company.create({ data: { name: `${name} ${tag}`, slug: `${name.toLowerCase().replace(/\s/g, '-')}-${tag}`, kind } as any })
  w.firm = await co('Chase Firm', 'VENDOR'); w.client = await co('Chase Client', 'CLIENT'); w.supplier = await co('Chase Supplier', 'VENDOR'); w.quiet = await co('Quiet Co', 'CLIENT'); w.both = await co('Both Ways', 'CLIENT')
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Chase Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const ownerRole = await role('Owner', ['*'])
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  w.reqCo = await prisma.requirement.create({ data: { companyId: w.client.id, title: 'Anchor', skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: day(-30) } })
  w.anyone = await prisma.person.create({ data: { name: 'Anchor Person', primaryEmail: `anchor.${tag}@example.invalid` } })
}, 600_000)
afterEach(() => { unregisterAgent(TRACK); unregisterAgent(CENSUS); sent.length = 0; handFails = false })

describe('the submission chase, on the database', () => {
  it('a submission waiting more than three days with no confirmation becomes one task and one card asking for a yes', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission()
    await track(); await track()
    const t = (await tasks()).filter((x) => x.recordId === s.id)
    expect(t).toHaveLength(1)
    expect(t[0].state).toBe('PROPOSED')
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t[0].decisionId } })
    expect([card.state, card.question]).toEqual(['OPEN', expect.stringMatching(/Candidate \d+ for Job \d+.*Proposed numbers, awaiting the Owner/)])
  })

  it('a submission chase reads by name as the chase of that person for that job, not a code', async () => {
    const { findOnBook } = await import('@/app/api/records/lookup')
    const t = (await tasks())[0]
    const name = (await findOnBook(t.companyId, 'AgentTask' as any, t.id))?.name ?? ''
    expect(name).toMatch(/Chase of Candidate \d+'s submission for Job \d+/)
    expect(name).not.toContain('SUBMISSION_CHASE')
  })

  it('a submission is never proposed for a chase twice, whatever became of the first task', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission()
    await track()
    await say((await taskFor(s.id)).decisionId, 'REJECT')
    await track(); await track()
    expect((await tasks()).filter((x) => x.recordId === s.id)).toHaveLength(1)
  })

  it('a submission held by a dual authorization is not chased', async () => {
    await setSwitch(TRACK, 'ON')
    const person = await prisma.person.create({ data: { name: 'Twice Put', primaryEmail: `twice.${tag}@example.invalid` } })
    const a = await newSubmission({ person, job: 'Twin Job' }); const b = await newSubmission({ person, job: 'Twin Job' })
    await track()
    expect((await tasks()).filter((x) => [a.id, b.id].includes(x.recordId))).toHaveLength(0)
  })

  it('a submission whose letter bounced is not chased, because its own card already asks a person', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission({ letter: 'FAILED_DELIVERY' })
    await track()
    expect((await tasks()).filter((x) => x.recordId === s.id)).toHaveLength(0)
  })

  it('a submission confirmed by phone with no letter on the mail ledger is not chased', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission({ letter: 'NONE' })
    await track()
    expect((await tasks()).filter((x) => x.recordId === s.id)).toHaveLength(0)
  })

  it('a submission put forward less than three days ago is not chased', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission({ waitedDays: 2 })
    await track()
    expect((await tasks()).filter((x) => x.recordId === s.id)).toHaveLength(0)
  })

  it('no letter leaves a submission chase before a person says yes', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission()
    await track(); await track()
    expect(sent).toHaveLength(0)
    expect(await chaseLetters(s.id)).toHaveLength(0)
  })

  it('after the yes the chase sends one letter and one reminder three working days apart and no more', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await track(); await track()
    expect(await chaseLetters(s.id)).toHaveLength(1)
    await age(s.id, 8)
    await track()
    expect(await chaseLetters(s.id)).toHaveLength(2)
    await age(s.id, 8)
    await track(); await track()
    expect(await chaseLetters(s.id)).toHaveLength(2)
    expect(sent).toHaveLength(2)
    const t = await taskFor(s.id)
    expect([t.state, t.sentCount]).toEqual(['DONE', 2])
  })

  it('the submission chase goes to the address the submission letter was sent to and never to the candidate', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await track()
    const row = (await chaseLetters(s.id))[0]
    expect(row.toAddresses).toEqual([s.to])
    expect(row.toAddresses).not.toContain(s.person.primaryEmail)
  })

  it('the submission chase letter names the person, the job and the day put forward, asks for one thing, and carries no rate', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await track()
    const text = sent[0].text
    expect(text).toMatch(s.person.name); expect(text).toMatch(/Job \d+/)
    expect(text).toMatch(/confirm you have it, or tell us it is not wanted/)
    expect(text).not.toMatch(/https?:|\$|\brate\b|9000|90\.00/)
  })

  it('on drafts only a submission chase sends nothing even after a yes', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await setSwitch(TRACK, 'DRAFT_ONLY')
    await track(); await track()
    expect(sent).toHaveLength(0)
    expect(await chaseLetters(s.id)).toHaveLength(0)
  })

  it('a confirmation recorded after the yes closes the submission chase before the reminder goes', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await track()
    await recordConfirmation({ companyId: w.firm.id, submissionId: s.id, personId: w.owner.id, heldAs: 'Owner', actingEntityId: w.entity.id, channel: 'PHONE' })
    await age(s.id, 8)
    await track()
    expect(await chaseLetters(s.id)).toHaveLength(1)
    const t = await taskFor(s.id)
    expect(t.state).toBe('CLOSED_BY_ARRIVAL')
  })

  it('a submission confirmed before anyone says yes closes its chase, sends nothing, and its card no longer counts as owed', async () => {
    const { listDecisions } = await import('@/lib/decision-items')
    await setSwitch(TRACK, 'ON')
    const s = await newSubmission()
    await track()
    const t0 = await taskFor(s.id)
    expect(t0.state).toBe('PROPOSED')
    expect((await listDecisions(w.firm.id, { state: 'open' })).some((d) => d.id === t0.decisionId)).toBe(true)
    await recordConfirmation({ companyId: w.firm.id, submissionId: s.id, personId: w.owner.id, heldAs: 'Owner', actingEntityId: w.entity.id, channel: 'PHONE' })
    await track()
    expect((await taskFor(s.id)).state).toBe('CLOSED_BY_ARRIVAL')
    expect(await chaseLetters(s.id)).toHaveLength(0)
    expect((await listDecisions(w.firm.id, { state: 'open' })).some((d) => d.id === t0.decisionId)).toBe(false)
    expect((await prisma.decisionItem.findUniqueOrThrow({ where: { id: t0.decisionId } })).state).toBe('OPEN')
  })

  it('a confirmation tied to the chase letter counts as the confirmation of the submission', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await track()
    const letter = (await chaseLetters(s.id))[0]
    await recordConfirmation({ companyId: w.firm.id, submissionId: s.id, personId: w.owner.id, heldAs: 'Owner', actingEntityId: w.entity.id, channel: 'EMAIL', mailSendId: letter.id })
    const [it] = await trackerItems(w.firm.id, new Date(), s.id)
    expect(it.state).toBe('CONFIRMED')
  })

  it('a submission rejected or withdrawn closes its chase as stopped', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await prisma.submission.update({ where: { id: s.id }, data: { status: 'WITHDRAWN' } })
    await track()
    expect(await chaseLetters(s.id)).toHaveLength(0)
    expect((await taskFor(s.id)).state).toBe('STOPPED')
  })

  it('a chase letter that bounces opens the existing failed delivery card and stops the chase', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    handFails = true
    await track()
    await track()
    expect((await taskFor(s.id)).state).toBe('STOPPED')
    expect(await prisma.decisionItem.count({ where: { companyId: w.firm.id, state: 'OPEN', question: { startsWith: 'Failed delivery: the submission of' }, proofLinks: { array_contains: [{ recordType: 'Person', recordId: s.person.id }] } } })).toBe(1)
  })

  it('the mail door refuses a chase letter sent for a different submission than the one approved', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    const other = await newSubmission()
    const t = await taskFor(s.id)
    const res = await sendMail({ to: other.to, subject: 'x', text: 'x', about: { companyId: w.firm.id, agentKey: TRACK, agentTaskId: t.id, agentAttempt: 1, recordType: 'Submission', recordId: other.id, template: 'submission-chase', chase: true } }, deps as any)
    expect(res.outcome).toBe('REFUSED')
    expect(res.note).toMatch(/approved for another record/)
  })

  it('when the agent is off no chase is proposed and the ledger says why', async () => {
    await setSwitch(TRACK, 'OFF')
    const s = await newSubmission()
    await track()
    expect((await tasks()).filter((x) => x.recordId === s.id)).toHaveLength(0)
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: TRACK, action: 'NOT_RUN' } })).toBeGreaterThan(0)
  })

  it('the chase touches no money and changes no submission, confirmation or register row', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    const count = async () => [await prisma.submissionConfirmation.count(), await prisma.counterparty.count(), await prisma.invoice.count(), await prisma.payment.count(), (await prisma.submission.findUniqueOrThrow({ where: { id: s.id } })).status]
    const before = await count()
    await track(); await age(s.id, 8); await track()
    expect(await count()).toEqual(before)
  })
})

describe('the dormant outreach, on the database', () => {
  // Counterparty rows are old enough to be in last week's census; the last submission sets when each company went quiet.
  const register = (otherCompanyId: string, relationship: string) => prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId, relationship, status: 'ACTIVE', createdAt: day(300) } })
  const quietSince = async (co: any, side: 'CUSTOMER' | 'SUPPLIER', daysAgo: number) => {
    n++
    const job = await prisma.requirement.create({ data: { companyId: w.client.id, title: `Quiet job ${n}`, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: day(-30) } })
    const person = await prisma.person.create({ data: { name: `Quiet Person ${n}`, primaryEmail: `quiet${n}.${tag}@example.invalid` } })
    const ends = side === 'CUSTOMER' ? { fromCompanyId: w.firm.id, toCompanyId: co.id } : { fromCompanyId: co.id, toCompanyId: w.firm.id }
    return prisma.submission.create({ data: { requirementId: job.id, personId: person.id, ...ends, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: day(daysAgo) } })
  }
  const cards = (co: any, prefix: string) => prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: prefix }, proofLinks: { array_contains: [{ recordType: 'Company', recordId: co.id }] } } })
  const mailOut = () => prisma.mailSend.count({ where: { companyId: w.firm.id, template: { not: 'submission' }, recordType: 'Company' } })

  it('a company that turned dormant this week becomes one card holding the draft and the recipient, and no task', async () => {
    await setSwitch(CENSUS, 'ON')
    await register(w.quiet.id, 'CLIENT'); await quietSince(w.quiet, 'CUSTOMER', 92)
    await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: w.quiet.id, name: 'Mina Cho', email: `mina.${tag}@example.invalid`, kind: 'HIRING_MANAGER' } as any })
    const before = await prisma.agentTask.count({ where: { companyId: w.firm.id, agentKey: CENSUS } })
    await census(new Date())
    const c = await cards(w.quiet, 'Check in with customer ')
    expect(c).toHaveLength(1)
    expect(c[0].question).toMatch(/A person sends this; Etyme sent nothing\./)
    expect(c[0].proof).toMatch(`mina.${tag}@example.invalid`)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, agentKey: CENSUS } })).toBe(before)
  })

  it('the dormant outreach never calls the mail door, on drafts only or on', async () => {
    await setSwitch(CENSUS, 'DRAFT_ONLY')
    await census(day(-8))
    await setSwitch(CENSUS, 'ON')
    await census(day(-16))
    expect(await mailOut()).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('a company that stayed dormant from earlier weeks is not drafted for again', async () => {
    expect(await cards(w.quiet, 'Check in with customer ')).toHaveLength(1)
  })

  it('a company asked within the last 180 days is not drafted for again when it flaps', async () => {
    await setSwitch(CENSUS, 'ON')
    await quietSince(w.quiet, 'CUSTOMER', -60) // active again until day 150 from now, dormant again at day 152
    await census(day(-152))
    const line = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' }, orderBy: { createdAt: 'desc' } })
    expect(line.summary).toMatch(/1 change since last week/) // it did go dormant again; the cooling-off alone held the second card
    expect(await cards(w.quiet, 'Check in with customer ')).toHaveLength(1)
  })

  it('a company that is both a customer and a supplier gets a separate card for each side that went quiet', async () => {
    await setSwitch(CENSUS, 'ON')
    await register(w.both.id, 'CLIENT'); await register(w.both.id, 'SUPPLIER')
    // Both sides had their last work 60 days ago, so 32 days on, one week after it was still inside 90 days, both are quiet.
    await quietSince(w.both, 'CUSTOMER', 60); await quietSince(w.both, 'SUPPLIER', 60)
    await census(day(-32))
    expect(await cards(w.both, 'Check in with customer ')).toHaveLength(1)
    expect(await cards(w.both, 'Check in with supplier ')).toHaveLength(1)
  })

  it('a dormant company with no recorded contact gets one card that says so and no letter, and the card is not repeated the next week', async () => {
    await setSwitch(CENSUS, 'ON')
    const c = (await cards(w.both, 'Check in with supplier '))[0]
    expect(c.proof).toMatch(/No one with an email is recorded at Both Ways/)
    await census(day(-39))
    expect(await cards(w.both, 'Check in with supplier ')).toHaveLength(1)
    expect(await mailOut()).toBe(0)
  })

  it('the outreach card is one yes or no that sends nothing, so nothing was written to the register or to the company', async () => {
    const rows = await prisma.counterparty.findMany({ where: { companyId: w.firm.id, otherCompanyId: w.quiet.id } })
    expect(rows.map((r) => r.status)).toEqual(['ACTIVE'])
  })
})
