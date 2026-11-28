import { describe, it, expect } from 'vitest'
import { readReportingAsk } from '@/lib/reporting-currency-setting'

/**
 * The door to a company's reporting currency and its exchange rates
 * (2026-10-27): its own figures, checked in sentences before they are
 * written with who and when (PATCH /api/settings/reporting-currency).
 */
describe('setting the reporting currency and its rates', () => {
  const today = new Date(Date.UTC(2026, 9, 27, 15))

  it('a rate is recorded into the reporting currency, from the day it applies, and a code is read in capitals', () => {
    const r = readReportingAsk({ reportingCurrency: 'eur', rates: [{ from: 'inr', rate: 0.011, effectiveOn: '2026-10-01' }] }, 'USD', today)
    expect(r).toEqual({
      ok: true, into: 'EUR',
      ask: { reportingCurrency: 'EUR', rates: [{ from: 'INR', rate: 0.011, effectiveOn: new Date(Date.UTC(2026, 9, 1)), source: null }] },
    })
  })

  it('a rate with no day applies from today, into the currency already set', () => {
    const r = readReportingAsk({ rates: [{ from: 'VND', rate: 0.000039 }] }, 'USD', today)
    expect(r.ok && r.into).toBe('USD')
    expect(r.ok && r.ask.rates[0].effectiveOn).toEqual(new Date(Date.UTC(2026, 9, 27)))
    expect(r.ok && r.ask.reportingCurrency).toBeUndefined()
  })

  it('refuses a rate of nothing, a made-up code, a rate for the reporting currency itself, and an empty ask, each in a sentence', () => {
    const says = (b: unknown) => { const r = readReportingAsk(b, 'USD', today); return r.ok ? null : r.says }
    expect(says({ rates: [{ from: 'INR', rate: 0 }] })).toBe('The rate for INR must be a number above zero: how many USD one INR is worth.')
    expect(says({ reportingCurrency: 'dollars' })).toBe('“dollars” is not a currency code. Use three letters, such as USD or EUR.')
    expect(says({ rates: [{ from: 'USD', rate: 1 }] })).toBe('USD is the reporting currency, so it needs no rate.')
    expect(says({})).toBe('Nothing to change: send a reporting currency, rates, or both.')
  })

  it('null puts the reporting currency back to the home currency', () => {
    const r = readReportingAsk({ reportingCurrency: null }, 'EUR', today)
    expect(r.ok && r.ask.reportingCurrency).toBeNull()
  })
})
