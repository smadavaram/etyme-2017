import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as invoiceList } from '@/app/api/invoices/route'
import { GET as invoiceRead } from '@/app/api/invoices/[id]/route'
import { POST as submitRoute } from '@/app/api/invoices/[id]/submit/route'
import { GET as apRoute } from '@/app/api/ap/route'
import { GET as ordersRoute } from '@/app/api/purchase-orders/route'
import { whatWeOwe } from '@/lib/money/what-we-owe'
import { orderLedgers } from '@/lib/money/order-ledger'
import { awaitsPayment } from '@/lib/money/bill-sent-view'

/**
 * Walk 9, 2026-11-09: Brightmoor raised a $22,080 bill and never sent it,
 * and Northbend's Payables read "We owe $47,467" with $458,464 left on
 * the order, while the order's page read $480,544 left and the $22,080
 * drafted, not sent. Brightmoor's own Bills counted it as owed to it.
 * Nobody owes a bill they were never sent. Found by its facts.
 */

const D = '@demo.etyme.local'
const NORTHBEND_AP = `world-nike-ap${D}`
const NORTHBEND_OWNER = `world-nike${D}`
const BRIGHTMOOR_AR = `world-brightmoor-ar${D}`

let invoiceId = ''
let orderId = ''
let northbendId = ''
const NUMBER = 'IN-RAISED-W9'

const summaryAs = async (email: string, direction: 'RECEIVABLE' | 'PAYABLE') => {
  as(email)
  const r = await json(await invoiceList(req('GET', `/api/invoices?direction=${direction}&limit=200`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data as { invoices: { id: string; number: string; status: string; totalMinor: number; outstandingMinor: number; notSent: boolean }[]; summary: unknown }
}
const leftAs = async (email: string) => {
  as(email)
  const r = await json(await ordersRoute(req('GET', '/api/purchase-orders')))
  return (r.body.data.orders as { id: string; remaining: number; notSent: number }[]).find((o) => o.id === orderId)!
}

describe('a bill raised and not sent is never owed on Payables or Bills, and every seat reads the order’s Left the same', () => {
  let before: { owe: unknown; clientSummary: unknown; supplierSummary: unknown }

  beforeAll(async () => {
    await freshWorld()
    const [nb, bm] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } }),
      prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } }),
    ])
    northbendId = nb.id
    const order = await prisma.workOrder.findFirstOrThrow({
      where: { issuedById: nb.id, issuedToId: bm.id }, orderBy: { startDate: 'asc' }, select: { id: true, currency: true },
    })
    orderId = order.id
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { workOrderId: order.id, engagementId: { not: null } }, orderBy: { startDate: 'asc' },
      select: { id: true, personId: true, engagementId: true },
    })
    before = {
      owe: await whatWeOwe(nb.id, new Date()),
      clientSummary: (await summaryAs(NORTHBEND_AP, 'PAYABLE')).summary,
      supplierSummary: (await summaryAs(BRIGHTMOOR_AR, 'RECEIVABLE')).summary,
    }
    const inv = await prisma.invoice.create({
      data: {
        engagementId: line.engagementId!, workOrderId: order.id, number: NUMBER, currency: order.currency,
        total: '22080.00', periodStart: new Date('2026-03-01T00:00:00Z'), periodEnd: new Date('2026-03-28T00:00:00Z'),
        dueAt: new Date('2026-04-27T00:00:00Z'), status: 'ISSUED',
        invoiceLines: { create: [{ sellContractId: line.id, personId: line.personId, hours: '192.00', rateCents: 11_200, amountCents: 2_150_400 }] },
      },
      select: { id: true },
    })
    invoiceId = inv.id
  }, 600_000)

  it('the client’s Payables owes nothing more for a bill its supplier raised and never sent', async () => {
    expect(await whatWeOwe(northbendId, new Date())).toEqual(before.owe)
    as(NORTHBEND_AP)
    const ap = await json(await apRoute(req('GET', '/api/ap')))
    expect(ap.status, JSON.stringify(ap.body)).toBe(200)
    expect(JSON.stringify(ap.body)).not.toContain(NUMBER)
  })

  it('the client neither lists nor opens a bill nobody has sent it', async () => {
    const mine = await summaryAs(NORTHBEND_AP, 'PAYABLE')
    expect(mine.invoices.map((i) => i.number)).not.toContain(NUMBER)
    expect(mine.summary).toEqual(before.clientSummary)
    as(NORTHBEND_AP)
    const opened = await json(await invoiceRead(req('GET', `/api/invoices/${invoiceId}`), { params: Promise.resolve({ id: invoiceId }) } as any))
    expect(opened.status).toBe(404)
    // Said, never "not found": the supplier has not sent it yet.
    expect(opened.body.error.code).toBe('NOT_SENT_YET')
    expect(opened.body.error.message).toMatch(/^Brightmoor Staffing has not sent this bill yet\./)
  })

  it('the supplier lists its raised bill as its own work but counts nothing owed to it until it is sent', async () => {
    const theirs = await summaryAs(BRIGHTMOOR_AR, 'RECEIVABLE')
    expect(theirs.invoices.map((i) => i.number)).toContain(NUMBER)
    expect(theirs.summary).toEqual(before.supplierSummary)
  })

  it('the supplier’s Bills page shows nothing outstanding and counts nothing awaiting payment for a bill it raised and has not sent', async () => {
    const theirs = await summaryAs(BRIGHTMOOR_AR, 'RECEIVABLE')
    const row = theirs.invoices.find((i) => i.number === NUMBER)!
    expect(row.totalMinor).toBe(2_208_000)
    expect(row.outstandingMinor).toBe(0)
    expect(row.notSent).toBe(true)
    expect(awaitsPayment(row)).toBe(false)
    const awaiting = theirs.invoices.filter((i) => awaitsPayment(i))
    expect(awaiting.every((i) => !['DRAFT', 'ISSUED', 'CANCELLED', 'VOID'].includes(i.status))).toBe(true)
  })

  it('every seat reads the order’s Left the same, with the raised bill said apart as not sent', async () => {
    const ledger = (await orderLedgers([orderId])).get(orderId)!
    for (const email of [NORTHBEND_AP, BRIGHTMOOR_AR]) {
      const row = await leftAs(email)
      expect(row.remaining, email).toBe(ledger.leftMinor / 100)
      expect(row.notSent, email).toBeGreaterThanOrEqual(22_080)
    }
  })

  it('a seat at the firm that pays is told the supplier sends the bill, never that a role at its own firm does', async () => {
    for (const email of [NORTHBEND_AP, NORTHBEND_OWNER]) {
      as(email)
      const r = await json(await submitRoute(req('POST', `/api/invoices/${invoiceId}/submit`, {}), { params: Promise.resolve({ id: invoiceId }) }))
      expect(r.status, email).toBe(403)
      expect(r.body.error.code).toBe('NOT_YOURS_TO_SEND')
      expect(r.body.error.message).toContain('Brightmoor')
      expect(r.body.error.message).not.toMatch(/Owner|Ask whoever manages roles/)
    }
    const still = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { status: true } })
    expect(still.status).toBe('ISSUED')
  })
})
