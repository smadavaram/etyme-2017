import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Add contact on the seeded world, after the founder's firm pressed it on
 * 2026-11-14 (fix list A2, record 72). The email's domain names where the
 * contact works; a company not on the list yet is added in the same save,
 * not classified, through the writer Add a company runs; a firm on Etyme
 * she does not work with gets Add a company's own answer; and nothing here
 * sends an email: the one sender is faked and counted.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }),
  }
})

const contacts = await import('@/app/api/contacts/route')
const companies = await import('@/app/api/companies/route')
const { worksForFromEmail } = await import('@/lib/contacts')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const RECRUITER = `world-brightmoor-recruiter${D}`

let brightmoor = { id: '', name: '', isDemo: false }
const add = async (body: object) => json(await contacts.POST(req('POST', '/api/contacts', body)))
const book = async () => {
  const r = await json(await contacts.GET(req('GET', '/api/contacts')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.worksAt
}

beforeAll(async () => {
  await freshWorld()
  brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, name: true, isDemo: true } })
}, 600_000)

describe('a contact at a company not on the list yet', () => {
  let kestrel = ''

  it('an email at a domain nobody has listed adds the company in the same save, not classified, with no register row and nothing sent', async () => {
    as(OWNER)
    const sentBefore = sent.length
    const before = await prisma.automationLog.count({ where: { companyId: brightmoor.id, action: { in: ['COMPANY_CREATED', 'CONTACT_RECORDED'] } } })
    const r = await add({ name: 'Lee Park', email: 'lee.park@kestrel-assembly.example', newCompany: { name: 'Kestrel Assembly' } })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toBe('Lee Park is in your Contacts at Kestrel Assembly. Kestrel Assembly was added to your Companies, not classified. Nothing was sent to anybody.')
    kestrel = r.body.data.company.id
    expect(r.body.data.contact.atCompanyId).toBe(kestrel)
    const c = await prisma.company.findUniqueOrThrow({ where: { id: kestrel }, select: { kind: true, listedById: true, claimedAt: true, domain: true, website: true } })
    expect(c).toEqual({ kind: 'UNCLASSIFIED', listedById: brightmoor.id, claimedAt: null, domain: null, website: 'kestrel-assembly.example' })
    expect(await prisma.counterparty.count({ where: { otherCompanyId: kestrel } })).toBe(0)
    expect(await prisma.context.count({ where: { companyId: kestrel } })).toBe(0)
    // The company's row and the contact's row, both on the firm's own log.
    expect(await prisma.automationLog.count({ where: { companyId: brightmoor.id, action: { in: ['COMPANY_CREATED', 'CONTACT_RECORDED'] } } })).toBe(before + 2)
    expect(sent.length).toBe(sentBefore)
  })

  it('the company added with a contact is on the Companies list, and the next email at that domain chooses it', async () => {
    const list = await json(await companies.GET(req('GET', '/api/companies?records=1')))
    expect(list.body.data.companies.find((x: any) => x.id === kestrel)).toMatchObject({ notClassified: true, notedDomain: 'kestrel-assembly.example' })
    const r = worksForFromEmail('ops@mail.kestrel-assembly.example', await book())
    expect(r).toMatchObject({ read: 'ONE', company: { id: kestrel, name: 'Kestrel Assembly' } })
  })

  it('a second new company on a domain already on the list is refused, naming the one there, and nothing is written', async () => {
    const companiesBefore = await prisma.company.count()
    const r = await add({ name: 'Pat Moss', email: 'pat@kestrel-assembly.example', newCompany: { name: 'Kestrel Assembly West' } })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('A company on your list already uses kestrel-assembly.example. Choose it under Works for.')
    expect(r.body.error.companyId).toBe(kestrel)
    expect(await prisma.company.count()).toBe(companiesBefore)
  })

  it('a personal email never adds a company or names one', async () => {
    const companiesBefore = await prisma.company.count()
    const r = await add({ name: 'Ana Ruiz', email: 'ana.ruiz@gmail.com', newCompany: { name: 'Gmail' } })
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('atCompanyId')
    expect(r.body.error.message).toBe('A new company is added from a work email at its domain. Choose the company they work for, or add it on Companies first.')
    expect(await prisma.company.count()).toBe(companiesBefore)
    expect(worksForFromEmail('ana.ruiz@gmail.com', await book())).toMatchObject({ read: 'NOT_A_COMPANY' })
  })

  it('a new company with no name is refused beside its box, and nothing is written', async () => {
    const r = await add({ name: 'Ana Ruiz', email: 'ana@alder-freight.example', newCompany: { name: ' ' } })
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'newCompanyName', message: 'Give the new company’s name, at least two letters.' })
    expect(await prisma.company.count({ where: { website: 'alder-freight.example' } })).toBe(0)
  })

  it('a seat that may not add a company is told who may, logged first, and can still save a contact at a company on its list', async () => {
    as(RECRUITER)
    const w = await book()
    expect(w.mayRecord).toBe(false)
    expect(w.whoRecords).toMatch(/^Adding a company to your Companies list is for the .+ here\. Ask (them|one of them)\.$/)
    const refusals = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: brightmoor.id } })
    const r = await add({ name: 'Rae Lin', email: 'rae@corvid-mills.example', newCompany: { name: 'Corvid Mills' } })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(w.whoRecords)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: brightmoor.id } })).toBe(refusals + 1)
    expect(await prisma.company.count({ where: { website: 'corvid-mills.example' } })).toBe(0)
    const ok = await add({ name: 'Rae Lin', email: 'rae@kestrel-assembly.example', atCompanyId: kestrel })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    as(OWNER)
  })
})

