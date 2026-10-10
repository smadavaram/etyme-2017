import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as hold } from '@/app/api/invoices/[id]/hold/route'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'

/**
 * Northbend Athletic's AP clerk holds a supplier's invoice with a reason,
 * cannot pay it while it is held, the supplier is told why, and paying
 * works again once the hold is lifted.
 */

const AP = 'world-nike-ap@demo.etyme.local'
const s: Record<string, any> = {}
const params = () => ({ params: Promise.resolve({ id: s.id }) })

describe('an invoice receipt held with a reason cannot be paid until the hold is lifted, and the supplier is told why', () => {
  beforeAll(async () => {
    await freshWorld()
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    const inv = await prisma.invoice.findFirstOrThrow({
      where: {
        status: 'SUBMITTED',
        OR: [{ engagement: { msa: { clientId: northbend.id } } }, { workOrder: { issuedById: northbend.id } }],
      },
    })
    s.id = inv.id
    s.number = inv.number
    s.outstanding = Number(inv.total) - Number(inv.paid)
  }, 240_000)

  it('the AP clerk holds it with a reason', async () => {
    as(AP)
    const r = await json(await hold(req('POST', `/api/invoices/${s.id}/hold`, { reason: 'Two days look like a training session' }), params()))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.status).toBe('HELD')
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'INVOICE_HELD' }, orderBy: { at: 'desc' } })
    expect((log.payload as any).reason).toBe('Two days look like a training session')
  })

  it('holding it a second time is refused in a sentence', async () => {
    as(AP)
    const r = await json(await hold(req('POST', `/api/invoices/${s.id}/hold`, { release: false }), params()))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe(`Invoice ${s.number} is already on hold.`)
  })

  it('a held invoice cannot be paid, and the refusal says to lift the hold first', async () => {
    as(AP)
    const r = await json(await pay(req('POST', `/api/invoices/${s.id}/payments`, { amount: s.outstanding, method: 'ACH' }), params()))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe(`Invoice ${s.number} is on hold at your desk. Lift the hold on its page first, then pay it.`)
  })

  it('the supplier is told who held it and why', async () => {
    const told = await prisma.notification.findMany({ where: { entityId: s.id, type: 'INVOICE' } })
    // Fire-and-forget, so give it a moment.
    const rows = told.length > 0 ? told : (await new Promise((r) => setTimeout(r, 300)), await prisma.notification.findMany({ where: { entityId: s.id, type: 'INVOICE' } }))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].body).toBe(`Northbend Athletic put invoice ${s.number} on hold: Two days look like a training session. Nothing is paid on it until they lift the hold.`)
  })

  it('once the hold is lifted it is submitted again and can be paid', async () => {
    as(AP)
    const r = await json(await hold(req('POST', `/api/invoices/${s.id}/hold`, { release: true, reason: 'Supplier confirmed the days' }), params()))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.status).toBe('SUBMITTED')
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('SUBMITTED')
  })
})
