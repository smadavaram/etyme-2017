import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as person } from '@/app/api/people/[id]/route'
import { POST as ask } from '@/app/api/people/[id]/ask/route'

/**
 * Nike's hiring manager liked a candidate a supplier sent for one role
 * and wants him for another. He stars him and asks; the supplier, not
 * the candidate, hears.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const it_: Record<string, any> = {}

describe('asking for a person you were shown', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    it_.nike = nike.id
    const sub = await prisma.submission.findFirstOrThrow({
      where: { toCompanyId: nike.id, status: { notIn: ['PLACED'] }, person: { name: 'Daniel Okafor' } },
      select: { personId: true, requirementId: true, fromCompanyId: true, fromCompany: { select: { name: true } } },
    })
    it_.daniel = sub.personId; it_.role = sub.requirementId; it_.supplier = sub.fromCompanyId; it_.supplierName = sub.fromCompany.name
    // A second published role to ask for him on.
    const first = await prisma.requirement.findUniqueOrThrow({ where: { id: sub.requirementId } })
    const other = await prisma.requirement.create({
      data: {
        companyId: nike.id, title: 'Integration analyst', skills: first.skills, location: first.location, billMin: first.billMin, billMax: first.billMax,
        months: 6, headcount: 1, status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', raisedById: first.raisedById, hoursPerWeek: 40,
      },
      select: { id: true },
    })
    it_.other = other.id
    const draft = await prisma.requirement.create({
      data: {
        companyId: nike.id, title: 'Not published yet', skills: first.skills, location: first.location, billMin: first.billMin, billMax: first.billMax,
        months: 6, headcount: 1, status: 'DRAFT', approvalState: 'DRAFT', source: 'MANUAL', raisedById: first.raisedById, hoursPerWeek: 40,
      },
      select: { id: true },
    })
    it_.draft = draft.id
  }, 240_000)

  it('a candidate who was submitted and not hired is on the register with everything the client knows, and the read leaves a trail', async () => {
    as(HIRING)
    const r = await call(person, 'GET', `/api/people/${it_.daniel}`, it_.daniel)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.person.name).toBe('Daniel Okafor')
    expect(r.body.data.onSite).toBe(false)
    expect(r.body.data.submissions.length).toBeGreaterThan(0)
    expect(r.body.data.representedBy.map((x: any) => x.name)).toContain(it_.supplierName)
    expect(r.body.data.openRequirements.map((x: any) => x.id)).toContain(it_.other)
    let trail = null
    for (let i = 0; i < 20 && !trail; i++) {
      trail = await prisma.accessLog.findFirst({ where: { subjectId: it_.daniel, action: 'PROFILE_VIEW', allowed: true } })
      if (!trail) await new Promise((r) => setTimeout(r, 100))
    }
    expect(trail).not.toBeNull()
  })

  it('somebody never put in front of this client cannot be opened, and the refusal is logged too', async () => {
    const stranger = await prisma.person.create({ data: { name: 'Nobody Here', primaryEmail: 'nobody.here@seed.etyme.invalid' }, select: { id: true } })
    as(HIRING)
    const r = await call(person, 'GET', `/api/people/${stranger.id}`, stranger.id)
    expect(r.status).toBe(404)
    expect(r.body.error.message).toContain('has not been put in front of you')
    // The trail is written without holding the response up, so give it a moment.
    let trail = null
    for (let i = 0; i < 20 && !trail; i++) {
      trail = await prisma.accessLog.findFirst({ where: { subjectId: stranger.id, allowed: false } })
      if (!trail) await new Promise((r) => setTimeout(r, 100))
    }
    expect(trail).not.toBeNull()
  })

  it('asking for him on a published role goes to the supplier on the thread for that role, and says so', async () => {
    as(HIRING)
    const r = await call(ask, 'POST', `/api/people/${it_.daniel}/ask`, it_.daniel, { requirementId: it_.other, note: 'Strong in the first interview.' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain(`asked to put Daniel Okafor forward for Integration analyst`)
    const thread = await prisma.conversation.findFirst({
      where: { companyId: it_.nike, withCompanyId: it_.supplier, topic: 'REQUIREMENT', topicId: it_.other },
      include: { messages: true },
    })
    expect(thread?.messages.map((m) => m.body).join(' ')).toContain('would like to see Daniel Okafor for Integration analyst')
  })

  it('a role that is not published cannot be asked for, and neither can a role he is already on', async () => {
    as(HIRING)
    const draft = await call(ask, 'POST', `/api/people/${it_.daniel}/ask`, it_.daniel, { requirementId: it_.draft })
    expect(draft.status).toBe(409)
    expect(draft.body.error.code).toBe('NOT_PUBLISHED')
    const again = await call(ask, 'POST', `/api/people/${it_.daniel}/ask`, it_.daniel, { requirementId: it_.role })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED')
  })

  it('a blocked person cannot be asked for until the block is lifted', async () => {
    const hm = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIRING }, select: { id: true } })
    await prisma.blacklist.create({ data: { companyId: it_.nike, targetType: 'PERSON', targetId: it_.daniel, reason: 'Left mid-project in 2023.', blockedById: hm.id } })
    as(HIRING)
    const r = await call(ask, 'POST', `/api/people/${it_.daniel}/ask`, it_.daniel, { requirementId: it_.other })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Daniel Okafor is blocked here — Left mid-project in 2023. Lift the block first.')
  })
})
