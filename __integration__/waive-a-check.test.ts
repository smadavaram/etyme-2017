import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as waive, DELETE as withdraw } from '@/app/api/invoices/[id]/match/override/route'
import { matchInvoice, matchRefusal } from '@/lib/invoice-match'

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

describe('a waiver on an invoice a supplier sent is for one total, as on a typed-in receipt', () => {
  const w: Record<string, any> = {}
  // One more hour billed on the line, the line and the total moved
  // together, so the arithmetic still adds up and only the hours differ.
  const oneMoreHour = async () => {
    const line = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: w.lineId } })
    await prisma.invoiceLine.update({
      where: { id: line.id },
      data: { hours: Number(line.hours) + 1, amountCents: line.amountCents + line.rateCents },
    })
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: w.id } })
    const total = Math.round(Number(inv.total) * 100) + line.rateCents
    await prisma.invoice.update({ where: { id: w.id }, data: { total: total / 100 } })
    return total
  }
  const dollars = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const quantity = async () => (await matchInvoice(w.id))?.checks.find((c) => c.code === 'QUANTITY')?.outcome

  beforeAll(async () => {
    // An invoice whose hours match what its payer signed: the one the
    // seeded credit note was raised against.
    const o = await prisma.invoiceMatchOverride.findFirstOrThrow({
      where: { reason: { startsWith: 'Four hours on the Thursday' } },
      include: { invoice: { include: { invoiceLines: { where: { timesheetId: { not: null } }, orderBy: { amountCents: 'desc' } } } } },
    })
    await prisma.invoiceMatchOverride.deleteMany({ where: { invoiceId: o.invoiceId } })
    w.id = o.invoiceId
    w.number = o.invoice.number
    w.lineId = o.invoice.invoiceLines[0].id
    const payer = (await prisma.sellContract.findUniqueOrThrow({ where: { id: o.invoice.invoiceLines[0].sellContractId! } })).clientCompanyId
    w.ap = await payerAt({ id: payer })
  }, 120_000)

  it('a difference the paying team waives with a reason covers the invoice at the total it was waived at', async () => {
    expect(await quantity()).toBe('PASS')
    w.first = await oneMoreHour()
    expect(await quantity()).toBe('FAIL')
    as(w.ap)
    const r = await json(await waive(req('POST', `/api/invoices/${w.id}/match/override`, { code: 'QUANTITY', reason: 'One hour of handover, agreed with the manager in writing.' }), { params: Promise.resolve({ id: w.id }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await prisma.invoiceMatchOverride.findFirstOrThrow({ where: { invoiceId: w.id, code: 'QUANTITY' } })).invoiceTotalCentsAtOverride).toBe(w.first)
    expect(await quantity()).toBe('OVERRIDDEN')
    expect((await matchInvoice(w.id))?.voidedWaiver ?? null).toBeNull()
  })

  it('once the invoice’s total changes the waiver no longer covers it, and paying it is refused in a sentence saying what the waiver was for and what the invoice is now', async () => {
    const now = await oneMoreHour()
    const m = await matchInvoice(w.id)
    expect(m?.checks.find((c) => c.code === 'QUANTITY')?.outcome).toBe('FAIL')
    expect(m?.voidedWaiver).toMatch(
      new RegExp(`recorded was for \\${dollars(w.first)}; the invoice is now \\${dollars(now)}, so it no longer covers it\\. Record the exception again if it still stands\\.$`)
    )
    const refused = matchRefusal(w.number, m)
    expect(refused?.ok).toBe(false)
    expect(refused && !refused.ok && refused.says).toContain(m!.voidedWaiver!)
  })

  it('recorded again at the new total by the team that pays, the waiver covers the invoice again', async () => {
    as(w.ap)
    const r = await json(await waive(req('POST', `/api/invoices/${w.id}/match/override`, { code: 'QUANTITY', reason: 'Two hours of handover, agreed with the manager in writing.' }), { params: Promise.resolve({ id: w.id }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await quantity()).toBe('OVERRIDDEN')
    expect((await matchInvoice(w.id))?.voidedWaiver ?? null).toBeNull()
  })
})
