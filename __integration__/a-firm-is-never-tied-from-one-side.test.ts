import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * A firm on Etyme is never tied to you from your side alone (review,
 * 2026-11-13). Walked through the routes on the seeded world as
 * Brightmoor Staffing's Owner: Extend to Customer on a firm on Etyme
 * writes only Brightmoor's own row; a purchase-order sheet names only a
 * firm Brightmoor may write an order to; the company doors answer a
 * stranger as they answer an id that does not exist; the nightly run
 * reads only firms that are really here; and a company that claims a
 * record is never handed the recorder's note as its own answer. Nothing
 * here sends an email: the one sender is faked and counted.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return { ...real, emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }) }
})

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const kind = await import('@/app/api/companies/[id]/kind/route')
const counterparties = await import('@/app/api/counterparties/route')
const sheets = await import('@/app/api/imports/sheets/route')
const { approvedSuppliersOf } = await import('@/lib/sites')
const { suppliersOf } = await import('@/lib/suppliers-of')
const { workTogether } = await import('@/lib/company-create')
const { programsToRun, suppliersToRun } = await import('@/lib/twin/run')
const { readSetup } = await import('@/app/api/settings/setup/read')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const NOT_LISTED = 'That company is not on your Companies list.'

let brightmoor = ''
let isDemo = false
const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: { id } }))
const record = async (name: string, extra: object = {}) =>
  json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED', ...extra })))
const refusalsAbout = (companyId: string) => prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: companyId } })
const claimedFirm = async (name: string, slug: string, kind: 'VENDOR' | 'CLIENT' = 'VENDOR') =>
  (await prisma.company.create({ data: { name, slug, kind, currency: 'USD', claimedAt: new Date(), isDemo }, select: { id: true } })).id

beforeAll(async () => {
  await freshWorld()
  const b = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, isDemo: true } })
  brightmoor = b.id
  isDemo = b.isDemo
  as(OWNER)
}, 600_000)

describe('extending a firm on Etyme to Customer', () => {
  let other = ''
  beforeAll(async () => {
    // A firm on Etyme Brightmoor buys from: the two work together, and
    // nothing says the firm buys from Brightmoor.
    other = await claimedFirm('Harlow Field Services', 'harlow-field-walk')
    await prisma.workOrder.create({
      data: { number: 'HARLOW-1', issuedById: brightmoor, issuedToId: other, recordedById: brightmoor, amount: 1000, startDate: new Date(), status: 'OPEN' },
    })
    expect(await workTogether(brightmoor, other)).toBe(true)
  })

  it('extending a firm on Etyme to Customer writes your own register row and no agreement on their book', async () => {
    const r = await call(extend.POST as any, 'POST', `/api/companies/${other}/extend`, other, { as: 'CUSTOMER' })
    expect(r.status).toBe(201)
    expect(r.body.data).toMatchObject({ positions: ['CUSTOMER'], customerAgreement: 'NONE' })
    expect(r.body.data.message).toBe('Harlow Field Services is your customer now, with no agreement on file. Record it under Contracts, Agreements. What kind of company it is did not change.')
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: other, relationship: 'CLIENT' } })).toBe(1)
    expect(await prisma.masterAgreement.count({ where: { OR: [{ vendorId: brightmoor, clientId: other }, { vendorId: other, clientId: brightmoor }] } })).toBe(0)
  })

  it('a firm you extended to Customer does not read you as one of its approved suppliers', async () => {
    expect((await suppliersOf(other)).ids.has(brightmoor)).toBe(false)
    expect((await approvedSuppliersOf(other)).map((f) => f.id)).not.toContain(brightmoor)
  })

  it('a company you recorded yourself still gets the unsigned agreement record when extended to Customer', async () => {
    const id = (await record('Quarry Lane Builders')).body.data.company.id
    const r = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'CUSTOMER' })
    expect(r.body.data).toMatchObject({ positions: ['CUSTOMER'], customerAgreement: 'UNSIGNED' })
    expect(await prisma.masterAgreement.count({ where: { vendorId: brightmoor, clientId: id, signedAt: null } })).toBe(1)
  })
})

