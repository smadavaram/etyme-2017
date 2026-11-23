/**
 * Chain 1 of record 112, "Win work", on the database through the real
 * runner and the real routes: the confirmation tracker (submissions out
 * against confirmations in) and the census keeper (customers and suppliers,
 * active against dormant). Builds its own firm on reserved domains.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { confirmationTrackerAgent, recordConfirmation, trackerItems } from '@/lib/agents/confirmation-tracker'
import { censusKeeperAgent } from '@/lib/agents/census-keeper'
import * as confirmations from '@/app/api/bench/submission-confirmations/route'
import * as item from '@/app/api/decision-items/[id]/route'
import { decideBody } from '@/lib/decision-queue'

const tag = `wn${Date.now()}`
const w: Record<string, any> = {}
const TRACK = 'confirmation-tracker'
const CENSUS = 'census-keeper'
const mail = (n: string) => `${n}.${tag}@example.invalid`
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const p = (id: string) => ({ params: Promise.resolve({ id }) })

const setSwitch = (agentKey: string, state: 'OFF' | 'DRAFT_ONLY' | 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey } },
  update: { state }, create: { companyId: w.firm.id, agentKey, state, changedById: w.owner.id },
})
const track = (when = new Date()) => { registerAgent(TRACK, confirmationTrackerAgent); return runAgent(TRACK, w.firm.id, when) }
const census = (when: Date) => { registerAgent(CENSUS, censusKeeperAgent); return runAgent(CENSUS, w.firm.id, when) }
const post = async (seat: any, body: unknown) => {
  as(seat.email)
  return json(await confirmations.POST(req('POST', '/api/bench/submission-confirmations', body, { 'x-context-id': seat.ctx })))
}
const stateOf = async (seat: any, id: string) => {
  as(seat.email)
  return json(await confirmations.GET(req('GET', `/api/bench/submission-confirmations?submissionId=${id}`, undefined, { 'x-context-id': seat.ctx })))
}
const cardsStarting = (prefix: string) => prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { startsWith: prefix } }, orderBy: { createdAt: 'asc' } })
const say = async (seat: any, decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(seat.email)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id), { 'x-context-id': seat.ctx }), p(decisionId)))
}
const submit = (requirementId: string, personId: string, checkState: string) => prisma.submission.create({
  data: { requirementId, personId, fromCompanyId: w.firm.id, toCompanyId: w.client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState },
})

beforeAll(async () => {
  await resetDatabase()
  const co = (name: string, kind: string) => prisma.company.create({ data: { name: `${name} ${tag}`, slug: `${name.toLowerCase().replace(/\s/g, '-')}-${tag}`, kind } as any })
  w.firm = await co('Win Firm', 'VENDOR'); w.client = await co('Win Client', 'CLIENT'); w.other = await co('Other Firm', 'VENDOR')
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Win Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const roles = { owner: await role('Owner', ['*']), am: await role('Account Manager', ['submissions.read', 'submissions.create']), hr: await role('HR', ['submissions.read']) }
  const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: mail(n.toLowerCase().replace(/\s/g, '.')) } })
  const seat = async (name: string, r: any) => {
    const x = await person(name)
    const c = await prisma.context.create({ data: { personId: x.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: r.id } as any })
    return { ...x, email: x.primaryEmail, ctx: c.id }
  }
  w.owner = await seat('Dana Owner', roles.owner); w.am = await seat('Oli Manager', roles.am); w.hr = await seat('Hana Hiring', roles.hr)
  w.cara = await person('Cara Client')
  await prisma.context.create({ data: { personId: w.cara.id, companyId: w.client.id, type: 'EMPLOYEE' } as any })
  w.priya = await person('Priya Nair'); w.tom = await person('Tom Ruiz')

  const job = (companyId: string, title: string) => prisma.requirement.create({
    data: { companyId, title, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: d('2026-12-07') },
  })
  w.analyst = await job(w.client.id, 'Analyst'); w.de1 = await job(w.client.id, 'Data Engineer'); w.de2 = await job(w.client.id, 'Data Engineer')
  w.otherJob = await job(w.client.id, 'Planner'); w.pe = await job(w.client.id, 'Platform Engineer'); w.sa = await job(w.client.id, 'Support Analyst')

  w.s1 = await submit(w.analyst.id, w.priya.id, 'SENT')   // confirmed by a person
  w.s2 = await submit(w.analyst.id, w.tom.id, 'READY')    // a draft: never confirmed
  w.s3 = await submit(w.de1.id, w.priya.id, 'SENT')       // the same person, the same job ...
  w.s4 = await submit(w.de2.id, w.priya.id, 'SENT')       // ... twice
  w.s5 = await submit(w.pe.id, w.tom.id, 'SENT')         // its letter bounced
  w.s6 = await submit(w.sa.id, w.tom.id, 'SENT')         // the client already replied on Etyme
  w.sOther = await prisma.submission.create({ data: { requirementId: w.otherJob.id, personId: w.tom.id, fromCompanyId: w.other.id, toCompanyId: w.client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT' } })

  await prisma.mailSend.create({ data: { companyId: w.firm.id, recordType: 'Submission', recordId: w.s5.id, fromAddress: 'hello@etyme.example', toAddresses: ['x@example.invalid'], bccAddresses: [], subject: 'Tom Ruiz for Platform Engineer', template: 'submission', templateVersion: '1', outcome: 'FAILED_DELIVERY', note: 'Mailbox full' } })
  const thread = await prisma.conversation.create({
    data: { companyId: w.client.id, withCompanyId: w.firm.id, topic: 'SUBMISSION', topicId: w.s6.id, participants: [] } as any,
  })
  await prisma.message.create({ data: { conversationId: thread.id, authorId: w.cara.id, body: 'Can Tom do Tuesday at 10?', type: 'INTERVIEW' } })
}, 600_000)
afterEach(() => { unregisterAgent(TRACK); unregisterAgent(CENSUS) })

describe('a person recording that the other side confirmed a submission', () => {
  it('a draft submission cannot be confirmed, and the refusal says a draft is not a confirmation', async () => {
    const out = await post(w.am, { submissionId: w.s2.id, channel: 'PHONE' })
    expect(out.status).toBe(422)
    expect(out.body.error.message).toMatch(/draft is not a confirmation/)
    expect(await prisma.submissionConfirmation.count({ where: { submissionId: w.s2.id } })).toBe(0)
  })

  it('a seat that only reads submissions cannot record a confirmation', async () => {
    const out = await post(w.hr, { submissionId: w.s1.id, channel: 'PHONE' })
    expect(out.status).toBe(403)
  })

  it('another firm’s submission is not found, and nothing is written', async () => {
    const out = await post(w.am, { submissionId: w.sOther.id, channel: 'PHONE' })
    expect(out.status).toBe(422)
    expect(await prisma.submissionConfirmation.count({ where: { submissionId: w.sOther.id } })).toBe(0)
  })

  it('a confirmation names how it was confirmed, or is refused in a sentence', async () => {
    const out = await post(w.am, { submissionId: w.s1.id, channel: 'SMOKE' })
    expect(out.status).toBe(422)
    expect(out.body.error.message).toMatch(/email, phone, portal or manual/)
  })

  it('a confirmation by phone is recorded with its ledger row, and the submission then reads confirmed', async () => {
    const out = await post(w.am, { submissionId: w.s1.id, channel: 'PHONE', note: 'Cara said it is with the hiring manager.', actingEntityId: w.entity.id })
    expect(out.status).toBe(201)
    const row = await prisma.submissionConfirmation.findFirstOrThrow({ where: { submissionId: w.s1.id } })
    expect([row.channel, row.confirmedByPersonId]).toEqual(['PHONE', w.am.id])
    const act = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, recordType: 'SubmissionConfirmation', recordId: row.id, action: 'CONFIRMATION_RECORDED' } })
    expect([act.personId, act.agentKey]).toEqual([w.am.id, null])
    expect((await stateOf(w.hr, w.s1.id)).body.data.state).toBe('CONFIRMED')
  })

  it('a second confirmation of the same submission is refused', async () => {
    const out = await post(w.am, { submissionId: w.s1.id, channel: 'EMAIL', actingEntityId: w.entity.id })
    expect(out.status).toBe(422)
    expect(out.body.error.message).toMatch(/already confirmed/)
  })
})

describe('the confirmation tracker, on drafts only', () => {
  it('an agent that is off tracks nothing and opens no card', async () => {
    const out = await track()
    expect(out.ran).toBe(false)
    expect(await prisma.decisionItem.count({ where: { companyId: w.firm.id } })).toBe(0)
  })

  it('the same person put forward twice for the same job opens two cards for two different people, and records nothing', async () => {
    await setSwitch(TRACK, 'DRAFT_ONLY')
    const out = await track()
    expect(out.ran).toBe(true)
    const cards = await cardsStarting('Two authorizations for ')
    expect(cards).toHaveLength(2)
    expect(new Set(cards.map((c) => c.ownerPersonId))).toEqual(new Set([w.am.id, w.owner.id]))
    expect(cards[0].question).toMatch(/Priya Nair on Data Engineer/)
  })

  it('both submissions of a double authorization are on hold and take no confirmation', async () => {
    expect((await stateOf(w.am, w.s3.id)).body.data.state).toBe('BLOCKED')
    const out = await post(w.am, { submissionId: w.s4.id, channel: 'PHONE', actingEntityId: w.entity.id })
    expect(out.status).toBe(422)
    expect(out.body.error.message).toMatch(/Two different people/)
  })

  it('a letter that bounced reopens its submission as failed delivery, with one card owed by the Account Manager', async () => {
    expect((await stateOf(w.am, w.s5.id)).body.data.state).toBe('FAILED_DELIVERY')
    const cards = await cardsStarting('Failed delivery: ')
    expect(cards).toHaveLength(1)
    expect(cards[0].ownerPersonId).toBe(w.am.id)
    expect(cards[0].question).toMatch(/Tom Ruiz for Platform Engineer/)
  })

  it('a reply Etyme already holds is found but not recorded while the agent is on drafts only', async () => {
    expect(await prisma.submissionConfirmation.count({ where: { submissionId: w.s6.id } })).toBe(0)
    const act = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, recordId: w.tom.id, action: 'CONFIRMATION_FOUND_NOT_RECORDED' } })
    expect(act.summary).toMatch(/Cara Client replied/)
    expect(act.agentKey).toBe(TRACK)
  })

  it('the week’s tally is one ledger line that counts every state', async () => {
    const acts = await prisma.recordAction.findMany({ where: { companyId: w.firm.id, action: 'WEEKLY_TALLY' } })
    expect(acts).toHaveLength(1)
    expect(acts[0].summary).toMatch(/Submissions out 5: confirmed 1, awaiting 1 .*failed delivery 1, on hold 2/)
  })

  it('a second run the same day opens no second card and no second line', async () => {
    const before = [await prisma.decisionItem.count({ where: { companyId: w.firm.id } }), await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: TRACK } })]
    await track()
    expect([await prisma.decisionItem.count({ where: { companyId: w.firm.id } }), await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: TRACK } })]).toEqual(before)
  })

  it('the tracker sends nothing: no letter was written to the mail ledger by an agent', async () => {
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id, agentKey: TRACK } })).toBe(0)
  })
})

describe('the dual authorization, released only by two different people', () => {
  it('one yes does not lift the hold', async () => {
    const [first] = await cardsStarting('Two authorizations for ')
    const owner = first.ownerPersonId === w.am.id ? w.am : w.owner
    expect((await say(owner, first.id, 'APPROVE')).status).toBe(200)
    expect((await stateOf(w.am, w.s3.id)).body.data.state).toBe('BLOCKED')
  })

  it('a no from the second person leaves the hold standing', async () => {
    const [, second] = await cardsStarting('Two authorizations for ')
    const owner = second.ownerPersonId === w.am.id ? w.am : w.owner
    expect((await say(owner, second.id, 'REJECT')).status).toBe(200)
    expect((await stateOf(w.am, w.s4.id)).body.data.state).toBe('BLOCKED')
  })
})

describe('the confirmation tracker, on', () => {
  it('a reply the client already put on the submission’s thread is matched and recorded as a portal confirmation', async () => {
    await setSwitch(TRACK, 'ON')
    await track()
    const row = await prisma.submissionConfirmation.findFirstOrThrow({ where: { submissionId: w.s6.id } })
    expect(row.channel).toBe('PORTAL')
    expect(row.note).toMatch(/Cara Client replied on Etyme/)
    const act = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, recordType: 'SubmissionConfirmation', recordId: row.id, action: 'CONFIRMATION_MATCHED' } })
    expect(act.agentKey).toBe(TRACK)
  })

  it('a plain reply with no interview and no rate proves nothing', async () => {
    const thread = await prisma.conversation.create({ data: { companyId: w.client.id, withCompanyId: w.firm.id, topic: 'SUBMISSION', topicId: w.s3.id, participants: [] } as any })
    await prisma.message.create({ data: { conversationId: thread.id, authorId: w.cara.id, body: 'Thanks!', type: 'TEXT' } })
    await track()
    expect(await prisma.submissionConfirmation.count({ where: { submissionId: w.s3.id } })).toBe(0)
  })

  it('a bounce after a confirmation reopens the confirmed submission as failed delivery with a card', async () => {
    await new Promise((r) => setTimeout(r, 20))
    await prisma.mailSend.create({ data: { companyId: w.firm.id, recordType: 'Submission', recordId: w.s1.id, fromAddress: 'hello@etyme.example', toAddresses: ['x@example.invalid'], bccAddresses: [], subject: 'Priya Nair for Analyst', template: 'submission', templateVersion: '1', outcome: 'FAILED_DELIVERY' } })
    expect((await stateOf(w.am, w.s1.id)).body.data.state).toBe('FAILED_DELIVERY')
    await track()
    const cards = await cardsStarting('Failed delivery: ')
    expect(cards.filter((c) => /Priya Nair for Analyst/.test(c.question))).toHaveLength(1)
  })

  it('a firm’s tracker reads only that firm’s own submissions', async () => {
    const items = await trackerItems(w.firm.id)
    expect(items.map((i) => i.fact.id)).not.toContain(w.sOther.id)
  })

  it('recording a confirmation for a submission on hold is refused even by the library', async () => {
    await expect(recordConfirmation({ companyId: w.firm.id, submissionId: w.s4.id, personId: w.am.id, heldAs: 'Account Manager', actingEntityId: w.entity.id, channel: 'PHONE' }))
      .rejects.toThrow(/Two different people/)
  })
})

describe('the dual authorization lifts when two different people say yes', () => {
  it('two approved cards from two different people release both submissions', async () => {
    // The second card was refused above; it is set to approved directly, since a decided card cannot be decided twice.
    const cards = await cardsStarting('Two authorizations for ')
    const rejected = cards.find((c) => c.state === 'REJECTED')!
    await prisma.decisionItem.update({ where: { id: rejected.id }, data: { state: 'APPROVED', decidedByPersonId: rejected.ownerPersonId, decidedAt: new Date() } })
    expect((await stateOf(w.am, w.s3.id)).body.data.state).not.toBe('BLOCKED')
    expect((await stateOf(w.am, w.s4.id)).body.data.state).toBe('AWAITING')
  })
})

describe('the census keeper', () => {
  const NOW = new Date('2026-11-23T12:00:00Z')
  beforeAll(async () => {
    const reg = async (name: string, relationship: string, status = 'ACTIVE') => {
      const c = await prisma.company.create({ data: { name: `${name} ${tag}`, slug: `${name.toLowerCase()}-${tag}`, kind: 'CLIENT' } as any })
      await prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId: c.id, relationship, status, createdAt: d('2026-01-01') } })
      return c
    }
    w.northwind = await reg('Northwind', 'CLIENT'); w.bluebell = await reg('Bluebell', 'CLIENT'); w.quill = await reg('Quill', 'SUPPLIER'); w.prospect = await reg('Prospect', 'CLIENT', 'PROSPECT')
    // Northwind: an old contract and a submission long ago. Bluebell: a contract running today. Quill: a bill 93 days ago, so it went quiet this week.
    w.oldSell = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.northwind.id, personId: w.priya.id, billRate: 9_000, startDate: d('2025-01-01'), endDate: d('2025-06-30'), state: 'ENDED' } })
    await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.bluebell.id, personId: w.tom.id, billRate: 9_500, startDate: d('2026-02-01'), state: 'IN_PROGRESS' } })
    await prisma.vendorBill.create({ data: { companyId: w.firm.id, vendorCompanyId: w.quill.id, number: `QB-${tag}`, receivedAt: d('2026-08-22'), dueAt: d('2026-09-22'), totalCents: 100_000, currency: 'USD' } })
  })

  it('an agent that is off writes no census', async () => {
    const out = await census(NOW)
    expect(out.ran).toBe(false)
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' } })).toBe(0)
  })

  it('the weekly list counts customers and suppliers as active or dormant and names the dormant ones', async () => {
    await setSwitch(CENSUS, 'DRAFT_ONLY')
    await census(NOW)
    const line = (await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' } })).summary
    expect(line).toMatch(/2 customers \(1 active, 1 dormant\), 1 supplier \(0 active, 1 dormant\)/)
    expect(line).toMatch(/Dormant now: Northwind .*, Quill /)
    expect(line).toMatch(/a proposal/)
  })

  it('a company still only a prospect is not on the census', async () => {
    const line = (await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' } })).summary
    expect(line).not.toMatch(/Prospect/)
  })

  it('one card a week says who moved, owed by the Account Manager, with the proposal said as one', async () => {
    const cards = await cardsStarting('Weekly census: ')
    expect(cards).toHaveLength(1)
    expect(cards[0].ownerPersonId).toBe(w.am.id)
    expect(cards[0].proof).toMatch(/Quill .* went dormant as a supplier: last activity 2026-08-22/)
    expect(cards[0].proof).toMatch(/a proposal/)
  })

  it('a second run in the same week writes no second list and no second card', async () => {
    await census(new Date('2026-11-24T12:00:00Z'))
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' } })).toBe(1)
    expect(await cardsStarting('Weekly census: ')).toHaveLength(1)
  })

  it('the census edits no money field and deletes nothing', async () => {
    expect(Number((await prisma.sellContract.findUniqueOrThrow({ where: { id: w.oldSell.id } })).billRate)).toBe(9_000)
    expect((await prisma.counterparty.findMany({ where: { companyId: w.firm.id } })).map((c) => c.status).sort()).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE', 'PROSPECT'])
    expect(await prisma.vendorBill.count({ where: { companyId: w.firm.id } })).toBe(1)
  })

  it('a week with nothing moved writes the list and no card', async () => {
    await census(new Date('2026-12-01T12:00:00Z'))
    expect(await prisma.recordAction.count({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' } })).toBe(2)
    const second = (await prisma.recordAction.findMany({ where: { companyId: w.firm.id, action: 'CENSUS_WEEKLY' }, orderBy: { createdAt: 'desc' } }))[0]
    expect(second.summary).toMatch(/No change since last week/)
    expect(await cardsStarting('Weekly census: ')).toHaveLength(1)
  })
})
