import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { necFloorCheck, ownNecRateOf, NEC_FOREIGN_CURRENCY_RULE } from '@/lib/worker-classification'
import { rateFor, SAMPLE_RATE_TABLE, type ReportingRate } from '@/lib/money/reporting-currency'

/**
 * The 1099-NEC floor is in dollars, as the IRS writes it, and a
 * contractor's gross may not be (money's payroll export carries each
 * line's currency). Until a source confirms how a payment in another
 * currency is converted, the rule warns and never blocks.
 */
const ON = new Date('2026-12-31T00:00:00Z')
const OWN = { sample: false, rates: [{ from: 'INR', to: 'USD', rate: 0.012, effectiveOn: new Date('2026-10-01T00:00:00Z'), source: 'manual', recordedAt: null, setBy: 'Rosalind Tay' }] as ReportingRate[] }
const own = ownNecRateOf(OWN, rateFor as never, ON)
const FLOOR = 60_000

describe('the 1099-NEC floor against a gross that may not be in dollars', () => {
  it('a gross in dollars is put beside the floor as it stands, with nothing converted', () => {
    expect(necFloorCheck({ personName: 'Colleen Byrne', grossMinor: 50_000, currency: 'USD', floorCents: FLOOR })).toMatchObject({ checked: true, below: true, grossUsdCents: 50_000, rate: null, confirmed: true })
  })

  it('a gross in rupees is converted at the company’s own rate, and the sentence names the rate, its day and who set it', () => {
    // ₹40,000 at 0.012 is $480: under a $600 floor.
    const c = necFloorCheck({ personName: 'Ravi Kumar', grossMinor: 40_000_00, currency: 'INR', floorCents: FLOOR, rateOf: own })
    expect(c).toMatchObject({ checked: true, below: true, grossUsdCents: 480_00, confirmed: false })
    expect(c.says).toContain('Ravi Kumar’s ₹40,000.00 is $480.00 at your rate of 0.012 USD to the INR from Oct 1, 2026, set by Rosalind Tay, so it is under the $600.00 reporting floor.')
    expect(c.says).toContain('a person checks this before the bureau files')
  })

  it('a gross in rupees over the floor at the company’s own rate reads at or over the floor', () => {
    expect(necFloorCheck({ personName: 'Ravi Kumar', grossMinor: 100_000_00, currency: 'INR', floorCents: FLOOR, rateOf: own })).toMatchObject({ checked: true, below: false, grossUsdCents: 1_200_00 })
  })

  it('with no rate of the company’s own, the floor is not checked and the sentence says a person decides', () => {
    const c = necFloorCheck({ personName: 'Ravi Kumar', grossMinor: 40_000_00, currency: 'INR', floorCents: FLOOR, companyName: 'Tapin', rateOf: ownNecRateOf({ sample: false, rates: [] }, rateFor as never, ON) })
    expect(c).toMatchObject({ checked: false, below: null, grossUsdCents: null })
    expect(c.says).toBe('Ravi Kumar’s ₹40,000.00 was paid in INR. The 1099-NEC floor of $600.00 is in dollars, and no rate from INR to USD is set at Tapin, so the floor is not checked: a person decides whether a 1099-NEC is due. Set a rate to have it checked.')
  })

  it('the shipped sample table is never the company’s rate: the floor is not checked against it', () => {
    expect(ownNecRateOf(SAMPLE_RATE_TABLE, rateFor as never, ON)).toBeNull()
    expect(necFloorCheck({ personName: 'Ravi Kumar', grossMinor: 40_000_00, currency: 'INR', floorCents: FLOOR, rateOf: ownNecRateOf(SAMPLE_RATE_TABLE, rateFor as never, ON) }).checked).toBe(false)
  })

  it('a dong gross reads whole dong beside the floor', () => {
    const c = necFloorCheck({ personName: 'Linh Tran', grossMinor: 10_000_000, currency: 'VND', floorCents: FLOOR })
    expect(c.says).toContain('Linh Tran’s ₫10,000,000 was paid in VND.')
  })

  it('the conversion rule is marked unconfirmed beside it, and it warns and never blocks', () => {
    expect(NEC_FOREIGN_CURRENCY_RULE).toMatchObject({ confirmed: false, enforcedAs: 'WARN' })
    expect(NEC_FOREIGN_CURRENCY_RULE.source).toMatch(/Instructions for Forms 1099-MISC and 1099-NEC/)
  })
})
