import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as ordersRoute } from '@/app/api/purchase-orders/route'
import { POST as submitRoute } from '@/app/api/invoices/[id]/submit/route'
import { orderLedgers } from '@/lib/money/order-ledger'
import { drawnOnOrder } from '@/lib/money/order-drawn'
import { matchInvoices } from '@/lib/invoice-match'
import { signedAndBilled } from '@/lib/money/signed-unbilled'

/**
 * One definition of money, on the seeded world (the founder's scale
 * audit, 2026-11-08). Every row is found by its facts: the client, the
 * supplier, the person. Never a generated number or a calendar day.
 */

const D = '@demo.etyme.local'
const NORTHBEND_AP = `world-nike-ap${D}`
const BRIGHTMOOR_AR = `world-brightmoor-ar${D}`
const CSI = `world-computer-systems${D}`
const APTIVA = `world-aptiva${D}`

type Row = { id: string; currency: string; authorized: number; invoiced: number; remaining: number; notSent: number; lines: { personName: string; side: string; billed: number | null }[] }

async function ordersAs(email: string): Promise<Map<string, Row>> {
  as(email)
  const { status, body } = await json(await ordersRoute(req('GET', '/api/purchase-orders')))
  expect(status, JSON.stringify(body)).toBe(200)
  return new Map((body.data.orders as Row[]).map((o) => [o.id, o]))
}

const per = (ccy: string) => (ccy.toUpperCase() === 'VND' || ccy.toUpperCase() === 'JPY' ? 1 : 100)

async function orderBetween(buyerSlug: string, sellerSlug: string) {
  const [buyer, seller] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { slug: buyerSlug }, select: { id: true } }),
    prisma.company.findUniqueOrThrow({ where: { slug: sellerSlug }, select: { id: true } }),
  ])
  return prisma.workOrder.findFirstOrThrow({
    where: { issuedById: buyer.id, issuedToId: seller.id },
    orderBy: { startDate: 'asc' },
    select: { id: true, number: true, currency: true, amount: true, engagementId: true },
  })
}

describe('one definition of what an order authorized, billed and has left', () => {
  beforeAll(async () => { await freshWorld() }, 600_000)

  it('for every order, Authorized minus Billed equals Left, and the three-way check’s door draws the same Billed', async () => {
    const orders = await prisma.workOrder.findMany({ select: { id: true, currency: true } })
    expect(orders.length).toBeGreaterThan(0)
    const ledgers = await orderLedgers(orders.map((o) => o.id))
    for (const o of orders) {
      const l = ledgers.get(o.id)!
      expect(l.leftMinor, o.id).toBe(l.authorizedMinor - l.billedMinor)
      const drawn = await drawnOnOrder(o)
      expect(drawn.cents, o.id).toBe(l.billedMinor)
    }
  })

  it('the client’s, the supplier’s, the MSP’s and the AP views give the same three figures for every order they share', async () => {
    const seats = [NORTHBEND_AP, BRIGHTMOOR_AR, CSI, APTIVA]
    const views = await Promise.all(seats.map((s) => ordersAs(s)))
    const ids = [...new Set(views.flatMap((v) => [...v.keys()]))]
    const ledgers = await orderLedgers(ids)
    let compared = 0
    for (const [i, v] of views.entries()) {
      for (const [id, row] of v) {
        const l = ledgers.get(id)!
        const p = per(l.currency)
        expect(row.authorized, `${seats[i]} ${id}`).toBe(l.authorizedMinor / p)
        expect(row.invoiced, `${seats[i]} ${id}`).toBe(l.billedMinor / p)
        expect(row.remaining, `${seats[i]} ${id}`).toBe(l.leftMinor / p)
        expect(row.remaining).toBe(row.authorized - row.invoiced)
        compared++
      }
    }
    // The Northbend orders are read from both ends: the client's AP clerk and each supplier.
    const shared = ids.filter((id) => views.filter((v) => v.has(id)).length >= 2)
    expect(shared.length).toBeGreaterThan(0)
    expect(compared).toBeGreaterThan(shared.length)
  })

  it('a draft on Northbend’s order with Brightmoor is said apart as not sent and leaves Billed and Left as they were', async () => {
    const order = await orderBetween('world-nike', 'world-brightmoor')
    const before = (await orderLedgers([order.id])).get(order.id)!
    const engagementId = order.engagementId ?? (await prisma.sellContract.findFirstOrThrow({
      where: { workOrderId: order.id, engagementId: { not: null } }, select: { engagementId: true },
    })).engagementId!
    await prisma.invoice.create({
      data: {
        engagementId, workOrderId: order.id, number: 'IN-DRAFT-T1', currency: order.currency,
        total: '14900.00', periodStart: new Date('2026-03-01T00:00:00Z'), periodEnd: new Date('2026-03-07T00:00:00Z'),
        dueAt: new Date('2026-04-06T00:00:00Z'), status: 'DRAFT',
      },
    })
    const after = (await orderLedgers([order.id])).get(order.id)!
    expect(after.billedMinor).toBe(before.billedMinor)
    expect(after.leftMinor).toBe(before.leftMinor)
    expect(after.draftedNotSentMinor).toBe(before.draftedNotSentMinor + 1_490_000)
    const client = (await ordersAs(NORTHBEND_AP)).get(order.id)!
    const supplier = (await ordersAs(BRIGHTMOOR_AR)).get(order.id)!
    for (const row of [client, supplier]) {
      expect(row.remaining).toBe(after.leftMinor / 100)
      expect(row.notSent).toBe(after.draftedNotSentMinor / 100)
    }
  })

  it('on Northbend’s order with Computer Systems, Left after each sent bill in the three-way check is the order’s own Left', async () => {
    const order = await orderBetween('world-nike', 'world-computer-systems')
    const ledger = (await orderLedgers([order.id])).get(order.id)!
    const sent = await prisma.invoice.findMany({
      where: { workOrderId: order.id, status: { notIn: ['DRAFT', 'ISSUED', 'CANCELLED', 'VOID'] } },
      select: { id: true },
    })
    expect(sent.length).toBeGreaterThan(0)
    const matches = await matchInvoices(sent.map((s) => s.id))
    for (const s of sent) expect(matches.get(s.id)?.poAfter?.remainingCents, s.id).toBe(ledger.leftMinor)
  })
})

