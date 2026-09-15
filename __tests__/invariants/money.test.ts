/**
 * Money — an amount and its currency, which are one thing.
 *
 * This codebase shipped a bug from separating them: a $110/hr requirement
 * submitted a candidate at $1.10/hr, because one column held dollars and
 * another held cents and nothing said which.
 *
 * The deeper problem is that sixteen screens each wrote their own division
 * by a hundred, and a hundred is only right for some currencies. SAP looks
 * the number up from the currency and never hardcodes it. So does this.
 */

import { describe, it, expect } from 'vitest'
import {
  fromMinor, fromDecimal, toDecimal, format, formatRate, parse,
  add, subtract, multiply, sum, percentDifference, decimalsFor, zero,
} from '@/lib/money'

describe('A hundred is not always the right number', () => {

  it('dollars have two decimal places', () => {
    expect(decimalsFor('USD')).toBe(2)
  })

  it('yen has none, so a hundred would be a hundred times wrong', () => {
    // The bug waiting in every hand-written `/ 100` in the codebase.
    expect(decimalsFor('JPY')).toBe(0)
    expect(toDecimal(fromMinor(15_000, 'JPY'))).toBe(15_000)
  })

  it('Kuwaiti dinar has three', () => {
    expect(decimalsFor('KWD')).toBe(3)
    expect(toDecimal(fromMinor(15_000, 'KWD'))).toBe(15)
  })

  it('a currency nobody listed is assumed to have two, like most of the world', () => {
    expect(decimalsFor('ZAR')).toBe(2)
  })

  it('the code is read case-insensitively, because data is messy', () => {
    expect(decimalsFor('jpy')).toBe(0)
  })
})

describe('Turning what somebody types into what is stored', () => {

  it('$130.50 becomes 13050 cents', () => {
    expect(fromDecimal(130.5, 'USD').minor).toBe(13_050)
  })

  it('¥15000 stays 15000, because yen has no minor unit', () => {
    expect(fromDecimal(15_000, 'JPY').minor).toBe(15_000)
  })

  it('a fraction of a cent rounds rather than being dropped', () => {
    // Truncating loses a cent per conversion and finance notices.
    expect(fromDecimal(977.309, 'USD').minor).toBe(97_731)
  })

  it('the round trip returns what went in', () => {
    expect(toDecimal(fromDecimal(130.5, 'USD'))).toBe(130.5)
  })
})

describe('One place formats, so every screen agrees', () => {

  it('a dollar amount shows its symbol and both decimals', () => {
    expect(format(fromDecimal(1040, 'USD'))).toBe('$1,040.00')
  })

  it('yen shows no decimal places at all', () => {
    expect(format(fromDecimal(15_000, 'JPY'))).toBe('¥15,000')
  })

  it('a whole amount can be shown without the trailing zeroes', () => {
    expect(format(fromDecimal(130, 'USD'), { compact: true })).toBe('$130')
  })

  it('but a part amount keeps them, even in compact form', () => {
    expect(format(fromDecimal(130.5, 'USD'), { compact: true })).toBe('$130.50')
  })

  it('a rate carries its unit', () => {
    expect(formatRate(fromDecimal(130, 'USD'))).toBe('$130/hr')
  })

  it('a daily rate says so', () => {
    expect(formatRate(fromDecimal(1040, 'USD'), 'day')).toBe('$1,040/day')
  })
})

describe('One place parses, and it refuses rather than guesses', () => {

  it('a plain number is read', () => {
    expect(parse('130.50', 'USD')?.minor).toBe(13_050)
  })

  it('a pasted amount with symbol and commas is read', () => {
    expect(parse('$1,040.00', 'USD')?.minor).toBe(104_000)
  })

  it('something unreadable returns nothing, rather than zero', () => {
    // A zero stored silently is worse than a question asked out loud.
    expect(parse('about a hundred', 'USD')).toBeNull()
    expect(parse('', 'USD')).toBeNull()
  })
})

describe('Currencies cannot be mixed by accident', () => {

  it('dollars add to dollars', () => {
    const total = add(fromDecimal(100, 'USD'), fromDecimal(30.5, 'USD'))
    expect(toDecimal(total)).toBe(130.5)
  })

  it('adding dollars to yen throws, because there is no right answer', () => {
    expect(() => add(fromDecimal(100, 'USD'), fromDecimal(100, 'JPY')))
      .toThrow(/Cannot add USD and JPY/)
  })

  it('the error says what to do about it', () => {
    expect(() => add(fromDecimal(1, 'USD'), fromDecimal(1, 'GBP')))
      .toThrow(/Convert one of them first/)
  })

  it('comparing across currencies throws too', () => {
    expect(() => subtract(fromDecimal(1, 'USD'), fromDecimal(1, 'EUR'))).toThrow()
  })

  it('a rate times hours keeps the currency', () => {
    const line = multiply(fromDecimal(130, 'USD'), 80)
    expect(format(line)).toBe('$10,400.00')
  })

  it('summing an empty list gives zero in the currency asked for', () => {
    expect(sum([], 'JPY')).toEqual(zero('JPY'))
  })
})

describe('Rate variances, reported the same way everywhere', () => {

  it('twenty per cent above is reported as twenty', () => {
    expect(percentDifference(fromDecimal(180, 'USD'), fromDecimal(150, 'USD'))).toBe(20)
  })

  it('below the reference is negative', () => {
    expect(percentDifference(fromDecimal(120, 'USD'), fromDecimal(150, 'USD'))).toBe(-20)
  })

  it('against nothing returns nothing, rather than infinity', () => {
    expect(percentDifference(fromDecimal(150, 'USD'), zero('USD'))).toBeNull()
  })
})

describe('The bug that started this', () => {

  it('dollars passed where cents belong is no longer possible to express', () => {
    // Before: billMax held 130 (dollars) and Submission.rate held 13000
    // (cents), both plain numbers, and nothing could tell them apart.
    // Now the currency travels with the amount and the conversion happens
    // in one place.
    const ceiling = fromDecimal(130, 'USD')
    const submitted = fromDecimal(105, 'USD')
    expect(ceiling.minor).toBe(13_000)
    expect(submitted.minor).toBe(10_500)
    expect(format(submitted)).toBe('$105.00')
    // Not $1.05.
    expect(format(submitted)).not.toBe('$1.05')
  })
})
