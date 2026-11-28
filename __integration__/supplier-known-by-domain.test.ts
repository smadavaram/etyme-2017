import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { newChecklist, type Decision } from '@/lib/supplier-onboarding'

/**
 * A supplier is known by its domain on the two demand doors onto the
 * Companies list, the supplier paste and the supplier approval, by the
 * same rule Add a company reads (record 72, items B1 and B3; founder,
 * 2026-11-15: "the email is the identifier"). The same domain is the same
 * company whatever the name; two domains are two companies even under one
 * name; and the domain a supplier came with is kept on the record so its
 * row on Companies shows it. Nothing here sends an email: the one sender
 * is faked and counted.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }),
  }
})

const companies = await import('@/app/api/companies/route')
const suppliers = await import('@/app/api/suppliers/route')
const review = await import('@/app/api/supplier-requests/[id]/route')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const HIRING = `world-northbend-hiring${D}`
const LEAD = `world-northbend-vp${D}`
const AP = `world-northbend-ap${D}`
const HR = `world-northbend-hr${D}`
const PROCUREMENT = `world-northbend-procurement${D}`

let brightmoor = ''
let northbend = ''
let isDemo = false

const listed = async () => {
  const r = await json(await companies.GET(req('GET', '/api/companies?records=1')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.companies as any[]
}
const record = async (name: string, domain?: string) =>
  json(await companies.POST(req('POST', '/api/companies', { name, kind: 'VENDOR', relationship: 'SUPPLIER', ...(domain ? { domain } : {}) })))
const paste = async (rows: object[]) => json(await suppliers.POST(req('POST', '/api/suppliers', { rows })))
const ownByName = (companyId: string, name: string) =>
  prisma.company.count({ where: { listedById: companyId, name: { equals: name, mode: 'insensitive' } } })

/** A recommended supplier walked to Finance at Northbend, every item verified, waiting on the last yes. */
const atFinance = async (name: string, contactEmail: string, domain: string | null) => {
  const people = await prisma.person.findMany({ where: { primaryEmail: { in: [HIRING, LEAD, PROCUREMENT, HR] } }, select: { id: true, primaryEmail: true, name: true } })
  const by = (e: string) => people.find((p) => p.primaryEmail === e)!
  const at = new Date().toISOString()
  const decisions: Decision[] = (['LEAD', 'PROCUREMENT', 'HR'] as const).map((stage, i) => {
    const p = by([LEAD, PROCUREMENT, HR][i])
    return { stage, outcome: 'APPROVED', byId: p.id, byName: p.name, at, note: null }
  })
  const checklist = newChecklist().map((i) => ({ ...i, state: 'HELD' as const, at }))
  const row = await prisma.supplierRequest.create({
    data: {
      companyId: northbend, name, reason: 'Supplies data engineers.', recommendedById: by(HIRING).id, state: 'IN_REVIEW', stage: 'FINANCE',
      decisions: decisions as unknown as object, checklist: checklist as unknown as object,
      token: `domain-walk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      contactEmail, contactName: 'Dana Whitlow', domain,
    },
    select: { id: true },
  })
  return row.id
}
const approve = async (id: string) => {
  as(AP)
  return json(await review.PATCH(req('PATCH', `/api/supplier-requests/${id}`, { action: 'approve' }), { params: Promise.resolve({ id }) } as any))
}

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  const n = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-northbend' }, select: { id: true, isDemo: true } })
  northbend = n.id
  isDemo = n.isDemo
}, 600_000)

describe('the supplier paste knows a company by its domain', () => {
  it('a supplier pasted on a new domain is added although a supplier of the same name is listed on another domain', async () => {
    as(OWNER)
    const first = await record('Northwind Staffing', 'northwind-staffing.example')
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const r = await paste([{ company: 'Northwind Staffing', email: 'desk@northwind-group.example', domain: 'northwind-group.example' }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.added[0].companyId).not.toBe(first.body.data.company.id)
    expect(r.body.data.added[0].says).toBe('Another company on your list is also called Northwind Staffing, on northwind-staffing.example.')
    expect(r.body.data.summary).toContain('Another company on your list is also called Northwind Staffing, on northwind-staffing.example.')
    expect(await ownByName(brightmoor, 'Northwind Staffing')).toBe(2)
  })

  it('a supplier pasted on a domain already on your list under another name is not added twice', async () => {
    as(OWNER)
    const first = await record('Harborline Tech', 'harborline-tech.example')
    const id = first.body.data.company.id
    const r = await paste([{ company: 'Harborline Technologies', email: 'jobs@harborline-tech.example', contactName: 'Ines Marr', domain: 'harborline-tech.example' }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.added[0].companyId).toBe(id)
    expect(r.body.data.added[0].says).toBeUndefined()
    expect(await ownByName(brightmoor, 'Harborline Technologies')).toBe(0)
    expect(await prisma.companyContact.count({ where: { companyId: brightmoor, atCompanyId: id, email: 'jobs@harborline-tech.example' } })).toBe(1)
  })

  it('a supplier pasted on a subdomain of a domain already on your list is that same company', async () => {
    as(OWNER)
    const id = (await record('Quillfeather Partners', 'quillfeather.example')).body.data.company.id
    const r = await paste([{ company: 'Quillfeather', email: 'ap@mail.quillfeather.example', domain: 'mail.quillfeather.example' }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.added[0].companyId).toBe(id)
  })

  it('a supplier pasted by email shows the domain it was pasted with on the Companies list', async () => {
    as(OWNER)
    const r = await paste([{ company: 'Calderbrook Talent', email: 'hello@calderbrook.example', domain: 'calderbrook.example' }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const id = r.body.data.added[0].companyId
    const row = (await listed()).find((c) => c.id === id)
    expect(row).toMatchObject({ domain: null, notedDomain: 'calderbrook.example' })
    // A note, never the column a company's own people join by.
    expect(await prisma.company.findUniqueOrThrow({ where: { id }, select: { domain: true, website: true } })).toEqual({ domain: null, website: 'calderbrook.example' })
  })

  it('a supplier pasted from a personal address keeps no domain, and is that company where the name is already on your list with no domain', async () => {
    as(OWNER)
    const id = (await record('Thornbury Recruiting')).body.data.company.id
    const r = await paste([{ company: 'Thornbury Recruiting', email: 'thornbury.recruits@gmail.com', domain: null }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.added[0].companyId).toBe(id)
    expect((await prisma.company.findUniqueOrThrow({ where: { id }, select: { website: true } })).website).toBeNull()
  })

  it('a pasted row with no company name is not given one from its domain, and the reply says to check the name', async () => {
    as(OWNER)
    const r = await paste([{ company: null, email: 'desk@ottermere.example', domain: 'ottermere.example' }])
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.message).toBe('desk@ottermere.example was not added because it has no company name. Paste it again, check the company name, then press Add.')
    expect(await prisma.company.count({ where: { listedById: brightmoor, name: 'Ottermere' } })).toBe(0)
    expect(sent.filter((to) => to.includes('ottermere'))).toEqual([])
  })

  it('a raw paste sent with no preview saves nothing and says to check each company name first', async () => {
    as(OWNER)
    const r = await json(await suppliers.POST(req('POST', '/api/suppliers', { text: 'desk@pellowmarsh.example' })))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.message).toBe('Nothing was added. Paste the list on Suppliers, check each company name, then press Add.')
    expect(await prisma.company.count({ where: { name: 'Pellowmarsh' } })).toBe(0)
  })
})

describe('the supplier approval knows a company by its domain', () => {
  it('a supplier approved on a new domain is added although a supplier of the same name is listed on another domain', async () => {
    const other = await prisma.company.create({
      data: { name: 'Larchmont Data', slug: `larchmont-data-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: northbend, website: 'larchmont-data.example', isDemo } as any,
      select: { id: true },
    })
    const id = await atFinance('Larchmont Data', 'ops@larchmont-analytics.example', 'larchmont-analytics.example')
    const r = await approve(id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.supplier.id).not.toBe(other.id)
    expect(r.body.data.says).toContain('Another company on your list is also called Larchmont Data, on larchmont-data.example.')
    expect(await ownByName(northbend, 'Larchmont Data')).toBe(2)
  })

  it('a supplier approved on a domain already on your list under another name is not added twice', async () => {
    const mine = await prisma.company.create({
      data: { name: 'Wrenfield Analytics', slug: `wrenfield-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: northbend, website: 'wrenfield.example', isDemo } as any,
      select: { id: true },
    })
    const id = await atFinance('Wrenfield Data Partners', 'desk@wrenfield.example', 'wrenfield.example')
    const r = await approve(id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.supplier.id).toBe(mine.id)
    expect(r.body.data.says).not.toContain('Another company on your list')
    expect(await ownByName(northbend, 'Wrenfield Data Partners')).toBe(0)
    expect(await prisma.counterparty.count({ where: { companyId: northbend, otherCompanyId: mine.id, relationship: 'SUPPLIER', tier: 'APPROVED' } })).toBe(1)
  })

  it('a supplier approved by email shows the domain it was approved with on the Companies list', async () => {
    // No domain typed on the request: the contact's address says it.
    const id = await atFinance('Saltmarsh Engineering', 'lead@saltmarsh-eng.example', null)
    const r = await approve(id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const supplierId = r.body.data.supplier.id
    expect(await prisma.company.findUniqueOrThrow({ where: { id: supplierId }, select: { domain: true, website: true } })).toEqual({ domain: null, website: 'saltmarsh-eng.example' })
    as(`world-northbend-procurement${D}`)
    const row = (await listed()).find((c) => c.id === supplierId)
    expect(row).toMatchObject({ domain: null, notedDomain: 'saltmarsh-eng.example' })
  })
})
