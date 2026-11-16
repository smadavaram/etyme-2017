import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { rolesFor, ADMIN_PERMISSIONS } from '@/lib/company-defaults'
import { ensureDefaultRoles } from '@/lib/company-roles'

import { GET as readCoding, PATCH as changeCoding } from '@/app/api/settings/coding/route'
import { POST as addOrder } from '@/app/api/settings/internal-orders/route'
import { POST as addCostCenter } from '@/app/api/settings/cost-centers/route'
import { GET as readSettings } from '@/app/api/settings/route'
import { PATCH as changeRegister } from '@/app/api/counterparties/route'

/** Who keeps a company's own accounting codes: Finance and the Owner, never an Admin. */
type Seat = { id: string; email: string }
let n = 0
async function seat(companyId: string, roleName: string, permissions: string[]): Promise<Seat> {
  n += 1
  const role = await prisma.role.create({ data: { companyId, name: roleName, permissions } })
  const person = await prisma.person.create({ data: { name: `Codes Tester ${n}`, primaryEmail: `codes-tester-${n}@northwind-staffing.example` } })
  const c = await prisma.context.create({ data: { personId: person.id, type: 'EMPLOYEE', companyId, roleId: role.id } })
  return { id: c.id, email: person.primaryEmail }
}
async function call(fn: any, method: string, path: string, body: unknown, s: Seat) {
  as(s.email)
  return json(await fn(req(method, path, body, { 'x-context-id': s.id })))
}

