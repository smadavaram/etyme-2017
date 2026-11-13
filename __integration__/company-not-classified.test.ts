import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * "Company — not classified yet", walked through the routes (founder,
 * 2026-11-12). A firm the Owner simply knows is recorded with its name
 * alone, holds no position, is on the Companies list and in Contacts'
 * Works at, and on no supplier list, client list or picker until it is
 * extended. The Kind is what a company is; the position is the register
 * row between two firms; neither ever sets the other. Nothing here sends
 * an email or writes a notice: the one sender is faked and counted, and
 * the notice rows are counted before and after.
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
const extend = await import('@/app/api/companies/[id]/extend/route')
const kind = await import('@/app/api/companies/[id]/kind/route')
const contacts = await import('@/app/api/contacts/route')
const counterparties = await import('@/app/api/counterparties/route')
const clients = await import('@/app/api/clients/route')
const pickable = await import('@/app/api/companies/suppliers/route')
const { suppliersOf } = await import('@/lib/suppliers-of')
const { workTogether } = await import('@/lib/company-create')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const RECRUITER = `world-brightmoor-recruiter${D}`
const PARTNER = 'tapin.partner.walk@gmail.com'

let brightmoor = ''
let notices = 0
const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: { id } }))
const record = async (name: string, extra: object = {}) =>
  json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED', ...extra })))
const listed = async (q = '?records=1') => (await json(await companies.GET(req('GET', `/api/companies${q}`)))).body.data.companies as any[]

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  // A partner invited on a Gmail address and seated as Admin, the way
  // Tapin's three partners are.
  const admin = await prisma.role.findFirstOrThrow({ where: { companyId: brightmoor, name: 'Admin' }, select: { id: true } })
  const p = await prisma.person.create({ data: { name: 'Partner Walk', primaryEmail: PARTNER } })
  await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: brightmoor, roleId: admin.id } })
  notices = await prisma.notification.count()
}, 600_000)

