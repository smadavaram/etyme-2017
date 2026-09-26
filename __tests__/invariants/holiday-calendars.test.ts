import { describe, it, expect } from 'vitest'
import { usFederalHolidays, ukBankHolidays, indiaNationalHolidays, holidaysFor } from '@/lib/holidays'

/**
 * Cycle dates shift off weekends and off these days. A UK or Indian
 * company used to get an empty calendar, so every due date was computed
 * against weekends only — and nobody notices until an invoice run fires on
 * Good Friday.
 */

describe('which calendars exist', () => {
  it('has one for each country a template pack covers', () => {
    // A pack that generates dates in a country with no calendar is a
    // guarantee of wrong dates.
    for (const country of ['US', 'GB', 'IN']) {
      expect(holidaysFor(country, 2027), country).not.toBeNull()
    }
  })

  it('accepts UK spelled either way', () => {
    expect(holidaysFor('UK', 2027)).not.toBeNull()
    expect(holidaysFor('GB', 2027)).not.toBeNull()
  })

  it('says no rather than seeding another country’s dates', () => {
    // A wrong calendar looks deliberate and nobody checks it again.
    expect(holidaysFor('DE', 2027)).toBeNull()
    expect(holidaysFor('FR', 2027)).toBeNull()
  })
})

describe('every calendar', () => {
  const all = [
    ['US', usFederalHolidays(2027)],
    ['UK', ukBankHolidays(2027)],
    ['IN', indiaNationalHolidays(2027)],
  ] as const

  it('gives every day a real date in the year asked for', () => {
    for (const [name, days] of all) {
      for (const d of days) {
        expect(d.date, `${name}: ${d.name}`).toMatch(/^2027-\d{2}-\d{2}$/)
        expect(Number.isNaN(new Date(d.date).getTime()), `${name}: ${d.name}`).toBe(false)
      }
    }
  })

  it('never lists the same date twice', () => {
    for (const [name, days] of all) {
      const dates = days.map((d) => d.date)
      expect(new Set(dates).size, name).toBe(dates.length)
    }
  })

  it('names every day, because a date with no name is unreviewable', () => {
    for (const [name, days] of all) {
      for (const d of days) expect(d.name.length, name).toBeGreaterThan(3)
    }
  })
})

describe('the UK calendar', () => {
  it('computes Easter rather than reading it from a table that runs out', () => {
    // Easter 2027 is 28 March, so Good Friday is the 26th.
    const days = ukBankHolidays(2027)
    expect(days.find((d) => d.name === 'Good Friday')!.date).toBe('2027-03-26')
    expect(days.find((d) => d.name === 'Easter Monday')!.date).toBe('2027-03-29')
  })

  it('gets Easter right in a different year too', () => {
    // Easter 2026 is 5 April.
    const days = ukBankHolidays(2026)
    expect(days.find((d) => d.name === 'Good Friday')!.date).toBe('2026-04-03')
  })

  it('moves a weekend bank holiday to the next working day', () => {
    // Christmas 2027 falls on a Saturday, so the substitute is Monday the
    // 27th. Getting this wrong shifts a whole month of cycle dates.
    const days = ukBankHolidays(2027)
    const christmas = days.find((d) => d.name === 'Christmas Day')!
    expect(new Date(christmas.date + 'T00:00:00Z').getUTCDay()).not.toBe(6)
    expect(new Date(christmas.date + 'T00:00:00Z').getUTCDay()).not.toBe(0)
  })

  it('never leaves a bank holiday on a weekend', () => {
    for (const year of [2026, 2027, 2028, 2029]) {
      for (const d of ukBankHolidays(year)) {
        const day = new Date(d.date + 'T00:00:00Z').getUTCDay()
        expect(day, `${year} ${d.name} on ${d.date}`).not.toBe(0)
        expect(day, `${year} ${d.name} on ${d.date}`).not.toBe(6)
      }
    }
  })

  it('has the eight days England and Wales actually observe', () => {
    expect(ukBankHolidays(2027)).toHaveLength(8)
  })
})

describe('the India calendar', () => {
  it('carries only the three national days, and deliberately so', () => {
    // The rest of India's calendar is state and religion specific and
    // moves each year. Guessing would put confident wrong dates in front
    // of somebody who would trust them.
    const days = indiaNationalHolidays(2027)
    expect(days).toHaveLength(3)
    expect(days.map((d) => d.name)).toEqual([
      'Republic Day', 'Independence Day', 'Gandhi Jayanti',
    ])
  })

  it('puts them on the dates they are actually on', () => {
    const days = indiaNationalHolidays(2027)
    expect(days.find((d) => d.name === 'Republic Day')!.date).toBe('2027-01-26')
    expect(days.find((d) => d.name === 'Independence Day')!.date).toBe('2027-08-15')
  })
})
