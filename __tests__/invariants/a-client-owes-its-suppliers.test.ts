/**
 * A client's accounts payable is its suppliers' invoices.
 *
 * ── The empty page that lied ─────────────────────────────────────────
 *
 * Northbend Athletic's AP desk opened Accounts payable and read "No
 * supplier bills have been recorded, so there is nothing to measure on
 * the way out" — with six unpaid invoices from its suppliers one nav
 * entry away on Invoices.
 *
 * Both records are right. A supplier issues its invoice and the client
 * receives it (CLAUDE.md: the party who issues a document names it), so
 * on the platform it is an `Invoice` row raised by the supplier. A
 * `VendorBill` is the other case — a bill keyed in from a supplier that
 * is not here. A client whose suppliers are all on the platform has no
 * `VendorBill` rows at all and never will, so the page has to read the
 * invoices or it is a page that lies for good.
 */

import { describe, it, expect } from 'vitest'
import { supplierInvoicesOwed, type SupplierInvoiceRow } from '@/lib/money/supplier-invoices'

const NOW = new Date('2026-09-20T00:00:00Z')

function invoice(over: Partial<SupplierInvoiceRow> = {}): SupplierInvoiceRow {
  return {
    id: 'inv1',
    number: 'IN-1001',
    supplierName: 'Veritan Talent',
    currency: 'USD',
    totalMinor: 520_000,
    paidMinor: 0,
    dueAt: new Date('2026-10-05T00:00:00Z'),
    status: 'SUBMITTED',
    ...over,
  }
}

describe("a client's accounts payable is the invoices its suppliers raised to it", () => {

  it('tells a client what it owes rather than that nothing has been recorded', () => {
    const l = supplierInvoicesOwed([
      invoice({ id: 'a', number: 'IN-1' }),
      invoice({ id: 'b', number: 'IN-2', totalMinor: 300_000 }),
    ], NOW)
    expect(l.openCount).toBe(2)
    expect(l.books[0].owedMinor).toBe(820_000)
    expect(l.says).toContain('2 supplier invoices open, $8,200.00')
  })

  it('says where the rows are, so nobody is left on an empty page', () => {
    const l = supplierInvoicesOwed([invoice()], NOW)
    expect(l.says).toContain('on Invoices')
    expect(l.says).toContain('We owe')
  })

  it('counts what is owed one currency at a time and never adds two together', () => {
    const l = supplierInvoicesOwed([
      invoice({ id: 'a', currency: 'USD', totalMinor: 520_000 }),
      invoice({ id: 'b', currency: 'INR', totalMinor: 4_000_000 }),
    ], NOW)
    expect(l.books.map((b) => b.currency).sort()).toEqual(['INR', 'USD'])
    expect(l.books.find((b) => b.currency === 'USD')!.owedMinor).toBe(520_000)
    expect(l.books.find((b) => b.currency === 'INR')!.owedMinor).toBe(4_000_000)
    expect(l.says).toContain('in USD')
    expect(l.says).toContain('in INR')
  })

  it('does not count an invoice that has already been paid as owed', () => {
    const l = supplierInvoicesOwed([
      invoice({ id: 'a', status: 'PAID', paidMinor: 520_000 }),
      invoice({ id: 'b', number: 'IN-2' }),
    ], NOW)
    expect(l.openCount).toBe(1)
    expect(l.books[0].owedMinor).toBe(520_000)
  })

  it('counts what is left on a part-paid invoice, not the whole of it', () => {
    const l = supplierInvoicesOwed(
      [invoice({ status: 'PARTIALLY_PAID', totalMinor: 520_000, paidMinor: 120_000 })],
      NOW
    )
    expect(l.books[0].owedMinor).toBe(400_000)
  })

  it('leaves a cancelled invoice and a draft out of what is owed', () => {
    const l = supplierInvoicesOwed([
      invoice({ id: 'a', status: 'CANCELLED' }),
      invoice({ id: 'b', status: 'DRAFT' }),
    ], NOW)
    expect(l.openCount).toBe(0)
    expect(l.books).toEqual([])
  })

  it('says how much of what is owed is already past its due date', () => {
    const l = supplierInvoicesOwed([
      invoice({ id: 'a', dueAt: new Date('2026-09-01T00:00:00Z'), totalMinor: 200_000 }),
      invoice({ id: 'b', dueAt: new Date('2026-10-01T00:00:00Z'), totalMinor: 300_000 }),
    ], NOW)
    expect(l.books[0].overdueMinor).toBe(200_000)
    expect(l.says).toContain('$2,000.00 of that is past its due date')
  })

  it('puts the invoice due soonest at the top, because that is the one to pay next', () => {
    const l = supplierInvoicesOwed([
      invoice({ id: 'late', number: 'IN-LATE', dueAt: new Date('2026-11-01T00:00:00Z') }),
      invoice({ id: 'soon', number: 'IN-SOON', dueAt: new Date('2026-09-25T00:00:00Z') }),
    ], NOW)
    expect(l.rows[0].number).toBe('IN-SOON')
  })

  it('tells a client whose suppliers are all paid that nothing is open, not that nothing exists', () => {
    const l = supplierInvoicesOwed([invoice({ status: 'PAID', paidMinor: 520_000 })], NOW)
    expect(l.says).toContain('every one is paid')
    expect(l.says).not.toContain('Nothing has been recorded')
  })

  it('tells a company with nothing at all what would make something appear', () => {
    const l = supplierInvoicesOwed([], NOW)
    expect(l.says).toContain('Nothing has been recorded to pay')
    expect(l.says).toContain('hours you have signed')
  })
})