describe('signed, billed and signed and not billed on the seeded world', () => {
  beforeAll(async () => { await freshWorld() }, 600_000)

  const lineOf = async (person: string, sellerSlug: string, clientSlug: string) => {
    const [seller, client] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { slug: sellerSlug }, select: { id: true } }),
      prisma.company.findUniqueOrThrow({ where: { slug: clientSlug }, select: { id: true } }),
    ])
    return prisma.sellContract.findFirstOrThrow({
      where: { person: { name: person }, companyId: seller.id, clientCompanyId: client.id },
      select: { id: true, billRate: true },
    })
  }

  it('Rosa Delgado’s placement shows its signed hours, its billed hours and the hours signed and not billed, aged by week', async () => {
    const line = await lineOf('Rosa Delgado', 'world-brightmoor', 'world-nike')
    const b = (await signedAndBilled([line.id])).get(line.id)!
    expect(b.signed.weeks).toBeGreaterThan(0)
    expect(b.notBilled.hours).toBe(Math.round((b.signed.hours - b.billed.hours) * 100) / 100)
    expect(b.notBilled.weeks.reduce((n, w) => n + w.hours, 0)).toBeCloseTo(b.notBilled.hours, 2)
    // Weeks and the accepted expenses not billed yet age together, so the bands add up to the whole.
    expect(b.notBilled.aging.reduce((n, a) => n + a.amountMinor, 0)).toBe(b.notBilled.amountMinor)
    // Nothing a draft holds is counted as billed.
    const sentHours = await prisma.invoiceLine.aggregate({
      where: { sellContractId: line.id, timesheetId: { not: null }, invoice: { status: { notIn: ['DRAFT', 'ISSUED', 'CANCELLED', 'VOID'] } } },
      _sum: { hours: true },
    })
    expect(b.billed.hours).toBeCloseTo(Number(sentHours._sum.hours ?? 0), 2)
  })

  it('a draft bill’s number is never shown as the total of what is unbilled', async () => {
    const line = await lineOf('Rosa Delgado', 'world-brightmoor', 'world-nike')
    const b = (await signedAndBilled([line.id])).get(line.id)!
    for (const w of b.notBilled.weeks.filter((x) => x.onDraft)) {
      expect(w.onDraft!.amountMinor).toBeLessThanOrEqual(w.amountMinor ?? 0)
    }
    const draftTotal = b.drafted.bills.reduce((n, d) => n + d.amountMinor, 0)
    expect(draftTotal).toBeLessThanOrEqual(b.notBilled.amountMinor)
    if (b.notBilled.weeks.some((w) => !w.onDraft)) expect(draftTotal).toBeLessThan(b.notBilled.amountMinor)
  })

  it('for Helena Marsh, billed hours × rate equals the invoiced figure, and the client’s and the supplier’s seats show the same money', async () => {
    const line = await lineOf('Helena Marsh', 'world-computer-systems', 'world-nike')
    const b = (await signedAndBilled([line.id])).get(line.id)!
    expect(b.billed.hours).toBeGreaterThan(0)
    expect(b.billed.amountMinor).toBe(Math.round(b.billed.hours * line.billRate))
    const lineOn = async (email: string) => {
      const orders = await ordersAs(email)
      return [...orders.values()].flatMap((o) => o.lines).find((l) => l.personName === 'Helena Marsh' && l.side === 'SELL')
    }
    const client = await lineOn(NORTHBEND_AP)
    const supplier = await lineOn(CSI)
    expect(client?.billed).toBe(b.billed.amountMinor / 100)
    expect(supplier?.billed).toBe(b.billed.amountMinor / 100)
  })

  it('a bill sent once cannot be sent again: the route refuses a second sending in a sentence', async () => {
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const sent = await prisma.invoice.findFirstOrThrow({ orderBy: { id: 'asc' },
      where: { status: { notIn: ['DRAFT', 'ISSUED', 'CANCELLED', 'VOID'] }, invoiceLines: { some: { sellContract: { companyId: brightmoor.id } } } },
      select: { id: true, number: true },
    })
    as(BRIGHTMOOR_AR)
    const { status, body } = await json(await submitRoute(req('POST', `/api/invoices/${sent.id}/submit`, {}), { params: Promise.resolve({ id: sent.id }) }))
    expect(status).toBe(409)
    expect(body.error.message).toMatch(/already been sent/)
    expect(body.error.message).toContain(sent.number)
  })
})
