import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as waive, DELETE as withdraw } from '@/app/api/invoices/[id]/match/override/route'

/**
 * Recording an exception against a failed check is a decision to pay
 * something that did not match. The route found the invoice by id alone
 * and asked nobody anything, so any signed-in caller could waive a check
 * on any company's invoice. Found 2026-10-06, after the Pay review.
 *
 * Walked on Northbend Athletic's seeded invoice receipts, as four desks.
 */

const AP = 'world-nike-ap@demo.etyme.local'
const PROGRAM = 'world-nike-programme@demo.etyme.local'
const s: Record<string, any> = {}
const params = () => ({ params: Promise.resolve({ id: s.id }) })
const body = { code: 'QUANTITY', reason: 'Hours under query with the manager' }

/** Somebody seated at a desk that pays — an owner's counts — at a firm matching `where`. */
async function payerAt(where: Record<string, unknown>): Promise<string> {
  const ctx = await prisma.context.findFirstOrThrow({
    where: {
      revokedAt: null,
      type: { not: 'CONSULTANT' },
      company: where,
      role: { OR: [{ permissions: { has: 'payments.record' } }, { permissions: { has: '*' } }] },
    },
    include: { person: true },
  })
  return ctx.person.primaryEmail
}

describe('a failed check is waived only by the desk that pays the invoice, and only in its own books', () => {
  beforeAll(async () => {
    await freshWorld()
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { engagement: { msa: { clientId: northbend.id } } },
      include: { engagement: { include: { msa: true } } },
    })
    s.id = inv.id
    s.vendorId = inv.engagement.msa!.vendorId
    s.supplierDesk = await payerAt({ id: s.vendorId })
    s.stranger = await payerAt({ id: { notIn: [northbend.id, s.vendorId] }, kind: 'CLIENT' })
  }, 240_000)

  it('a firm that is not a party to the invoice is told there is no such invoice', async () => {
    as(s.stranger)
    const r = await json(await waive(req('POST', `/api/invoices/${s.id}/match/override`, body), params()))
    expect(r.status, JSON.stringify(r.body)).toBe(404)
    expect(await prisma.invoiceMatchOverride.count({ where: { invoiceId: s.id } })).toBe(0)
  })

  it('a program manager is refused in a sentence naming the AP clerk, and nothing is recorded', async () => {
    as(PROGRAM)
    const r = await json(await waive(req('POST', `/api/invoices/${s.id}/match/override`, body), params()))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toMatch(/AP Clerk/)
    expect(r.body.error.message).not.toMatch(/payments\.record/)
    expect(await prisma.invoiceMatchOverride.count({ where: { invoiceId: s.id } })).toBe(0)
  })

  it('the supplier that raised the invoice cannot waive a check on it, however senior the desk', async () => {
    as(s.supplierDesk)
    const r = await json(await waive(req('POST', `/api/invoices/${s.id}/match/override`, body), params()))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toMatch(/raised it/)
  })

  it('the client’s AP clerk is let through to the check itself', async () => {
    as(AP)
    const r = await json(await waive(req('POST', `/api/invoices/${s.id}/match/override`, body), params()))
    // 200 where the hours check is failing, 409 where there is nothing to
    // waive — either way the desk was the right one.
    expect([200, 409], JSON.stringify(r.body)).toContain(r.status)
  })

  it('a program manager cannot withdraw an exception either', async () => {
    as(PROGRAM)
    const r = await json(await withdraw(req('DELETE', `/api/invoices/${s.id}/match/override?code=QUANTITY`), params()))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
  })
})
