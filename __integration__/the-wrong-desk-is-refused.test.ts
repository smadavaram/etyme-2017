import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { rolesFor } from '@/lib/company-defaults'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'

/**
 * The same three stations, asked of every desk inside one company.
 *
 * `party-uniform.test.ts` asks each station of eight *firms* and proves
 * that a firm with no business on a deal is refused in words. It has a
 * blind spot of its own: every actor in it holds an Owner seat, so a
 * station that checks which company is calling and never which desk
 * passes it clean.
 *
 * Three routes were in exactly that state. They established the
 * caller's company and then acted for anybody inside it — so a
 * supplier's HR partner could sell somebody, and a client's Viewer, a
 * role whose whole blurb is "Reads the program. Changes nothing.",
 * could award a placement and write both contracts.
 *
 * That is segregation of duties, which Addendum E puts in the BLOCK
 * list. So this file walks one placement the way `client-programme`
 * does, and at every station sends the wrong desk first.
 */

const D = '@demo.etyme.local'
const NIKE = {
  hiring: `world-nike-hiring${D}`,
  program: `world-nike-programme${D}`,
  ap: `world-nike-ap${D}`,
  procurement: `world-nike-procurement${D}`,
  compliance: `world-nike-compliance${D}`,
}
/** Desks this test needs that the world does not seed. */
const SEAT = {
  viewer: 'viewer@desks.etyme.invalid',
  supplierHr: 'hr@pinnacle.desks.etyme.invalid',
  supplierCompliance: 'compliance@pinnacle.desks.etyme.invalid',
  supplierRecruiter: 'recruiter@pinnacle.desks.etyme.invalid',
}

const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

/** A refusal anybody can act on: words, not an identifier. */
function isASentence(message: string) {
  expect(message, 'refused with nothing to read').toMatch(/[a-z]{3,}\s+[a-z]{2,}\s+[a-z]{2,}/i)
  expect(message, 'refused by naming a permission string').not.toMatch(
    /submissions\.create|requirements\.write|requirements\.read/
  )
}

const it_: Record<string, any> = {}

