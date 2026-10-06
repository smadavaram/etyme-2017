import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as raiseOrder, PATCH as changeOrder } from '@/app/api/purchase-orders/route'
import { POST as raiseExpense } from '@/app/api/expenses/route'
import { POST as decideExpenses } from '@/app/api/expenses/actions/route'
import { suppliersOf } from '@/lib/suppliers-of'

/**
 * A write lands in the book the screen was reading.
 *
 * Aptiva Workforce runs Cavanaugh Glassworks' program from a desk
 * Cavanaugh granted it. The purchase-order list and the expense page both
 * read Cavanaugh's book through that seat — and "Raise" and "Approve"
 * wrote to Aptiva's own, under Aptiva's own role. Found by the architect,
 * 2026-10-06. Now a write follows the read: the client's book, judged by
 * the client's role on the seat, unless the screen asked for the office's
 * own books by name.
 */

const APTIVA = 'world-aptiva@demo.etyme.local'
const id = { aptiva: '', cavanaugh: '', wrenfield: '', aptivaSupplier: '' }
const s: Record<string, any> = {}

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
      clientCompanyId: id.cavanaugh,
      officeCompanyId: id.aptiva,
      roleId: role.id,
      grantedById: owner.personId,
      reason: `Aptiva runs our program and sits at our ${roleName} desk.`,
    },
  })
}

const order = (number: string) => ({
  number,
  amount: 50_000,
  issuedToId: id.wrenfield,
  startDate: '2026-10-01',
  endDate: '2027-03-31',
})

beforeAll(async () => {
  await freshWorld()
  id.aptiva = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-aptiva' } })).id
  id.cavanaugh = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' } })).id
  id.wrenfield = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-wrenfield' } })).id
  // A firm Aptiva itself buys from, read the way the order route reads
  // it. Wrenfield is Cavanaugh's supplier, not Aptiva's, and an order on
  // Aptiva's own book to Wrenfield is rightly refused.
  const aptivaBuysFrom = [...(await suppliersOf(id.aptiva)).ids]
  expect(aptivaBuysFrom.length, 'Aptiva buys from somebody in the seeded world').toBeGreaterThan(0)
  id.aptivaSupplier = aptivaBuysFrom.sort()[0]
  // And the client's: Wrenfield must really be Cavanaugh's supplier, or
  // the seated order below proves nothing.
  expect((await suppliersOf(id.cavanaugh)).ids.has(id.wrenfield)).toBe(true)
  const ownLine = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: id.aptiva },
    select: { id: true, personId: true },
  })
  s.expense = {
    sellContractId: ownLine.id,
    personId: ownLine.personId,
    category: 'TRAVEL',
    description: 'Site visit, two nights',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    items: [{ description: 'Hotel', quantity: 2, unitPrice: 18_000 }],
  }
  as(APTIVA)
}, 300_000)