describe('a company door answers a stranger as it answers an id that does not exist', () => {
  let stranger = ''
  let theirs = ''
  let unknown: { status: number; message: string }
  beforeAll(async () => {
    stranger = await claimedFirm('Corvid Bay Partners', 'corvid-bay-walk', 'CLIENT')
    as(`world-nike${D}`)
    theirs = (await record('Pellmore Advisory')).body.data.company.id
    as(OWNER)
    const r = await call(extend.GET as any, 'GET', '/api/companies/no-such-company/extend', 'no-such-company')
    unknown = { status: r.status, message: r.body.error.message }
    expect(unknown).toEqual({ status: 404, message: NOT_LISTED })
  })

  it('a firm on Etyme you do not deal with is answered on every Extend and Kind verb exactly as an unknown id, logged first', async () => {
    for (const id of [stranger, theirs]) {
      const before = await refusalsAbout(id)
      const answers = [
        await call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id),
        await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' }),
        await json(await extend.DELETE(req('DELETE', `/api/companies/${id}/extend?as=SUPPLIER`), { params: { id } })),
        await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'VENDOR' }),
      ]
      for (const a of answers) {
        expect({ status: a.status, message: a.body.error.message }).toEqual(unknown)
        expect(JSON.stringify(a.body)).not.toMatch(/Corvid|Pellmore|corvid-bay-walk/)
      }
      expect(await refusalsAbout(id)).toBe(before + answers.length)
    }
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: { in: [stranger, theirs] } } })).toBe(0)
  })

  it('a firm on Etyme on your own list that does not work with you is asked to link by the name on your list, never its Etyme address', async () => {
    await prisma.counterparty.create({ data: { companyId: brightmoor, otherCompanyId: stranger, relationship: 'SUPPLIER', status: 'ACTIVE' } })
    const r = await call(extend.POST as any, 'POST', `/api/companies/${stranger}/extend`, stranger, { as: 'CUSTOMER' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Corvid Bay Partners is already on Etyme, so no copy of them was made. Ask them to link, as your customer: once they say yes, each of you has the other on your companies.')
    expect(r.body.error.message).not.toContain('etyme.com')
    await prisma.counterparty.deleteMany({ where: { companyId: brightmoor, otherCompanyId: stranger } })
  })

  it('a register row for a company nobody recorded and nobody claimed is refused unless the two work together, as Extend refuses it', async () => {
    const loose = (await prisma.company.create({ data: { name: 'Loose Shell Co', slug: 'loose-shell-walk', kind: 'VENDOR', currency: 'USD', isDemo }, select: { id: true } })).id
    const before = await refusalsAbout(loose)
    const r = await call(counterparties.POST as any, 'POST', '/api/counterparties', '', { otherCompanyId: loose, relationship: 'SUPPLIER' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('That company is not on your Companies list. Add it there first.')
    expect(await refusalsAbout(loose)).toBe(before + 1)
    expect(await prisma.counterparty.count({ where: { otherCompanyId: loose } })).toBe(0)
  })
})

describe('a purchase-order sheet names only a firm you may write an order to', () => {
  let supplierName = ''
  let ownRecord = ''
  let stranger = ''
  beforeAll(async () => {
    as(OWNER)
    // One of Brightmoor's real suppliers, by a name only it carries.
    const ids = [...(await suppliersOf(brightmoor)).ids]
    const firms = await prisma.company.findMany({ where: { id: { in: ids } }, select: { name: true } })
    supplierName = firms.find((f) => firms.filter((g) => g.name.toLowerCase() === f.name.toLowerCase()).length === 1)!.name
    ownRecord = (await record('Tidewater Couriers')).body.data.company.id
    stranger = await claimedFirm('Marrow Lane Staffing', 'marrow-lane-walk')
    as(`world-nike${D}`)
    await record('Bellwether Freight')
    as(OWNER)
  })

  const load = async (rows: object[]) =>
    json(await sheets.POST(req('POST', '/api/imports/sheets', { entity: 'PURCHASE_ORDERS', commit: true, rows })))

  it('an order on a sheet is written to one of your own suppliers named by name', async () => {
    const r = await load([{ 'PO number': 'SHEET-OK-1', Supplier: supplierName.toUpperCase(), Amount: '5000' }])
    expect(r.status).toBe(200)
    expect(r.body.data.created).toBe(1)
    expect(r.body.data.failures).toEqual([])
  })

  it('a sheet row naming your own record that is not a Supplier, another firm’s record, or a firm on Etyme you do not work with writes no order and says why, logged first', async () => {
    const before = { own: await refusalsAbout(ownRecord), me: await refusalsAbout(brightmoor) }
    const orders = await prisma.workOrder.count()
    const r = await load([
      { 'PO number': 'SHEET-NO-1', Supplier: 'Tidewater Couriers', Amount: '100' },
      { 'PO number': 'SHEET-NO-2', Supplier: 'Bellwether Freight', Amount: '100' },
      { 'PO number': 'SHEET-NO-3', Supplier: 'Marrow Lane Staffing', Amount: '100' },
    ])
    expect(r.status).toBe(200)
    expect(r.body.data.created).toBe(0)
    expect(r.body.data.failures).toEqual([
      { row: expect.any(Number), reason: 'Tidewater Couriers is on your Companies list and is not classified yet. Extend it to Supplier first.' },
      { row: expect.any(Number), reason: 'None of your suppliers is called "Bellwether Freight". Add it on Companies and extend it to Supplier, then load this row again.' },
      { row: expect.any(Number), reason: 'None of your suppliers is called "Marrow Lane Staffing". Add it on Companies and extend it to Supplier, then load this row again.' },
    ])
    expect(await prisma.workOrder.count()).toBe(orders)
    expect(await prisma.workOrder.count({ where: { issuedToId: stranger } })).toBe(0)
    expect(await refusalsAbout(ownRecord)).toBe(before.own + 1)
    expect(await refusalsAbout(brightmoor)).toBe(before.me + 2)
  })
})

describe('the nightly run reads only firms that are really here', () => {
  it('the nightly run reads every firm it read before, and no record another firm made, whatever Kind it was given', async () => {
    // What the run read before this change, on the same world.
    const before = async () => ({
      programs: (await prisma.company.findMany({ where: { kind: 'CLIENT', isCensusSandbox: false }, select: { id: true }, orderBy: { id: 'asc' }, take: 200 })).map((r) => r.id),
      firms: (await prisma.company.findMany({ where: { kind: { in: ['VENDOR', 'GSI', 'CONSULTANT_CORP'] }, isCensusSandbox: false, isDemo: false }, select: { id: true }, orderBy: { id: 'asc' }, take: 500 })).map((r) => r.id),
    })
    const was = await before()
    expect(await programsToRun()).toEqual(was.programs)
    expect(await suppliersToRun()).toEqual(was.firms)

    as(OWNER)
    const id = (await record('Ferncliff Supply')).body.data.company.id
    expect((await call(kind.PATCH as any, 'PATCH', `/api/companies/${id}/kind`, id, { kind: 'VENDOR' })).status).toBe(200)
    expect([...(await before()).programs, ...(await before()).firms]).toContain(id)
    expect(await programsToRun()).not.toContain(id)
    expect(await suppliersToRun()).not.toContain(id)
  })
})

describe('a company that claims a record is never handed the recorder’s note as its own answer', () => {
  it('the domain and kind another firm typed are not offered on the claimed company’s setup until the company saves its own', async () => {
    as(OWNER)
    const id = (await record('Sable Point Labs', { domain: 'sablepoint.example', entityType: 'LLC' })).body.data.company.id
    // The claim, as the claim route writes it, before the note is cleared.
    await prisma.company.update({ where: { id }, data: { kind: 'VENDOR', claimedAt: new Date() } })
    const reader = { personId: 'nobody', email: 'owner@sablepoint.example' }
    const first = (await readSetup(id, reader)).detail.COMPANY
    expect(first.website).toBe('')
    expect(first.entityType).toBe('')
    await prisma.setupAnswer.create({ data: { companyId: id, field: 'website', source: 'PERSON' } })
    expect((await readSetup(id, reader)).detail.COMPANY.website).toBe('sablepoint.example')
  })

  it('a seeded client’s own website is offered on its setup exactly as before', async () => {
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true, website: true } })
    expect((await readSetup(nike.id, { personId: 'nobody', email: `world-nike${D}` })).detail.COMPANY.website).toBe(nike.website ?? '')
  })
})

