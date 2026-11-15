import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Five faults a reader found by hand on 2026-11-15, after the fix list of
 * 2026-11-14 (record 72). A firm on Etyme that a client only wrote on its
 * own register showed its seated staff under Contacts, and its drawer told
 * its Kind and positions while a firm only sent a job got a 404. A domain
 * box holding an email, a port, a trailing dot or plain words was accepted
 * and dropped without a word. And clearing the domain of a pasted supplier
 * answered "corrected", logged a change, and changed nothing. The sender
 * is faked and counted: none of this emails anybody.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return { ...real, emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }) }
})

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const recordRoute = await import('@/app/api/companies/[id]/record/route')
const clients = await import('@/app/api/clients/route')
const contacts = await import('@/app/api/contacts/route')

const D = '@demo.etyme.local'
const CLIENT_OWNER = `world-nike${D}`
const SUPPLIER_OWNER = `world-brightmoor${D}`

let client = ''
let brightmoor = ''
const listed = async () => {
  const r = await json(await companies.GET(req('GET', '/api/companies?records=1')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.companies as any[]
}
const drawer = async (id: string) => json(await extend.GET(req('GET', `/api/companies/${id}/extend`) as any, { params: { id } }))
const edit = async (id: string, body: object) => json(await recordRoute.PATCH(req('PATCH', `/api/companies/${id}/record`, body) as any, { params: { id } }))
const contactsOf = async () => {
  const r = await json(await contacts.GET(req('GET', '/api/contacts')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.contacts as any[]
}

/** A firm on Etyme, signed up on its own domain, with one seated person. */
async function firmOnEtyme(name: string, slug: string, domain: string, person: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind: 'VENDOR', currency: 'USD', domain, domainVerified: true, claimedAt: new Date('2026-02-02T12:00:00Z'), isDemo: false },
  })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'] } })
  const p = await prisma.person.create({ data: { name: person, primaryEmail: `owner@${domain}` } })
  await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: c.id, roleId: role.id } })
  return c.id
}

beforeAll(async () => {
  await freshWorld()
  client = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })).id
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
}, 600_000)

describe('a firm on Etyme a client only wrote down is not described to it', () => {
  let written = ''
  let sentAJob = ''
  beforeAll(async () => {
    written = await firmOnEtyme('Northwind Staffing', 'northwind-staffing-walk', 'northwind-staffing.example', 'Northwind Owner')
    await prisma.counterparty.create({ data: { companyId: client, otherCompanyId: written, relationship: 'SUPPLIER', status: 'ACTIVE' } })
    sentAJob = await firmOnEtyme('Harborline Tech', 'harborline-tech-walk2', 'harborline-tech.example', 'Harborline Owner')
    const job = await prisma.requirement.findFirstOrThrow({ where: { companyId: client }, select: { id: true } })
    await prisma.requirementInvitation.create({ data: { requirementId: job.id, fromCompanyId: client, toCompanyId: sentAJob, expiresAt: new Date('2027-01-01T00:00:00Z') } })
  })

  it('a client that only wrote a firm on Etyme on its own register sees none of that firm’s seated people under Contacts', async () => {
    as(CLIENT_OWNER)
    const rows = await contactsOf()
    expect(rows.filter((c) => c.at?.id === written)).toEqual([])
    expect(JSON.stringify(rows)).not.toContain('Northwind Owner')
    expect(JSON.stringify(rows)).not.toContain('owner@northwind-staffing.example')
  })

  it('the drawer of a firm on Etyme the reader only wrote on its register is answered as not on its list, and the refusal is logged first', async () => {
    as(CLIENT_OWNER)
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: written } })
    const r = await drawer(written)
    expect(r.status).toBe(404)
    // The answer an id that does not exist gets: no Kind, no position, no name.
    expect(r.body.error).toEqual({ code: 'NOT_FOUND', message: 'That company is not on your Companies list.' })
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: written } })).toBe(before + 1)
  })

  it('a firm the reader only wrote down and a firm it only sent a job to get the same answer from the drawer', async () => {
    as(CLIENT_OWNER)
    const a = await drawer(written)
    const b = await drawer(sentAJob)
    expect([a.status, b.status]).toEqual([404, 404])
    expect(a.body.error).toEqual(b.body.error)
    // And the list draws both as not linked yet, so no row opens a drawer that refuses.
    const rows = (await listed()).filter((c) => c.id === written || c.id === sentAJob)
    expect(rows.map((r) => r.notLinked)).toEqual([true, true])
  })

  it('once the other firm writes the client on its own register, its people are under Contacts and its drawer opens', async () => {
    await prisma.counterparty.create({ data: { companyId: written, otherCompanyId: client, relationship: 'CLIENT', status: 'ACTIVE' } })
    as(CLIENT_OWNER)
    expect((await contactsOf()).some((c) => c.at?.id === written && c.name === 'Northwind Owner')).toBe(true)
    expect((await drawer(written)).status).toBe(200)
  })
})

