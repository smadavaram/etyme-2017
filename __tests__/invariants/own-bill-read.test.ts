import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { issuerOrderLeft, issuerPayTo, ownBillIsTheIssuers, ownBillView } from '@/lib/money/own-bill-read'

/**
 * The supplier's own two facts on its own bill.
 *
 * Since 2026-11-13 the coding view answers only the company that pays,
 * because a client's cost centers and accounts are the client's
 * (`coding-reader.test.ts`). The supplier lost two facts that are its own
 * with them: what is left on the order after this bill, and its pay-to
 * details. They come back through a read of their own,
 * GET /api/invoices/:id/own-bill, that carries nothing of the client's.
 * The walk on the seeded world is `__integration__/invoice-coding-wall.test.ts`.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const remit = {
  companyId: 'supplier',
  legalName: 'Supplier Co LLC',
  accountName: 'Supplier Co LLC',
  paymentMethod: 'ACH',
  bankName: 'First Bank',
  accountLast4: '4321',
  // What the row also holds, which never leaves through this read.
  taxId: '12-3456789',
  routingLast4: '0001',
  addressLines: ['1 Main St'],
}

const left = {
  number: 'PO-1',
  afterThisBill: true as const,
  amountCents: 10_000_00,
  invoicedCents: 4_000_00,
  remainingCents: 6_000_00,
  consumedPercent: 40,
  overdrawn: false,
  expired: false,
  canInvoice: true,
  reason: 'Available',
}

describe("a supplier's own bill", () => {
  it('a supplier opening its own bill still reads what is left on the order after this bill and its own pay-to details', () => {
    const view = ownBillView({ orderNumber: 'PO-1', left, remitTo: remit, issuerId: 'supplier' })
    expect(view.workOrder).toBe('PO-1')
    expect(view.purchaseOrderBalance).toEqual({ number: 'PO-1', remainingCents: 6_000_00, consumedPercent: 40, overdrawn: false })
    expect(view.remitTo).toEqual({
      legalName: 'Supplier Co LLC', accountName: 'Supplier Co LLC', paymentMethod: 'ACH', bankName: 'First Bank', accountLast4: '4321',
    })

    // The screen asks for it on the supplier's side and draws it in the same block as before.
    const screen = read('src/app/dashboard/invoices/invoice-money.tsx')
    expect(screen).toContain("const readsOwnBill = invoice.direction === 'RECEIVABLE'")
    expect(screen).toContain('/api/invoices/${invoice.id}/own-bill')
    expect(screen).toContain('readsCoding ? coding : ownBill')
    expect(screen).toContain('left after this bill')
    expect(screen).toContain("{payer ? 'Pay to' : 'Paid to'}")
  })

  it('that read carries no cost center, no account and no cost split', () => {
    const view = ownBillView({ orderNumber: 'PO-1', left, remitTo: remit, issuerId: 'supplier' })
    expect(Object.keys(view).sort()).toEqual(['purchaseOrderBalance', 'remitTo', 'workOrder'])
    expect(Object.keys(view.remitTo!).sort()).toEqual(['accountLast4', 'accountName', 'bankName', 'legalName', 'paymentMethod'])
    const text = JSON.stringify(view)
    expect(text).not.toMatch(/costCenter|glAccount|share|rows|codingOwner|internalOrder|taxId|routing|address/i)
    expect(text).not.toContain('12-3456789')

    // The route builds its answer from that one shape and reads no split.
    const route = read('src/app/api/invoices/[id]/own-bill/route.ts')
    expect(route).toContain('data: ownBillView(')
    expect(route).not.toMatch(/costAllocation|costCenter|glAccount|internalOrder|allocateAmount|erp-profiles/)
  })

  it('pay-to details that are not the issuer’s own are not given', () => {
    expect(issuerPayTo({ ...remit, companyId: 'someone-else' }, 'supplier')).toBeNull()
    expect(issuerPayTo(null, 'supplier')).toBeNull()
  })

  it('an order holding a document in another currency gives no figure, and says why', () => {
    const unreadable = { number: 'PO-1', unreadable: 'What is left on PO-1 is not given: INV-2 is in another currency than the order’s USD, and two currencies are never added.' }
    expect(issuerOrderLeft(unreadable)).toEqual(unreadable)
    expect(issuerOrderLeft(null)).toBeNull()
  })

  it('the figure is the one the coding view reads, never computed a second time', () => {
    const route = read('src/app/api/invoices/[id]/own-bill/route.ts')
    expect(route).toContain("import { leftAfterThisBill } from '@/lib/money/left-after-this-bill'")
    expect(read('src/app/api/invoices/[id]/coding/route.ts')).toContain('await leftAfterThisBill(invoice)')
    expect(read('src/lib/money/own-bill-read.ts')).not.toMatch(/remainingCents\s*[-+]=|amountCents\s*-/)
  })

  it('the client that pays reads the coding view as before', () => {
    const screen = read('src/app/dashboard/invoices/invoice-money.tsx')
    expect(screen).toContain("const readsCoding = invoice.direction === 'PAYABLE'")
    expect(screen).toContain('fetch(withBooks(`/api/invoices/${invoice.id}/coding`, books))')
    // The payer asking the issuer's door is pointed to its own view, in a sentence.
    expect(ownBillIsTheIssuers('INV-1')).toBe('INV-1 is yours to pay: its order and pay-to details are on its page, beside the cost coding.')
  })

  it('anybody but the firm that issued it is refused, and the refusal is on the access log before it is sent', () => {
    const route = read('src/app/api/invoices/[id]/own-bill/route.ts')
    const logged = route.indexOf('await recordRefusal(')
    expect(logged).toBeGreaterThan(-1)
    expect(route.indexOf("code: 'FORBIDDEN'")).toBeGreaterThan(logged)
    expect(route.indexOf('return notFound()\n  }\n  noteMoneyRead')).toBeGreaterThan(logged)
    expect(route).toContain("reader.kind !== 'ISSUER'")
  })
})
