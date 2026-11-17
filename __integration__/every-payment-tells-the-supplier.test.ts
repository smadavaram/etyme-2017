import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as payBill } from '@/app/api/ap/bills/route'
import { PATCH as runs } from '@/app/api/ap/payment-runs/route'
import { POST as payInvoice } from '@/app/api/invoices/[id]/payments/route'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { mayPayInvoiceReceipt } from '@/lib/invoice-match'

/**
 * Every payment goes through one function, and the supplier is told every
 * time (the founder, 2026-11-12), on the seeded world, through the real
 * routes: a typed-in receipt paid from its own page, a run marked paid,
 * and a supplier's bill paid from its page. Each writes one Payment row
 * and one notice per seat that hears it; a second press writes and tells
 * nothing.
 */

const D = '@demo.etyme.local'
const PAYROLL = `world-brightmoor-payroll${D}`
const FINANCE = `world-brightmoor-finance${D}`
const NIKE_AP = `world-nike-ap${D}`

const s: Record<string, any> = {}
const today = () => new Date().toISOString().slice(0, 10)

const told = (paymentId: string) => prisma.notification.count({ where: { entityId: paymentId, type: 'INVOICE' } })
const payments = (billId: string) => prisma.payment.count({ where: { vendorBillId: billId } })

/** Put the receipt back as it was found: unpaid, no payment rows. */
async function putBack() {
  await prisma.paymentRunItem.deleteMany({ where: { vendorBillId: s.ownPay } })
  await prisma.payment.deleteMany({ where: { vendorBillId: s.ownPay } })
  await prisma.vendorBill.update({ where: { id: s.ownPay }, data: s.found })
}

async function runFor(billId: string) {
  const b = await prisma.vendorBill.findUniqueOrThrow({ where: { id: billId }, select: { companyId: true, currency: true, totalCents: true, paidCents: true } })
  const [creator, approver] = await Promise.all([
    prisma.person.findFirstOrThrow({ where: { primaryEmail: FINANCE }, select: { id: true } }),
    prisma.person.findFirstOrThrow({ where: { primaryEmail: PAYROLL }, select: { id: true } }),
  ])
  const owed = b.totalCents - b.paidCents
  const run = await prisma.paymentRun.create({
    data: {
      companyId: b.companyId, currency: b.currency, status: 'APPROVED', scheduledFor: new Date(), totalCents: owed,
      createdById: creator.id, approvedById: approver.id,
      items: { create: [{ vendorBillId: billId, amountCents: owed }] },
    },
    select: { id: true },
  })
  return run.id
}

const markPaid = (body: Record<string, unknown>) => {
  as(PAYROLL)
  return runs(req('PATCH', '/api/ap/payment-runs', { action: 'pay', ...body })).then(json)
}

