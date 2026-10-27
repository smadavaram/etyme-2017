import { describe, it, expect } from 'vitest'
import { spendInReporting, rateFor, SAMPLE_RATE_TABLE, type ReportingRate, type RateTable } from '@/lib/money/reporting-currency'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const r = (from: string, to: string, rate: number, on = '2026-09-01', source: string | null = 'manual'): ReportingRate =>
  ({ from, to, rate, effectiveOn: d(on), source, recordedAt: d(on), setBy: null })
const own = (rates: ReportingRate[]): RateTable => ({ reportingCurrency: 'USD', rates, sample: false, label: 'Rates you set.' })

// Corvane's eight countries, a month each, in each site's own minor units.
const EIGHT = [
  { currency: 'USD', minor: 1_000_000 },     // $10,000.00
  { currency: 'MXN', minor: 10_000_000 },    // MX$100,000.00
  { currency: 'BRL', minor: 5_000_000 },     // R$50,000.00
  { currency: 'COP', minor: 4_000_000_000 }, // 40,000,000.00 pesos
  { currency: 'VND', minor: 250_000_000 },   // 250,000,000 dong, no minor unit
  { currency: 'INR', minor: 50_000_000 },    // ₹500,000.00
  { currency: 'EUR', minor: 2_000_000 },     // €20,000.00
  { currency: 'GBP', minor: 1_000_000 },     // £10,000.00
]
const CORVANE_RATES = own([
  r('MXN', 'USD', 0.05), r('BRL', 'USD', 0.2), r('COP', 'USD', 0.00025), r('VND', 'USD', 0.00004),
  r('INR', 'USD', 0.012), r('EUR', 'USD', 1.1), r('GBP', 'USD', 1.25),
])

