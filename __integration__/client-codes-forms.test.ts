import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readCoding, PATCH as changeCoding } from '@/app/api/settings/coding/route'
import { GET as readOrders, POST as addOrder, PATCH as changeOrder } from '@/app/api/settings/internal-orders/route'
import { POST as addCostCenter, PATCH as changeCostCenter } from '@/app/api/settings/cost-centers/route'
import { GET as readSettings } from '@/app/api/settings/route'
import { GET as readRegister, PATCH as changeRegister } from '@/app/api/counterparties/route'

/**
 * The client's own codes: the company code, the kind of each cost object,
 * a cost center's profit center and the vendor number for a supplier.
 */
type Seat = { id: string; personId: string; email: string }
let client: Seat & { companyId: string }
let supplier: Seat & { companyId: string }
let plainClient: Seat
let supplierRowId = ''

const seatOf = (c: any): Seat => ({ id: c.id, personId: c.personId, email: c.person.primaryEmail })
async function call(fn: any, method: string, path: string, body?: unknown, seat: Seat = client) {
  as(seat.email)
  return json(await fn(req(method, path, body, { 'x-context-id': seat.id })))
}

describe('a client sets the codes its own books use', () => {
  beforeAll(async () => {
    await freshWorld()
    const c = await prisma.context.findFirstOrThrow({
      orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'CLIENT' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    client = { ...seatOf(c), companyId: c.companyId! }
    const s = await prisma.context.findFirstOrThrow({
      orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    supplier = { ...seatOf(s), companyId: s.companyId! }
    const plain = await prisma.context.findFirst({
      where: {
        companyId: client.companyId, revokedAt: null, roleId: { not: null },
        NOT: [{ role: { permissions: { has: '*' } } }, { role: { permissions: { has: 'settings.manage' } } }],
      },
      include: { person: true },
    })
    plainClient = plain ? seatOf(plain) : client
    const row = await prisma.counterparty.upsert({
      where: { companyId_otherCompanyId_relationship: { companyId: client.companyId, otherCompanyId: supplier.companyId, relationship: 'SUPPLIER' } },
      create: { companyId: client.companyId, otherCompanyId: supplier.companyId, relationship: 'SUPPLIER', status: 'ACTIVE' },
      update: {},
    })
    supplierRowId = row.id
  })

  it('a client saves its company code and reads it again on reload', async () => {
    const saved = await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: ' 1000 ' })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const again = await call(readCoding, 'GET', '/api/settings/coding')
    expect(again.body.data.companyCode).toBe('1000')
    const rows = await prisma.companyCoding.count({ where: { companyId: client.companyId } })
    expect(rows).toBe(1)
  })

  it('saving the company code writes a log row that says who changed it and never holds the code', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: client.companyId, action: 'COMPANY_CODE_CHANGED' } })
    expect(log.summary).toContain('changed the company code')
    expect(JSON.stringify(log)).not.toContain('1000')
    expect(log.payload).toMatchObject({ by: client.personId })
  })

  it('a supplier cannot read or write a company code, and is told the codes belong to the company that pays', async () => {
    const w = await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '9999' }, supplier)
    expect(w.status).toBe(403)
    expect(w.body.error.message).toContain('company that pays')
    expect((await call(readCoding, 'GET', '/api/settings/coding', undefined, supplier)).status).toBe(403)
    expect(await prisma.companyCoding.count({ where: { companyId: supplier.companyId } })).toBe(0)
  })

  it('a refused company code write is logged before the sentence is sent', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false, actorCompanyId: supplier.companyId } })
    await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '9999' }, supplier)
    expect(await prisma.accessLog.count({ where: { allowed: false, actorCompanyId: supplier.companyId } })).toBeGreaterThan(before)
  })

  it('a client seat without the settings permission cannot change the company code', async () => {
    if (plainClient.id === client.id) return
    const r = await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '2222' }, plainClient)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Finance, the Owner or an Admin')
    expect((await call(readCoding, 'GET', '/api/settings/coding')).body.data.companyCode).toBe('1000')
  })

  it('a cost object is added with a kind and an old one reads as an internal order', async () => {
    const old = await prisma.internalOrder.create({ data: { companyId: client.companyId, code: 'IO-OLD', name: 'Old order' } })
    expect(old.kind).toBe('INTERNAL_ORDER')
    const r = await call(addOrder, 'POST', '/api/settings/internal-orders', { code: 'wbs-4711.02', name: 'Plant upgrade', kind: 'WBS_ELEMENT' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const list = await call(readOrders, 'GET', '/api/settings/internal-orders')
    expect(list.body.data.internalOrders.find((o: any) => o.code === 'WBS-4711.02').kind).toBe('WBS_ELEMENT')
    expect(list.body.data.internalOrders.find((o: any) => o.code === 'IO-OLD').kind).toBe('INTERNAL_ORDER')
  })

  it('a kind that is not one of the four is refused in a sentence and nothing is written', async () => {
    const r = await call(addOrder, 'POST', '/api/settings/internal-orders', { code: 'X-1', name: 'X', kind: 'GRANT' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('project code')
    expect(await prisma.internalOrder.count({ where: { companyId: client.companyId, code: 'X-1' } })).toBe(0)
  })

  it('the kind of a cost object can be changed, and one row changes', async () => {
    const o = await prisma.internalOrder.findFirstOrThrow({ where: { companyId: client.companyId, code: 'IO-OLD' } })
    const r = await call(changeOrder, 'PATCH', '/api/settings/internal-orders', { id: o.id, kind: 'PROJECT_CODE' })
    expect(r.status).toBe(200)
    expect((await prisma.internalOrder.findUniqueOrThrow({ where: { id: o.id } })).kind).toBe('PROJECT_CODE')
  })

  it('a supplier cannot add a cost object', async () => {
    const r = await call(addOrder, 'POST', '/api/settings/internal-orders', { code: 'S-1', name: 'S', kind: 'PROJECT_CODE' }, supplier)
    expect(r.status).toBe(403)
    expect(await prisma.internalOrder.count({ where: { companyId: supplier.companyId } })).toBe(0)
  })

  it('a cost center saves a profit center and the settings page reads it back', async () => {
    const r = await call(addCostCenter, 'POST', '/api/settings/cost-centers', { code: 'fin-1', name: 'Finance', profitCenter: 'PC-77' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const page = await call(readSettings, 'GET', '/api/settings')
    expect(page.body.data.costCenters.find((c: any) => c.code === 'FIN-1').profitCenter).toBe('PC-77')
    expect(page.body.data.canEditCodes).toBe(true)
    const p = await call(changeCostCenter, 'PATCH', '/api/settings/cost-centers', { id: r.body.data.costCenter.id, profitCenter: '' })
    expect(p.body.data.costCenter.profitCenter).toBeNull()
  })

  it('a supplier cannot set a profit center and its settings page does not offer the codes', async () => {
    const r = await call(addCostCenter, 'POST', '/api/settings/cost-centers', { code: 'S-FIN', name: 'Finance', profitCenter: 'PC-1' }, supplier)
    expect(r.status).toBe(403)
    expect(await prisma.costCenter.count({ where: { companyId: supplier.companyId, code: 'S-FIN' } })).toBe(0)
    const page = await call(readSettings, 'GET', '/api/settings', undefined, supplier)
    expect(page.body.data.canEditCodes).toBe(false)
  })

  it('a client saves its vendor number for a supplier and reads it again on reload', async () => {
    const r = await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: supplier.companyId, vendorNumber: ' V-5521 ' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const again = await call(readRegister, 'GET', `/api/counterparties?vendorNumberFor=${supplier.companyId}`)
    expect(again.body.data.vendorNumber).toBe('V-5521')
    expect((await prisma.counterparty.findUniqueOrThrow({ where: { id: supplierRowId } })).vendorNumber).toBe('V-5521')
  })

  it('changing a vendor number logs who changed it and never puts the number in the log', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: client.companyId, action: 'VENDOR_NUMBER_CHANGED' } })
    expect(log.summary).toContain('changed the vendor number')
    expect(JSON.stringify(log)).not.toContain('V-5521')
  })

  it('a supplier never reads the vendor number its client gave it', async () => {
    const r = await call(readRegister, 'GET', `/api/counterparties?vendorNumberFor=${client.companyId}`, undefined, supplier)
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.body)).not.toContain('V-5521')
    const own = await call(readRegister, 'GET', '/api/counterparties', undefined, supplier)
    expect(JSON.stringify(own.body)).not.toContain('V-5521')
  })

  it('a supplier cannot write a vendor number on its own register, and the client’s row is untouched', async () => {
    await prisma.counterparty.upsert({
      where: { companyId_otherCompanyId_relationship: { companyId: supplier.companyId, otherCompanyId: client.companyId, relationship: 'SUPPLIER' } },
      create: { companyId: supplier.companyId, otherCompanyId: client.companyId, relationship: 'SUPPLIER', status: 'ACTIVE' },
      update: {},
    })
    const r = await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: client.companyId, vendorNumber: 'HIJACK' }, supplier)
    expect(r.status).toBe(403)
    expect(await prisma.counterparty.count({ where: { vendorNumber: 'HIJACK' } })).toBe(0)
    expect((await prisma.counterparty.findUniqueOrThrow({ where: { id: supplierRowId } })).vendorNumber).toBe('V-5521')
  })

  it('a firm that is not a supplier on the client’s register is refused in a sentence', async () => {
    const other = await prisma.company.findFirstOrThrow({ where: { id: { notIn: [client.companyId, supplier.companyId] } } })
    const r = await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: other.id, vendorNumber: 'V-1' })
    expect(r.status).toBe(404)
    expect(r.body.error.message).toContain('not a supplier on your register')
  })
})
