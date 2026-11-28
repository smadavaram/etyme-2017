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

describe('one sell line billed in one currency and paid in another', () => {
  it('a line billed and paid in dollars has its margin as before', async () => {
    const { lineMargin } = await import('@/lib/commission')
    expect(lineMargin({ hours: 10, billRateCents: 10_000, billCurrency: 'USD', payRateCents: 7_000, payCurrency: 'USD' }, null, ON))
      .toEqual({ ok: true, currency: 'USD', minor: 30_000, converted: null })
  })

  it('a line billed in dollars and paid in rupees is converted once at the company’s own rate and says which', async () => {
    const { lineMargin } = await import('@/lib/commission')
    const m = lineMargin({ hours: 10, billRateCents: 10_000, billCurrency: 'USD', payRateCents: 500_000, payCurrency: 'INR' }, OWN, ON)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    // ₹5,000 an hour at 0.012 is $60 an hour; $100 less $60 over 10 hours.
    expect(m.minor).toBe(40_000)
    expect(m.converted).toMatch(/converted to \$60\.00 at your rate INR 0\.012 from 2026-10-01 \(set by Rosalind Tay\)/)
  })

  it('a line billed in dollars and paid in rupees with no rate of the company’s own has no margin figure, and names both rates', async () => {
    const { lineMargin } = await import('@/lib/commission')
    for (const table of [null, SAMPLE]) {
      const m = lineMargin({ hours: 10, billRateCents: 10_000, billCurrency: 'USD', payRateCents: 500_000, payCurrency: 'INR' }, table, ON)
      expect(m.ok).toBe(false)
      if (!m.ok) expect(m.says).toMatch(/\$100\.00 an hour.*₹5,000\.00 an hour/)
    }
  })
})

describe('the cap counts what was already paid in one currency', () => {
  it('past commission in the run’s own currency is counted as it stands', async () => {
    const { alreadyPaidIn } = await import('@/lib/commission')
    expect(alreadyPaidIn('USD', [{ txCurrency: 'USD', txAmountCents: -30_000, amountCents: -30_000 }], null, ON))
      .toEqual({ ok: true, cents: 30_000, converted: null })
  })

  it('past commission paid in rupees is converted once at the company’s own rate before it is counted against a dollar cap, and says so', async () => {
    const { alreadyPaidIn } = await import('@/lib/commission')
    const a = alreadyPaidIn('USD', [
      { txCurrency: 'USD', txAmountCents: -30_000, amountCents: -30_000 },
      { txCurrency: 'INR', txAmountCents: -1_000_000, amountCents: -12_000 },
    ], OWN, ON)
    expect(a).toMatchObject({ ok: true, cents: 30_000 + 12_000 })
    if (a.ok) expect(a.converted).toMatch(/₹10,000\.00 as \$120\.00/)
  })

  it('past commission in another currency with no rate of the company’s own leaves the cap unchecked, said, never summed', async () => {
    const { alreadyPaidIn } = await import('@/lib/commission')
    const a = alreadyPaidIn('USD', [{ txCurrency: 'INR', txAmountCents: -1_000_000, amountCents: -12_000 }], SAMPLE, ON)
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.says).toMatch(/cap cannot be checked/)
  })
})
