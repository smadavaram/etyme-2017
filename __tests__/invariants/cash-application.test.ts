/**
 * Money you have and cannot count.
 *
 * A receipt keyed against no invoice is invisible in most systems, because
 * every screen is built around the invoice rather than the receipt. It sits
 * on a bank statement and in no figure anywhere, and that is a worse
 * problem than money you are owed — it looks like neither.
 */

import { describe, it, expect } from 'vitest'
import { unappliedCash, applyReceipt, type Receipt } from '@/lib/ar-ageing'

const NOW = new Date('2026-08-29T00:00:00Z')

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    payerCompanyId: 'c-nike',
    payerName: 'Nike Inc',
    currency: 'USD',
    amountMinor: 500_000,
    receivedAt: new Date('2026-08-20T00:00:00Z'),
    reference: 'WIRE-4471',
    appliedToInvoiceId: null,
    appliedAt: null,
    ...over,
  }
}

function invoice(over: Partial<{ number: string; currency: string; totalMinor: number; paidMinor: number }> = {}) {
  return {
    number: 'IN_ABC_001',
    currency: 'USD',
    totalMinor: 900_000,
    paidMinor: 0,
    ...over,
  }
}

describe('A receipt that names nothing is still a fact', () => {
  it('a receipt that names no invoice is recorded rather than lost, and appears as unapplied cash', () => {
    const books = unappliedCash([receipt()], NOW)
    expect(books).toHaveLength(1)
    expect(books[0].currency).toBe('USD')
    expect(books[0].totalMinor).toBe(500_000)
  })

  it('the unapplied queue shows the payer, the amount and the date, because that is what a person matches by hand', () => {
    const books = unappliedCash([receipt()], NOW)
    const r = books[0].receipts[0]
    expect(r.payerName).toBe('Nike Inc')
    expect(r.amountMinor).toBe(500_000)
    expect(r.receivedAt.toISOString().slice(0, 10)).toBe('2026-08-20')
    expect(books[0].oldestDays).toBe(9)
  })

  it('a receipt already placed on an invoice has left the queue', () => {
    const books = unappliedCash([receipt({ appliedToInvoiceId: 'inv-1', appliedAt: NOW })], NOW)
    expect(books).toEqual([])
  })

  it('dollars and rupees sit in separate queues and are never added', () => {
    const books = unappliedCash(
      [receipt(), receipt({ id: 'r2', currency: 'INR', amountMinor: 8_000_000 })],
      NOW
    )
    expect(books.map((b) => b.currency).sort()).toEqual(['INR', 'USD'])
    expect(books.find((b) => b.currency === 'USD')!.totalMinor).toBe(500_000)
  })

  it('a receipt with no payer on it is counted and said out loud, because that is the hard one to place', () => {
    const books = unappliedCash([receipt({ payerCompanyId: null, payerName: null })], NOW)
    expect(books[0].says).toContain('do not even say who sent the money')
  })

  it('unapplied cash is its own number on the AR screen and is never netted into what we are owed', () => {
    const books = unappliedCash([receipt()], NOW)
    expect(books[0].says).toContain('not netted against what you are owed')
  })
})

describe('Placing a receipt on an invoice', () => {
  it('applying a receipt to an invoice larger than itself leaves the invoice part paid', () => {
    const v = applyReceipt(receipt({ amountMinor: 400_000 }), invoice({ totalMinor: 900_000 }))
    expect(v.ok).toBe(true)
    expect(v.appliedMinor).toBe(400_000)
    expect(v.invoiceOwesAfterMinor).toBe(500_000)
  })

  it('a receipt exactly matching the balance settles the invoice in full', () => {
    const v = applyReceipt(receipt({ amountMinor: 900_000 }), invoice({ totalMinor: 900_000 }))
    expect(v.ok).toBe(true)
    expect(v.invoiceOwesAfterMinor).toBe(0)
    expect(v.says).toContain('settled in full')
  })

  it('a receipt cannot be applied twice', () => {
    const v = applyReceipt(receipt({ appliedToInvoiceId: 'inv-9' }), invoice())
    expect(v.ok).toBe(false)
    expect(v.refusal).toBe('ALREADY_APPLIED')
    expect(v.says).toContain('same money twice')
  })

  it('a receipt in one currency cannot be applied to an invoice in another', () => {
    const v = applyReceipt(receipt({ currency: 'INR' }), invoice({ currency: 'USD' }))
    expect(v.ok).toBe(false)
    expect(v.refusal).toBe('CURRENCY_MISMATCH')
    expect(v.says).toContain('bury an exchange rate inside a payment')
  })

  it('applying more cash than the invoice is owed is refused, and the excess offered as a second receipt', () => {
    const v = applyReceipt(receipt({ amountMinor: 1_000_000 }), invoice({ totalMinor: 600_000 }))
    expect(v.ok).toBe(false)
    expect(v.refusal).toBe('MORE_THAN_OWED')
    expect(v.leftOverMinor).toBe(1_000_000)
    expect(v.says).toContain('Split the receipt')
  })

  it('an invoice already settled refuses more cash rather than inventing an overpayment', () => {
    const v = applyReceipt(receipt(), invoice({ totalMinor: 900_000, paidMinor: 900_000 }))
    expect(v.ok).toBe(false)
    expect(v.refusal).toBe('INVOICE_SETTLED')
  })

  it('a part-paid invoice takes a receipt against its remaining balance only', () => {
    const v = applyReceipt(
      receipt({ amountMinor: 300_000 }),
      invoice({ totalMinor: 900_000, paidMinor: 600_000 })
    )
    expect(v.ok).toBe(true)
    expect(v.invoiceOwesAfterMinor).toBe(0)
  })
})