describe('a purchase order raised from a seat is the client’s', () => {
  it('a program office seated at a client raises the client’s order on the client’s book, never its own', async () => {
    await seatAptivaAt('Owner')
    const r = await json(await raiseOrder(req('POST', '/api/purchase-orders', order('CAV-SEAT-0001'))))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const po = await prisma.workOrder.findFirstOrThrow({ where: { number: 'CAV-SEAT-0001' } })
    expect(po.issuedById).toBe(id.cavanaugh)
    expect(po.issuedById).not.toBe(id.aptiva)
    s.poId = po.id
  })

  it('the order raised from a seat says on the record that the office raised it in the client’s seat', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'PURCHASE_ORDER_RAISED', companyId: id.cavanaugh },
      orderBy: { at: 'desc' },
    })
    expect(log.reason).toMatch(/Aptiva/)
  })

  it('the office may change the client’s order from the seat it raised it in', async () => {
    const r = await json(await changeOrder(req('PATCH', '/api/purchase-orders', { id: s.poId, amount: 60_000 })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(Number((await prisma.workOrder.findUniqueOrThrow({ where: { id: s.poId } })).amount)).toBe(60_000)
  })

  it('a seat whose desk may not raise an order is refused in a sentence naming the client, and nothing is raised', async () => {
    await seatAptivaAt('Program Manager')
    const r = await json(await raiseOrder(req('POST', '/api/purchase-orders', order('CAV-SEAT-0002'))))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toMatch(/Cavanaugh Glassworks/)
    expect(r.body.error.message).not.toMatch(/invoices\.issue/)
    expect(await prisma.workOrder.count({ where: { number: 'CAV-SEAT-0002' } })).toBe(0)
  })

  it('the same seat cannot change the client’s order either, however much the office may at home', async () => {
    const r = await json(await changeOrder(req('PATCH', '/api/purchase-orders', { id: s.poId, amount: 70_000 })))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(Number((await prisma.workOrder.findUniqueOrThrow({ where: { id: s.poId } })).amount)).toBe(60_000)
  })

  it('an office reading its own books raises its own order, on its own book', async () => {
    const r = await json(
      await raiseOrder(req('POST', '/api/purchase-orders?books=own', { ...order('APT-OWN-PO-1'), issuedToId: id.aptivaSupplier }))
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect((await prisma.workOrder.findFirstOrThrow({ where: { number: 'APT-OWN-PO-1' } })).issuedById).toBe(id.aptiva)
  })
})

describe('a purchase order goes only to one of the buyer’s suppliers', () => {
  it('an order to a firm that is not one of the buyer’s suppliers is refused and told to recommend them first', async () => {
    await seatAptivaAt('Owner')
    // Talvern Medical is a client, and buys nothing from anybody's
    // order — it is no firm's supplier, Cavanaugh's least of all.
    const talvern = await prisma.company.findFirstOrThrow({ where: { slug: 'world-terumo-bct' } })
    const r = await json(
      await raiseOrder(req('POST', '/api/purchase-orders', { ...order('CAV-NOT-A-SUPPLIER'), issuedToId: talvern.id }))
    )
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toMatch(/is not one of Cavanaugh Glassworks's suppliers/)
    expect(r.body.error.message).toMatch(/Recommend them as a supplier first/)
    expect(await prisma.workOrder.count({ where: { number: 'CAV-NOT-A-SUPPLIER' } })).toBe(0)
  })
})

describe('an expense raised or decided from a seat is the client’s book’s, or refused', () => {
  it('a seated office cannot put its own contract’s expense on the client’s book, and is told to use its own books', async () => {
    const r = await json(await raiseExpense(req('POST', '/api/expenses', s.expense)))
    expect(r.status, JSON.stringify(r.body)).toBe(404)
    expect(r.body.error.message).toMatch(/Cavanaugh Glassworks/)
    expect(r.body.error.message).toMatch(/own books/)
  })

  it('an office reading its own books raises its own expense, on its own book', async () => {
    const r = await json(await raiseExpense(req('POST', '/api/expenses?books=own', s.expense)))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const e = await prisma.expense.findUniqueOrThrow({ where: { id: r.body.data.expense.id } })
    expect(e.companyId).toBe(id.aptiva)
    s.expenseId = e.id
  })

  it('submitting the office’s own expense from the client’s seat finds nothing to submit, and says whose book it looked in', async () => {
    const r = await json(await decideExpenses(req('POST', '/api/expenses/actions', { action: 'submit', expenseIds: [s.expenseId] })))
    expect(r.status, JSON.stringify(r.body)).toBe(404)
    expect(r.body.error.message).toMatch(/Cavanaugh Glassworks/)
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: s.expenseId } })).status).toBe('DRAFT')
  })

  it('the office submits its own expense from its own books', async () => {
    const r = await json(await decideExpenses(req('POST', '/api/expenses/actions?books=own', { action: 'submit', expenseIds: [s.expenseId] })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: s.expenseId } })).status).toBe('SUBMITTED')
  })
})
