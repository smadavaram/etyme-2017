import { describe, it, expect } from 'vitest'
import { watchedOrder, type OrderRow } from '@/app/api/cron/watch/orders'
import { watchPurchaseOrders } from '@/lib/watch'

const now = new Date('2026-11-09T12:00:00Z')
const order = (o: Partial<OrderRow>): OrderRow => ({
  id: 'po-1', issuedById: 'corvane', number: 'PO-VN-7', amount: 100_000_000, currency: 'VND', endDate: null, status: 'OPEN',
  issuedTo: { name: 'Saigon Talent' }, invoices: [], sellContracts: [{ id: 'l1' }], ...o,
})

describe('The nightly watch reads an order in its own currency (2026-11-09)', () => {
  it('a dong order is read in dong, with only its dong invoices added against the ceiling', () => {
    const w = watchedOrder(order({
      invoices: [
        { total: 90_000_000, status: 'SENT', currency: 'VND' },
        { total: 5_000_000, status: 'VOID', currency: 'VND' },
      ],
    }))
    expect(w.currency).toBe('VND')
    expect(w.invoicedCents).toBe(9_000_000_000)
    expect(w.otherCurrencies).toEqual([])
  })

  it('an invoice in another currency is never added to the order and its currency is passed on as left out', () => {
    const w = watchedOrder(order({
      invoices: [
        { total: 90_000_000, status: 'SENT', currency: 'VND' },
        { total: 4_000, status: 'SENT', currency: 'USD' },
        { total: 1_000, status: 'PAID', currency: 'USD' },
      ],
    }))
    expect(w.invoicedCents).toBe(9_000_000_000)
    expect(w.otherCurrencies).toEqual(['USD'])
  })

  it('a dong order running out is said in dong, never behind a dollar sign', () => {
    const findings = watchPurchaseOrders([watchedOrder(order({ invoices: [{ total: 95_000_000, status: 'SENT', currency: 'VND' }] }))], now)
    const words = JSON.stringify(findings)
    expect(findings.length).toBeGreaterThan(0)
    expect(words).not.toMatch(/\$/)
    expect(words).toMatch(/₫/)
  })
})