describe('the rollup in one currency', () => {
  it('spend in eight currencies rolls up to one figure in the company’s reporting currency at the rates the company set', () => {
    const out = spendInReporting(EIGHT, 'USD', CORVANE_RATES, d('2026-10-27'))
    // 10,000 + 5,000 + 10,000 + 10,000 + 10,000 + 6,000 + 22,000 + 12,500
    expect(out.total).toEqual({ minor: 8_550_000, currency: 'USD' })
    expect(out.missing).toEqual([])
    expect(out.sampleRates).toBe(false)
    expect(out.byCurrency.find((l) => l.currency === 'VND')).toMatchObject({ minor: 250_000_000, rate: 0.00004, reportingMinor: 1_000_000 })
    expect(out.says).toContain('$85,500.00 in USD')
    expect(out.says).toContain('At the rates you set')
    expect(out.says).toContain('VND 0.00004 from 2026-09-01')
  })

  it('a rollup with no rate for a currency says so rather than guessing', () => {
    const noDong = own(CORVANE_RATES.rates.filter((x) => x.from !== 'VND'))
    const out = spendInReporting(EIGHT, 'USD', noDong, d('2026-10-27'))
    expect(out.total).toBeNull()
    expect(out.missing).toEqual(['VND'])
    expect(out.says).toBe('No one figure in USD: there is no rate for VND. Its spend is shown in its own currency; set a rate to USD to add it in.')
    // The dong is still there, in dong; every other currency still converted.
    expect(out.byCurrency.find((l) => l.currency === 'VND')).toMatchObject({ minor: 250_000_000, rate: null, reportingMinor: null })
    expect(out.byCurrency.find((l) => l.currency === 'EUR')?.reportingMinor).toBe(2_200_000)
  })

  it('a company’s own rates are never mixed with the sample: a currency it has not priced is missing, not filled in', () => {
    const out = spendInReporting(EIGHT, 'USD', own([r('EUR', 'USD', 1.1)]), d('2026-10-27'))
    expect(out.total).toBeNull()
    expect(out.missing).toEqual(['BRL', 'COP', 'GBP', 'INR', 'MXN', 'VND'])
  })

  it('a company with no rates of its own rolls up at the shipped sample, and the figure says they are sample rates and not market rates', () => {
    const out = spendInReporting(EIGHT, 'USD')
    expect(out.total).not.toBeNull()
    expect(out.sampleRates).toBe(true)
    expect(SAMPLE_RATE_TABLE.sample).toBe(true)
    expect(out.says).toContain('sample rates written October 1, 2026, not market rates')
    for (const l of out.byCurrency.filter((x) => x.currency !== 'USD')) expect(l.rateFrom?.source).toBe('sample')
  })

  it('spend in one currency needs no rate and says none was used', () => {
    const out = spendInReporting([{ currency: 'USD', minor: 2_800 }, { currency: 'usd', minor: 200 }], 'USD', own([]))
    expect(out.total).toEqual({ minor: 3_000, currency: 'USD' })
    expect(out.says).toBe('$30.00 in USD. No rate was needed.')
    expect(out.sampleRates).toBe(false)
  })

  it('rupees and dollars are never added as they stand: each currency keeps its own total beside the figure', () => {
    const out = spendInReporting([{ currency: 'INR', minor: 10_000 }, { currency: 'USD', minor: 10_000 }], 'USD', own([r('INR', 'USD', 0.012)]))
    expect(out.total?.minor).toBe(10_120)
    expect(out.byCurrency.map((l) => [l.currency, l.minor])).toEqual([['USD', 10_000], ['INR', 10_000]])
  })

  it('each currency is converted once on its own total and rounded once', () => {
    // Three rows of 1 cent at 0.5 would round to 3 × 1 = 3 if each row were converted; once, it is 2.
    const rows = [1, 1, 1].map((minor) => ({ currency: 'EUR', minor }))
    expect(spendInReporting(rows, 'USD', own([r('EUR', 'USD', 0.5)])).total?.minor).toBe(2)
  })

  it('a rate written the other way round is inverted, and a rate of zero is no rate', () => {
    const inverted = spendInReporting([{ currency: 'INR', minor: 8_000_000 }], 'USD', own([r('USD', 'INR', 80)]))
    expect(inverted.total?.minor).toBe(100_000)
    expect(inverted.byCurrency[0].rateFrom?.inverted).toBe(true)
    const zero = spendInReporting([{ currency: 'INR', minor: 8_000_000 }], 'USD', own([r('INR', 'USD', 0)]))
    expect(zero.total).toBeNull()
    expect(zero.missing).toEqual(['INR'])
  })

  it('the latest rate on or before the day of the rollup is used, never one set for a later day', () => {
    const table = [r('EUR', 'USD', 1.0, '2026-01-01'), r('EUR', 'USD', 1.1, '2026-06-01'), r('EUR', 'USD', 1.5, '2026-12-01')]
    expect(rateFor(table, 'EUR', 'USD', d('2026-10-27'))?.rate).toBe(1.1)
    expect(rateFor(table, 'EUR', 'USD', d('2025-12-31'))).toBeNull()
    expect(spendInReporting([{ currency: 'EUR', minor: 100 }], 'USD', own(table), d('2025-12-31')).missing).toEqual(['EUR'])
  })

  it('a dong total is never multiplied by a hundred on its way into dollars', () => {
    // 75,000 dong an hour for 40 hours is 3,000,000 dong, at 0.00004 is $120.00.
    const out = spendInReporting([{ currency: 'VND', minor: 3_000_000 }], 'USD', own([r('VND', 'USD', 0.00004)]))
    expect(out.total?.minor).toBe(12_000)
    // And the other way: $120.00 into dong is 3,000,000 dong, not 300,000,000.
    const back = spendInReporting([{ currency: 'USD', minor: 12_000 }], 'VND', own([r('VND', 'USD', 0.00004)]))
    expect(back.total).toEqual({ minor: 3_000_000, currency: 'VND' })
  })

  it('an amount that is not whole minor units is refused, never rounded in silently', () => {
    expect(() => spendInReporting([{ currency: 'USD', minor: 10.5 }], 'USD')).toThrow(/whole minor units/)
  })
})
