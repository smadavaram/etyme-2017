import { describe, it, expect } from 'vitest'
import { wageSummary, yearEndPack, necThresholdFor, type PayPosting } from '@/lib/payroll-export'
import { ownNecRateOf } from '@/lib/worker-classification'
import { rateFor, type RateTable } from '@/lib/money/reporting-currency'

/**
 * The 1099-NEC floor is the payment year's (the One Big Beautiful Bill Act,
 * July 2025, amending IRC §6041): $600 through 2025, $2,000 from 2026,
 * indexed from 2027. A gross in another currency is put beside the dollar
 * floor at the company's own rate (regulatory's necFloorCheck), or not
 * checked and left to a person.
 */

const pay = (amountCents: number, year: number, currency = 'USD'): PayPosting => ({
  personId: 'ravi', personName: 'Ravi Kumar', hasTaxId: true, contractType: 'IND_1099',
  amountCents: -amountCents, currency, postedAt: new Date(Date.UTC(year, 5, 1)),
})

const OWN: RateTable = {
  reportingCurrency: 'USD', sample: false, label: 'Rates you set.',
  rates: [{ from: 'INR', to: 'USD', rate: 0.012, effectiveOn: new Date('2026-01-01'), source: 'manual', recordedAt: null, setBy: 'Rosalind Tay' }],
}
const yearEnd = (y: number) => new Date(Date.UTC(y, 11, 31))

describe('the 1099-NEC floor is the one for the year the payment was made', () => {
  it('a 2026 contractor paid $1,500 needs no 1099-NEC', () => {
    const s = wageSummary('ravi', [pay(150_000, 2026)], 2026)
    expect(s.form).toBe('NONE')
    expect(s.belowThreshold).toBe(true)
    expect(s.says).toContain('under the $2,000.00 reporting floor for payments in 2026')
  })

  it('a 2026 contractor paid $2,500 needs a 1099-NEC', () => {
    const s = wageSummary('ravi', [pay(250_000, 2026)], 2026)
    expect(s.form).toBe('1099_NEC')
  })

  it('a 2025 contractor paid $700 needs a 1099-NEC, because the floor for 2025 payments was $600', () => {
    const s = wageSummary('ravi', [pay(70_000, 2025)], 2025)
    expect(s.form).toBe('1099_NEC')
    expect(s.says).toContain('$600.00 floor for payments in 2025')
  })

  it('the floor for 2027 is $2,000 until the IRS’s indexed figure is entered, and says a person checks', () => {
    const t = necThresholdFor(2027)
    expect(t).toMatchObject({ cents: 200_000, onRecord: false })
    expect(wageSummary('ravi', [pay(250_000, 2027)], 2027).says).toContain('not yet on record')
  })

  it('each floor names what it stands on', () => {
    expect(necThresholdFor(2025).source).toMatch(/\$600/)
    expect(necThresholdFor(2026).source).toMatch(/One Big Beautiful Bill Act/)
  })
})

describe('a gross paid in another currency', () => {
  it('a rupee gross is compared in dollars at the company’s own rate, and says the rate', () => {
    // ₹2,50,000 at 0.012 is $3,000: over the 2026 floor.
    const s = wageSummary('ravi', [pay(25_000_000, 2026, 'INR')], 2026, { rateOf: ownNecRateOf(OWN, rateFor as never, yearEnd(2026)) })
    expect(s.form).toBe('1099_NEC')
    expect(s.says).toContain('$3,000.00 at your rate of 0.012')
  })

  it('a rupee gross under the floor at the company’s own rate needs no 1099-NEC', () => {
    // ₹1,00,000 at 0.012 is $1,200: under $2,000.
    const s = wageSummary('ravi', [pay(10_000_000, 2026, 'INR')], 2026, { rateOf: ownNecRateOf(OWN, rateFor as never, yearEnd(2026)) })
    expect(s.form).toBe('NONE')
    expect(s.belowThreshold).toBe(true)
  })

  it('a rupee gross with no rate of the company’s own is not checked, and the person is on the list with no form', () => {
    for (const rateOf of [null, ownNecRateOf({ ...OWN, sample: true }, rateFor as never, yearEnd(2026))]) {
      const pack = yearEndPack([pay(25_000_000, 2026, 'INR')], 2026, { rateOf, companyName: 'Teleworld' })
      const s = pack.summaries[0]
      expect(s.notChecked).toBe(true)
      expect(s.form).toBe('NONE')
      expect(s.says).toMatch(/floor is not checked/)
      expect(pack.noForm.map((x) => x.personId)).toContain('ravi')
    }
  })
})