describe('every payment goes through one function, and the supplier is told every time', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    // Found by their facts: Brightmoor's open typed-in receipts that pass
    // the payment gate today, whoever sent them.
    const open = await prisma.vendorBill.findMany({
      where: { companyId: brightmoor.id, status: { in: ['RECEIVED', 'APPROVED'] }, paidCents: 0 },
      select: { id: true, vendorCompanyId: true },
      orderBy: { createdAt: 'asc' },
    })
    const payable: { id: string; vendorCompanyId: string }[] = []
    for (const b of open) if ((await mayPayKeyedReceipt(b.id))?.ok) payable.push(b)
    if (payable.length === 0) throw new Error('The seeded world holds no payable typed-in receipt at Brightmoor.')
    // One receipt, paid once by each door in turn: between doors it is put
    // back as it was found, so each door meets the same receipt.
    s.ownPay = s.runPay = s.held = payable[0].id
    s.ownVendor = s.heldVendor = payable[0].vendorCompanyId
    s.found = await prisma.vendorBill.findUniqueOrThrow({ where: { id: payable[0].id }, select: { status: true, paidCents: true, paidAt: true } })

    // A supplier's bill that arrived on Etyme, which Northbend's AP clerk may pay now.
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const candidates = await prisma.invoice.findMany({
      where: { status: { in: ['SUBMITTED', 'ISSUED'] }, OR: [{ engagement: { msa: { clientId: nike.id } } }, { workOrder: { issuedById: nike.id } }] },
      select: { id: true, total: true, paid: true, currency: true },
      orderBy: { number: 'asc' },
    })
    for (const c of candidates) {
      if ((await mayPayInvoiceReceipt(c.id))?.ok) {
        s.invoice = c.id
        s.invoiceOwed = Number(c.total) - Number(c.paid)
        s.invoiceCurrency = c.currency
        break
      }
    }
  }, 600_000)

  it('a typed-in receipt paid from its own page writes exactly one Payment row and tells the supplier exactly once', async () => {
    as(PAYROLL)
    const r = await json(await payBill(req('PATCH', '/api/ap/bills', { id: s.ownPay, method: 'ACH', reference: 'ACH-ONE-1' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await payments(s.ownPay)).toBe(1)
    const id = r.body.data.payment.id
    const n = await told(id)
    expect(n).toBe(r.body.data.suppliersTold)
    expect(n, 'the supplier has somebody on Etyme to tell').toBeGreaterThan(0)
    {
      const note = await prisma.notification.findFirstOrThrow({ where: { entityId: id }, select: { title: true, body: true, companyId: true } })
      expect(note.companyId).toBe(s.ownVendor)
      expect(note.title).toMatch(/^Brightmoor .+ paid your invoice /)
      expect(note.body).toContain('reference ACH-ONE-1')
    }
    s.ownPaymentId = id
    s.ownTold = n
  })

  it('a second press on the same receipt pays nothing and tells nobody', async () => {
    as(PAYROLL)
    const r = await json(await payBill(req('PATCH', '/api/ap/bills', { id: s.ownPay, method: 'ACH', reference: 'ACH-ONE-1' })))
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(await payments(s.ownPay)).toBe(1)
    expect(await told(s.ownPaymentId)).toBe(s.ownTold)
  })

  it('Mark it paid without a reference or a paid date is refused in a sentence naming the field, and nothing is written', async () => {
    await putBack()
    s.run = await runFor(s.runPay)
    const noRef = await markPaid({ id: s.run, paidOn: today() })
    expect(noRef.status).toBe(422)
    expect(noRef.body.error.field).toBe('reference')
    const noDay = await markPaid({ id: s.run, reference: 'ACH-RUN-1' })
    expect(noDay.status).toBe(422)
    expect(noDay.body.error.field).toBe('paidOn')
    expect(await payments(s.runPay)).toBe(0)
  })

  it('Mark it paid writes one Payment row through the one write and tells the supplier exactly once', async () => {
    const r = await markPaid({ id: s.run, reference: 'ACH-RUN-1', paidOn: today() })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.paid).toHaveLength(1)
    expect(await payments(s.runPay)).toBe(1)
    const p = r.body.data.paid[0]
    expect(p.payerReference).toBe('ACH-RUN-1')
    expect(await told(p.paymentId)).toBe(p.suppliersTold)
    expect(p.suppliersTold).toBeGreaterThan(0)
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId }, select: { reference: true, method: true } })
    expect(pay).toEqual({ reference: 'ACH-RUN-1', method: 'PAYMENT_RUN' })
    expect((await prisma.paymentRun.findUniqueOrThrow({ where: { id: s.run } })).status).toBe('PAID')
    s.runPaymentId = p.paymentId
    s.runTold = p.suppliersTold
  })

  it('a second press of Mark it paid, or the same confirmation brought back, pays nothing and tells nobody', async () => {
    const again = await markPaid({ id: s.run, reference: 'ACH-RUN-1', paidOn: today() })
    expect(again.status).toBe(422)
    as(PAYROLL)
    const confirmed = await json(await runs(req('PATCH', '/api/ap/payment-runs', { action: 'confirm', id: s.run, reference: 'ACH-RUN-1', paidOn: today() })))
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.data.paid).toHaveLength(0)
    expect(confirmed.body.data.refused[0].says).toMatch(/is already paid\. Nothing was written again\.$/)
    expect(await payments(s.runPay)).toBe(1)
    expect(await told(s.runPaymentId)).toBe(s.runTold)
  })

  it('a held receipt is refused from its own page, from Mark it paid and from the confirmation in the same sentence', async () => {
    await putBack()
    s.heldRun = await runFor(s.held)
    await prisma.remitTo.updateMany({ where: { companyId: s.heldVendor }, data: { verifiedAt: null, verifiedById: null, verifiedByCompanyId: null } })
    const before = await prisma.notification.count({ where: { companyId: s.heldVendor, type: 'INVOICE' } })

    as(PAYROLL)
    const own = await json(await payBill(req('PATCH', '/api/ap/bills', { id: s.held, method: 'ACH', reference: 'ACH-H' })))
    expect(own.status).toBe(409)
    const sentence: string = own.body.error.message
    expect(sentence).toMatch(/^Bank details not checked\./)

    const run = await markPaid({ id: s.heldRun, reference: 'ACH-H', paidOn: today() })
    expect(run.status).toBe(409)
    expect(run.body.error.message).toContain(sentence)

    as(PAYROLL)
    const confirmed = await json(await runs(req('PATCH', '/api/ap/payment-runs', { action: 'confirm', id: s.heldRun, reference: 'ACH-H', paidOn: today() })))
    expect(confirmed.body.data.paid).toHaveLength(0)
    expect(confirmed.body.data.refused[0].says).toContain(sentence)

    expect(await payments(s.held)).toBe(0)
    expect(await prisma.notification.count({ where: { companyId: s.heldVendor, type: 'INVOICE' } })).toBe(before)
  })

  it('a supplier’s bill paid from its page writes one Payment row, tells the supplier once in the bill’s currency and names that bill', async () => {
    expect(s.invoice, 'the seeded world holds a supplier’s bill Northbend may pay now').toBeTruthy()
    const paidBefore = await prisma.payment.count({ where: { invoiceId: s.invoice } })
    as(NIKE_AP)
    const params = { params: Promise.resolve({ id: s.invoice }) }
    const r = await json(await payInvoice(req('POST', `/api/invoices/${s.invoice}/payments`, { amount: s.invoiceOwed, method: 'ACH', reference: 'ACH-INV-1' }), params))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const id = r.body.data.payment.id
    expect(await prisma.payment.count({ where: { invoiceId: s.invoice } })).toBe(paidBefore + 1)
    const notes = await prisma.notification.findMany({ where: { entityId: id, type: 'INVOICE' }, select: { body: true, data: true } })
    expect(notes.length).toBeGreaterThan(0)
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: s.invoice }, select: { number: true, currency: true } })
    for (const n of notes) {
      expect(n.body).toContain(`paid your invoice ${inv.number}`)
      expect(n.body).toContain('It is recorded on that invoice under Receivables.')
      expect((n.data as any).currency).toBe(inv.currency)
      expect((n.data as any).amountMinor).toBe(r.body.data.payment.amountMinor)
      expect((n.data as any).href).toBe(`/dashboard/invoices/${s.invoice}`)
    }

    // The second press is refused as paid, and nobody is told again.
    as(NIKE_AP)
    const again = await json(await payInvoice(req('POST', `/api/invoices/${s.invoice}/payments`, { amount: s.invoiceOwed, method: 'ACH', reference: 'ACH-INV-1' }), params))
    expect(again.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.payment.count({ where: { invoiceId: s.invoice } })).toBe(paidBefore + 1)
    expect(await prisma.notification.count({ where: { entityId: id, type: 'INVOICE' } })).toBe(notes.length)
  })
})