describe('the domain box says what it kept, or refuses in a sentence', () => {
  it('an email address typed in the domain box on Add a company keeps its domain, and the reply says so', async () => {
    as(SUPPLIER_OWNER)
    const r = await json(await companies.POST(req('POST', '/api/companies', { name: 'Quillmark Systems', kind: 'UNCLASSIFIED', domain: 'jobs@quillmark-walk.example' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toContain('The domain was taken from the email address you typed: quillmark-walk.example.')
    const row = (await listed()).find((c) => c.id === r.body.data.company.id)
    expect(row).toMatchObject({ notedDomain: 'quillmark-walk.example', domain: null })
  })

  it('a domain with a port, a trailing dot or plain words is refused on Add a company in a sentence, and nothing is recorded', async () => {
    as(SUPPLIER_OWNER)
    const before = await prisma.company.count({ where: { listedById: brightmoor } })
    for (const typed of ['probe02.example:8080', 'probe02.example.', 'not a domain!!']) {
      const r = await json(await companies.POST(req('POST', '/api/companies', { name: `Probe ${typed}`, kind: 'UNCLASSIFIED', domain: typed })))
      expect(r.status, typed).toBe(422)
      expect(r.body.error).toMatchObject({ field: 'domain', message: `${typed} does not read as a domain. Type it like northwind-staffing.example, or leave the box empty.` })
    }
    // The same answer whatever Kind is chosen.
    const v = await json(await companies.POST(req('POST', '/api/companies', { name: 'Probe Vendor', kind: 'VENDOR', relationship: 'SUPPLIER', domain: 'probe02.example:8080' })))
    expect(v.status).toBe(422)
    expect(await prisma.company.count({ where: { listedById: brightmoor } })).toBe(before)
  })

  it('the clients door reads the domain box the same way: an email keeps its domain and says so, anything else is refused', async () => {
    as(SUPPLIER_OWNER)
    const ok = await json(await clients.POST(req('POST', '/api/clients', { name: 'Larkspur Mills', domain: 'ap@larkspur-walk.example' })))
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    expect(ok.body.data.message).toContain('The domain was taken from the email address you typed: larkspur-walk.example.')
    expect((await listed()).find((c) => c.id === ok.body.data.client.id)).toMatchObject({ notedDomain: 'larkspur-walk.example' })
    const no = await json(await clients.POST(req('POST', '/api/clients', { name: 'Larkspur Two', domain: 'larkspur-two.example.' })))
    expect(no.status).toBe(422)
    expect(no.body.error.field).toBe('domain')
    expect(await prisma.company.count({ where: { name: 'Larkspur Two' } })).toBe(0)
  })
})

describe('clearing the domain of a pasted supplier', () => {
  let pasted = ''
  beforeAll(async () => {
    const c = await prisma.company.create({ data: { name: 'Tidewater Talent', slug: 'tidewater-talent-walk', kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo: false } })
    pasted = c.id
    await prisma.counterparty.create({ data: { companyId: brightmoor, otherCompanyId: c.id, relationship: 'SUPPLIER', status: 'ACTIVE' } })
    await prisma.supplierInvite.create({ data: { companyId: c.id, byId: brightmoor, email: 'ops@tidewater-walk.example', domain: 'tidewater-walk.example', token: `walk-tidewater-${Date.now()}` } })
  })

  it('clearing the domain of a company made by the supplier paste takes it off the list, and the log says what the list now reads', async () => {
    as(SUPPLIER_OWNER)
    expect((await listed()).find((c) => c.id === pasted)).toMatchObject({ notedDomain: 'tidewater-walk.example', notedFrom: 'INVITATION' })
    const r = await edit(pasted, { name: 'Tidewater Talent', domain: '', entityType: '' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.changes).toEqual([{ box: 'domain', from: 'tidewater-walk.example', to: null }])
    expect((await listed()).find((c) => c.id === pasted)).toMatchObject({ notedDomain: null })
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: brightmoor, action: 'COMPANY_RECORD_EDITED' }, orderBy: { at: 'desc' }, select: { summary: true } })
    expect(log.summary).toContain('the domain from tidewater-walk.example to nothing')
    // The invitation itself is untouched: nothing on it is rewritten.
    expect((await prisma.supplierInvite.findFirstOrThrow({ where: { companyId: pasted }, select: { domain: true } })).domain).toBe('tidewater-walk.example')
  })

  it('a cleared domain saved again with no change says nothing changed and writes no log row', async () => {
    as(SUPPLIER_OWNER)
    const before = await prisma.automationLog.count({ where: { companyId: brightmoor, action: 'COMPANY_RECORD_EDITED' } })
    const r = await edit(pasted, { name: 'Tidewater Talent', domain: '', entityType: '' })
    expect(r.body.data).toMatchObject({ changed: false })
    expect(await prisma.automationLog.count({ where: { companyId: brightmoor, action: 'COMPANY_RECORD_EDITED' } })).toBe(before)
  })

  it('a domain typed again after it was cleared is the one the list shows', async () => {
    as(SUPPLIER_OWNER)
    const r = await edit(pasted, { name: 'Tidewater Talent', domain: 'tidewater-talent.example', entityType: '' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await listed()).find((c) => c.id === pasted)).toMatchObject({ notedDomain: 'tidewater-talent.example', notedFrom: 'TYPED' })
  })

  it('Edit takes an email address in the domain box the way Add a company does', async () => {
    as(SUPPLIER_OWNER)
    const r = await edit(pasted, { name: 'Tidewater Talent', domain: 'hr@tidewater-hr.example', entityType: '' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await listed()).find((c) => c.id === pasted)).toMatchObject({ notedDomain: 'tidewater-hr.example' })
  })
})

it('nothing was emailed at any step', () => {
  expect(sent).toEqual([])
})
