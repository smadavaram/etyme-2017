import { describe, it, expect } from 'vitest'
import { yearEndPack, blankShortWages, type PayPosting } from '@/lib/payroll-export'

/**
 * A W-2 figure is never shown short of what the runs paid.
 *
 * Walked 2026-09-30 as CloudEPA: the bureau panel said 2026 W-2 wages
 * were $720 for Helena Marsh, on assignment since March and paid every
 * month by a payroll run. The runs paid; only one day had a wage posting
 * behind it, and the W-2 read the postings.
 */

const posting = (over: Partial<PayPosting>): PayPosting => ({
  personId: 'helena', personName: 'Helena Marsh', hasTaxId: false, contractType: 'W2',
  amountCents: -72_000, currency: 'USD', postedAt: new Date('2026-09-07T00:00:00Z'), ...over,
})

describe('a W-2 figure is never shown short of what the payroll runs paid', () => {
  it('where the runs paid $62,640 and the postings hold $720, the figure is blank and the sentence says both', () => {
    const pack = yearEndPack([posting({})], 2026)
    expect(pack.summaries[0].grossCents).toBe(72_000)
    const { pack: out, short } = blankShortWages(pack, [
      { personId: 'helena', personName: 'Helena Marsh', currency: 'USD', paidCents: 6_264_000 },
    ])
    expect(out.summaries[0].grossCents).toBeNull()
    expect(short[0].says).toBe(
      'Payroll runs paid Helena Marsh $62,640.00 USD in 2026, and only $720.00 has a wage posting behind it, ' +
        'so no W-2 figure is shown until the postings are complete.'
    )
    expect(out.totalReportableCents).toBe(0)
  })

  it('where the postings hold what the runs paid, to within a dollar of rounding, the figure stands', () => {
    const pack = yearEndPack([posting({ amountCents: -6_264_000 })], 2026)
    const { pack: out, short } = blankShortWages(pack, [
      { personId: 'helena', personName: 'Helena Marsh', currency: 'USD', paidCents: 6_264_040 },
    ])
    expect(out.summaries[0].grossCents).toBe(6_264_000)
    expect(short).toEqual([])
  })

  it('a person a run paid with no posting at all is named, never left off in silence', () => {
    const { short } = blankShortWages(yearEndPack([], 2026), [
      { personId: 'priya', personName: 'Priya Raman', currency: 'USD', paidCents: 1_000_000 },
    ])
    expect(short[0].says).toMatch(/^Payroll runs paid Priya Raman \$10,000\.00 USD in 2026 with no wage posting behind it/)
  })
})