// ── A company still waiting for a verified Owner ──────────────────────

import { GET as receipts } from '@/app/api/ap/receipts/route'
import { GET as payables } from '@/app/api/ap/route'
import { GET as runsPage } from '@/app/api/ap/payment-runs/route'
import { GET as invoicePage } from '@/app/api/invoices/[id]/route'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'

describe('a company waiting for a verified Owner is told before anybody presses Pay', () => {
  beforeAll(async () => {
    await putBack()
    await prisma.paymentRunItem.deleteMany({ where: { vendorBillId: s.ownPay } })
    await prisma.remitTo.updateMany({ where: { companyId: s.ownVendor }, data: { verifiedAt: new Date() } })
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    s.brightmoor = brightmoor.id
    await prisma.company.update({ where: { id: brightmoor.id }, data: { ownerProofRequiredAt: new Date(), ownerVerifiedAt: null } })
    const gate = await needsVerifiedOwnerAt(brightmoor.id, 'PAY')
    if (gate.ok) throw new Error('Brightmoor should be waiting for a verified Owner now.')
    s.ownerSays = gate.says
  })

  it('the Payables page says the gate’s own sentence with its link to Prove ownership', async () => {
    as(PAYROLL)
    const r = await json(await payables(req('GET', '/api/ap')))
    expect(r.status).toBe(200)
    expect(r.body.data.payWaits).toEqual({ says: s.ownerSays, href: '/dashboard/settings/setup/ownership', linkSays: 'Prove ownership' })
  })

  it('a typed-in receipt draws no Pay control and says the gate’s sentence with its link, the one the route refuses with', async () => {
    as(PAYROLL)
    const r = await json(await receipts(req('GET', '/api/ap/receipts')))
    const row = r.body.data.receipts.find((x: { id: string }) => x.id === s.ownPay)
    expect(row.doors.pay.offered).toBe(false)
    expect(row.doors.pay.says).toBe(s.ownerSays)
    expect(row.doors.pay.href).toBe('/dashboard/settings/setup/ownership')

    as(PAYROLL)
    const refused = await json(await payBill(req('PATCH', '/api/ap/bills', { id: s.ownPay, method: 'ACH', reference: 'ACH-O' })))
    expect(refused.status).toBe(403)
    expect(refused.body.error.message).toBe(s.ownerSays)
    expect(await payments(s.ownPay)).toBe(0)
  })

  it('the payment run says the same line, so the page draws no Mark it paid', async () => {
    as(PAYROLL)
    const r = await json(await runsPage(req('GET', '/api/ap/payment-runs')))
    expect(r.status).toBe(200)
    expect(r.body.data.payWaits?.says).toBe(s.ownerSays)
  })

  it('a company that may pay is told nothing of the kind', async () => {
    await prisma.company.update({ where: { id: s.brightmoor }, data: { ownerProofRequiredAt: null } })
    as(PAYROLL)
    const r = await json(await payables(req('GET', '/api/ap')))
    expect(r.body.data.payWaits).toBeNull()
  })

  it('a supplier’s bill on its own page reads the gate’s sentence and no Pay where its payer waits for a verified Owner', async () => {
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    let target: string | null = null
    for (const c of await prisma.invoice.findMany({
      where: { status: { in: ['SUBMITTED', 'ISSUED'] }, OR: [{ engagement: { msa: { clientId: nike.id } } }, { workOrder: { issuedById: nike.id } }] },
      select: { id: true }, orderBy: { number: 'asc' },
    })) {
      if ((await mayPayInvoiceReceipt(c.id))?.ok) { target = c.id; break }
    }
    expect(target, 'Northbend has a supplier’s bill it may pay now').toBeTruthy()
    await prisma.company.update({ where: { id: nike.id }, data: { ownerProofRequiredAt: new Date(), ownerVerifiedAt: null } })
    const says = (await needsVerifiedOwnerAt(nike.id, 'PAY') as { says: string }).says
    as(NIKE_AP)
    const r = await json(await invoicePage(req('GET', `/api/invoices/${target}`), { params: Promise.resolve({ id: target! }) }))
    expect(r.status).toBe(200)
    expect(r.body.data.payPanel).toEqual({ kind: 'OWNER_WAITS', says, href: '/dashboard/settings/setup/ownership', linkSays: 'Prove ownership' })
  })
})
