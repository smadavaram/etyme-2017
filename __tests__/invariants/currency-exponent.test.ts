import { describe, it, expect } from 'vitest'
import { decimalsFor, format, fromDecimal, fromMinor, minorFromWhole, minorPerUnit, sum, toDecimal, wholeFromMinor } from '@/lib/money'
import { decimalToCents } from '@/lib/three-way-match'
import { billRateMinor, CORVANE_COUNTRIES } from '@/lib/seed-corvane'

/**
 * A currency's minor unit is its own: two decimals for the dollar, none for
 * the dong, the yen and the won, three for the Kuwaiti and Bahraini dinar.
 * One rule in lib/money, read by the seeded rates, invoice totals, the
 * three-way check and the formatter.
 */
describe('a currency with no minor unit', () => {
  it('a dong amount is stored and totalled with no minor unit', () => {
    expect(decimalsFor('VND')).toBe(0)
    expect(minorPerUnit('VND')).toBe(1)
    const rate = fromDecimal(75_000, 'VND')
    expect(rate.minor).toBe(75_000)
    const week = sum([rate, rate, rate], 'VND')
    expect(week.minor).toBe(225_000)
    expect(toDecimal(week)).toBe(225_000)
    // The seeded Vietnamese rate is the drawing's 75,000 dong, not 7,500,000.
    expect(CORVANE_COUNTRIES.VN.currency).toBe('VND')
    expect(billRateMinor('VN')).toBe(75_000)
  })

  it('a bill in dong is formatted without decimals and matches its lines', () => {
    const lines = [40, 37.5].map((hours) => Math.round(hours * billRateMinor('VN')))
    const linesMinor = lines.reduce((n, l) => n + l, 0)
    // What the database keeps on Invoice.total: whole dong.
    const total = wholeFromMinor(linesMinor, 'VND')
    expect(total).toBe(5_812_500)
    expect(minorFromWhole(total, 'VND')).toBe(linesMinor)
    expect(decimalToCents({ toString: () => '5812500.00' }, 'VND')).toBe(linesMinor)
    expect(format(fromMinor(linesMinor, 'VND'))).toBe('₫5,812,500')
    expect(format(fromMinor(linesMinor, 'VND'))).not.toMatch(/\.\d/)
  })

  it('a yen and a won amount have no minor unit, and a dinar has three', () => {
    expect(minorPerUnit('JPY')).toBe(1)
    expect(minorPerUnit('KRW')).toBe(1)
    expect(minorPerUnit('KWD')).toBe(1000)
    expect(minorPerUnit('BHD')).toBe(1000)
    expect(format(fromMinor(15_000, 'JPY'))).toBe('¥15,000')
    expect(format(fromMinor(1_234, 'KWD'))).toMatch(/^KWD\s1\.234$/)
  })

  it('every other currency on the region map keeps two decimals', () => {
    for (const c of ['USD', 'MXN', 'BRL', 'COP', 'INR', 'EUR', 'GBP']) expect(minorPerUnit(c)).toBe(100)
    expect(billRateMinor('US')).toBe(2_800)
    expect(billRateMinor('CO')).toBe(3_200_000)
  })

  it('an invoice total in whole currency is read as minor units by its currency, never by a hundred', () => {
    expect(decimalToCents({ toString: () => '1120.00' }, 'USD')).toBe(112_000)
    expect(decimalToCents({ toString: () => '3000000' }, 'VND')).toBe(3_000_000)
    expect(decimalToCents({ toString: () => '1.234' }, 'KWD')).toBe(1_234)
    // A caller that names no currency is read as two decimals, as before.
    expect(decimalToCents({ toString: () => '10.01' })).toBe(1_001)
  })
})
