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

  // ── The rung the client pays, and nothing below it ────────────────
  //
  // Nike buys Helena Marsh from Computer Systems, who buy her from
  // CloudEPA, and the bench listing that makes a submission possible at
  // all is CloudEPA's. So "Ask for them" named CloudEPA on Nike's own
  // page and opened a thread straight to it — the prime's supplier list
  // and a direct channel, both given away by one button, and the NDA
  // between prime and sub breached in each direction at once.

  describe('asking for somebody you buy through a chain', () => {
    beforeAll(async () => {
      const [prime, sub, helena] = await Promise.all([
        prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' }, select: { id: true, name: true } }),
        prisma.company.findUniqueOrThrow({ where: { slug: 'world-cloudepa' }, select: { id: true, name: true } }),
        prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' }, select: { id: true } }),
      ])
      it_.prime = prime.id; it_.primeName = prime.name
      it_.sub = sub.id; it_.subName = sub.name
      it_.helena = helena.id
      const raisedBy = await prisma.requirement.findFirstOrThrow({ where: { companyId: it_.nike }, select: { raisedById: true, skills: true, location: true } })
      const role = async (title: string) => (await prisma.requirement.create({
        data: {
          companyId: it_.nike, title, skills: raisedBy.skills, location: raisedBy.location, billMin: 10000, billMax: 15000,
          months: 6, headcount: 1, status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', raisedById: raisedBy.raisedById, hoursPerWeek: 40,
        },
        select: { id: true },
      })).id
      it_.chainRole = await role('Central Finance lead')
      it_.discloseRole = await role('S/4 migration lead')
      // Somebody on a bench Nike has never bought from and was never
      // offered: no contract, no submission, no deal of any kind.
      const stranger = await prisma.person.create({ data: { name: 'Anselm Roche', primaryEmail: 'anselm.roche@seed.etyme.invalid' }, select: { id: true } })
      const profile = await prisma.consultantProfile.create({ data: { personId: stranger.id, skills: ['Workday'], location: 'Beaverton, OR', visibility: 'VERIFIED', workAuth: 'USC' }, select: { id: true } })
      await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: it_.sub, tier: 'RETAINED', state: 'GRANTED' } })
      it_.stranger = stranger.id
      it_.openRole = (await prisma.requirement.findFirstOrThrow({ where: { companyId: it_.nike, title: 'Workday HCM integration lead' }, select: { id: true } })).id
    }, 120_000)

    it('the bench listing that would be submitted against belongs to the firm below the one Nike pays', async () => {
      const listing = await prisma.benchListing.findFirstOrThrow({
        where: { consultant: { personId: it_.helena }, state: 'GRANTED' },
        select: { companyId: true },
      })
      expect(listing.companyId).toBe(it_.sub)
      const paid = await prisma.sellContract.findFirstOrThrow({ where: { personId: it_.helena, clientCompanyId: it_.nike }, select: { companyId: true } })
      expect(paid.companyId).toBe(it_.prime)
    })

    it('asking for her opens the thread with the prime Nike pays, and never with the sub-vendor holding her', async () => {
      as(HIRING)
      const r = await call(ask, 'POST', `/api/people/${it_.helena}/ask`, it_.helena, { requirementId: it_.chainRole })
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.asked).toEqual([it_.primeName])
      expect(r.body.data.throughAPrime).toBe(true)
      const withPrime = await prisma.conversation.findFirst({ where: { companyId: it_.nike, withCompanyId: it_.prime, topic: 'REQUIREMENT', topicId: it_.chainRole } })
      const withSub = await prisma.conversation.findFirst({ where: { companyId: it_.nike, withCompanyId: it_.sub, topic: 'REQUIREMENT', topicId: it_.chainRole } })
      expect(withPrime).not.toBeNull()
      expect(withSub).toBeNull()
    })

    it('and nothing in the reply, the thread title, the message or its metadata names the firm below the rung Nike pays', async () => {
      const thread = await prisma.conversation.findFirstOrThrow({
        where: { companyId: it_.nike, withCompanyId: it_.prime, topic: 'REQUIREMENT', topicId: it_.chainRole },
        include: { messages: true },
      })
      const everything = JSON.stringify({ title: thread.title, messages: thread.messages })
      expect(everything).not.toContain(it_.subName)
      expect(everything).not.toContain(it_.sub)
      const asked = thread.messages.find((m) => m.type === 'ASK')!
      expect((asked.metadata as Record<string, string>).supplierId).toBe(it_.prime)
      expect((asked.metadata as Record<string, string>).supplierName).toBe(it_.primeName)
    })

    it('the prime is told who was asked for and on which role, and why it came to them', async () => {
      const thread = await prisma.conversation.findFirstOrThrow({
        where: { companyId: it_.nike, withCompanyId: it_.prime, topic: 'REQUIREMENT', topicId: it_.chainRole },
        include: { messages: true },
      })
      const asked = thread.messages.find((m) => m.type === 'ASK')!
      expect(asked.body).toContain('Helena Marsh')
      expect(asked.body).toContain('Central Finance lead')
      expect(asked.body).toContain('buys through you here, so the ask comes to you rather than to anyone below you')
      const atPrime = (await prisma.context.findMany({ where: { companyId: it_.prime, revokedAt: null }, select: { personId: true } })).map((c) => c.personId)
      let told = null
      for (let i = 0; i < 20 && !told; i++) {
        told = await prisma.notification.findFirst({ where: { personId: { in: atPrime }, type: 'CONVERSATION', body: { contains: 'Helena Marsh' } } })
        if (!told) await new Promise((r) => setTimeout(r, 100))
      }
      expect(told, 'the prime heard about the ask').not.toBeNull()
      expect(told!.body).toContain('Central Finance lead')
    })

    it('a client whose agreement discloses sub-vendor names still asks through the prime, because reading a name is not having a channel', async () => {
      await prisma.masterAgreement.updateMany({ where: { clientId: it_.nike, vendorId: it_.prime }, data: { disclosesSubVendors: true } })
      as(HIRING)
      const r = await call(ask, 'POST', `/api/people/${it_.helena}/ask`, it_.helena, { requirementId: it_.discloseRole })
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.asked).toEqual([it_.primeName])
      const withSub = await prisma.conversation.findFirst({ where: { companyId: it_.nike, withCompanyId: it_.sub, topic: 'REQUIREMENT', topicId: it_.discloseRole } })
      expect(withSub).toBeNull()
      await prisma.masterAgreement.updateMany({ where: { clientId: it_.nike, vendorId: it_.prime }, data: { disclosesSubVendors: false } })
    })

    it('somebody Nike has never bought through anyone is refused in a sentence that names Nike’s own suppliers and not the firm holding them', async () => {
      as(HIRING)
      const r = await call(ask, 'POST', `/api/people/${it_.stranger}/ask`, it_.stranger, { requirementId: it_.openRole })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body.error.code).toBe('NO_SUPPLIER_OF_YOUR_OWN')
      expect(r.body.error.message).toContain('You have no supplier for Anselm Roche yet')
      expect(r.body.error.message).toContain(it_.primeName)
      expect(r.body.error.message).not.toContain(it_.subName)
      const anywhere = await prisma.conversation.findFirst({ where: { companyId: it_.nike, topicId: it_.openRole, withCompanyId: it_.sub } })
      expect(anywhere).toBeNull()
    })
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