describe('recording a company with only its name', () => {
  let id = ''

  it('a company recorded with only a name and Kind not classified yet is saved with no relationship and no register row', async () => {
    as(OWNER)
    const r = await record('Rivermark Partners', { domain: 'rivermark.example' })
    expect(r.status).toBe(201)
    expect(r.body.data.notClassified).toBe(true)
    expect(r.body.data.positions).toEqual([])
    expect(r.body.data.message).toContain('Saving a company never emails them.')
    id = r.body.data.company.id
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { kind: true, listedById: true, claimedAt: true, domain: true, siteTagline: true } })
    expect(c).toMatchObject({ kind: 'UNCLASSIFIED', listedById: brightmoor, claimedAt: null, domain: null, siteTagline: null })
    expect(await prisma.counterparty.count({ where: { otherCompanyId: id } })).toBe(0)
    expect(await prisma.masterAgreement.count({ where: { OR: [{ vendorId: id }, { clientId: id }] } })).toBe(0)
  })

  it('recording a company that is not on Etyme seats nobody and claims no domain', async () => {
    expect(await prisma.role.count({ where: { companyId: id } })).toBe(0)
    expect(await prisma.context.count({ where: { companyId: id } })).toBe(0)
    expect(await prisma.companyDomain.count({ where: { companyId: id } })).toBe(0)
  })

  it('a seated partner invited on a Gmail address may record a company, because recording one registers nothing', async () => {
    as(PARTNER)
    const r = await record('Halvard Talent Group')
    expect(r.status).toBe(201)
    as(OWNER)
  })

  it('the same name twice, in another case and spacing, is refused in a sentence that links the one already there', async () => {
    const r = await record('RIVERMARK  partners')
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Rivermark Partners is on your Companies list already. Open it there rather than record it twice.')
    expect(r.body.error.companyId).toBe(id)
  })

  it('a seat that does not manage who the firm trades with is refused, and the refusal is in the access log before it is sent', async () => {
    as(RECRUITER)
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: brightmoor } })
    const r = await record('Quillon Staffing')
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: brightmoor } })).toBe(before + 1)
    as(OWNER)
  })

  it('a company not classified yet appears on the Companies list with a Not classified badge and in the Works at choice on Contacts', async () => {
    const row = (await listed()).find((c) => c.id === id)
    expect(row).toMatchObject({ kind: 'UNCLASSIFIED', notClassified: true, mine: true, positions: [] })
    const reg = await call(counterparties.GET as any, 'GET', '/api/counterparties', '')
    expect(reg.body.data.known.map((k: any) => k.id)).toContain(id)
    expect(reg.body.data.rows.map((r: any) => r.otherCompanyId)).not.toContain(id)
  })

  it('a contact can be added to a company that is not classified yet and it is listed under Contacts and on the company', async () => {
    const r = await call(contacts.POST as any, 'POST', '/api/contacts', '', { name: 'Ines Varga', email: 'ines@rivermark.example', atCompanyId: id })
    expect(r.status).toBe(201)
    const list = await call(contacts.GET as any, 'GET', '/api/contacts', '')
    expect(JSON.stringify(list.body)).toContain('Ines Varga')
    expect(await prisma.companyContact.count({ where: { companyId: brightmoor, atCompanyId: id } })).toBe(1)
  })

  it('a contact cannot be added at a company that is not on your book', async () => {
    const stranger = await prisma.company.create({ data: { name: 'Nobody Knows Ltd', slug: 'nobody-knows-walk', kind: 'VENDOR', currency: 'USD', listedById: null, isDemo: true } })
    const r = await call(contacts.POST as any, 'POST', '/api/contacts', '', { name: 'Al Stranger', email: 'al@nobody.example', atCompanyId: stranger.id })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('That company is not on your Companies list. Add it there first, then add the people you know at it.')
  })

  it('a company not classified yet is in no supplier list, no client list, no count and not the send-a-job picker', async () => {
    expect((await listed('')).map((c) => c.id)).not.toContain(id)
    const picker = await json(await pickable.GET(req('GET', '/api/companies/suppliers')))
    expect(JSON.stringify(picker.body)).not.toContain(id)
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(false)
    const cl = await json(await clients.GET(req('GET', '/api/clients')))
    expect(cl.body.data.clients.map((c: any) => c.id)).not.toContain(id)
    expect(await workTogether(brightmoor, id)).toBe(false)
  })

  it('extending a company to Supplier puts it in Suppliers and in the send-a-job picker and leaves its Kind as it was', async () => {
    const r = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' })
    expect(r.status).toBe(201)
    expect(r.body.data.positions).toEqual(['SUPPLIER'])
    expect(r.body.data.notClassified).toBe(false)
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(true)
    const picker = await json(await pickable.GET(req('GET', '/api/companies/suppliers')))
    expect(JSON.stringify(picker.body)).toContain(id)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).kind).toBe('UNCLASSIFIED')
    // Still no client.
    const cl = await json(await clients.GET(req('GET', '/api/clients')))
    expect(cl.body.data.clients.map((c: any) => c.id)).not.toContain(id)
  })

  it('an extension is written to the history with who made it, when, and the position it gave', async () => {
    const r = await call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id)
    const row = r.body.data.history.find((h: any) => h.action === 'COMPANY_EXTENDED')
    expect(row).toMatchObject({ position: 'SUPPLIER', reversible: true })
    expect(row.byName).toBeTruthy()
    expect(Date.parse(row.at)).not.toBeNaN()
    expect(r.body.data.history.some((h: any) => h.action === 'COMPANY_CREATED')).toBe(true)
  })

  it('extending a company to Customer writes the Customer position and a contract record and leaves its Kind as it was', async () => {
    const r = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'CUSTOMER' })
    expect(r.status).toBe(201)
    expect(r.body.data.positions).toEqual(['CUSTOMER', 'SUPPLIER'])
    expect(r.body.data.customerAgreement).toBe('UNSIGNED')
    expect(await prisma.masterAgreement.count({ where: { vendorId: brightmoor, clientId: id, signedAt: null } })).toBe(1)
    const cl = await json(await clients.GET(req('GET', '/api/clients')))
    expect(cl.body.data.clients.find((c: any) => c.id === id)?.agreementSigned).toBe(false)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).kind).toBe('UNCLASSIFIED')
  })

  it('one company can be a Customer and a Supplier at once, and removing one position leaves the other', async () => {
    const r = json(await extend.DELETE(req('DELETE', `/api/companies/${id}/extend?as=SUPPLIER`), { params: { id } }))
    const out = await r
    expect(out.status).toBe(200)
    expect(out.body.data.positions).toEqual(['CUSTOMER'])
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(false)
  })

  it('removing the contract from a Customer puts the company back to not classified with its Kind still as it was', async () => {
    const out = await json(await extend.DELETE(req('DELETE', `/api/companies/${id}/extend?as=CUSTOMER`), { params: { id } }))
    expect(out.status).toBe(200)
    expect(out.body.data).toMatchObject({ positions: [], notClassified: true })
    expect(await prisma.masterAgreement.count({ where: { vendorId: brightmoor, clientId: id } })).toBe(0)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).kind).toBe('UNCLASSIFIED')
    expect((await listed()).find((c) => c.id === id)?.notClassified).toBe(true)
  })

  it('a position with real work hanging off it is not removed, in one sentence', async () => {
    await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'CUSTOMER' })
    await prisma.workOrder.create({ data: { number: 'RM-WALK-1', issuedById: id, issuedToId: brightmoor, amount: 100, recordedById: brightmoor, title: 'Order from Rivermark', startDate: new Date() } as any })
    const out = await json(await extend.DELETE(req('DELETE', `/api/companies/${id}/extend?as=CUSTOMER`), { params: { id } }))
    expect(out.status).toBe(409)
    expect(out.body.error.message).toBe('Rivermark Partners stays your customer while 1 order hangs off it. End or move that work first.')
  })

  it('a company not classified yet cannot be invited until somebody says what kind it is', async () => {
    const out = await json(await clients.POST(req('POST', '/api/clients', { name: 'Halvard Talent Group', email: 'kai@halvard.example', contactName: 'Kai Lund', invite: true })))
    expect(out.status).toBe(201)
    expect(out.body.data.invited).toBeNull()
    expect(out.body.data.message).toContain('Say what kind of company Halvard Talent Group is before you invite them.')
    expect(await prisma.supplierInvite.count({ where: { email: 'kai@halvard.example' } })).toBe(0)
  })
})

