import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { owedInAll, type SupplierInvoiceRow } from '@/lib/money/supplier-invoices'

/**
 * One figure for what a firm owes, from one door.
 *
 * Walked 2026-09-30 as Computer Systems: its invoice list read "We owe
 * $16,992" — the bills its supplier generated to it — and Accounts
 * payable read "$36,800" — the invoice receipts it keyed in. Neither was
 * what it owed.
 */

const now = new Date('2026-09-30T12:00:00Z')
const row = (over: Partial<SupplierInvoiceRow>): SupplierInvoiceRow => ({
  id: over.number ?? 'x', number: 'x', supplierName: 'CloudEPA', currency: 'USD',
  totalMinor: 0, paidMinor: 0, dueAt: new Date('2026-10-30T00:00:00Z'), status: 'SUBMITTED', ...over,
})

describe('what a firm owes its suppliers is one figure, from both ways an invoice reaches the record', () => {
  it('a generated bill and a keyed-in invoice receipt are both owed, and the headline is their sum', () => {
    const r = owedInAll(
      [row({ number: 'IN_W1ZA7E_001', totalMinor: 283_200 })],
      [row({ number: 'CE-2026-0418', totalMinor: 1_792_000 })],
      now
    )
    expect(r.books).toEqual([
      { currency: 'USD', owedMinor: 2_075_200, overdueMinor: 0, openCount: 2, fromBills: 1, fromReceipts: 1 },
    ])
    expect(r.says).toBe('You owe $20,752.00 on 2 invoice receipts.')
  })

  it('a paid or cancelled one is not owed, whichever door it came through', () => {
    const r = owedInAll(
      [row({ totalMinor: 448_000, paidMinor: 448_000, status: 'PAID' })],
      [row({ totalMinor: 896_000, status: 'CANCELLED' })],
      now
    )
    expect(r.books).toEqual([])
    expect(r.says).toBe('Nothing is owed to any supplier.')
  })

  it('what is past its due date is counted as overdue', () => {
    const r = owedInAll([], [row({ totalMinor: 100_000, dueAt: new Date('2026-09-01T00:00:00Z') })], now)
    expect(r.books[0].overdueMinor).toBe(100_000)
  })

  it('dollars and rupees are two books, never one sum', () => {
    const r = owedInAll([row({ totalMinor: 100_000 })], [row({ totalMinor: 5_000_000, currency: 'INR' })], now)
    expect(r.books.map((b) => b.currency).sort()).toEqual(['INR', 'USD'])
    expect(r.says).toMatch(/ in USD/)
    expect(r.says).toMatch(/ in INR/)
  })
})

describe('both screens read the one door', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8')

  it('Accounts payable’s “We owe” and the invoice list’s “we owe” are both read from whatWeOwe', () => {
    expect(src('app/api/ap/route.ts')).toContain('await whatWeOwe(companyId, now)')
    expect(src('app/api/invoices/route.ts')).toContain('await whatWeOwe(companyId, new Date())')
    expect(src('app/dashboard/invoices/page.tsx')).toContain('summary?.owedInAll')
  })
})
