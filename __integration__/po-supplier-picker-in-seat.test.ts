import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as orderSuppliers } from '@/app/api/companies/suppliers/route'
import { suppliersOf } from '@/lib/suppliers-of'

/**
 * The supplier picker on Purchase orders, from a client's seat.
 *
 * Aptiva runs Cavanaugh Glassworks' program. An order it raises in that
 * seat is Cavanaugh's (the-seat-writes-the-clients-book), so the firms
 * it may pick are Cavanaugh's suppliers — not the firms Aptiva itself
 * trades with. Found 2026-10-06.
 */

const APTIVA = 'world-aptiva@demo.etyme.local'
const id = { aptiva: '', cavanaugh: '', wrenfield: '' }

async function seatAptivaAt(roleName: string) {
  const role = await prisma.role.findFirstOrThrow({ where: { companyId: id.cavanaugh, name: roleName } })
  const owner = await prisma.context.findFirstOrThrow({
    where: { companyId: id.cavanaugh, role: { name: 'Owner' } },
    select: { personId: true },
  })
  await prisma.programSeat.updateMany({
    where: { clientCompanyId: id.cavanaugh, officeCompanyId: id.aptiva, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await prisma.programSeat.create({
    data: {
      clientCompanyId: id.cavanaugh, officeCompanyId: id.aptiva, roleId: role.id,
      grantedById: owner.personId, reason: `Aptiva runs our program and sits at our ${roleName} desk.`,
    },
  })
}

beforeAll(async () => {
  await freshWorld()
  id.aptiva = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-aptiva' } })).id
  id.cavanaugh = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' } })).id
  id.wrenfield = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-wrenfield' } })).id
  as(APTIVA)
}, 300_000)

describe('the purchase-order supplier picker follows the seat', () => {
  it('a program office in a client’s seat is offered the client’s suppliers, the firm with people on the client’s site among them', async () => {
    await seatAptivaAt('Owner')
    const r = await json(await orderSuppliers(req('GET', '/api/companies/suppliers')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.buyer.id).toBe(id.cavanaugh)
    expect(r.body.data.seated).toBe(true)
    const ids = r.body.data.companies.map((c: any) => c.id)
    expect(ids).toContain(id.wrenfield)
    const cavanaughs = await suppliersOf(id.cavanaugh)
    expect(new Set(ids)).toEqual(cavanaughs.ids)
  })

  it('a program office in a client’s seat is never offered a firm only it trades with', async () => {
    const own = await suppliersOf(id.aptiva)
    const cavanaughs = await suppliersOf(id.cavanaugh)
    const onlyAptivas = [...own.ids].filter((x) => !cavanaughs.ids.has(x))
    expect(onlyAptivas.length, 'the seeded Aptiva should trade with somebody Cavanaugh does not').toBeGreaterThan(0)
    const r = await json(await orderSuppliers(req('GET', '/api/companies/suppliers')))
    const ids = new Set(r.body.data.companies.map((c: any) => c.id))
    for (const x of onlyAptivas) expect(ids.has(x)).toBe(false)
    expect(ids.has(id.aptiva)).toBe(false)
  })

  it('a program office reading its own books is offered its own suppliers, not the client’s', async () => {
    const r = await json(await orderSuppliers(req('GET', '/api/companies/suppliers?books=own')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.buyer.id).toBe(id.aptiva)
    expect(r.body.data.seated).toBe(false)
    expect(new Set(r.body.data.companies.map((c: any) => c.id))).toEqual((await suppliersOf(id.aptiva)).ids)
  })

  it('a supplier the client has blocked is not offered from the seat', async () => {
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: id.cavanaugh, role: { name: 'Owner' } }, select: { personId: true },
    })
    await prisma.blacklist.create({
      data: { companyId: id.cavanaugh, targetType: 'COMPANY', targetId: id.wrenfield, reason: 'Missed three start dates', blockedById: owner.personId },
    })
    const r = await json(await orderSuppliers(req('GET', '/api/companies/suppliers')))
    expect(r.body.data.companies.map((c: any) => c.id)).not.toContain(id.wrenfield)
    await prisma.blacklist.deleteMany({ where: { companyId: id.cavanaugh, targetId: id.wrenfield } })
  })

  it('a seat whose desk may neither raise orders nor read suppliers is refused in a sentence naming the client', async () => {
    const role = await prisma.role.findFirst({
      where: { companyId: id.cavanaugh, NOT: { permissions: { hasSome: ['invoices.issue', 'vendors.read', '*'] } } },
      select: { name: true },
    })
    expect(role, 'Cavanaugh has no desk without both permissions to test the refusal with').not.toBeNull()
    await seatAptivaAt(role!.name)
    const r = await json(await orderSuppliers(req('GET', '/api/companies/suppliers')))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toMatch(/Cavanaugh Glassworks/)
  })
})
