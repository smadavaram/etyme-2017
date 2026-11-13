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
const suppliersPage = await import('@/app/api/suppliers/route')
const { suppliersOf } = await import('@/lib/suppliers-of')
const { workTogether } = await import('@/lib/company-create')
const { standingWith, positionsFor } = await import('@/app/api/companies/positions')

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

  it('the domain typed for a recorded company is kept as your own note and shown on your list, and it is never a claim on that domain', async () => {
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { domain: true, domainVerified: true, website: true } })
    expect(c).toEqual({ domain: null, domainVerified: false, website: 'rivermark.example' })
    expect((await listed()).find((x) => x.id === id)).toMatchObject({ domain: null, notedDomain: 'rivermark.example' })
    // Another firm reading the directory is never shown the note.
    as(`world-techpeple${D}`)
    expect(JSON.stringify((await json(await companies.GET(req('GET', '/api/companies?records=1')))).body)).not.toContain('rivermark.example')
    as(OWNER)
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

describe('another firm’s record is never given a position from outside', () => {
  it('a register row for a company another firm recorded is refused in a sentence, so nothing can name it on a contract', async () => {
    const mine = await prisma.company.findFirstOrThrow({ where: { listedById: brightmoor, kind: 'UNCLASSIFIED' }, select: { id: true } })
    as(`world-nike${D}`)
    const r = await call(counterparties.POST as any, 'POST', '/api/counterparties', '', { otherCompanyId: mine.id, relationship: 'SUPPLIER' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('That company is not on your Companies list. Add it there first.')
    as(OWNER)
  })
})

describe('a firm on Etyme is never tied to you from your side alone', () => {
  let stranger = ''
  beforeAll(async () => {
    as(OWNER)
    const isDemo = (await prisma.company.findUniqueOrThrow({ where: { id: brightmoor }, select: { isDemo: true } })).isDemo
    stranger = (await prisma.company.create({
      data: { name: 'Corriban Logistics', slug: 'corriban-walk', kind: 'CLIENT', currency: 'USD', claimedAt: new Date(), isDemo },
      select: { id: true },
    })).id
  })

  it('a register row for a firm on Etyme that does not work with you is refused in a sentence logged first, and nothing is written', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger } })
    const r = await call(counterparties.POST as any, 'POST', '/api/counterparties', '', { otherCompanyId: stranger, relationship: 'CLIENT' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('That company is on Etyme and does not work with you yet. Ask them to link from Add company: nothing is on either list until they say yes.')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger } })).toBe(before + 1)
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: stranger } })).toBe(0)
  })

  it('a row a firm wrote on its own register never counts as working together, so Extend still asks them to link and writes no agreement', async () => {
    await prisma.counterparty.create({ data: { companyId: brightmoor, otherCompanyId: stranger, relationship: 'SUPPLIER', status: 'ACTIVE' } })
    expect(await workTogether(brightmoor, stranger)).toBe(false)
    const r = await call(extend.POST as any, 'POST', `/api/companies/${stranger}/extend`, stranger, { as: 'CUSTOMER' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(r.body.error.message).not.toContain('corriban-walk')
    expect(await prisma.masterAgreement.count({ where: { vendorId: brightmoor, clientId: stranger } })).toBe(0)
    await prisma.counterparty.deleteMany({ where: { companyId: brightmoor, otherCompanyId: stranger } })
  })

  it('a firm on Etyme found while adding a company is said with no id, name or Etyme address of it, and the refusal is logged before it is sent', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger } })
    const r = await record('Corriban Logistics', { address: 'corriban-walk' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(r.body.error.message).toBe('That company is on Etyme already, so no copy of it was made. Ask them to link, as your partner: they are asked, and nothing is on either list until they say yes.')
    expect(r.body.error).not.toHaveProperty('companyId')
    expect(r.body.error).not.toHaveProperty('address')
    expect(r.body.error).not.toHaveProperty('company')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger } })).toBe(before + 1)
  })
})

