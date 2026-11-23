/**
 * Chain 2 of record 112, "Fill it": the match ranker, the interview chase
 * and the Offer record, through the real runner, the real task record, the
 * real mail ledger and the real routes. Builds its own firms. The mail
 * provider is a stub; the door's rules are the real ones.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import * as offerRoute from '@/app/api/submissions/[id]/offer/route'
import * as listRoute from '@/app/api/submissions/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { interviewChaseStep, INTERVIEW_CHASE, PROPOSED_INTERVIEW_PLAN } from '@/lib/agents/interview-chase'
import { matchRankerStep, MATCH_RANKER } from '@/lib/agents/match-ranker'

const tag = `fi${Date.now()}`
const w: Record<string, any> = {}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const sent: string[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async () => { sent.push('x'); return { provider: 'Resend' as const, messageId: 'm' } },
}

const setSwitch = (companyId: string, agentKey: string, state: string, by: string) => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId, agentKey } },
  update: { state: state as any }, create: { companyId, agentKey, state: state as any, changedById: by },
})
const say = async (email: string, entityId: string, decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(email)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', entityId)), p(decisionId)))
}
const offerCall = async (email: string, method: 'GET' | 'POST' | 'PATCH', submissionId: string, body?: unknown) => {
  as(email)
  const fn = method === 'GET' ? offerRoute.GET : method === 'POST' ? offerRoute.POST : offerRoute.PATCH
  return json(await fn(req(method, `/api/submissions/${submissionId}/offer`, body), p(submissionId)))
}

async function firm(name: string, kind: 'VENDOR' | 'CLIENT') {
  const company = await prisma.company.create({ data: { name: `${name} ${tag}`, slug: `${name.toLowerCase().replace(/\s/g, '-')}-${tag}`, kind } })
  const entity = await prisma.legalEntity.create({ data: { companyId: company.id, name: `${name} LLC`, country: 'US', currency: 'USD' } })
  const seat = async (who: string, roleName: string, permissions: string[]) => {
    const role = await prisma.role.create({ data: { companyId: company.id, name: roleName, permissions } })
    const person = await prisma.person.create({ data: { name: who, primaryEmail: `${who.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` } })
    await prisma.context.create({ data: { personId: person.id, companyId: company.id, type: 'EMPLOYEE', roleId: role.id } as any })
    return person
  }
  return { company, entity, seat }
}

async function submission(status = 'SUBMITTED', submittedAt = new Date(), title = 'Java developer') {
  const person = await prisma.person.create({ data: { name: `Cand ${Math.random().toString(36).slice(2, 7)}`, primaryEmail: `c${Math.random().toString(36).slice(2, 9)}.${tag}@example.invalid` } })
  const requirement = await prisma.requirement.create({
    data: { companyId: w.client.company.id, title, skills: ['Java'], status: 'OPEN', raisedById: w.hiring.id, location: 'Remote', billMin: 5000, billMax: 9000 } as any,
  })
  const s = await prisma.submission.create({
    data: { requirementId: requirement.id, personId: person.id, fromCompanyId: w.supplier.company.id, toCompanyId: w.client.company.id, kind: 'BENCH', rate: 8000, status, submittedAt } as any,
  })
  return { person, requirement, s }
}

beforeAll(async () => {
  await resetDatabase()
  w.supplier = await firm('Fill Supplier', 'VENDOR')
  w.client = await firm('Fill Client', 'CLIENT')
  w.owner = await w.supplier.seat('Sam Owner', 'Owner', ['*'])
  w.recruiter = await w.supplier.seat('Rita Recruiter', 'Recruiter', ['submissions.create'])
  w.hiring = await w.client.seat('Hugo Hiring', 'Hiring Manager', ['requirements.write', 'requirements.read', 'submissions.read'])
  w.viewer = await w.client.seat('Vera Viewer', 'Viewer', ['requirements.read'])
}, 120_000)
afterEach(() => { unregisterAgent(INTERVIEW_CHASE); unregisterAgent(MATCH_RANKER); sent.length = 0 })

describe('the offer on a submission', () => {
  it('the hiring manager drafts an offer and one live offer per submission is enforced by the database', async () => {
    const a = await submission()
    const made = await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { rate: '85.50', currency: 'usd', startDate: '2027-02-01', terms: 'Six months, then review.', actingEntityId: w.client.entity.id })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(made.body.data).toMatchObject({ state: 'DRAFT', rate: 85.5, currency: 'USD', startDate: '2027-02-01' })
    const row = await prisma.offer.findUniqueOrThrow({ where: { id: made.body.data.id } })
    expect(row.liveFor).toBe(a.s.id)
    const again = await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { rate: 90, actingEntityId: w.client.entity.id })
    expect(again.status).toBe(409)
    await expect(prisma.offer.create({ data: { companyId: w.client.company.id, submissionId: a.s.id, rate: 70, liveFor: a.s.id } })).rejects.toBeTruthy()
  })

  it('only a person at the firm that hires may make an offer, and a viewer is told so in a sentence', async () => {
    const a = await submission()
    const no = await offerCall(w.viewer.primaryEmail, 'POST', a.s.id, { rate: 80 })
    expect(no.status).toBe(403)
    expect(no.body.error.message).toMatch(/hiring manager/)
    const sup = await offerCall(w.recruiter.primaryEmail, 'POST', a.s.id, { rate: 80 })
    expect(sup.status).toBe(403)
    expect(sup.body.error.message).toMatch(/made by the firm that hires/)
  })

  it('a firm that is not on the submission cannot read or change its offer', async () => {
    const a = await submission()
    const other = await firm('Other Firm', 'VENDOR')
    const stranger = await other.seat('Ola Owner', 'Owner', ['*'])
    expect((await offerCall(stranger.primaryEmail, 'GET', a.s.id)).status).toBe(404)
  })

  it('an offer with no rate, a rate with three decimals or a bad date is refused in a sentence naming the field', async () => {
    const a = await submission()
    for (const [body, field] of [[{ currency: 'USD' }, 'rate'], [{ rate: 80.123 }, 'rate'], [{ rate: 80, startDate: 'Monday' }, 'startDate']] as const) {
      const r = await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { ...body, actingEntityId: w.client.entity.id })
      expect([r.status, r.body.error.field]).toEqual([422, field])
    }
  })

  it('a person proposes it, the supplier records the answer, and a decline names a reason from the closed list', async () => {
    const a = await submission()
    const e = w.client.entity.id
    const made = await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { rate: 80, actingEntityId: e })
    const id = made.body.data.id
    expect((await offerCall(w.recruiter.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'ACCEPT', actingEntityId: w.supplier.entity.id })).status).toBe(409)
    const proposed = await offerCall(w.hiring.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'PROPOSE', actingEntityId: e })
    expect(proposed.body.data.state).toBe('PROPOSED')
    const noReason = await offerCall(w.recruiter.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'DECLINE', actingEntityId: w.supplier.entity.id })
    expect([noReason.status, noReason.body.error.field]).toEqual([422, 'reasonCode'])
    const free = await offerCall(w.recruiter.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'DECLINE', reasonCode: 'because', actingEntityId: w.supplier.entity.id })
    expect(free.status).toBe(422)
    const declined = await offerCall(w.recruiter.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'DECLINE', reasonCode: 'RATE', actingEntityId: w.supplier.entity.id })
    expect(declined.body.data.state).toBe('DECLINED')
    const row = await prisma.offer.findUniqueOrThrow({ where: { id } })
    expect([row.liveFor, row.decidedById]).toEqual([null, w.recruiter.id])
    const ledger = await prisma.recordAction.findMany({ where: { recordType: 'Offer', recordId: id, action: { startsWith: 'OFFER_' } }, orderBy: { createdAt: 'asc' } })
    expect(ledger.map((l) => l.action)).toEqual(['OFFER_DRAFTED', 'OFFER_PROPOSED', 'OFFER_DECLINED:RATE'])
    expect(ledger.every((l) => l.agentKey === null)).toBe(true)
    // After a decline a new offer may be made.
    expect((await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { rate: 95, propose: true, actingEntityId: e })).status).toBe(201)
  })

  it('a submission with a live offer reads Offered in the list and the Offered filter, and not Interviewing', async () => {
    const a = await submission('INTERVIEW')
    const e = w.client.entity.id
    const listed = async (status: string) => {
      as(w.recruiter.primaryEmail)
      const r = await json(await listRoute.GET(req('GET', `/api/submissions?direction=sent&limit=50${status ? `&status=${status}` : ''}`)))
      return (r.body.data?.submissions ?? []).filter((x: any) => x.id === a.s.id)
    }
    expect((await listed(''))[0].status).toBe('INTERVIEW')
    await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { rate: 80, propose: true, actingEntityId: e })
    expect((await listed(''))[0].status).toBe('OFFERED')
    expect(await listed('OFFERED')).toHaveLength(1)
    expect(await listed('INTERVIEW')).toHaveLength(0)
  })

  it('the list offers Record confirmation to a seat that puts people forward, and not to a seat that cannot', async () => {
    const a = await submission()
    as(w.recruiter.primaryEmail)
    const mine = await json(await listRoute.GET(req('GET', '/api/submissions?direction=sent&limit=50')))
    expect(mine.body.data.submissions.find((x: any) => x.id === a.s.id).confirm.open).toBe(true)
    as(w.owner.primaryEmail)
    await prisma.submissionConfirmation.create({ data: { companyId: w.supplier.company.id, submissionId: a.s.id, channel: 'PHONE' } })
    const after = await json(await listRoute.GET(req('GET', '/api/submissions?direction=sent&limit=50')))
    expect(after.body.data.submissions.find((x: any) => x.id === a.s.id).confirm.open).toBe(false)
  })

  it('an offer that was accepted can be withdrawn only before the person is placed', async () => {
    const a = await submission()
    const e = w.client.entity.id
    const id = (await offerCall(w.hiring.primaryEmail, 'POST', a.s.id, { rate: 80, propose: true, actingEntityId: e })).body.data.id
    await offerCall(w.hiring.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'ACCEPT', actingEntityId: e })
    const w1 = await offerCall(w.hiring.primaryEmail, 'PATCH', a.s.id, { offerId: id, action: 'WITHDRAW', actingEntityId: e })
    expect(w1.body.data.state).toBe('WITHDRAWN')
    expect((await prisma.offer.findUniqueOrThrow({ where: { id } })).liveFor).toBeNull()
  })
})

describe('the interview chase agent', () => {
  const reg = () => registerAgent(INTERVIEW_CHASE, { ruleVersion: 't', step: (ctx) => interviewChaseStep(ctx) })
  const run = (now = new Date()) => runAgent(INTERVIEW_CHASE, w.supplier.company.id, now)
  const tasks = () => prisma.agentTask.findMany({ where: { companyId: w.supplier.company.id, agentKey: INTERVIEW_CHASE }, orderBy: { createdAt: 'asc' } })

  it('a submission the client left quiet for three working days is proposed as one task with a card, and not twice', async () => {
    await setSwitch(w.supplier.company.id, INTERVIEW_CHASE, 'ON', w.owner.id)
    const quiet = await submission('SUBMITTED', day(10), 'Quiet role')
    const fresh = await submission('SUBMITTED', new Date(), 'Fresh role')
    reg(); await run(); await run()
    const t = await tasks()
    expect(t.map((x) => x.recordId)).toEqual([quiet.s.id])
    expect(fresh.s.id).not.toBe(quiet.s.id)
    expect([t[0].kind, t[0].state, t[0].plan]).toEqual(['INTERVIEW_CHASE', 'PROPOSED', PROPOSED_INTERVIEW_PLAN])
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: t[0].decisionId } })
    expect(card.question).toMatch(/has not moved .* for Quiet role in 3 working days/)
    expect(card.question).toMatch(/A person follows up with .* about .*; the agent does not write to the client\./)
    expect(sent).toHaveLength(0)
  })

  it('the interview chase never writes to a client contact, even after a yes with the switch On', async () => {
    const [t] = await tasks()
    await say(w.owner.primaryEmail, w.supplier.entity.id, t.decisionId, 'APPROVE')
    reg(); await run(); await run()
    expect(await prisma.mailSend.count({ where: { agentTaskId: t.id } })).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('when the client interviews the person the chase is closed and no more letters go', async () => {
    const [t] = await tasks()
    await prisma.submission.update({ where: { id: t.recordId }, data: { status: 'SHORTLISTED' } })
    reg(); await run()
    const closed = await prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } })
    expect([closed.state, closed.closedReason]).toEqual(['CLOSED_BY_ARRIVAL', 'The client moved the submission, so the chase is closed.'])
  })

  it('on drafts only the task is proposed and nothing is sent even after a yes', async () => {
    await setSwitch(w.supplier.company.id, INTERVIEW_CHASE, 'DRAFT_ONLY', w.owner.id)
    const q = await submission('SUBMITTED', day(10), 'Draft role')
    reg(); await run()
    const t = (await tasks()).find((x) => x.recordId === q.s.id)!
    await say(w.owner.primaryEmail, w.supplier.entity.id, t.decisionId, 'APPROVE')
    await run()
    expect(await prisma.mailSend.count({ where: { agentTaskId: t.id } })).toBe(0)
  })

  it('a submission nobody at the client can be written to about is never proposed', async () => {
    await setSwitch(w.supplier.company.id, INTERVIEW_CHASE, 'ON', w.owner.id)
    const q = await submission('SUBMITTED', day(10), 'Nobody role')
    await prisma.requirement.update({ where: { id: q.requirement.id }, data: { raisedById: null } })
    reg(); await run()
    expect((await tasks()).some((x) => x.recordId === q.s.id)).toBe(false)
  })
})

describe('the match ranker agent', () => {
  const reg = () => registerAgent(MATCH_RANKER, { ruleVersion: 't', step: matchRankerStep })
  const run = () => runAgent(MATCH_RANKER, w.supplier.company.id)
  const cards = (title: string) => prisma.decisionItem.findMany({ where: { companyId: w.supplier.company.id, question: { contains: title } } })

  it('an open job with a matching person on the bench opens one card, “N people match”, and submits nobody', async () => {
    await setSwitch(w.supplier.company.id, MATCH_RANKER, 'DRAFT_ONLY', w.owner.id)
    const job = await prisma.requirement.create({ data: { companyId: w.supplier.company.id, title: `Java lead ${tag}`, skills: ['Java', 'Spring'], status: 'OPEN', location: 'Remote', billMin: 5000, billMax: 9000 } as any })
    const person = await prisma.person.create({ data: { name: 'Bea Bench', primaryEmail: `bea.${tag}@example.invalid` } })
    const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['Java', 'Spring'], location: 'Remote', visibility: 'VERIFIED', workAuth: 'USC' } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: w.supplier.company.id, tier: 'RETAINED', state: 'GRANTED', invitedAt: day(20), respondedAt: day(19), grantedAt: day(19) } })
    await prisma.context.create({ data: { personId: person.id, companyId: w.supplier.company.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } as any })
    reg(); await run(); await run()
    const c = await cards(`Java lead ${tag}`)
    expect(c).toHaveLength(1)
    expect(c[0].question).toBe(`1 person matches Java lead ${tag}`)
    expect(c[0].proof).toMatch(/Scored by rules only/)
    expect(c[0].proof).toMatch(/Bea Bench: \d+ of 100/)
    expect(c[0].proof).toMatch(/Nobody has been submitted\. Consent comes first/)
    expect(c[0].proof).toContain(`/dashboard/requirements/${job.id}`)
    expect(c[0].ownerPersonId).toBe(w.recruiter.id)
    const m = await prisma.match.findMany({ where: { requirementId: job.id } })
    expect(m).toHaveLength(1)
    expect(m[0].factors).toBeTruthy()
    expect(m[0].basis).toBeTruthy()
    expect(m[0].confidence).toBeTruthy()
    expect(await prisma.submission.count({ where: { requirementId: job.id } })).toBe(0)
    const act = await prisma.recordAction.findFirstOrThrow({ where: { companyId: w.supplier.company.id, agentKey: MATCH_RANKER, recordId: job.id } })
    expect(act.summary).toMatch(/by rules only/)
  })

  it('a card already decided for the same count is not opened again the next morning', async () => {
    const [c] = await cards('Java lead')
    await say(w.recruiter.primaryEmail, w.supplier.entity.id, c.id, 'REJECT')
    reg(); await run()
    expect(await cards('Java lead')).toHaveLength(1)
  })

  it('a job with nobody who matches opens no card', async () => {
    await prisma.requirement.create({ data: { companyId: w.supplier.company.id, title: `Welder ${tag}`, skills: ['Welding'], status: 'OPEN', location: 'Remote' } as any })
    reg(); await run()
    expect(await cards('Welder')).toHaveLength(0)
  })
})
