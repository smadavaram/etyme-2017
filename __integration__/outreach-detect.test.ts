/**
 * Advanced outreach, detection (record 135), on the database, through the real
 * routes, the real task record, the real runner and the real mail ledger: a
 * saved segment holds only people who agreed to hear from the firm, the
 * tripwires fire from the firm's own record with their reasons, a detected push
 * joins only a pack one person approved and whose segment and kind it matches,
 * and anything else waits as a card and sends nothing.
 * Builds its own firm on reserved domains. The provider is a stub.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import * as segmentsRoute from '@/app/api/outreach/segments/route'
import * as segmentRoute from '@/app/api/outreach/segments/[id]/route'
import * as packsRoute from '@/app/api/outreach/packs/route'
import * as detectionRoute from '@/app/api/outreach/detection/route'
import * as visitRoute from '@/app/api/outreach/visit/[token]/route'
import * as interest from '@/app/api/answer/outreach-interest/[token]/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { sendMail } from '@/lib/notify/mail-door'
import { scanTripwires } from '@/lib/outreach/tripwires'
import { releaseWaiting, syncPack } from '@/lib/outreach/pack'
import { openVisit } from '@/lib/outreach/visit'
import { resultsOf } from '@/lib/outreach/results'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-outreach-detect'
process.env.NEXTAUTH_URL = 'https://etyme.example'
const tag = `od${Date.now()}`
const w: Record<string, any> = {}
const KEY = 'outreach-batch'
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const ahead = (n: number) => new Date(Date.now() + n * 86_400_000)
const sent: { to: string[]; text: string; subject: string }[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => { sent.push({ to: e.to, text: e.text, subject: e.subject }); return { provider: 'Resend' as const, messageId: 'm' } },
}
const run = (when: Date = new Date()) => {
  registerAgent(KEY, { ruleVersion: 't', step: (ctx) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) })
  return runAgent(KEY, w.firm.id, when)
}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const pt = (token: string) => ({ params: Promise.resolve({ token }) })
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const post = async (route: any, url: string, body: unknown, who = w.owner) => { as(who.primaryEmail); return json(await route.POST(req('POST', url, body))) }
const saveSegment = (body: unknown) => post(segmentsRoute, '/api/outreach/segments', body)
const proposePack = (body: unknown) => post(packsRoute, '/api/outreach/packs', body)
const lookNow = () => post(detectionRoute, '/api/outreach/detection', {})
const readSegment = async (id: string) => { as(w.owner.primaryEmail); return json(await segmentRoute.GET(req('GET', `/api/outreach/segments/${id}`), p(id))) }
const firingsOf = (kind?: string) => prisma.outreachTripwireFiring.findMany({ where: { companyId: w.firm.id, ...(kind ? { kind } : {}) }, include: { pushes: true } })
const lettersOf = async (packId: string) => { const pk = await prisma.outreachPack.findUniqueOrThrow({ where: { id: packId } }); return prisma.outreachLetter.findMany({ where: { agentTaskId: pk.agentTaskId! } }) }
const approvePack = async (packId: string) => {
  const pk = await prisma.outreachPack.findUniqueOrThrow({ where: { id: packId }, include: { } })
  const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: pk.agentTaskId! } })
  expect((await say(task.decisionId, 'APPROVE')).status).toBe(200)
  return syncPack(packId)
}
const mailFor = (who: string) => sent.filter((s) => s.to.join().includes(who))
const tokenIn = (text: string, part: string) => text.match(new RegExp(`${part}/([\\w.-]+)`))![1]
let n = 0
async function candidate(name: string, o: { yes?: boolean; revoked?: boolean; listing?: 'GRANTED' | 'INVITED'; skills?: string[]; location?: string } = {}) {
  n++
  const person = await prisma.person.create({ data: {
    name, primaryEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid`,
    updatesYesAt: o.yes === false ? null : day(30), updatesRevokedAt: o.revoked ? day(5) : null,
  } as any })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: o.skills ?? ['sql'], location: o.location ?? 'Leeds, GB' } })
  await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: w.firm.id, tier: 'RETAINED', state: o.listing ?? 'GRANTED' } })
  return person
}
const newCo = (name: string, extra: Record<string, unknown> = {}) => prisma.company.create({ data: { name: `${name} ${tag}`, slug: `od-${name.toLowerCase().replace(/\s/g, '-')}-${tag}`, kind: 'CLIENT', ...extra } as any })
async function customer(name: string, contactEmail: string | null, extra: Record<string, unknown> = {}) {
  const co = await newCo(name)
  await prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId: co.id, relationship: 'CLIENT', status: 'ACTIVE', createdAt: day(400) } })
  const job = await prisma.requirement.create({ data: { companyId: co.id, title: `Job ${name}`, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: ahead(30) } })
  const person = await prisma.person.create({ data: { name: `Worker ${name}`, primaryEmail: `w.${name.replace(/\s/g, '').toLowerCase()}.${tag}@example.invalid` } })
  await prisma.submission.create({ data: { requirementId: job.id, personId: person.id, fromCompanyId: w.firm.id, toCompanyId: co.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: day(100) } })
  if (contactEmail) w[`c_${name}`] = await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: co.id, name: `Contact ${name}`, email: contactEmail, kind: 'HIRING_MANAGER', ...extra } as any })
  return co
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await newCo('Win Firm', { kind: 'VENDOR', siteLiveAt: null, pluginsOn: ['OUTREACH'], unfilledJobDays: 30 })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Win Firm LLC', country: 'US', currency: 'USD' } })
  await prisma.companyAddress.create({ data: { companyId: w.firm.id, kind: 'LEGAL', street: '12 Mill Road', city: 'Leeds', state: null, postalCode: 'LS1 4AB', country: 'GB' } })
  const ownerRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  await prisma.agentSwitch.create({ data: { companyId: w.firm.id, agentKey: KEY, state: 'ON', dailyCap: null, changedById: w.owner.id } })

  w.asha = await candidate('Asha Rao')
  w.cora = await candidate('Cora Lind', { yes: false })
  w.dev = await candidate('Dev Shah', { revoked: true })
  w.fay = await candidate('Fay Wren', { listing: 'INVITED' })
  w.stranger = await prisma.person.create({ data: { name: 'Sam Stranger', primaryEmail: `sam.${tag}@example.invalid`, updatesYesAt: day(3) } as any })
  await prisma.consultantProfile.create({ data: { personId: w.stranger.id, skills: ['sql'] } })

  w.orchid = await customer('Orchid Foods', `mina.${tag}@example.invalid`)
  w.cedar = await customer('Cedar Co', `cy.${tag}@example.invalid`, { outreachOptOutAt: day(10) })
  w.stray = await newCo('Stray Co', { claimedAt: new Date() })
  await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: w.stray.id, name: 'Sid Stray', email: `sid.${tag}@example.invalid`, kind: 'HIRING_MANAGER' } })
  // Mina has her own sign-in, under the address the firm wrote to.
  w.mina = await prisma.person.create({ data: { name: 'Mina Cho', primaryEmail: `mina.${tag}@example.invalid` } })

  // What the firm sells: a course six people finished, and a team with room.
  w.course = await prisma.course.create({ data: { companyId: w.firm.id, title: 'Data engineering basics', description: 'SQL and dbt for people coming from analysis', trackKey: 'it-upgrade', slug: `learn:it-upgrade` } as any })
  for (let i = 0; i < 6; i++) {
    const learner = await prisma.person.create({ data: { name: `Learner ${i}`, primaryEmail: `l${i}.${tag}@example.invalid` } })
    await prisma.enrollment.create({ data: { courseId: w.course.id, personId: learner.id, companyId: w.firm.id, status: 'COMPLETED', completedAt: day(60) } })
  }
  w.pod = await prisma.pod.create({ data: { companyId: w.firm.id, name: 'Data team', pricing: 'RATE_CARD' } })
  await prisma.podRole.create({ data: { podId: w.pod.id, title: 'Data engineer', headcount: 3, skills: ['sql'] } })
  // An open job, twenty days old: past the default fourteen, short of the firm's own thirty.
  w.job = await prisma.requirement.create({ data: { companyId: w.firm.id, title: 'Data engineer', skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, createdAt: day(20) } })
})
afterEach(() => { unregisterAgent(KEY) })

describe('the audience builder', () => {
  it('a segment cut by industry is refused in a sentence, because nothing on the record holds an industry', async () => {
    const out = await saveSegment({ name: 'By industry', role: 'CLIENT', industry: 'Packaging' })
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('industry'); expect(out.body.error.message).toMatch(/No industry is recorded/)
  })
  it('a segment that asks for people who have not agreed to hear from the firm is refused', async () => {
    const out = await saveSegment({ name: 'Everyone', role: 'CANDIDATE', consent: 'ANYONE' })
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('consent')
  })
  it('an unconsented candidate is never in a segment: no yes, a yes taken back, only asked, and not kept by the firm are all left out and never named', async () => {
    const saved = await saveSegment({ name: 'Learners', role: 'CANDIDATE', skills: ['SQL'] })
    expect(saved.status).toBe(201)
    w.learners = saved.body.data.id
    const read = (await readSegment(w.learners)).body.data
    expect(read.members.map((m: any) => m.name)).toEqual(['Asha Rao'])
    expect(read.withoutYes).toBe(2) // Cora and Dev; Fay is only asked, Sam is not kept
    const everything = JSON.stringify(read)
    for (const nobody of ['Cora', 'Dev Shah', 'Sam Stranger', 'Fay', 'example.invalid']) expect(everything).not.toContain(nobody)
  })
  it('a segment is a saved query, not a copied list: it stores no person, and her yes taken back removes her on the next read', async () => {
    const row = await prisma.outreachSegment.findUniqueOrThrow({ where: { id: w.learners } })
    expect(JSON.stringify(row.definition)).not.toContain(w.asha.id)
    await prisma.person.update({ where: { id: w.asha.id }, data: { updatesRevokedAt: new Date() } })
    expect((await readSegment(w.learners)).body.data.members).toEqual([])
    await prisma.person.update({ where: { id: w.asha.id }, data: { updatesRevokedAt: null } })
    expect((await readSegment(w.learners)).body.data.members.map((m: any) => m.name)).toEqual(['Asha Rao'])
  })
  it('a contact who unsubscribed, and a company the firm never traded with, are not in a client segment; the contact at a company it trades with is', async () => {
    const saved = await saveSegment({ name: 'Clients', role: 'CLIENT' })
    expect(saved.status).toBe(201)
    w.clients = saved.body.data.id
    const read = (await readSegment(w.clients)).body.data
    expect(read.members.map((m: any) => m.name)).toEqual(['Contact Orchid Foods'])
    expect(JSON.stringify(read)).not.toMatch(/Stray|Cedar.*Contact Cedar/)
  })
  it('a client segment that names skills is refused, because skills are a candidate’s', async () => {
    const out = await saveSegment({ name: 'Wrong', role: 'CLIENT', skills: ['sql'] })
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('skills')
  })
})

describe('the tripwires', () => {
  it('a job open for twenty days does not fire while the firm’s own line is thirty days, and fires once the Owner sets it to fourteen', async () => {
    await scanTripwires(w.firm.id)
    expect(await firingsOf('JOB_UNFILLED')).toHaveLength(0)
    expect((await firingsOf()).map((f) => f.kind).sort()).toEqual(['BENCH_SKILL_MATCHES_DEMAND', 'POD_CAPACITY_OPENED'])
    await prisma.company.update({ where: { id: w.firm.id }, data: { unfilledJobDays: 14 } })
  })
  it('a look at the record fires an open job past the firm’s line, with its reason, beside the team with room and the bench skill already seen, and writes no letter and sends no mail', async () => {
    const out = await lookNow()
    expect(out.status).toBe(200)
    expect(out.body.data.fired.map((f: any) => f.kind)).toEqual(['JOB_UNFILLED'])
    const job = (await firingsOf('JOB_UNFILLED'))[0]
    expect(job.reason).toBe('Data engineer has been open 20 days, past your 14-day line.')
    expect((await firingsOf('POD_CAPACITY_OPENED'))[0].reason).toBe('Data team has room for 3 more people: Data engineer.')
    expect(await prisma.outreachLetter.count()).toBe(0)
    expect(sent).toHaveLength(0)
  })
  it('looking again the same day fires nothing new, because the same thing stays quiet', async () => {
    const out = await lookNow()
    expect(out.body.data.fired).toEqual([])
    expect(await prisma.outreachTripwireFiring.count({ where: { companyId: w.firm.id } })).toBe(3)
  })
})

describe('a push no approved pack covers', () => {
  it('waits as one card and sends nothing: the letter is drafted from the firm’s own course and team, and no letter row exists', async () => {
    const pushes = await prisma.outreachPush.findMany({ where: { companyId: w.firm.id }, orderBy: { contentKind: 'asc' } })
    expect(pushes.map((x) => [x.contentKind, x.state, x.drafter])).toEqual([['COURSE', 'WAITING', 'RULES'], ['POD_OFFER', 'WAITING', 'RULES']])
    for (const x of pushes) expect(x.decisionId).toBeTruthy()
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: pushes[0].decisionId! } })
    expect(card.state).toBe('OPEN'); expect(card.question).toMatch(/^Outreach: .*Approve a pack for it\?$/)
    expect(card.proof).toMatch(/nothing is sent/)
    expect(await prisma.outreachLetter.count()).toBe(0)
    await run(new Date())
    expect(sent).toHaveLength(0)
  })
  it('stays waiting while the only pack that covers it has no yes, and a pack is one card for one yes', async () => {
    const proposed = await proposePack({ name: 'Autumn courses', segmentId: w.learners, contentKinds: ['COURSE'] })
    expect(proposed.status).toBe(201)
    w.packA = proposed.body.data.id
    const second = await proposePack({ name: 'Spare courses', segmentId: w.learners, contentKinds: ['COURSE'] })
    w.packB = second.body.data.id
    expect((await releaseWaiting(w.firm.id))).toBe(0)
    expect(await prisma.outreachPush.count({ where: { companyId: w.firm.id, state: 'QUEUED' } })).toBe(0)
    expect(await prisma.outreachLetter.count()).toBe(0)
    await run(new Date())
    expect(sent).toHaveLength(0)
    const pack = await prisma.outreachPack.findUniqueOrThrow({ where: { id: w.packA } })
    expect(await prisma.decisionItem.count({ where: { id: (await prisma.agentTask.findUniqueOrThrow({ where: { id: pack.agentTaskId! } })).decisionId, state: 'OPEN' } })).toBe(1)
  })
  it('a pack with a name, a segment and no kind is refused naming the field', async () => {
    const out = await proposePack({ name: 'Empty', segmentId: w.learners, contentKinds: [] })
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('contentKinds')
  })
})

describe('one yes releases one pack only', () => {
  it('after one person says yes to the first pack, the waiting course push joins it, the second pack stays unapproved with no letters, and the other push still waits', async () => {
    expect((await approvePack(w.packA)).state).toBe('APPROVED')
    expect(await releaseWaiting(w.firm.id)).toBe(1)
    const a = await lettersOf(w.packA)
    expect(a).toHaveLength(1); expect(a[0].contactId).toBe(w.asha.id)
    expect(await lettersOf(w.packB)).toHaveLength(0)
    expect((await syncPack(w.packB)).state).toBe('PROPOSED')
    const pod = await prisma.outreachPush.findFirstOrThrow({ where: { companyId: w.firm.id, contentKind: 'POD_OFFER' } })
    expect(pod.state).toBe('WAITING')
  })
  it('a push whose segment or kind the approved pack did not declare waits: the team offer is for clients, and the course pack carries courses', async () => {
    const proofPack = await proposePack({ name: 'Proof for clients', segmentId: w.clients, contentKinds: ['OUTCOME_PROOF'] })
    w.packC = proofPack.body.data.id
    await approvePack(w.packC)
    expect(await releaseWaiting(w.firm.id)).toBe(0)
    expect(await lettersOf(w.packC)).toHaveLength(0)
    expect((await prisma.outreachPush.findFirstOrThrow({ where: { companyId: w.firm.id, contentKind: 'POD_OFFER' } })).state).toBe('WAITING')
  })
  it('the approved pack’s letter goes to her under her yes: one email, from the firm, with its postal address, a way to stop, and a tracked link; the unapproved pack sends nothing', async () => {
    await run(new Date())
    const mine = mailFor(w.asha.primaryEmail)
    expect(mine).toHaveLength(1)
    expect(sent).toHaveLength(1)
    const text = mine[0].text
    w.ashaLetterText = text
    expect(text).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    expect(text).toMatch(/Stop them here/); expect(text).toMatch(/\/answer\/updates\//)
    expect(text).toContain('The page this is about: https://etyme.example/api/outreach/visit/')
    expect(mine[0].subject).toBe(`A course from Win Firm ${tag}: Data engineering basics`)
    expect(mailFor(w.cora.primaryEmail)).toHaveLength(0)
  })
  it('a letter for a candidate whose yes was taken back after it was queued is not sent', async () => {
    const dara = await candidate('Dara Pike')
    const pack = await prisma.outreachPack.findUniqueOrThrow({ where: { id: w.packA } })
    const letter = await prisma.outreachLetter.create({ data: { companyId: w.firm.id, agentTaskId: pack.agentTaskId!, contactId: dara.id, atCompanyId: dara.id, email: dara.primaryEmail, state: 'READY' } })
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: pack.agentTaskId! } })
    const payload = task.payload as any
    const first = Object.values(payload.letterContent)[0]
    await prisma.agentTask.update({ where: { id: task.id }, data: { payload: { ...payload, letterContent: { ...payload.letterContent, [letter.id]: first } } } })
    await prisma.person.update({ where: { id: dara.id }, data: { updatesRevokedAt: new Date() } })
    sent.length = 0
    await run(new Date())
    expect(mailFor(dara.primaryEmail)).toHaveLength(0)
    expect((await prisma.outreachLetter.findUniqueOrThrow({ where: { id: letter.id } })).state).toBe('STOPPED')
  })
  it('a pack’s letters wait while the firm’s Outreach switch is off, a candidate’s too, and go on under the same yes when it is back on', async () => {
    const pack = await prisma.outreachPack.findUniqueOrThrow({ where: { id: w.packA } })
    const letter = await prisma.outreachLetter.create({ data: { companyId: w.firm.id, agentTaskId: pack.agentTaskId!, contactId: w.fay.id, atCompanyId: w.fay.id, email: w.fay.primaryEmail, state: 'READY' } })
    await prisma.person.update({ where: { id: w.fay.id }, data: { updatesYesAt: day(10) } })
    await prisma.benchListing.updateMany({ where: { consultant: { personId: w.fay.id } }, data: { state: 'GRANTED' } })
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: pack.agentTaskId! } })
    const payload = task.payload as any
    const first = Object.values(payload.letterContent)[0]
    await prisma.agentTask.update({ where: { id: task.id }, data: { payload: { ...payload, letterContent: { ...payload.letterContent, [letter.id]: first } } } })
    await prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: [] } })
    sent.length = 0
    await run(new Date())
    expect(sent).toHaveLength(0)
    await prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: ['OUTREACH'] } })
    await run(new Date())
    expect(mailFor(w.fay.primaryEmail)).toHaveLength(1)
  })
})

describe('a pack of letters to a client keeps every rule of an outreach letter', () => {
  it('a team offer pack that says it carries team offers takes the waiting team push, and the letter says who sends it, where, how to stop, and carries the interested link', async () => {
    const pack = await proposePack({ name: 'Teams for clients', segmentId: w.clients, contentKinds: ['POD_OFFER'] })
    w.packD = pack.body.data.id
    await approvePack(w.packD)
    expect(await releaseWaiting(w.firm.id)).toBe(1)
    expect(await lettersOf(w.packD)).toHaveLength(1)
    sent.length = 0
    await run(new Date())
    const mine = mailFor(`mina.${tag}`)
    expect(mine).toHaveLength(1)
    const text = mine[0].text
    expect(text).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    expect(text).toMatch(/Unsubscribe here/); expect(text).toMatch(/outreach-interest\//); expect(text).toContain('/api/outreach/visit/')
    expect(text).not.toMatch(/\$\d|per hour/)
    w.minaLetterText = text
  })
  it('it is sent again twice at most, and never a fourth time', async () => {
    for (const d of [7, 14, 21, 28]) await run(ahead(d))
    expect(mailFor(`mina.${tag}`)).toHaveLength(3) // the letter, then two follow-ups, and no fourth
  })
  it('a reply becomes a decision card: pressing I’m interested opens a lead and one card for the Account Manager or Owner, and the follow-ups stop', async () => {
    const token = tokenIn(w.minaLetterText, 'outreach-interest')
    const before = await prisma.decisionItem.count({ where: { companyId: w.firm.id, question: { contains: 'is interested' } } })
    const out = await json(await interest.POST(req('POST', `/api/answer/outreach-interest/${token}`, {}), pt(token)))
    expect(out.status).toBe(200)
    expect(await prisma.lead.count({ where: { companyId: w.firm.id, source: 'OUTREACH' } })).toBe(1)
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, state: 'OPEN', question: { contains: 'is interested' } } })
    expect(cards).toHaveLength(before + 1)
    expect(cards[0].question).toContain('Teams for clients')
  })
})

describe('repeat visits count only a signed-in person the letter was written to', () => {
  it('a visitor who is not signed in is sent to the page and nothing is written, so no tripwire can fire from an anonymous visit', async () => {
    const token = tokenIn(w.minaLetterText, 'visit')
    for (const d of [1, 2, 3]) {
      const out = await openVisit(token, null, ahead(d))
      expect(out.recorded).toBe(false); expect(out.redirect).toBe(`/site/${w.firm.slug}`)
    }
    expect(await prisma.outreachVisit.count()).toBe(0)
    await scanTripwires(w.firm.id, ahead(3))
    expect(await firingsOf('REPEAT_VISITS')).toHaveLength(0)
  })
  it('a person signed in as somebody else is sent on and nothing is written', async () => {
    const token = tokenIn(w.minaLetterText, 'visit')
    const out = await openVisit(token, w.cora.primaryEmail, new Date())
    expect(out.recorded).toBe(false); expect(out.why).toMatch(/not the person the letter was written to/)
    expect(await prisma.outreachVisit.count()).toBe(0)
  })
  it('the contact signed in under the address the letter went to is counted once a day, through the real link', async () => {
    const token = tokenIn(w.minaLetterText, 'visit')
    as(w.mina.primaryEmail)
    const res = await visitRoute.GET(req('GET', `/api/outreach/visit/${token}`), pt(token))
    expect(res.status).toBe(302)
    expect(await prisma.outreachVisit.count()).toBe(1)
    const again = await openVisit(token, w.mina.primaryEmail, new Date())
    expect(again.recorded).toBe(false)
    expect(await prisma.outreachVisit.count()).toBe(1)
  })
  it('coming back on a second day fires the repeat-visit tripwire with its reason, once, for that person alone', async () => {
    const token = tokenIn(w.minaLetterText, 'visit')
    const out = await openVisit(token, w.mina.primaryEmail, ahead(1))
    expect(out.recorded).toBe(true)
    const fired = await firingsOf('REPEAT_VISITS')
    expect(fired).toHaveLength(1)
    expect(fired[0].reason).toBe('Somebody who opened your letter came back to Data team on 2 different days.')
    await openVisit(token, w.mina.primaryEmail, ahead(1))
    expect(await firingsOf('REPEAT_VISITS')).toHaveLength(1)
  })
})

describe('the Owner’s results say what is missing', () => {
  it('the cost per activated tenant is never a number, because no sign-up is tied to a letter, and the sentence says so', async () => {
    as(w.owner.primaryEmail)
    const out = await json(await detectionRoute.GET(req('GET', '/api/outreach/detection')))
    expect(out.status).toBe(200)
    const r = out.body.data.results
    expect(r.perActivatedTenant.value).toBeNull(); expect(r.perActivatedTenant.missing).toMatch(/No sign-up is tied to a letter/)
  })
  it('the cost per qualified resume is blank while nothing is priced, and counts a person only with a yes, a resume and a visit by a letter', async () => {
    expect((await resultsOf(w.firm.id)).qualifiedResumes).toBe(0)
    const token = tokenIn(w.ashaLetterText, 'visit')
    const hers = await openVisit(token, w.asha.primaryEmail, new Date())
    expect(hers.recorded).toBe(true)
    let r = await resultsOf(w.firm.id)
    expect(r.qualifiedResumes).toBe(0) // she has no resume on file
    await prisma.resume.create({ data: { personId: w.asha.id, label: 'Resume', fileName: 'asha.pdf', contentType: 'application/pdf', sizeBytes: 10 } })
    r = await resultsOf(w.firm.id)
    expect(r.qualifiedResumes).toBe(1)
    expect(r.perQualifiedResume.value).toBeNull()
    expect(r.perQualifiedResume.missing).toMatch(/Nothing in outreach is priced yet/)
  })
  it('once the model runs are priced, the cost per qualified resume is their cost divided by the resumes', async () => {
    await prisma.agentRun.create({ data: { companyId: w.firm.id, agent: 'outreach.push', recordType: 'TWIN_LEDGER', recordId: w.firm.id, verdict: 'PASS', ms: 5, skillKey: 'outreach.push', tier: 'LOW', costMicros: 4_000 } })
    const r = await resultsOf(w.firm.id)
    expect(r.perQualifiedResume).toEqual({ value: 4_000, missing: null })
  })
  it('only the Owner or an Admin is shown the results', async () => {
    const role = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Buyer', permissions: ['vendors.read'] } })
    const buyer = await prisma.person.create({ data: { name: 'Bo Buyer', primaryEmail: `bo.${tag}@example.invalid` } })
    await prisma.context.create({ data: { personId: buyer.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: role.id } as any })
    as(buyer.primaryEmail)
    const out = await json(await detectionRoute.GET(req('GET', '/api/outreach/detection')))
    expect(out.status).toBe(200); expect(out.body.data.results).toBeNull()
  })
})
