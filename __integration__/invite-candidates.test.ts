import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as invite } from '@/app/api/consultants/invite/route'
import { POST as nudge } from '@/app/api/bench/listings/[id]/nudge/route'

/**
 * Invite candidates, several at once (Tapin's first week, 2026-11-14),
 * through the real route as real seats. Every address goes through the
 * one door a single add uses, and is answered on its own line.
 */

const OWNER = 'owner@invite-bench.test'
const HR = 'hr@invite-bench.test'
const MAYA = 'maya@invite-gmail.test'
let companyId = ''
let mayaId = ''

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  delete process.env.RESEND_API_KEY
  delete process.env.SENDGRID_API_KEY

  const firm = await prisma.company.create({ data: { name: 'Invite Bench Partners', slug: 'invite-bench', kind: 'VENDOR', currency: 'USD' } })
  companyId = firm.id
  const ownerRole = await prisma.role.create({ data: { companyId, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: 'Odile Varga', primaryEmail: OWNER } })
  await prisma.context.create({ data: { personId: owner.id, companyId, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })

  // A seat that reads Candidates and adds nobody.
  const engRole = await prisma.role.create({ data: { companyId, name: 'Reader', permissions: ['consultants.read', 'submissions.read'] } })
  const hr = await prisma.person.create({ data: { name: 'Hana Ito', primaryEmail: HR } })
  await prisma.context.create({ data: { personId: hr.id, companyId, roleId: engRole.id, type: 'EMPLOYEE', grantReason: 'reader' } })

  // Maya signed up herself: a person and a profile, no firm.
  const maya = await prisma.person.create({ data: { name: 'Maya Brooks', primaryEmail: MAYA } })
  mayaId = maya.id
  await prisma.consultantProfile.create({ data: { personId: mayaId, skills: ['Data engineering'], visibility: 'INTERNAL' } })
}, 180_000)

describe('a recruiter invites candidates in one press', () => {
  it('three candidates are invited in one press, each asked onto the bench on her own line, and nobody is seated before her yes', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', {
      list: 'Ana Ruiz <ana@invite-gmail.test>\nben@invite-gmail.test, Chloe Park chloe@invite-gmail.test',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const lines = r.body.data.results
    expect(lines.map((l: { email: string }) => l.email)).toEqual(['ana@invite-gmail.test', 'ben@invite-gmail.test', 'chloe@invite-gmail.test'])
    expect(lines.every((l: { asked: boolean }) => l.asked)).toBe(true)
    for (const email of ['ana@invite-gmail.test', 'ben@invite-gmail.test', 'chloe@invite-gmail.test']) {
      const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email } })
      const listing = await prisma.benchListing.findFirstOrThrow({ where: { companyId, consultant: { personId: person.id } } })
      expect(listing.state).toBe('INVITED')
      expect(await prisma.context.count({ where: { personId: person.id, companyId } })).toBe(0)
    }
    expect((await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'ana@invite-gmail.test' } })).name).toBe('Ana Ruiz')
    expect((await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'ben@invite-gmail.test' } })).name).toBe('ben')
  })

  it('where no email can leave, the answer says the links are kept for staff, never that an email went, and returns no link', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: 'dev@invite-gmail.test' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.mailLeaves).toBe(false)
    expect(r.body.data.says).toContain('kept on the notice for staff')
    expect(r.body.data.results[0].says).not.toMatch(/went by email/)
    expect(JSON.stringify(r.body)).not.toMatch(/bench-invite\//)
  })

  it('a candidate who already has an account is asked on her own record, never a second one', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: `M. Brooks <${MAYA}>` })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.results[0].state).toBe('ASKED_ON_OWN_RECORD')
    expect(await prisma.person.count({ where: { primaryEmail: MAYA } })).toBe(1)
    expect((await prisma.person.findUniqueOrThrow({ where: { id: mayaId } })).name).toBe('Maya Brooks')
  })

  it('an address already asked, or not an email address, is answered on its own line and never stops the rest', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: 'ana@invite-gmail.test\nnot-an-address\neli@invite-gmail.test' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const [ana, junk, eli] = r.body.data.results
    expect(ana).toMatchObject({ state: 'ALREADY_ASKED', asked: false })
    expect(ana.says).toContain('Use Resend on their row')
    expect(junk).toMatchObject({ state: 'NOT_AN_EMAIL', asked: false })
    expect(eli).toMatchObject({ state: 'ASKED', asked: true })
    const anaId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'ana@invite-gmail.test' } })).id
    expect(await prisma.benchListing.count({ where: { companyId, consultant: { personId: anaId } } })).toBe(1)
  })

  it('a candidate already on the bench reads already on your bench, and nothing is sent', async () => {
    const anaId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'ana@invite-gmail.test' } })).id
    await prisma.benchListing.updateMany({ where: { companyId, consultant: { personId: anaId } }, data: { state: 'GRANTED' } })
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: 'ana@invite-gmail.test' })))
    expect(r.body.data.results[0]).toMatchObject({ state: 'ALREADY_ON', says: 'Already on your bench. Nothing was sent.' })
  })

  it('an empty box is refused in a sentence beside the box', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: '  ' })))
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'list', message: 'Type the addresses, one per line or separated by commas.' })
  })

  it('a seat that cannot add consultants is refused inviting candidates, in a sentence naming who can, and nothing is written', async () => {
    as(HR)
    const before = await prisma.benchListing.count({ where: { companyId } })
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: 'zed@invite-gmail.test' })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/Adding a consultant is done by/)
    expect(await prisma.benchListing.count({ where: { companyId } })).toBe(before)
  })
})

describe('Resend on a Candidates row', () => {
  it('a candidate asked and not answered can be sent the invitation again from her row', async () => {
    const benId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'ben@invite-gmail.test' } })).id
    const listing = await prisma.benchListing.findFirstOrThrow({ where: { companyId, consultant: { personId: benId } } })
    as(OWNER)
    const r = await json(await nudge(req('POST', `/api/bench/listings/${listing.id}/nudge`, { copyOnly: false }), { params: Promise.resolve({ id: listing.id }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toMatch(/ben/)
    expect(await prisma.automationLog.count({ where: { companyId, action: 'BENCH_INVITATION_RESENT' } })).toBe(1)
  })
})