describe('a company’s own accounting codes are kept by Finance and the Owner, not an Admin', () => {
  let clientId = ''
  let vendorId = ''
  let supplierId = ''
  let owner: Seat, clientAdmin: Seat, clerk: Seat, vendorOwner: Seat, vendorAdmin: Seat, vendorFinance: Seat

  beforeAll(async () => {
    await freshWorld()
    const o = await prisma.context.findFirstOrThrow({
      orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'CLIENT' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    clientId = o.companyId!
    owner = { id: o.id, email: o.person.primaryEmail }
    const v = await prisma.context.findFirstOrThrow({
      orderBy: { id: 'asc' },
      where: {
        type: 'EMPLOYEE', role: { permissions: { has: '*' } },
        company: { kind: 'VENDOR', counterparties: { none: { relationship: 'SUPPLIER' } }, msasAsClient: { none: {} } },
      },
      include: { person: true },
    })
    vendorId = v.companyId!
    vendorOwner = { id: v.id, email: v.person.primaryEmail }
    const sub = await prisma.company.findFirstOrThrow({ where: { id: { notIn: [clientId, vendorId] } }, orderBy: { id: 'asc' } })
    supplierId = sub.id
    for (const [a, b] of [[clientId, vendorId], [vendorId, supplierId]]) {
      await prisma.counterparty.upsert({
        where: { companyId_otherCompanyId_relationship: { companyId: a, otherCompanyId: b, relationship: 'SUPPLIER' } },
        create: { companyId: a, otherCompanyId: b, relationship: 'SUPPLIER', status: 'ACTIVE' },
        update: {},
      })
    }
    // The client has no Finance seat: whoever else held a seat that could stand in is taken away.
    await prisma.context.updateMany({
      where: { companyId: clientId, id: { not: owner.id }, role: { permissions: { has: 'payments.record' } } },
      data: { revokedAt: new Date() },
    })
    clientAdmin = await seat(clientId, 'Admin', [...ADMIN_PERMISSIONS])
    clerk = await seat(clientId, 'AP & Payroll', ['invoices.read', 'payments.record'])
    const vend = rolesFor('VENDOR')
    vendorAdmin = await seat(vendorId, 'Admin', vend.find((r) => r.name === 'Admin')!.permissions)
    vendorFinance = await seat(vendorId, 'Finance', vend.find((r) => r.name === 'Finance')!.permissions)
  })

  it('an Admin, who is IT and people, does not set the client’s company code', async () => {
    const r = await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '1' }, clientAdmin)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('AP clerk')
    expect(await prisma.companyCoding.count({ where: { companyId: clientId, companyCode: '1' } })).toBe(0)
  })

  it('an Admin, who is IT and people, does not set the client’s codes on cost objects', async () => {
    const r = await call(addOrder, 'POST', '/api/settings/internal-orders', { code: 'ADM-1', name: 'x', kind: 'PROJECT_CODE' }, clientAdmin)
    expect(r.status).toBe(403)
    expect(await prisma.internalOrder.count({ where: { companyId: clientId, code: 'ADM-1' } })).toBe(0)
  })

  it('an Admin, who is IT and people, does not set the client’s codes on cost centers', async () => {
    const r = await call(addCostCenter, 'POST', '/api/settings/cost-centers', { code: 'adm-cc', name: 'Admin try', profitCenter: 'PC-1' }, clientAdmin)
    expect(r.status).toBe(403)
    expect(await prisma.costCenter.count({ where: { companyId: clientId, code: 'ADM-CC' } })).toBe(0)
  })

  it('an Admin, who is IT and people, does not set the client’s vendor number', async () => {
    const r = await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: vendorId, vendorNumber: 'ADM-9' }, clientAdmin)
    expect(r.status).toBe(403)
    expect(await prisma.counterparty.count({ where: { vendorNumber: 'ADM-9' } })).toBe(0)
  })

  it('a refusal to an Admin is logged before the sentence is sent', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false, actorCompanyId: clientId } })
    await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '2' }, clientAdmin)
    expect(await prisma.accessLog.count({ where: { allowed: false, actorCompanyId: clientId } })).toBeGreaterThan(before)
  })

  it('the Owner saves the client’s company code and vendor number', async () => {
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '1000' }, owner)).status).toBe(200)
    expect((await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: vendorId, vendorNumber: 'V-1' }, owner)).status).toBe(200)
  })

  it('at a client with no Finance seat, the AP clerk saves the company code, a cost object and a vendor number', async () => {
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '3000' }, clerk)).status).toBe(200)
    expect((await call(readCoding, 'GET', '/api/settings/coding', undefined, clerk)).body.data.companyCode).toBe('3000')
    expect((await call(addOrder, 'POST', '/api/settings/internal-orders', { code: 'CLK-1', name: 'x', kind: 'PROJECT_CODE' }, clerk)).status).toBe(201)
    expect((await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: vendorId, vendorNumber: 'V-2' }, clerk)).status).toBe(200)
  })

  it('the client’s settings page draws the code boxes for the Owner and the AP clerk who opens settings, and not for an Admin', async () => {
    expect((await call(readSettings, 'GET', '/api/settings', undefined, owner)).body.data.canEditCodes).toBe(true)
    const clerkWithSettings = await seat(clientId, 'AP clerk with settings', ['invoices.read', 'payments.record', 'settings.manage'])
    expect((await call(readSettings, 'GET', '/api/settings', undefined, clerkWithSettings)).body.data.canEditCodes).toBe(true)
    expect((await call(readSettings, 'GET', '/api/settings', undefined, clientAdmin)).body.data.canEditCodes).toBe(false)
  })

  it('at a supplier firm with Finance, Finance saves the codes and an Admin does not', async () => {
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: 'F-1' }, vendorFinance)).status).toBe(200)
    expect((await call(changeRegister, 'PATCH', '/api/counterparties', { vendorNumberFor: supplierId, vendorNumber: 'F-V' }, vendorFinance)).status).toBe(200)
    const no = await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: 'A-1' }, vendorAdmin)
    expect(no.status).toBe(403)
    expect(no.body.error.message).toContain('Finance')
    const financeWithSettings = await seat(vendorId, 'Finance', [...rolesFor('VENDOR').find((r) => r.name === 'Finance')!.permissions, 'settings.manage'])
    expect((await call(readSettings, 'GET', '/api/settings', undefined, financeWithSettings)).body.data.canEditCodes).toBe(true)
    expect((await call(readSettings, 'GET', '/api/settings', undefined, vendorAdmin)).body.data.canEditCodes).toBe(false)
  })

  it('an Admin the Owner grants the permission to can then set the codes', async () => {
    const extra = await seat(clientId, 'Admin with codes', [...ADMIN_PERMISSIONS, 'codes.manage'])
    expect((await call(changeCoding, 'PATCH', '/api/settings/coding', { companyCode: '4000' }, extra)).status).toBe(200)
  })

  it('a company formed before the permission existed gets it on its Finance and Owner roles and not its Admin, with no migration', async () => {
    const owners = await prisma.role.findMany({ where: { companyId: vendorId, name: { in: ['Finance', 'Owner', 'Admin'] } } })
    const fin = owners.find((r) => r.name === 'Finance')!
    await prisma.role.update({ where: { id: fin.id }, data: { permissions: fin.permissions.filter((p) => p !== 'codes.manage') } })
    await ensureDefaultRoles(vendorId, 'VENDOR')
    expect((await prisma.role.findUniqueOrThrow({ where: { id: fin.id } })).permissions).toContain('codes.manage')
    const adm = await prisma.role.findFirstOrThrow({ where: { companyId: vendorId, name: 'Admin' } })
    expect(adm.permissions).not.toContain('codes.manage')
  })
})
