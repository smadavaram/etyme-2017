import { describe, it, expect } from 'vitest'
import { allocateByCurrency } from '@/lib/order'
import { marginForCommission } from '@/lib/commission'
import { looseEnd, rank } from '@/lib/loose-ends'
import type { RateTable } from '@/lib/money/reporting-currency'

/**
 * Two currencies are never added or ranked as raw numbers (coordinator's
 * call, 2026-11-08, the approval limit's rule): where one figure is needed
 * it is converted at the company's own rate and says which; where none is
 * set, each currency is said on its own and no single figure is given.
 */

const ON = new Date('2026-11-08T00:00:00Z')
const OWN: RateTable = {
  reportingCurrency: 'USD', sample: false, label: 'Rates you set.',
  rates: [{ from: 'INR', to: 'USD', rate: 0.012, effectiveOn: new Date('2026-10-01'), source: 'manual', recordedAt: null, setBy: 'Rosalind Tay' }],
}
const SAMPLE: RateTable = { ...OWN, sample: true, label: 'Sample rates, Oct 1, 2026.' }

describe('overhead is spread within its own currency', () => {
  const targets = [
    { key: 'usd-order', label: 'Corveldt', currency: 'USD', revenueCents: 1_000_000, people: 1 },
    { key: 'inr-order', label: 'Sundara', currency: 'INR', revenueCents: 90_000_000, people: 1 },
  ]

  it('rupee overhead lands only on rupee orders and dollar overhead only on dollar orders', () => {
    const { allocations, unspread } = allocateByCurrency(
      [{ currency: 'USD', amountCents: -50_000 }, { currency: 'INR', amountCents: -2_000_000 }], targets, 'REVENUE')
    expect(unspread).toEqual([])
    expect(allocations.find((a) => a.key === 'usd-order')).toMatchObject({ currency: 'USD', amountCents: -50_000 })
    expect(allocations.find((a) => a.key === 'inr-order')).toMatchObject({ currency: 'INR', amountCents: -2_000_000 })
  })

  it('a dollar order’s share is never weighed against rupee revenue', () => {
    const { allocations } = allocateByCurrency([{ currency: 'USD', amountCents: -50_000 }], targets, 'REVENUE')
    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toMatchObject({ key: 'usd-order', amountCents: -50_000, shareBps: 10_000 })
  })

  it('overhead in a currency no order bills in is left where it is and said, never moved onto another currency', () => {
    const { allocations, unspread } = allocateByCurrency([{ currency: 'EUR', amountCents: -10_000 }], targets, 'REVENUE')
    expect(allocations).toEqual([])
    expect(unspread[0].currency).toBe('EUR')
    expect(unspread[0].says).toMatch(/no order here bills in EUR/)
  })
})

describe('a margin share across sell lines in two currencies', () => {
  const two = [{ currency: 'USD', minor: 100_000 }, { currency: 'INR', minor: 5_000_000 }]

  it('one currency is paid on its margin as before', () => {
    expect(marginForCommission([{ currency: 'USD', minor: 100_000 }, { currency: 'USD', minor: 20_000 }], null, ON))
      .toEqual({ ok: true, marginCents: 120_000, currency: 'USD', converted: null })
  })

  it('two currencies with the company’s own rate are converted once and say at which rate', () => {
    const m = marginForCommission(two, OWN, ON)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.currency).toBe('USD')
    expect(m.marginCents).toBe(100_000 + 60_000)
    expect(m.converted).toMatch(/INR 0\.012 from 2026-10-01 \(set by Rosalind Tay\)/)
  })

  it('two currencies with no rate of the company’s own give no figure, and name each margin on its own', () => {
    const m = marginForCommission(two, null, ON)
    expect(m.ok).toBe(false)
    if (m.ok) return
    expect(m.says).toContain('$1,000.00')
    expect(m.says).toContain('₹50,000.00')
  })

  it('the shipped sample rates are never used to pay a commission', () => {
    expect(marginForCommission(two, SAMPLE, ON).ok).toBe(false)
  })
})

describe('loose ends are ranked by severity and age, never by an amount across currencies', () => {
  it('a rupee gap and a dollar gap of the same kind are ordered by age, whatever their amounts', () => {
    const old = looseEnd('NO_BUY_CONTRACT', { id: 'inr', label: 'Ravi', amountCents: 100, currency: 'INR', since: new Date('2026-06-01') }, ON)
    const recent = looseEnd('NO_BUY_CONTRACT', { id: 'usd', label: 'Helena', amountCents: 9_000_000, currency: 'USD', since: new Date('2026-11-01') }, ON)
    expect(rank([recent, old]).map((e) => e.subject.id)).toEqual(['inr', 'usd'])
  })
})