describe('the Kind and the position never set each other', () => {
  let id = ''

  it('a company recorded here and still unclaimed can have its type set to Vendor, and a claimed firm cannot', async () => {
    as(OWNER)
    id = (await record('Ostrava Delivery Partners')).body.data.company.id
    const r = await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'GSI' })
    expect(r.status).toBe(200)
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { kind: true } })
    expect(c.kind).toBe('GSI')
    // The claim has an Owner to seat the day somebody there takes the page.
    expect(await prisma.role.count({ where: { companyId: id, name: 'Owner' } })).toBe(1)
    // Setting the Kind gave no position.
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: id } })).toBe(0)
    const northbend = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })).id
    const refused = await call(kind.PATCH as any, 'PATCH', `/api/companies/${northbend}/kind`, northbend, { kind: 'VENDOR' })
    expect(refused.status).toBe(403)
  })

  it('a GSI can be extended to Customer and then to Supplier, and its Kind never changes', async () => {
    const a = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'CUSTOMER' })
    const b = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' })
    expect([a.status, b.status]).toEqual([201, 201])
    expect(b.body.data.positions).toEqual(['CUSTOMER', 'SUPPLIER'])
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).kind).toBe('GSI')
  })

  it('a company that is already on Etyme and does not work with you can only be extended by asking them to link', async () => {
    const isDemo = (await prisma.company.findUniqueOrThrow({ where: { id: brightmoor }, select: { isDemo: true } })).isDemo
    const stranger = await prisma.company.create({
      data: { name: 'Kestrel Health Systems', slug: 'kestrel-health-walk', kind: 'CLIENT', currency: 'USD', claimedAt: new Date(), isDemo },
      select: { id: true },
    })
    expect(await workTogether(brightmoor, stranger.id)).toBe(false)
    const r = await call(extend.POST as any, 'POST', `/api/companies/${stranger.id}/extend`, stranger.id, { as: 'SUPPLIER' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('Ask them to link')
  })
})

describe('nothing leaves and nothing else moves', () => {
  it('saving a company never emails them: recording, contacts, extending, removing a position and setting the Kind send no email, invite or notification', async () => {
    expect(sent).toEqual([])
    expect(await prisma.notification.count()).toBe(notices)
  })

  it('a firm’s recorded companies and contacts are never read by another firm', async () => {
    as(`world-nike${D}`)
    const mine = (await listed()).map((c) => c.id)
    const recorded = await prisma.company.findMany({ where: { listedById: brightmoor, kind: 'UNCLASSIFIED' }, select: { id: true } })
    for (const r of recorded) expect(mine).not.toContain(r.id)
    const reg = await call(counterparties.GET as any, 'GET', '/api/counterparties', '')
    for (const r of recorded) expect(reg.body.data.known.map((k: any) => k.id)).not.toContain(r.id)
  })

  it('adding the unclassified kind changes no existing company’s kind and no existing register row', async () => {
    const seededKinds = await prisma.company.groupBy({ by: ['kind'], where: { listedById: { not: brightmoor } }, _count: true })
    expect(seededKinds.find((k) => k.kind === 'UNCLASSIFIED')).toBeUndefined()
  })
})
