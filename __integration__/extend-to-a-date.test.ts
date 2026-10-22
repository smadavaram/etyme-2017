import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as extend } from '@/app/api/contracts/[id]/extend/route'
import { GET as listOrders } from '@/app/api/purchase-orders/route'

/**
 * The screens reach the extension's rules, and the order's paper set.
 *
 * Screen walk of 2026-10-22: the Extend button offered three months, no
 * reason box and a refusal that vanished; and a client could not reach
 * what its own order asks for on paper. These are the route halves of
 * those two screens.
 */

const supplier = 'world-techpeple@demo.etyme.local'
const day = (d: Date) => d.toISOString().slice(0, 10)

describe('a placement extended to the day somebody picked', () => {
  let sellId: string
  let buyId: string | null
  let personId: string
  let endBefore: Date
  let uploaderId: string
  const ask = async (body: Record<string, unknown>) =>
    json(await extend(req('POST', `/api/contracts/${sellId}/extend`, body), { params: Promise.resolve({ id: sellId }) }))

  beforeAll(async () => {
    await freshWorld()
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })
    const s = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id, state: 'IN_PROGRESS', endDate: { not: null } },
      include: { buyLinks: true },
      orderBy: { id: 'asc' },
    })
    sellId = s.id
    buyId = s.buyLinks[0]?.buyContractId ?? null
    personId = s.personId
    endBefore = s.endDate!
    uploaderId = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: supplier } })).id
    as(supplier)
  }, 180_000)

  it('a day on or before the current end is refused in a sentence and nothing moves', async () => {
    const r = await ask({ newEndDate: day(endBefore) })
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('newEndDate')
    expect(r.body.error.message).toMatch(/rolloff/i)
    const after = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    expect(after.endDate!.toISOString()).toBe(endBefore.toISOString())
  })

  it('a paper that lets the person work ending first stops a chosen day too, in the route’s own sentence', async () => {
    const visa = await prisma.verification.create({
      data: { personId, type: 'VISA', status: 'CLEAR', expiresAt: new Date(endBefore.getTime() + 10 * 86_400_000), uploadedById: uploaderId },
    })
    try {
      const r = await ask({ newEndDate: day(new Date(endBefore.getTime() + 40 * 86_400_000)), note: 'The client asked for six more weeks.' })
      expect(r.status).toBe(422)
      expect(r.body.error.code).toBe('PAPERS_BLOCK')
      expect(r.body.error.message.length).toBeGreaterThan(20)
    } finally {
      await prisma.verification.delete({ where: { id: visa.id } })
    }
  })

  it('a placement can be extended to a chosen day, and the line that pays ends that same day', async () => {
    // Inside the firm's cover, so no paper asks for a reason: three weeks on.
    const target = day(new Date(endBefore.getTime() + 21 * 86_400_000))
    const r = await ask({ newEndDate: target, note: 'The release moved by three weeks.' })
    if (r.status === 422 && r.body.error.code === 'PAPERS_NEED_A_REASON') {
      // The seeded cover may end inside three weeks on the day this runs; the reason goes with it.
      const again = await ask({ newEndDate: target, note: 'The release moved by three weeks.', reason: 'Renewal is bound.' })
      expect(again.status).toBe(200)
    } else {
      expect(r.status).toBe(200)
      expect(r.body.data.message).toMatch(/^Extended to [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/)
    }
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    expect(day(sell.endDate!)).toBe(target)
    if (buyId) {
      const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
      expect(day(buy.endDate!)).toBe(target)
    }
  })

  it('the reason given is kept with the extension', async () => {
    const log = await prisma.automationLog.findFirst({
      where: { action: 'CONTRACT_EXTENDED', payload: { path: ['note'], equals: 'The release moved by three weeks.' } },
      select: { reason: true },
    })
    expect(log).not.toBeNull()
    expect(log!.reason).toMatch(/Why: The release moved by three weeks\./)
  })
})

describe('the purchase orders page can offer the order’s paper set to the right desk', () => {
  it('every order on the purchase orders page names its buyer', async () => {
    as(supplier)
    const r = await json(await listOrders(req('GET', '/api/purchase-orders')))
    expect(r.status).toBe(200)
    const orders = r.body.data.orders as { id: string; issuedById: string; side: string }[]
    expect(orders.length).toBeGreaterThan(0)
    const rows = await prisma.workOrder.findMany({ where: { id: { in: orders.map((o) => o.id) } }, select: { id: true, issuedById: true } })
    const byId = new Map(rows.map((w) => [w.id, w.issuedById]))
    for (const o of orders) expect(o.issuedById).toBe(byId.get(o.id))
  })
})