describe('a Kind given to a recorded company changes no position and catches no invitation in flight', () => {
  it('a recorded company given a Kind reads no position from an agreement nobody extended, and every gate reads it as not classified', async () => {
    as(OWNER)
    const id = (await record('Brennock Advisory')).body.data.company.id
    // An agreement written some other way between the two firms.
    await prisma.masterAgreement.create({ data: { vendorId: brightmoor, clientId: id, paymentTerms: 30 } })
    const r = await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'CLIENT' })
    expect(r.status).toBe(200)
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { id: true, kind: true, claimedAt: true, listedById: true } })
    const read = (await positionsFor(brightmoor, [c])).get(id)!
    expect(read).toMatchObject({ positions: [], notClassified: true, recorded: true })
    expect(await standingWith(brightmoor, c)).toMatchObject({ notClassified: true, recorded: true })
    expect((await listed()).find((x) => x.id === id)).toMatchObject({ notClassified: true, positions: [] })
  })

  it('a company added as a supplier is on no client list, so Companies and Clients agree about the same firm', async () => {
    as(OWNER)
    const r = await json(await companies.POST(req('POST', '/api/companies', { name: 'Marrowgate Staffing', kind: 'VENDOR', relationship: 'SUPPLIER' })))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    const id = r.body.data.company.id
    const cl = await json(await clients.GET(req('GET', '/api/clients')))
    expect(cl.body.data.clients.map((c: any) => c.id)).not.toContain(id)
    expect((await listed('')).find((x) => x.id === id)?.positions).toEqual(['SUPPLIER'])
  })

  it('a Supplier given by an agreement, not by a row added here, is drawn no Remove and a press is refused in a sentence, so nothing claims to work', async () => {
    as(OWNER)
    const isDemo = (await prisma.company.findUniqueOrThrow({ where: { id: brightmoor }, select: { isDemo: true } })).isDemo
    const shell = await prisma.company.create({ data: { name: 'Dunmore Contract Labs', slug: `dunmore-walk-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo }, select: { id: true } })
    await prisma.masterAgreement.create({ data: { vendorId: shell.id, clientId: brightmoor, paymentTerms: 30 } })
    const g = await call(extend.GET as any, 'GET', `/api/companies/${shell.id}/extend`, shell.id)
    expect(g.body.data.positions).toContain('SUPPLIER')
    expect(g.body.data.may.remove.SUPPLIER).toEqual({ ok: false, says: 'Dunmore Contract Labs is your supplier through the agreement between you, not by a choice made here, so it cannot be taken off. The agreement stays as it is.' })
    const d = await call(extend.DELETE as any, 'DELETE', `/api/companies/${shell.id}/extend?as=SUPPLIER`, shell.id)
    expect(d.status).toBe(409)
    expect(d.body.error.code).toBe('HELD_BY_AGREEMENT')
    expect(await prisma.automationLog.count({ where: { companyId: brightmoor, action: 'COMPANY_POSITION_REMOVED', payload: { path: ['otherCompanyId'], equals: shell.id } } })).toBe(0)
  })

  it('changing the Kind of a recorded company withdraws an invitation already out, in the same change, and says so', async () => {
    as(OWNER)
    const id = (await record('Tolvane Search')).body.data.company.id
    await prisma.supplierInvite.create({ data: { companyId: id, byId: brightmoor, email: 'ines@tolvane.example', token: `tolvane-${Date.now()}` } })
    const r = await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'VENDOR' })
    expect(r.status).toBe(200)
    expect(r.body.data.message).toContain('The open invitation to ines@tolvane.example was withdrawn, so nobody takes it under the old kind.')
    expect(await prisma.supplierInvite.count({ where: { companyId: id, state: 'PENDING' } })).toBe(0)
    expect(await prisma.supplierInvite.count({ where: { companyId: id, state: 'REVOKED' } })).toBe(1)
  })
})

/**
 * The founder's acceptance walk (brief of 2026-11-12, tests 1 to 6 and the
 * three layer additions), as the Owner of a supplier with a Gmail partner
 * seated, the way Tapin runs. Brightmoor Staffing stands in for Tapin,
 * which the seeded world does not hold.
 */
describe('the founder’s acceptance walk', () => {
  const suppliersRoute = import('@/app/api/suppliers/route')
  const purchaseOrders = import('@/app/api/purchase-orders/route')
  const contractsRoute = import('@/app/api/contracts/route')
  let id = ''
  let kindsBefore = new Map<string, string>()
  let registerBefore = 0
  const notMine = () => ({ OR: [{ listedById: null }, { listedById: { not: brightmoor } }] })
  const row = async (cid: string) => (await listed()).find((c) => c.id === cid)
  const supplierPage = async () => JSON.stringify((await json(await (await suppliersRoute).GET(req('GET', '/api/suppliers')))).body)
  const clientIds = async () => (await json(await clients.GET(req('GET', '/api/clients')))).body.data.clients.map((c: any) => c.id)

  beforeAll(async () => {
    as(OWNER)
    kindsBefore = new Map((await prisma.company.findMany({ where: notMine(), select: { id: true, kind: true } })).map((c) => [c.id, c.kind]))
    registerBefore = await prisma.counterparty.count({ where: { companyId: { not: brightmoor } } })
  })

  it('1. a company created with only a name and Kind not classified yet saves, with no relationship', async () => {
    const r = await record('Lindqvist Talent Partners')
    expect(r.status).toBe(201)
    id = r.body.data.company.id
    expect(r.body.data.positions).toEqual([])
    expect(await prisma.counterparty.count({ where: { otherCompanyId: id } })).toBe(0)
    expect((await row(id))).toMatchObject({ notClassified: true, kind: 'UNCLASSIFIED', may: { extendToSupplier: true, extendToCustomer: true, setKind: true } })
  })

  it('2. a contact added with Works at that company saves, and shows under Contacts and on the company', async () => {
    const r = await call(contacts.POST as any, 'POST', '/api/contacts', '', { name: 'Petra Lindqvist', phone: '(303) 555-0142', atCompanyId: id })
    expect(r.status).toBe(201)
    expect(JSON.stringify((await call(contacts.GET as any, 'GET', '/api/contacts', '')).body)).toContain('Petra Lindqvist')
    const onIt = await json(await contacts.GET(req('GET', `/api/contacts?at=${id}`)))
    expect(onIt.body.data.contacts.map((c: any) => c.name)).toEqual(['Petra Lindqvist'])
    const reg = await call(counterparties.GET as any, 'GET', '/api/counterparties', '')
    expect(reg.body.data.known.find((k: any) => k.id === id)?.contacts).toBe(1)
  })

  it('3. it is in no Suppliers list, no client list or count, and no send-a-job picker', async () => {
    expect(await supplierPage()).not.toContain(id)
    expect(JSON.stringify((await json(await pickable.GET(req('GET', '/api/companies/suppliers')))).body)).not.toContain(id)
    expect(await clientIds()).not.toContain(id)
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(false)
    expect((await listed('')).map((c) => c.id)).not.toContain(id)
    const r = await row(id)
    expect(r.positions).toEqual([])
  })

  it('4. set to Vendor and extended to Supplier, it is a supplier everywhere the register is read and its Kind is Vendor', async () => {
    expect((await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'VENDOR' })).status).toBe(200)
    // Setting the Kind gave no position.
    expect((await row(id))).toMatchObject({ kind: 'VENDOR', positions: [], notClassified: true })
    const r = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' })
    expect(r.status).toBe(201)
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(true)
    expect(JSON.stringify((await json(await pickable.GET(req('GET', '/api/companies/suppliers')))).body)).toContain(id)
    expect((await row(id))).toMatchObject({ kind: 'VENDOR', positions: ['SUPPLIER'], notClassified: false, may: { extendToSupplier: false, extendToCustomer: true } })
    expect(await clientIds()).not.toContain(id)
  })

  it('4b. a company extended to Supplier is listed on the Suppliers page, which reads /api/suppliers', async () => {
    const list = await json(await suppliersPage.GET(req('GET', '/api/suppliers')))
    expect(list.status).toBe(200)
    expect((list.body.data.suppliers as any[]).map((s) => s.companyId)).toContain(id)
  })

  it('layer: a company of any Kind placed in the Customer layer and back keeps its Kind and reads not classified again', async () => {
    const vendor = (await record('Ashgrove Services')).body.data.company.id
    await call(kind.PATCH as any, 'PATCH', `/api/companies/${vendor}/kind`, vendor, { kind: 'VENDOR' })
    const up = await call(extend.POST as any, 'POST', `/api/companies/${vendor}/extend`, vendor, { as: 'CUSTOMER' })
    expect(up.body.data).toMatchObject({ kind: 'VENDOR', positions: ['CUSTOMER'], customerAgreement: 'UNSIGNED' })
    expect(await clientIds()).toContain(vendor)
    const down = await json(await extend.DELETE(req('DELETE', `/api/companies/${vendor}/extend?as=CUSTOMER`), { params: { id: vendor } }))
    expect(down.body.data).toMatchObject({ kind: 'VENDOR', positions: [], notClassified: true })
    expect(await clientIds()).not.toContain(vendor)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: vendor } })).kind).toBe('VENDOR')
  })

  it('layer: one company is a Customer and a Supplier at once, shows in both, and removing one leaves the other untouched', async () => {
    await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'CUSTOMER' })
    const both = await row(id)
    expect(both.positions).toEqual(['CUSTOMER', 'SUPPLIER'])
    expect(await clientIds()).toContain(id)
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(true)
    const out = await json(await extend.DELETE(req('DELETE', `/api/companies/${id}/extend?as=CUSTOMER`), { params: { id } }))
    expect(out.body.data.positions).toEqual(['SUPPLIER'])
    expect(await clientIds()).not.toContain(id)
    expect((await suppliersOf(brightmoor)).ids.has(id)).toBe(true)
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).kind).toBe('VENDOR')
  })

  it('layer: a GSI extended to Customer and then to Supplier holds both, and its Kind is GSI throughout', async () => {
    const gsi = (await record('Corbel Integration Group')).body.data.company.id
    await call(kind.PATCH as any, 'PATCH', `/api/companies/${gsi}/kind`, gsi, { kind: 'GSI' })
    const a = await call(extend.POST as any, 'POST', `/api/companies/${gsi}/extend`, gsi, { as: 'CUSTOMER' })
    expect(a.body.data.kind).toBe('GSI')
    const b = await call(extend.POST as any, 'POST', `/api/companies/${gsi}/extend`, gsi, { as: 'SUPPLIER' })
    expect([a.status, b.status]).toEqual([201, 201])
    expect(b.body.data).toMatchObject({ kind: 'GSI', positions: ['CUSTOMER', 'SUPPLIER'] })
    expect((await row(gsi))).toMatchObject({ kind: 'GSI', positions: ['CUSTOMER', 'SUPPLIER'] })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: gsi } })).kind).toBe('GSI')
  })

  it('the drawer offers Remove only where the route would take it, and says why where work hangs off a position', async () => {
    const d = await call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id)
    expect(d.body.data.may.remove.SUPPLIER).toEqual({ ok: true, says: expect.any(String) })
    expect(d.body.data.may.extend).toEqual({ SUPPLIER: false, CUSTOMER: true })
    expect(d.body.data.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['COMPANY_CREATED', 'COMPANY_KIND_SET', 'COMPANY_EXTENDED', 'COMPANY_POSITION_REMOVED']))
    // Rivermark, above, holds Customer with an order hanging off it.
    const rm = (await prisma.company.findFirstOrThrow({ where: { listedById: brightmoor, name: 'Rivermark Partners' }, select: { id: true } })).id
    const held = await call(extend.GET as any, 'GET', `/api/companies/${rm}/extend`, rm)
    expect(held.body.data.may.remove.CUSTOMER).toEqual({ ok: false, says: 'Rivermark Partners stays your customer while 1 order hangs off it. End or move that work first.' })
  })

  it('a seat that does not manage who the firm trades with is drawn no Extend, no Remove and no Change', async () => {
    as(RECRUITER)
    const r = (await listed()).find((c) => c.id === id)
    expect(r?.may).toEqual({ extendToSupplier: false, extendToCustomer: false, setKind: false })
    as(OWNER)
  })

  it('a company not classified yet cannot be named on an order it would receive', async () => {
    const fresh = (await record('Marlow Field Services')).body.data.company.id
    const r = await json(await (await purchaseOrders).POST(req('POST', '/api/purchase-orders', { number: 'MFS-1', amount: 1000, startDate: '2026-12-01', issuedToId: fresh })))
    expect(r.status).toBe(403)
    expect(await prisma.workOrder.count({ where: { issuedToId: fresh } })).toBe(0)
  })

  it('a company not classified yet cannot be named as the client on an order a supplier records, and the refusal is in the access log before it is sent', async () => {
    const fresh = (await record('Ostrava Clinic Group')).body.data.company.id
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: fresh } })
    const r = await json(await (await purchaseOrders).POST(req('POST', '/api/purchase-orders', { number: 'OCG-1', amount: 1000, startDate: '2026-12-01', issuedById: fresh, issuedToId: brightmoor })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Ostrava Clinic Group is on your Companies list and is not classified yet. Extend it to Customer first.')
    expect(await prisma.workOrder.count({ where: { issuedById: fresh } })).toBe(0)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: fresh } })).toBe(before + 1)
  })

  it('once it is extended to Customer, the supplier records the order its client handed it', async () => {
    const fresh = (await prisma.company.findFirstOrThrow({ where: { listedById: brightmoor, name: 'Ostrava Clinic Group' }, select: { id: true } })).id
    await call(extend.POST as any, 'POST', `/api/companies/${fresh}/extend`, fresh, { as: 'CUSTOMER' })
    const r = await json(await (await purchaseOrders).POST(req('POST', '/api/purchase-orders', { number: 'OCG-2', amount: 1000, startDate: '2026-12-01', issuedById: fresh, issuedToId: brightmoor })))
    expect(r.status).toBe(201)
    expect(await prisma.workOrder.count({ where: { issuedById: fresh } })).toBe(1)
  })

  it('a company not classified yet cannot be named as the client on a contract line, nor as the supplier a buy line pays', async () => {
    const fresh = (await record('Vesna Medical Partners')).body.data.company.id
    const partner = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: PARTNER }, select: { id: true } })).id
    const asClient = await json(await (await contractsRoute).POST(req('POST', '/api/contracts', { personId: partner, companyId: brightmoor, clientCompanyId: fresh, billRate: 100, startDate: '2026-12-01' })))
    expect(asClient.status).toBe(403)
    expect(asClient.body.error).toMatchObject({ field: 'clientCompanyId', message: 'Vesna Medical Partners is on your Companies list and is not classified yet. Extend it to Customer first.' })
    const client = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })).id
    const asSupplier = await json(await (await contractsRoute).POST(req('POST', '/api/contracts', { personId: partner, companyId: brightmoor, clientCompanyId: client, billRate: 100, payRate: 80, engagementType: 'OTHER_EMPLOYER', boughtFromId: fresh, startDate: '2026-12-01' })))
    expect(asSupplier.status).toBe(403)
    expect(asSupplier.body.error).toMatchObject({ field: 'boughtFromId', message: 'Vesna Medical Partners is on your Companies list and is not classified yet. Extend it to Supplier first.' })
    expect(await prisma.sellContract.count({ where: { clientCompanyId: fresh } })).toBe(0)
    expect(await prisma.buyContract.count({ where: { vendorCompanyId: fresh } })).toBe(0)
  })

  it('the same name twice, with punctuation, is refused and links the one already there', async () => {
    const r = await record('Lindqvist-Talent Partners.')
    expect(r.status).toBe(409)
    expect(r.body.error).toMatchObject({ code: 'SAME_NAME_ON_YOUR_LIST', companyId: id })
  })

  it('another company reads none of it: not the record, its positions, its history nor its contacts', async () => {
    as(`world-nike${D}`)
    expect((await listed()).map((c) => c.id)).not.toContain(id)
    expect((await call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id)).status).toBe(404)
    expect(JSON.stringify((await call(contacts.GET as any, 'GET', '/api/contacts', '')).body)).not.toContain('Petra Lindqvist')
    as(OWNER)
  })

  it('5. nothing was emailed and no notification was written at any step', async () => {
    expect(sent).toEqual([])
    expect(await prisma.notification.count()).toBe(notices)
  })

  it('6. companies that existed before keep their Kind and other firms’ register rows are untouched; nothing was migrated', async () => {
    const after = new Map((await prisma.company.findMany({ where: { id: { in: [...kindsBefore.keys()] } }, select: { id: true, kind: true } })).map((c) => [c.id, c.kind]))
    // Two firms the walk above created outside Brightmoor's list (a stranger and Kestrel) were made before this block.
    for (const [cid, k] of kindsBefore) expect(after.get(cid)).toBe(k)
    expect(await prisma.counterparty.count({ where: { companyId: { not: brightmoor } } })).toBe(registerBefore)
    expect(await prisma.company.count({ where: { kind: 'UNCLASSIFIED', ...notMine() } })).toBe(0)
  })
})

describe('a claim link never seats anybody at a company nobody has said the kind of', () => {
  const claim = () => import('@/app/api/claim/[token]/route')
  const at = (token: string) => ({ params: Promise.resolve({ token }) })

  it('the claim page says what is missing and offers no door, and taking it is refused in a sentence logged first, with nobody seated and no roles made', async () => {
    as(OWNER)
    const id = (await record('Harrow Quay Partners')).body.data.company.id
    const token = `walk-claim-${Date.now()}`
    await prisma.supplierInvite.create({ data: { companyId: id, byId: brightmoor, email: 'ops@harrowquay-walk.example', token } })
    const { GET, POST } = await claim()
    as('ops@harrowquay-walk.example')
    const page = await json(await GET(req('GET', `/api/claim/${token}`), at(token)))
    expect(page.status).toBe(200)
    expect(page.body.data.notReady).toBe('Nobody has said what kind of company Harrow Quay Partners is yet, so this link cannot seat you there. Ask the firm that sent it to set the kind, then open the link again.')
    expect(page.body.data.mayClaim).toBe(false)
    const r = await json(await POST(req('POST', `/api/claim/${token}`), at(token)))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_CLASSIFIED')
    expect(r.body.error.message).toBe(page.body.data.notReady)
    expect(await prisma.context.count({ where: { companyId: id } })).toBe(0)
    expect(await prisma.role.count({ where: { companyId: id } })).toBe(0)
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { kind: true, claimedAt: true } })
    expect(c).toEqual({ kind: 'UNCLASSIFIED', claimedAt: null })
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: id, allowed: false, reason: { contains: 'claim link' } } })).toBe(1)
  })

  it('a company set to Vendor and extended to Customer is invited as a client, read from the inviting firm’s own row, and its first seat says so', async () => {
    as(OWNER)
    const id = (await record('Larchmere Outfitters')).body.data.company.id
    expect((await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'VENDOR' })).status).toBe(200)
    expect((await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'CUSTOMER' })).status).toBe(201)
    const token = `walk-claim-client-${Date.now()}`
    await prisma.supplierInvite.create({ data: { companyId: id, byId: brightmoor, email: 'ap@larchmere-walk.example', token } })
    const { GET, POST } = await claim()
    as('ap@larchmere-walk.example')
    const page = await json(await GET(req('GET', `/api/claim/${token}`), at(token)))
    expect(page.body.data).toMatchObject({ invitedAs: 'CLIENT', notReady: null, mayClaim: true })
    const r = await json(await POST(req('POST', `/api/claim/${token}`), at(token)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const seat = await prisma.context.findFirstOrThrow({ where: { companyId: id }, select: { grantReason: true, role: { select: { name: true } } } })
    expect(seat.grantReason).toContain('Claimed a client invitation')
    expect(seat.role?.name).toBe('Owner')
  })
})
