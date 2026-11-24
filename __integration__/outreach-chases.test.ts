/**
 * Chain 1 of record 112, "Drafts of outreach and chases", on the database
 * through the real runner, the real task record and the real mail ledger:
 * the submission chase (a task, one yes, one letter and one reminder) and
 * the dormant outreach (a task, one yes, one letter with its unsubscribe
 * and the firm's postal address; record 116).
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
import { censusKeeperStep } from '@/lib/agents/census-keeper'
import { openDecision } from '@/lib/decision-items'
import * as unsub from '@/app/api/answer/outreach/[token]/route'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-outreach'
process.env.NEXTAUTH_URL = 'https://etyme.example'
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
const census = (when: Date) => { registerAgent(CENSUS, { ruleVersion: 't', step: (ctx) => censusKeeperStep(ctx, { send: (m) => sendMail(m, deps as any) }) }); return runAgent(CENSUS, w.firm.id, when) }
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
    expect([card.state, card.question]).toEqual(['OPEN', expect.stringMatching(/Candidate \d+ for Job \d+.*These numbers are proposed; the Owner may change them/)])
    expect(card.proof).toMatch(/The letter, to <.+>\.\nSubject: Candidate \d+ for Job \d+/)
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

  it('a contact who unsubscribed from outreach still gets the submission chase at the same address', async () => {
    await setSwitch(TRACK, 'ON')
    const s = await released()
    await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: w.client.id, name: 'Opted Out', email: s.to, kind: 'HIRING_MANAGER', outreachOptOutAt: new Date() } as any })
    await track()
    const row = (await chaseLetters(s.id))[0]
    expect(row.toAddresses).toEqual([s.to])
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
  // Each scenario is a company that turns quiet in its own week: last activity L days ago, run W days on, L + W = 92.
  const register = (otherCompanyId: string, relationship: string) => prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId, relationship, status: 'ACTIVE', createdAt: day(300) } })
  const quietSince = async (co: any, side: 'CUSTOMER' | 'SUPPLIER', daysAgo: number) => {
    n++
    const job = await prisma.requirement.create({ data: { companyId: w.client.id, title: `Quiet job ${n}`, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: day(-30) } })
    const person = await prisma.person.create({ data: { name: `Quiet Person ${n}`, primaryEmail: `quiet${n}.${tag}@example.invalid` } })
    const ends = side === 'CUSTOMER' ? { fromCompanyId: w.firm.id, toCompanyId: co.id } : { fromCompanyId: co.id, toCompanyId: w.firm.id }
    return prisma.submission.create({ data: { requirementId: job.id, personId: person.id, ...ends, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: day(daysAgo) } })
  }
  const newCo = (name: string) => prisma.company.create({ data: { name: `${name} ${tag}`, slug: `x-${name.toLowerCase().replace(/\s/g, '-')}-${tag}`, kind: 'CLIENT' } as any })
  const contactAt = (co: any, name: string, extra: Record<string, unknown> = {}, owner: any = w.firm) =>
    prisma.companyContact.create({ data: { companyId: owner.id, atCompanyId: co.id, name, email: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid`, kind: 'HIRING_MANAGER', ...extra } as any })
  /** A company that goes quiet on the census run W days from now. */
  async function quietOn(name: string, W: number, side: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER') {
    const co = await newCo(name)
    await register(co.id, side === 'CUSTOMER' ? 'CLIENT' : 'SUPPLIER'); await quietSince(co, side, 92 - W)
    return co
  }
  const outreachTasks = (kind = 'DORMANT_OUTREACH_CUSTOMER') => prisma.agentTask.findMany({ where: { companyId: w.firm.id, agentKey: CENSUS, kind }, orderBy: { createdAt: 'asc' } })
  const taskAt = async (contactId: string) => (await outreachTasks()).find((t) => t.recordId === contactId)!
  const cards = (co: any, prefix: string) => prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: prefix }, proofLinks: { array_contains: [{ recordType: 'Company', recordId: co.id }] } } })
  const outreachMail = () => prisma.mailSend.findMany({ where: { companyId: w.firm.id, template: 'dormant-outreach' }, orderBy: { createdAt: 'asc' } })
  const optOut = (token: string, method: 'GET' | 'POST') => (method === 'GET' ? unsub.GET : unsub.POST)(req(method, `/api/answer/outreach/${token}`), p2(token))
  const p2 = (token: string) => ({ params: Promise.resolve({ token }) })
  let token = ''
  let letterText = ''

  beforeAll(async () => {
    await prisma.companyAddress.create({ data: { companyId: w.firm.id, kind: 'LEGAL', street: '12 Mill Road', city: 'Leeds', state: null, postalCode: 'LS1 4AB', country: 'GB' } })
    w.mina = null
  })

  it('a company that turned dormant becomes one task and one card holding the letter and the recipient, and nothing is sent before the yes', async () => {
    await setSwitch(CENSUS, 'ON')
    w.quiet2 = await quietOn('Quiet Co', 0)
    w.mina = await contactAt(w.quiet2, 'Mina Cho')
    await contactAt(w.quiet2, 'Their Own', {}, w.supplier) // another firm's rolodex row at the same company
    await census(new Date())
    const t = await taskAt(w.mina.id)
    expect(t.state).toBe('PROPOSED'); expect(t.recordType).toBe('CompanyContact')
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t.decisionId } })
    expect(card.question).toMatch(/^Check in with customer /); expect(card.question).toMatch(/sends it only if you say yes/)
    expect(card.proof).toMatch(`mina.cho.${tag}@example.invalid`); expect(card.proof).toMatch(/12 Mill Road, Leeds, LS1 4AB, GB/)
    await census(day(-1)); await census(day(-2))
    expect(sent).toHaveLength(0); expect(await outreachMail()).toHaveLength(0)
    expect((await taskAt(w.mina.id)).state).toBe('PROPOSED')
  })

  it('on drafts only the outreach sends nothing even after a yes', async () => {
    await setSwitch(CENSUS, 'DRAFT_ONLY')
    await say((await taskAt(w.mina.id)).decisionId, 'APPROVE')
    await census(day(-3))
    expect(sent).toHaveLength(0); expect(await outreachMail()).toHaveLength(0)
    expect((await taskAt(w.mina.id)).state).toBe('APPROVED')
  })

  it('with room for only one more counted row today, no outreach letter leaves, because the letter and its close are two', async () => {
    const { actsToday } = await import('@/lib/agents/runner')
    await setSwitch(CENSUS, 'ON')
    const when = day(-4)
    const used = await actsToday(w.firm.id, CENSUS, when)
    await prisma.agentSwitch.update({ where: { companyId_agentKey: { companyId: w.firm.id, agentKey: CENSUS } }, data: { dailyCap: used + 1 } })
    await census(when)
    expect(sent).toHaveLength(0); expect(await outreachMail()).toHaveLength(0)
    expect((await taskAt(w.mina.id)).state).toBe('APPROVED')
    await prisma.agentSwitch.update({ where: { companyId_agentKey: { companyId: w.firm.id, agentKey: CENSUS } }, data: { dailyCap: null } })
  })

  it('after the yes, with the agent on, one letter goes to the firm’s own contact and the task closes, and it is never sent again', async () => {
    await setSwitch(CENSUS, 'ON')
    await census(day(-4)); await census(day(-5))
    const rows = await outreachMail()
    expect(rows).toHaveLength(1)
    expect(rows[0].toAddresses).toEqual([`mina.cho.${tag}@example.invalid`]); expect(rows[0].outcome).toBe('SENT')
    expect(rows[0].agentTaskId).toBe((await taskAt(w.mina.id)).id)
    expect(sent).toHaveLength(1)
    letterText = sent[0].text // the stub's list is cleared after each test
    expect((await taskAt(w.mina.id)).state).toBe('DONE')
    // The other firm's contact at that company was never used.
    expect(rows.flatMap((r) => r.toAddresses).join()).not.toMatch(/their\.own/)
  })

  it('every outreach letter carries the unsubscribe link, the sending firm and its postal address, and says what it is in the subject', async () => {
    const text = letterText
    expect(text).toMatch(/https:\/\/etyme\.example\/answer\/outreach\/\S+/)
    expect(text).toContain(`Chase Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    const row = (await outreachMail())[0]
    expect(row.subject).toBe(`Check-in from Chase Firm ${tag}: any jobs coming up?`)
    token = /answer\/outreach\/(\S+)/.exec(text)![1]
  })

  it('opening the unsubscribe link changes nothing, and pressing the button needs no sign-in and sets the opt-out', async () => {
    delete process.env.DEV_BYPASS_AUTH
    const view = await optOut(token, 'GET')
    expect(view.status).toBe(200)
    expect((await view.json()).data).toEqual({ firm: `Chase Firm ${tag}`, already: false })
    expect((await prisma.companyContact.findUniqueOrThrow({ where: { id: w.mina.id } })).outreachOptOutAt).toBeNull()
    const done = await optOut(token, 'POST')
    expect(done.status).toBe(200)
    expect((await done.json()).data.says).toBe(`Chase Firm ${tag} will send you no more outreach. Messages about work already agreed, such as timesheets and bills, still reach you.`)
    expect((await prisma.companyContact.findUniqueOrThrow({ where: { id: w.mina.id } })).outreachOptOutAt).not.toBeNull()
  })

  it('a second use of the link is harmless: the same sentence, the same time, one ledger row', async () => {
    const first = (await prisma.companyContact.findUniqueOrThrow({ where: { id: w.mina.id } })).outreachOptOutAt
    const again = await optOut(token, 'POST')
    expect(again.status).toBe(200)
    expect((await prisma.companyContact.findUniqueOrThrow({ where: { id: w.mina.id } })).outreachOptOutAt).toEqual(first)
    const lines = await prisma.recordAction.findMany({ where: { companyId: w.firm.id, recordType: 'Company', recordId: w.mina.atCompanyId, action: 'OUTREACH_UNSUBSCRIBED' } })
    expect(lines).toHaveLength(1)
    expect(lines[0].summary).toMatch(/Chases and bills are not affected/)
    expect((await (await optOut(token, 'GET')).json()).data.already).toBe(true)
  })

  it('a link that was altered is refused in a sentence and changes nobody', async () => {
    const res = await optOut(`${token}x`, 'POST')
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toMatch(/not valid/)
  })

  it('the token is in no ledger row, no card, no mail row and no reply of the route', async () => {
    const bodies = [JSON.stringify(await (await optOut(token, 'GET')).json()), JSON.stringify(await (await optOut(token, 'POST')).json()), JSON.stringify(await (await optOut(`${token}x`, 'POST')).json())]
    const ledger = JSON.stringify(await prisma.recordAction.findMany({ where: { companyId: w.firm.id } }))
    const decisions = JSON.stringify(await prisma.decisionItem.findMany({ where: { companyId: w.firm.id } }))
    const mail = JSON.stringify(await prisma.mailSend.findMany({ where: { companyId: w.firm.id } }))
    const tasks = JSON.stringify(await prisma.agentTask.findMany({ where: { companyId: w.firm.id } }))
    const secret = token.split('.')[1]
    for (const where of [...bodies, ledger, decisions, mail, tasks]) { expect(where).not.toContain(token); expect(where).not.toContain(secret) }
  })

  it('a contact who unsubscribed gets no task, and the card says so once', async () => {
    const co = await quietOn('Opted Co', 8)
    await contactAt(co, 'Olive Out', { outreachOptOutAt: new Date() })
    await census(day(-8))
    const c = await cards(co, 'Check in with customer ')
    expect(c).toHaveLength(1)
    expect(c[0].proof).toMatch(/asked .* for no more check-in letters/)
    expect((await outreachTasks()).length).toBe(1)
    await census(day(-9)); await census(day(-16))
    expect(await cards(co, 'Check in with customer ')).toHaveLength(1)
  })

  it('an address whose outreach letter bounced gets no task, and the card says to record a new address', async () => {
    const co = await quietOn('Bounced Co', 24)
    const c = await contactAt(co, 'Bo Bounce')
    await prisma.mailSend.create({ data: { companyId: w.firm.id, recordType: 'CompanyContact', recordId: c.id, fromAddress: 'hello@etyme.example', toAddresses: [c.email!.toUpperCase()], bccAddresses: [], subject: 'Check-in', template: 'dormant-outreach', templateVersion: '1', outcome: 'FAILED_DELIVERY', note: 'Mailbox does not exist' } })
    await census(day(-24))
    expect((await cards(co, 'Check in with customer '))[0].proof).toMatch(/did not receive the last check-in letter/)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, recordId: c.id } })).toBe(0)
  })

  it('a company where only another firm recorded a contact gets no task and no letter', async () => {
    const co = await quietOn('Theirs Co', 32)
    await contactAt(co, 'Not Ours', {}, w.supplier)
    await census(day(-32))
    expect((await cards(co, 'Check in with customer '))[0].proof).toMatch(/No one with an email is recorded at/)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, kind: 'DORMANT_OUTREACH_CUSTOMER', recordId: (await prisma.companyContact.findFirstOrThrow({ where: { atCompanyId: co.id } })).id } })).toBe(0)
  })

  it('a contact who unsubscribes between the yes and the send is not written to', async () => {
    const before = (await outreachMail()).length
    const co = await quietOn('Late Co', 40)
    const c = await contactAt(co, 'Lee Late')
    await census(day(-40))
    await say((await taskAt(c.id)).decisionId, 'APPROVE')
    await prisma.companyContact.update({ where: { id: c.id }, data: { outreachOptOutAt: new Date() } })
    await census(day(-41))
    const t = await taskAt(c.id)
    expect(t.state).toBe('STOPPED'); expect(t.closedReason).toMatch(/asked for no more outreach/)
    expect((await outreachMail()).length).toBe(before)
  })

  it('a company that is both a customer and a supplier gets a separate task for each side that went quiet', async () => {
    const co = await newCo('Both Ways')
    await register(co.id, 'CLIENT'); await register(co.id, 'SUPPLIER')
    await quietSince(co, 'CUSTOMER', 92 - 48); await quietSince(co, 'SUPPLIER', 92 - 48)
    const hm = await contactAt(co, 'Hana Hire'); const rc = await contactAt(co, 'Ravi Recruit', { kind: 'RECRUITING' })
    await census(day(-48))
    expect((await outreachTasks('DORMANT_OUTREACH_CUSTOMER')).some((t) => t.recordId === hm.id)).toBe(true)
    expect((await outreachTasks('DORMANT_OUTREACH_SUPPLIER')).some((t) => t.recordId === rc.id)).toBe(true)
  })

  it('a company asked within the last 180 days, by an old draft card or by a task, is not written to again when it flaps', async () => {
    const before = (await outreachTasks()).length
    await quietSince(w.quiet2, 'CUSTOMER', -60) // active again until day 150 from now, dormant again at day 152
    await census(day(-152))
    const line = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' }, orderBy: { createdAt: 'desc' } })
    expect(line.summary).toMatch(/1 change since last week/)
    expect((await outreachTasks()).length).toBe(before)
    // An old draft card from before the outreach could send counts the same way.
    const co = await quietOn('Cool Co', 160)
    await contactAt(co, 'Cora Cool')
    await openDecision({ companyId: w.firm.id, personId: w.owner.id, heldAs: 'Account Manager', actingEntityId: w.entity.id, question: `Check in with customer ${co.name}: nothing. Etyme drafted a check-in letter.`, ownerPersonId: w.owner.id, openedOn: day(-100), proof: 'old', proofLinks: [{ recordType: 'Company', recordId: co.id }] }, day(-100))
    await census(day(-160))
    expect((await outreachTasks()).length).toBe(before)
  })

  it('a firm with no postal address gets no task and a card that says to add it in Settings', async () => {
    await prisma.companyAddress.deleteMany({ where: { companyId: w.firm.id } })
    const co = await quietOn('Addressless Co', 176)
    const c = await contactAt(co, 'Ann Address')
    await census(day(-176))
    expect((await cards(co, 'Check in with customer '))[0].proof).toMatch(/Add the firm's address in Settings/)
    expect(await prisma.agentTask.count({ where: { companyId: w.firm.id, recordId: c.id } })).toBe(0)
  })
})