describe('Add a company with a relationship', () => {
  it('a company added with a relationship holds that position the moment it exists', async () => {
    as(OWNER)
    const r = await json(await companies.POST(req('POST', '/api/companies', { name: 'Granite Ridge Talent', kind: 'VENDOR', relationship: 'SUPPLIER' })))
    expect(r.status).toBe(200)
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: r.body.data.company.id, relationship: 'SUPPLIER' } })).toBe(1)
  })
})

describe('a job sent is read from the side that sent it', () => {
  const invite = (jobOwner: string, to: string, title: string) =>
    prisma.requirement
      .create({ data: { companyId: jobOwner, title, status: 'OPEN', approvalState: 'AUTO_APPROVED' }, select: { id: true } })
      .then((job) =>
        prisma.requirementInvitation.create({
          data: { requirementId: job.id, fromCompanyId: jobOwner, toCompanyId: to, expiresAt: new Date(Date.now() + 14 * 86_400_000) },
        }),
      )

  it('a job you sent a firm on your own is never read as working together; a job that firm sent you is', async () => {
    const sentTo = await claimedFirm('Wexley Field Staffing', 'wexley-field-walk')
    await invite(brightmoor, sentTo, 'A job Brightmoor sent on its own (tie walk)')
    expect(await workTogether(brightmoor, sentTo)).toBe(false)
    // The same invitation read from the firm that received it is the other firm's act.
    expect(await workTogether(sentTo, brightmoor)).toBe(true)

    const sentUs = await claimedFirm('Ottery Mills', 'ottery-mills-walk', 'CLIENT')
    await invite(sentUs, brightmoor, 'A job Ottery Mills sent Brightmoor (tie walk)')
    expect(await workTogether(brightmoor, sentUs)).toBe(true)
  })

  it('a firm you only sent a job to is not on your list to extend', async () => {
    as(OWNER)
    const sentTo = await claimedFirm('Penhallow Talent', 'penhallow-talent-walk')
    await invite(brightmoor, sentTo, 'A job Brightmoor sent Penhallow on its own (tie walk)')
    const r = await call(extend.POST as any, 'POST', `/api/companies/${sentTo}/extend`, sentTo, { as: 'SUPPLIER' })
    expect(r.status).not.toBe(201)
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: sentTo } })).toBe(0)
  })
})

describe('nothing leaves', () => {
  it('none of these doors sends an email', () => {
    expect(sent).toEqual([])
  })
})