describe('a domain a firm on Etyme has proved, where she does not work with it', () => {
  let stranger = ''
  beforeAll(async () => {
    as(OWNER)
    stranger = (await prisma.company.create({
      data: { name: 'Halvard Systems', slug: 'halvard-works-for', kind: 'CLIENT', currency: 'USD', claimedAt: new Date(), isDemo: brightmoor.isDemo, domain: 'halvard-systems.example', domainVerified: true },
      select: { id: true },
    })).id
  })

  it('is answered exactly as Add a company answers that domain, with no id, name or address, logged first, and nothing is written', async () => {
    const asCompany = await json(await companies.POST(req('POST', '/api/companies', { name: 'Halvard Systems', kind: 'UNCLASSIFIED', domain: 'halvard-systems.example' })))
    const refusals = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger } })
    const contactsBefore = await prisma.companyContact.count({ where: { companyId: brightmoor.id } })
    const companiesBefore = await prisma.company.count()
    const r = await add({ name: 'Ivo Brandt', email: 'ivo@halvard-systems.example', newCompany: { name: 'Halvard Systems' } })
    expect(r.status).toBe(409)
    expect(r.body.error).toEqual(asCompany.body.error)
    expect(r.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(JSON.stringify(r.body)).not.toMatch(/halvard-works-for|Halvard Systems/)
    expect(r.body.error).not.toHaveProperty('companyId')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger } })).toBe(refusals + 1)
    expect(await prisma.companyContact.count({ where: { companyId: brightmoor.id } })).toBe(contactsBefore)
    expect(await prisma.company.count()).toBe(companiesBefore)
  })

  it('the browser was never handed that firm’s domain, so the form could not have matched it', async () => {
    const w = await book()
    expect(w.companies.some((c: any) => c.domain === 'halvard-systems.example')).toBe(false)
  })
})

describe('the firm’s own people', () => {
  it('an email at the firm’s own domain chooses the firm itself, where the firm has a domain', async () => {
    as(OWNER)
    await prisma.company.update({ where: { id: brightmoor.id }, data: { domain: 'brightmoor-works-for.example' } })
    const w = await book()
    expect(w.own.domain).toBe('brightmoor-works-for.example')
    expect(worksForFromEmail('kim@brightmoor-works-for.example', w)).toEqual({ read: 'OWN', domain: 'brightmoor-works-for.example', id: brightmoor.id })
    const r = await add({ name: 'Kim Soto', email: 'kim@brightmoor-works-for.example', newCompany: { name: 'Brightmoor' } })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe(`brightmoor-works-for.example is your own firm's domain. Choose ${brightmoor.name} (your own firm) under Works for.`)
  })
})
