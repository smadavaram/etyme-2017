import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Review of 2026-11-12: Bench profit read commission one calendar month at a
 * time from the earliest placement to today, each month its own set of reads,
 * so a placement with years behind it cost a set of reads per month. Money's
 * reader now answers a span at once: the rows, the cash bills and the
 * postings read once, each window priced once, and every month's answer the
 * same as reading that month alone.
 */

const commissionRows = vi.fn()
const postings = vi.fn()
const invoiceLines = vi.fn()
const pairsFor = vi.fn()
const placementBooks = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    contractCommission: { findMany: (...a: unknown[]) => commissionRows(...a) },
    orderPosting: { findMany: (...a: unknown[]) => postings(...a) },
    invoiceLine: { findMany: (...a: unknown[]) => invoiceLines(...a) },
  },
}))
vi.mock('@/lib/money/margin', () => ({
  pairsFor: (...a: unknown[]) => pairsFor(...a),
  placementBooks: (...a: unknown[]) => placementBooks(...a),
}))

import { commissionAccruals, commissionAccrualsOver, monthPeriod } from '@/lib/money/commission-accrual'

const person = { id: 'rajesh', name: 'Rajesh Iyer' }
const sell = { id: 'sell-1', companyId: 'brightmoor', person, clientCompany: { id: 'northbend', name: 'Northbend Athletic' } }
const ROW = {
  id: 'row-1', companyId: 'brightmoor', sellContractId: 'sell-1', buyContractId: null, earnedById: 'marisa',
  kind: 'SALES', basis: 'PER_HOUR', rateBps: null, amountCents: 100, capCents: null,
  fromDate: new Date('2025-01-01T00:00:00Z'), toDate: null, accrueOn: 'ACCEPTED', reason: 'Marisa sold it.',
  earnedBy: { id: 'marisa', name: 'Marisa Delacroix' }, setBy: { id: 'jenna', name: 'Jenna Okafor' },
  setAt: new Date('2025-01-01T00:00:00Z'), sellContract: sell, buyContract: null,
}

const months = Array.from({ length: 24 }, (_, i) => monthPeriod(new Date(Date.UTC(2025, i, 15))))

beforeEach(() => {
  for (const f of [commissionRows, postings, invoiceLines, pairsFor, placementBooks]) f.mockReset()
  commissionRows.mockResolvedValue([ROW])
  postings.mockResolvedValue([])
  invoiceLines.mockResolvedValue([])
  pairsFor.mockResolvedValue({})
  placementBooks.mockImplementation(async () => [{
    sellContractId: 'sell-1', currency: 'USD',
    earned: { weeksAwaitingPay: 0, hoursBilled: 160, revenueCents: 1_600_000, marginCents: 400_000, marginBlankedBy: null, marginRefusedBecause: null },
  }])
})

describe('commission over a span of months', () => {
  it('two years of months read the commission rows, the placements and the postings once, not once a month', async () => {
    const out = await commissionAccrualsOver('brightmoor', months, { sellContractIds: ['sell-1'] })
    expect(out).toHaveLength(24)
    expect(commissionRows).toHaveBeenCalledTimes(1)
    expect(postings).toHaveBeenCalledTimes(1)
    expect(pairsFor).toHaveBeenCalledTimes(1)
    // One window a month, each priced once.
    expect(placementBooks).toHaveBeenCalledTimes(24)
  })

  it('every month reads the same commission over the span as it does on its own', async () => {
    const over = await commissionAccrualsOver('brightmoor', months, { sellContractIds: ['sell-1'] })
    for (const [i, p] of months.entries()) {
      const alone = await commissionAccruals('brightmoor', p, { sellContractIds: ['sell-1'] })
      expect(over[i].map((a) => a.accrual.amountCents)).toEqual(alone.map((a) => a.accrual.amountCents))
    }
    expect(over[0][0].accrual.amountCents).toBe(16_000)
  })

  it('a month before the row’s first day reads no commission, inside the same span', async () => {
    commissionRows.mockResolvedValue([{ ...ROW, fromDate: new Date('2025-07-01T00:00:00Z') }])
    const out = await commissionAccrualsOver('brightmoor', months, { sellContractIds: ['sell-1'] })
    expect(out[5]).toEqual([])
    expect(out[6]).toHaveLength(1)
  })

  it('a firm with no commission rows answers an empty month for every month and prices nothing', async () => {
    commissionRows.mockResolvedValue([])
    const out = await commissionAccrualsOver('brightmoor', months)
    expect(out.every((m) => m.length === 0)).toBe(true)
    expect(placementBooks).not.toHaveBeenCalled()
  })
})
