import { describe, it, expect } from 'vitest'
import { spendInReporting, rateFor, rateTableFrom, SAMPLE_RATE_TABLE, type ReportingRate, type RateTable } from '@/lib/money/reporting-currency'
import { corvaneContractors, billRateMinor, CORVANE_COUNTRIES } from '@/lib/seed-corvane/plan'
import { programMonthlySpend } from '@/lib/program-spend'
import { minorPerUnit, format, fromMinor } from '@/lib/money'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const r = (from: string, to: string, rate: number, on = '2026-09-01', source: string | null = 'manual'): ReportingRate =>
  ({ from, to, rate, effectiveOn: d(on), source, recordedAt: d(on), setBy: null })
const own = (rates: ReportingRate[]): RateTable => ({ reportingCurrency: 'USD', rates, sample: false, label: 'Rates you set.' })

// Corvane's eight countries, a month each, in each site's own minor units,
// read from the seed: every contractor on site at the seed's bill rate for
// their country, at 160 hours a month (`programMonthlySpend`). The test
// pins no figure of its own; the seed's figure is pinned once, in
// seed-corvane.test.ts.
const monthByCurrency = new Map<string, number>()
for (const c of corvaneContractors().onSite) {
  const cur = CORVANE_COUNTRIES[c.plant.cc].currency
  monthByCurrency.set(cur, (monthByCurrency.get(cur) ?? 0) + programMonthlySpend([{ rateMinorPerHour: billRateMinor(c.plant.cc) }]).totalMinor)
}
const EIGHT = [...monthByCurrency].map(([currency, minor]) => ({ currency, minor }))
const monthIn = (cur: string) => monthByCurrency.get(cur)!
const CORVANE_RATES = own([
  r('MXN', 'USD', 0.05), r('BRL', 'USD', 0.2), r('COP', 'USD', 0.00025), r('VND', 'USD', 0.00004),
  r('INR', 'USD', 0.012), r('EUR', 'USD', 1.1), r('GBP', 'USD', 1.25),
])
/** One currency's month in US cents at a rate, worked by hand: whole units times the rate, rounded once. */
const inCents = (cur: string, rate: number) => Math.round((monthIn(cur) / minorPerUnit(cur)) * rate * 100)

describe('the rollup in one currency', () => {
  it('spend in eight currencies rolls up to one figure in the company’s reporting currency at the rates the company set', () => {
    const out = spendInReporting(EIGHT, 'USD', CORVANE_RATES, d('2026-10-27'))
    expect(EIGHT).toHaveLength(8)
    // Each currency by hand, at the rate the company set, then added.
    const byHand = monthIn('USD') + CORVANE_RATES.rates.reduce((n, x) => n + inCents(x.from, x.rate), 0)
    expect(out.total).toEqual({ minor: byHand, currency: 'USD' })
    // A program of this size is millions a month, never a few thousand.
    expect(byHand).toBeGreaterThan(100_000_000)
    expect(out.missing).toEqual([])
    expect(out.sampleRates).toBe(false)
    expect(out.byCurrency.find((l) => l.currency === 'VND')).toMatchObject({ minor: monthIn('VND'), rate: 0.00004, reportingMinor: inCents('VND', 0.00004) })
    expect(out.says).toContain(`${format(fromMinor(byHand, 'USD'))} in USD`)
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
    expect(out.byCurrency.find((l) => l.currency === 'VND')).toMatchObject({ minor: monthIn('VND'), rate: null, reportingMinor: null })
    expect(out.byCurrency.find((l) => l.currency === 'EUR')?.reportingMinor).toBe(inCents('EUR', 1.1))
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
    // A week at the seed's dong rate for a specialist in Vietnam, 40 hours.
    // At 0.00004 a dong is 0.004 of a cent, so the week in cents is the
    // dong times four, over a thousand: worked in whole numbers, by hand.
    const week = billRateMinor('VN') * 40
    expect(minorPerUnit('VND')).toBe(1)
    const cents = (week * 4) / 1000
    const out = spendInReporting([{ currency: 'VND', minor: week }], 'USD', own([r('VND', 'USD', 0.00004)]))
    expect(out.total?.minor).toBe(cents)
    // And the other way: those dollars into dong are the week's dong, not a hundred times it.
    const back = spendInReporting([{ currency: 'USD', minor: cents }], 'VND', own([r('VND', 'USD', 0.00004)]))
    expect(back.total).toEqual({ minor: week, currency: 'VND' })
  })

  it('an amount that is not whole minor units is refused, never rounded in silently', () => {
    expect(() => spendInReporting([{ currency: 'USD', minor: 10.5 }], 'USD')).toThrow(/whole minor units/)
  })
})