async function seat(companyId: string, kind: 'CLIENT' | 'VENDOR', roleName: string, email: string, name: string) {
  const seed = rolesFor(kind).find((r) => r.name === roleName)!
  const role =
    (await prisma.role.findFirst({ where: { companyId, name: roleName } })) ??
    (await prisma.role.create({ data: { companyId, name: roleName, permissions: seed.permissions as string[] } }))
  const person = await prisma.person.upsert({
    where: { primaryEmail: email },
    update: { name },
    create: { name, primaryEmail: email },
  })
  await prisma.context.create({
    data: { personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', grantReason: `Desk test — ${roleName}` },
  })
  return person.id
}

describe('the desk inside the company, and not only the company', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true } })
    it_.nike = nike.id
    it_.pinnacle = pinnacle.id

    // A Viewer at the client. The world seeds five desks and not this
    // one, and it is the desk this whole file exists for.
    await seat(nike.id, 'CLIENT', 'Viewer', SEAT.viewer, 'Wendy Voss')
    // Three desks at the supplier: two that do not sell, one that does.
    await seat(pinnacle.id, 'VENDOR', 'HR', SEAT.supplierHr, 'Harriet Roe')
    await seat(pinnacle.id, 'VENDOR', 'Compliance Officer', SEAT.supplierCompliance, 'Colin Off')
    await seat(pinnacle.id, 'VENDOR', 'Recruiter', SEAT.supplierRecruiter, 'Rita Cruz')

    // Somebody on the supplier's bench, with consent actually granted.
    const person = await prisma.person.create({
      data: { name: 'Nadia Okonkwo', primaryEmail: 'nadia.okonkwo@desks.etyme.invalid' },
    })
    it_.worker = person.id
    const profile = await prisma.consultantProfile.create({
      data: {
        personId: person.id, skills: ['Sustainability reporting', 'Power BI'],
        location: 'Beaverton, OR', visibility: 'VERIFIED', workAuth: 'USC',
      },
    })
    await prisma.benchListing.create({
      data: {
        consultantId: profile.id, companyId: pinnacle.id, tier: 'RETAINED', state: 'GRANTED',
        invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29),
      },
    })
  }, 300_000)

  // ── Station one: the role is opened ────────────────────────────────

  describe('1 · raising the requisition', () => {
    const role = () => ({
      title: 'Sustainability data analyst', skills: ['Sustainability reporting', 'Power BI'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4000, months: 12, headcount: 1,
      hoursPerWeek: 40, costCenterId: it_.costCenter, neededBy: day(14).toISOString(),
    })

    beforeAll(async () => {
      const cc = await prisma.costCenter.findFirstOrThrow({
        where: { companyId: it_.nike, code: { startsWith: 'APPS-' } },
      })
      it_.costCenter = cc.id
    })

    it('the clerk who pays for a requisition cannot raise one', async () => {
      as(NIKE.ap)
      const r = await json(await raiseRequisition(req('POST', '/api/requisitions', role())))
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
      expect(r.body.error.message).toContain('whoever is hiring')
    })

    it('the compliance officer who clears the paperwork cannot raise one either', async () => {
      as(NIKE.compliance)
      const r = await json(await raiseRequisition(req('POST', '/api/requisitions', role())))
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
    })

    it('the procurement lead, who chooses which suppliers see a role, may not open the role', async () => {
      // The two halves of the same control. Procurement releases and does
      // not raise; the hiring manager raises and does not release.
      as(NIKE.procurement)
      const r = await json(await raiseRequisition(req('POST', '/api/requisitions', role())))
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
    })

    it('the hiring manager raises it, and nothing about the seat stands in the way', async () => {
      as(NIKE.hiring)
      const r = await json(await raiseRequisition(req('POST', '/api/requisitions', role())))
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
      it_.requisition = r.body.data.requisition.id
      const row = await prisma.requirement.findUniqueOrThrow({ where: { id: it_.requisition } })
      expect([row.status, row.approvalState]).toEqual(['OPEN', 'AUTO_APPROVED'])
    })

    it('and the hiring manager who raised it still cannot choose who sees it', async () => {
      as(NIKE.hiring)
      const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
        vendors: [{ companyId: it_.pinnacle, payMin: 3200, payMax: 3800 }],
      })
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
    })

    it('the program office releases it to the supplier', async () => {
      as(NIKE.program)
      const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
        vendors: [{ companyId: it_.pinnacle, payMin: 3200, payMax: 3800 }],
      })
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    })
  })

  // ── Station two: somebody is put forward ───────────────────────────

  describe('2 · putting somebody forward', () => {
    const submission = () => ({
      requirementId: it_.requisition, personIds: [it_.worker], rate: 3800, fromCompanyId: it_.pinnacle,
    })

    it('the supplier’s HR partner cannot put a candidate in front of a client', async () => {
      as(SEAT.supplierHr)
      const r = await json(await submitCandidates(req('POST', '/api/submissions', submission())))
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
      expect(r.body.error.message).toContain('recruiter')
    })

    it('neither can the supplier’s compliance officer, and neither of them is told a permission name', async () => {
      as(SEAT.supplierCompliance)
      const r = await json(await submitCandidates(req('POST', '/api/submissions', submission())))
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
    })

    it('nothing was written by either attempt — a refusal at the door leaves no submission behind', async () => {
      const count = await prisma.submission.count({ where: { requirementId: it_.requisition } })
      expect(count).toBe(0)
    })

    it('the recruiter puts the same person forward and it lands', async () => {
      as(SEAT.supplierRecruiter)
      const r = await json(await submitCandidates(req('POST', '/api/submissions', submission())))
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
      const row = await prisma.submission.findFirstOrThrow({
        where: { requirementId: it_.requisition, personId: it_.worker },
      })
      it_.submission = row.id
    })
  })

  // ── Station three: the award ───────────────────────────────────────

  describe('3 · the award', () => {
    const terms = () => ({
      rate: 3800,
      startDate: day(7).toISOString().slice(0, 10),
      endDate: day(187).toISOString().slice(0, 10),
    })

    it('a viewer at the client cannot award a placement', async () => {
      as(SEAT.viewer)
      const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, terms())
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
      expect(r.body.error.message).toContain('whoever is hiring')
    })

    it('neither can the AP clerk who will pay for it', async () => {
      as(NIKE.ap)
      const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, terms())
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
    })

    it('neither can the compliance officer who clears the person', async () => {
      as(NIKE.compliance)
      const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, terms())
      expect(r.status).toBe(403)
      isASentence(r.body.error.message)
    })

    it('no contract was written by any of the three refusals', async () => {
      const count = await prisma.sellContract.count({ where: { requirementId: it_.requisition } })
      expect(count).toBe(0)
    })

    it('the hiring manager awards it, and both sides of the deal are written', async () => {
      as(NIKE.hiring)
      const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, terms())
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
      const sell = await prisma.sellContract.findFirstOrThrow({
        where: { requirementId: it_.requisition, personId: it_.worker },
      })
      // The buy side is the supplier's own contract with the person it
      // employs, found through the candidate it names. Raising one side
      // and not the other is the failure this asserts against.
      const buy = await prisma.buyContractCandidate.findFirst({ where: { personId: it_.worker } })
      expect(buy, 'the sell side was raised without the buy side').not.toBeNull()
    })

    it('the program manager could have awarded it too — the split is hiring against reading, not manager against manager', async () => {
      const pm = await prisma.person.findUniqueOrThrow({
        where: { primaryEmail: NIKE.program },
        select: { contexts: { where: { companyId: it_.nike }, select: { role: { select: { permissions: true } } } } },
      })
      expect(pm.contexts[0].role!.permissions).toContain('requirements.write')
      const viewer = await prisma.person.findUniqueOrThrow({
        where: { primaryEmail: SEAT.viewer },
        select: { contexts: { select: { role: { select: { permissions: true } } } } },
      })
      expect(viewer.contexts[0].role!.permissions).not.toContain('requirements.write')
    })
  })
})
