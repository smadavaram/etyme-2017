/**
 * Three things money found on screens the platform draws (2026-11-01):
 * Today listed a bill raised and not sent under "Sent, not yet paid"; the
 * dashboard called every bill not yet sent "drafted"; and a placement said
 * a supplier "employs them directly" where it had no buy line at all.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/app/api/ar/book', () => ({
  loadBook: async () => ({
    book: {
      byCurrency: [{
        invoices: [
          { id: 'i1', number: 'INV-1', customerName: 'Northbend', currency: 'usd', outstandingMinor: 400000, dueAt: new Date('2026-11-10'), daysOverdue: 0, status: 'ISSUED' },
          { id: 'i2', number: 'INV-2', customerName: 'Northbend', currency: 'usd', outstandingMinor: 520000, dueAt: new Date('2026-11-05'), daysOverdue: 0, status: 'SUBMITTED' },
          { id: 'i3', number: 'INV-3', customerName: 'Cavanaugh', currency: 'usd', outstandingMinor: 100000, dueAt: new Date('2026-10-30'), daysOverdue: 3, status: 'PARTIALLY_PAID' },
          { id: 'i4', number: 'INV-4', customerName: 'Cavanaugh', currency: 'usd', outstandingMinor: 0, dueAt: new Date('2026-10-01'), daysOverdue: 0, status: 'PAID' },
          { id: 'i5', number: 'INV-5', customerName: 'Cavanaugh', currency: 'usd', outstandingMinor: 90000, dueAt: new Date('2026-10-20'), daysOverdue: 13, status: null },
        ],
      }],
    },
  }),
}))

import { unpaidBills } from '@/app/api/today/reads'
import { chainBelow } from '@/app/api/placements/[id]/chain'

describe('What Today and the placement say about bills and employment', () => {
  it('Today lists under "Sent, not yet paid" only bills that were sent, never one raised and not yet sent, nor one whose status is not on the record', async () => {
    const rows = await unpaidBills('brightmoor', new Date('2026-11-02'))
    expect(rows.map((r) => r.number)).toEqual(['INV-3', 'INV-2'])
  })

  it('the dashboard says a bill not yet sent in money’s own words, raised or drafted', () => {
    const page = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'page.tsx'), 'utf8')
    expect(page).toContain('{d.says ?? `Bill ${d.number} is drafted.`}')
    expect(page).not.toContain('>Bill {d.number} is drafted.<')
  })

  it('a supplier with no buy line for the person is never said to employ them', () => {
    const c = chainBelow({ isSupplier: true, firmName: 'Tapin', personName: 'Ravi Kumar', buyLine: null, below: 0, firmBelow: null })
    expect(c).toEqual({ hopsBelow: 0, weEmployThem: false, says: null })
  })

  it('a supplier whose buy line pays the person itself employs them; one whose buy line names a vendor buys their time', () => {
    expect(chainBelow({ isSupplier: true, firmName: 'Tapin', personName: 'Ravi Kumar', buyLine: { vendorName: null }, below: 0, firmBelow: null }))
      .toEqual({ hopsBelow: 0, weEmployThem: true, says: 'Tapin employs Ravi directly.' })
    expect(chainBelow({ isSupplier: true, firmName: 'Brightmoor', personName: 'Ravi Kumar', buyLine: { vendorName: 'Tapin' }, below: 1, firmBelow: 'Tapin' }).says)
      .toBe('Brightmoor buys Ravi’s time from Tapin.')
  })

  it('a client reads how many firms stand below and nothing about who employs whom', () => {
    expect(chainBelow({ isSupplier: false, firmName: 'Northbend', personName: 'Ravi Kumar', buyLine: null, below: 2, firmBelow: 'Tapin' }))
      .toEqual({ hopsBelow: 2, weEmployThem: null, says: null })
  })
})
