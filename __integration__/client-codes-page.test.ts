import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { rolesFor, ADMIN_PERMISSIONS } from '@/lib/company-defaults'

import { GET as readCodesPage } from '@/app/api/settings/codes/route'
import { PATCH as changeCoding } from '@/app/api/settings/coding/route'
import { PATCH as changeCostCenter, POST as addCostCenter } from '@/app/api/settings/cost-centers/route'

/** The page that holds a client's codes opens for the seats that keep them, and for nobody else. */
type Seat = { id: string; email: string }
let n = 0
async function seat(companyId: string, roleName: string, permissions: string[]): Promise<Seat> {
  n += 1
  const role = await prisma.role.create({ data: { companyId, name: roleName, permissions } })
  const person = await prisma.person.create({ data: { name: `Codes Page Tester ${n}`, primaryEmail: `codes-page-${n}@harborline-tech.example` } })
  const c = await prisma.context.create({ data: { personId: person.id, type: 'EMPLOYEE', companyId, roleId: role.id } })
  return { id: c.id, email: person.primaryEmail }
}
async function call(fn: any, method: string, path: string, body: unknown, s: Seat) {
  as(s.email)
  return json(await fn(req(method, path, body, { 'x-context-id': s.id })))
}

describe('the page that holds a client’s codes opens for the seats that keep them', () => {
  let clientId = ''
  let vendorId = ''
  let clerk: Seat, clientAdmin: Seat, vendorFinance: Seat, vendorAdmin: Seat
  let costCenterId = ''

  beforeAll(async () => {
    await freshWorld()
    const o = await prisma.context.findFirstOrThrow({
      orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'CLIENT' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    clientId = o.companyId!
    const v = await prisma.context.findFirstOrThrow({
      orderBy: { id: 'asc' },
      where: {
        type: 'EMPLOYEE', role: { permissions: { has: '*' } },
        company: { kind: 'VENDOR', counterparties: { none: { relationship: 'SUPPLIER' } }, msasAsClient: { none: {} } },
      },
      include: { person: true },
    })
    vendorId = v.companyId!
    const sub = await prisma.company.findFirstOrThrow({ where: { id: { notIn: [clientId, vendorId] } }, orderBy: { id: 'asc' } })
    await prisma.counterparty.upsert({
      where: { companyId_otherCompanyId_relationship: { companyId: vendorId, otherCompanyId: sub.id, relationship: 'SUPPLIER' } },
      create: { companyId: vendorId, otherCompanyId: sub.id, relationship: 'SUPPLIER', status: 'ACTIVE' },
      update: {},
    })
    // No Finance seat at the client: nobody else who could stand in.
    await prisma.context.updateMany({
      where: { companyId: clientId, id: { not: o.id }, role: { permissions: { has: 'payments.record' } } },
      data: { revokedAt: new Date() },
    })
    clientAdmin = await seat(clientId, 'Admin', [...ADMIN_PERMISSIONS])
    // The seeded AP Clerk: no settings.manage, so the settings page refuses it.
    clerk = await seat(clientId, 'AP Clerk', ['timesheets.read', 'invoices.read', 'payments.record', 'rates.read'])
    const vend = rolesFor('VENDOR')
    vendorAdmin = await seat(vendorId, 'Admin', vend.find((r) => r.name === 'Admin')!.permissions)
    vendorFinance = await seat(vendorId, 'Finance', vend.find((r) => r.name === 'Finance')!.permissions)
    const cc = await prisma.costCenter.create({ data: { companyId: clientId, code: 'CODES-PAGE-1', name: 'Page test' } })
    costCenterId = cc.id
  })

  it('the AP clerk who keeps a client’s codes can open the page that holds them', async () => {
    const r = await call(readCodesPage, 'GET', '/api/settings/codes', undefined, clerk)
    expect(r.status).toBe(200)
    expect(r.body.data.costCenters.map((c: any) => c.code)).toContain('CODES-PAGE-1')
  })

  it('the AP clerk who keeps a client’s codes saves the company code from that page', async () => {
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '5100' }, clerk)).status).toBe(200)
    expect(await prisma.companyCoding.count({ where: { companyId: clientId, companyCode: '5100' } })).toBe(1)
  })

  it('the AP clerk sets a profit center on a cost center and can change nothing else on it', async () => {
    expect((await call(changeCostCenter, 'PATCH', '/api/settings/cost-centers', { id: costCenterId, profitCenter: 'PC-77' }, clerk)).status).toBe(200)
    expect((await prisma.costCenter.findUniqueOrThrow({ where: { id: costCenterId } })).profitCenter).toBe('PC-77')
    const rename = await call(changeCostCenter, 'PATCH', '/api/settings/cost-centers', { id: costCenterId, name: 'Renamed', profitCenter: 'PC-78' }, clerk)
    expect(rename.status).toBe(403)
    const add = await call(addCostCenter, 'POST', '/api/settings/cost-centers', { code: 'clerk-new', name: 'x' }, clerk)
    expect(add.status).toBe(403)
    expect((await prisma.costCenter.findUniqueOrThrow({ where: { id: costCenterId } })).name).toBe('Page test')
  })

  it('the vendor’s Finance, who does not open settings, opens the page and saves a company code', async () => {
    expect((await call(readCodesPage, 'GET', '/api/settings/codes', undefined, vendorFinance)).status).toBe(200)
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: 'FIN-9' }, vendorFinance)).status).toBe(200)
  })

  it('an Admin still cannot open the page that holds the codes or save one', async () => {
    const page = await call(readCodesPage, 'GET', '/api/settings/codes', undefined, clientAdmin)
    expect(page.status).toBe(403)
    expect(page.body.error.message).toContain('AP clerk')
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: 'ADM' }, clientAdmin)).status).toBe(403)
    expect((await call(changeCostCenter, 'PATCH', '/api/settings/cost-centers', { id: costCenterId, profitCenter: 'ADM-PC' }, clientAdmin)).status).toBe(403)
    expect((await call(readCodesPage, 'GET', '/api/settings/codes', undefined, vendorAdmin)).status).toBe(403)
    expect((await prisma.costCenter.findUniqueOrThrow({ where: { id: costCenterId } })).profitCenter).toBe('PC-77')
  })
})