// What `reportingRatesFor` reads off the record, without the database.
const fx = (from: string, to: string, rate: number, setBy: string | null = null, on = '2026-09-01') =>
  ({ fromCurrency: from, toCurrency: to, rate, effectiveOn: d(on), source: 'manual', createdAt: d(on), setBy: setBy ? { name: setBy } : null })

describe('the currency a company chose to report in', () => {
  it('a company that chose to report in euros reads its spend in euros, not its home currency', () => {
    const own = rateTableFrom({
      company: { homeCurrency: 'USD', reportingCurrency: 'EUR' },
      rows: [fx('USD', 'EUR', 0.9, 'Ana Ruiz'), fx('INR', 'EUR', 0.011, 'Ana Ruiz')],
    })
    expect(own.reportingCurrency).toBe('EUR')
    const spend = [{ currency: 'USD', minor: 1_000_000 }, { currency: 'INR', minor: 50_000_000 }, { currency: 'EUR', minor: 2_000_000 }]
    const out = spendInReporting(spend, own.reportingCurrency, own, d('2026-10-27'))
    // $10,000 at 0.9 is €9,000; ₹500,000 at 0.011 is €5,500; plus €20,000.
    expect(out.total).toEqual({ minor: 3_450_000, currency: 'EUR' })
    expect(out.says).toContain('in EUR')

    // With no rates of its own, the sample is said in euros too, still labeled sample.
    const sample = rateTableFrom({ company: { homeCurrency: 'USD', reportingCurrency: 'EUR' }, rows: [] })
    expect(sample.reportingCurrency).toBe('EUR')
    expect(sample.sample).toBe(true)
    const viaSample = spendInReporting([{ currency: 'USD', minor: 108_000 }], sample.reportingCurrency, sample, d('2026-10-27'))
    expect(viaSample.total).toEqual({ minor: 100_000, currency: 'EUR' })
    expect(viaSample.sampleRates).toBe(true)
  })

  it('a rate the company set names who set it and beats the sample rate', () => {
    const table = rateTableFrom({
      company: { homeCurrency: 'USD', reportingCurrency: null },
      rows: [fx('INR', 'USD', 0.0125, 'Ana Ruiz')],
    })
    expect(table.sample).toBe(false)
    expect(table.label).toBe('Rates you set.')
    expect(table.label).not.toBe(SAMPLE_RATE_TABLE.label)
    expect(table.rates[0].setBy).toBe('Ana Ruiz')
    const out = spendInReporting([{ currency: 'INR', minor: 50_000_000 }], table.reportingCurrency, table, d('2026-10-27'))
    // ₹500,000 at the company's 0.0125 is $6,250, not the sample's $6,000.
    expect(out.total).toEqual({ minor: 625_000, currency: 'USD' })
    expect(out.byCurrency[0].rateFrom).toMatchObject({ source: 'manual', setBy: 'Ana Ruiz' })
    expect(out.sampleRates).toBe(false)
    expect(out.says).toContain('At the rates you set')
    expect(out.says).toContain('set by Ana Ruiz')
    // A rate written before anybody was recorded names nobody.
    const unnamed = rateTableFrom({ company: { homeCurrency: 'USD', reportingCurrency: null }, rows: [fx('INR', 'USD', 0.0125)] })
    expect(unnamed.rates[0].setBy).toBeNull()
  })

  it('a company that chose nothing reports in its home currency at sample rates, labeled as sample', () => {
    const table = rateTableFrom({ company: { homeCurrency: 'GBP', reportingCurrency: null }, rows: [] })
    expect(table.reportingCurrency).toBe('GBP')
    expect(table.sample).toBe(true)
    expect(table.label).toBe(SAMPLE_RATE_TABLE.label)
    const out = spendInReporting([{ currency: 'USD', minor: 127_000 }, { currency: 'GBP', minor: 50_000 }], table.reportingCurrency, table, d('2026-10-27'))
    // $1,270 at the sample's 1.27 dollars to the pound is £1,000, plus £500.
    expect(out.total).toEqual({ minor: 150_000, currency: 'GBP' })
    expect(out.sampleRates).toBe(true)
    expect(out.says).toContain('sample rates written October 1, 2026, not market rates')
    for (const r of table.rates) expect(r.source).toBe('sample')
    // And a company with no record of its own reads dollars.
    expect(rateTableFrom({ company: null, rows: [] })).toBe(SAMPLE_RATE_TABLE)
  })
})
