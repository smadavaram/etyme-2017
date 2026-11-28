import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { suppliersOf } from '@/lib/suppliers-of'

/**
 * A contract line naming a firm on Etyme, written from one side (review,
 * 2026-11-13). A sell line naming a firm as the client puts the seller on
 * that firm's supplier list and routes weeks and bills to it; a buy line
 * naming a firm as the supplier puts it on the buyer's. So neither is
 * written on the strength of a register row the caller wrote itself.
 *
 *   Tapin              the caller, a supplier on Etyme.
 *   Northbend Athletic on Etyme. Tapin wrote it onto its own list as a
 *                      client, and Northbend sells to Tapin under an
 *                      agreement: the two trade, and Northbend does not buy
 *                      from Tapin.
 *   Talvern Medical    on Etyme. Its own register names Tapin its supplier.
 *   Auralis Software   on Etyme. Only Tapin's own list names it.
 *   Kestrel Staffing   on Etyme. Sells to Tapin under an agreement.
 *   Delphi Talent      on Etyme. Only Tapin's own list names it a supplier.
 */

const contracts = (await import('@/app/api/contracts/route')).POST

const TAPIN = 'owner@tapin-lines.test'
const co = { tapin: '', northbend: '', talvern: '', auralis: '', kestrel: '', delphi: '' }
const people: string[] = []

async function company(name: string, slug: string, kind: any, email: string | null) {
  const c = await prisma.company.create({ data: { name, slug, kind, currency: 'USD', claimedAt: new Date('2026-01-04') } })
  if (email) {
    const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const p = await prisma.person.create({ data: { name: `${name} owner`, primaryEmail: email } })
    await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'one-side lines walk' } })
  }
  return c.id
}

const line = async (n: number, body: Record<string, unknown>) =>
  json(await contracts(req('POST', '/api/contracts', { personId: people[n], companyId: co.tapin, billRate: 100, startDate: '2026-12-06', ...body })))
const refusalsAbout = (companyId: string) => prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: companyId } })

beforeAll(async () => {
  await resetDatabase()
  co.tapin = await company('Tapin', 'tapin-lines', 'VENDOR', TAPIN)
  co.northbend = await company('Northbend Athletic', 'northbend-lines', 'CLIENT', 'owner@northbend-lines.test')
  co.talvern = await company('Talvern Medical', 'talvern-lines', 'CLIENT', 'owner@talvern-lines.test')
  co.auralis = await company('Auralis Software', 'auralis-lines', 'CLIENT', 'owner@auralis-lines.test')
  co.kestrel = await company('Kestrel Staffing', 'kestrel-lines', 'VENDOR', 'owner@kestrel-lines.test')
  co.delphi = await company('Delphi Talent', 'delphi-lines', 'VENDOR', 'owner@delphi-lines.test')
  for (const [companyId, otherCompanyId, relationship] of [
    [co.tapin, co.northbend, 'CLIENT'],
    [co.tapin, co.talvern, 'CLIENT'],
    [co.tapin, co.auralis, 'CLIENT'],
    [co.talvern, co.tapin, 'SUPPLIER'],
    [co.tapin, co.kestrel, 'SUPPLIER'],
    [co.tapin, co.delphi, 'SUPPLIER'],
  ] as const) {
    await prisma.counterparty.create({ data: { companyId, otherCompanyId, relationship } })
  }
  await prisma.masterAgreement.create({ data: { vendorId: co.northbend, clientId: co.tapin, paymentTerms: 30 } })
  await prisma.masterAgreement.create({ data: { vendorId: co.kestrel, clientId: co.tapin, paymentTerms: 30 } })
  const member = await prisma.role.create({ data: { companyId: co.tapin, name: 'Member', permissions: [] } })
  for (let i = 0; i < 6; i++) {
    const p = await prisma.person.create({ data: { name: `Tapin engineer ${i}`, primaryEmail: `engineer${i}@tapin-lines.test` } })
    await prisma.context.create({ data: { personId: p.id, companyId: co.tapin, roleId: member.id, type: 'EMPLOYEE', grantReason: 'one-side lines walk' } })
    people.push(p.id)
  }
  as(TAPIN)
}, 600_000)

describe('a sell line naming a firm on Etyme, written from one side', () => {
  it('a sell line to a firm on Etyme that sells to you and does not buy from you is refused, and you never land on its supplier list', async () => {
    const before = await refusalsAbout(co.northbend)
    const r = await line(0, { clientCompanyId: co.northbend })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(
      'Nothing on Etyme shows Northbend Athletic buying from you yet, so you cannot bill them on a line. ' +
        'Ask them to link with you as their supplier from Companies, then record it.'
    )
    expect(await prisma.sellContract.count({ where: { companyId: co.tapin, clientCompanyId: co.northbend } })).toBe(0)
    const theirs = await suppliersOf(co.northbend)
    expect(JSON.stringify(theirs)).not.toContain(co.tapin)
    expect(await refusalsAbout(co.northbend)).toBe(before + 1)
  })

  it('a sell line to a firm on Etyme that only your own list names is answered as an id nobody has, and never named', async () => {
    const before = await refusalsAbout(co.auralis)
    const r = await line(1, { clientCompanyId: co.auralis })
    const nobody = await line(1, { clientCompanyId: 'no-such-company-id' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(nobody.body.error.message)
    expect(JSON.stringify(r.body)).not.toContain('Auralis')
    expect(await prisma.sellContract.count({ where: { clientCompanyId: co.auralis } })).toBe(0)
    expect(await refusalsAbout(co.auralis)).toBe(before + 1)
  })

  it('a sell line to a firm on Etyme whose own list names you its supplier is written as before', async () => {
    const r = await line(2, { clientCompanyId: co.talvern })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    expect(await prisma.sellContract.count({ where: { companyId: co.tapin, clientCompanyId: co.talvern } })).toBe(1)
  })
})

describe('a buy line naming a firm on Etyme, written from one side', () => {
  it('a buy line naming a firm on Etyme that only your own list names is refused, and it never becomes your supplier', async () => {
    const before = await refusalsAbout(co.delphi)
    const r = await line(3, { clientCompanyId: co.talvern, payRate: 80, engagementType: 'OTHER_EMPLOYER', boughtFromId: co.delphi })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('We could not find that supplier. Add them from Companies first; they do not need to be on Etyme.')
    expect(JSON.stringify(r.body)).not.toContain('Delphi')
    expect(await prisma.buyContract.count({ where: { vendorCompanyId: co.delphi } })).toBe(0)
    expect(await prisma.sellContract.count({ where: { personId: people[3] } })).toBe(0)
    expect(await refusalsAbout(co.delphi)).toBe(before + 1)
  })

  it('a buy line naming a firm on Etyme that sells to you under an agreement is written as before', async () => {
    const r = await line(4, { clientCompanyId: co.talvern, payRate: 80, engagementType: 'OTHER_EMPLOYER', boughtFromId: co.kestrel })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    expect(await prisma.buyContract.count({ where: { companyId: co.tapin, vendorCompanyId: co.kestrel } })).toBe(1)
  })

  it('nothing in a refused line tells the other firm: no notice and no thread is written to it', async () => {
    const people = await prisma.context.findMany({ where: { companyId: { in: [co.northbend, co.auralis, co.delphi] } }, select: { personId: true } })
    expect(await prisma.notification.count({ where: { personId: { in: people.map((p) => p.personId) } } })).toBe(0)
  })
})
