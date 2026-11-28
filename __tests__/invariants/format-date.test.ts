import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { formatDay, formatDayLong, formatMonth, formatRange } from '@/lib/format-date'
import { dayOfMomentFor } from '@/lib/when'

/**
 * One way to print a calendar day. Every stored day is midnight UTC, so a
 * day is read in UTC whoever is reading it, in American order, with the
 * year unless the caller says the year is already on the screen.
 */

// The reader's machine is set to Los Angeles for the whole file, so a
// formatter that read local time would print the evening before and fail.
let savedTz: string | undefined
beforeAll(() => { savedTz = process.env.TZ; process.env.TZ = 'America/Los_Angeles' })
afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz })

const OCT_6 = new Date('2026-10-06T00:00:00.000Z')

describe('a day reads the same on every screen', () => {
  it('the test runs as a reader in Los Angeles, west of Greenwich', () => {
    // The guard on the guard: if the zone did not take, the next sentence proves nothing.
    expect(OCT_6.getDate()).toBe(5)
  })

  it('a day stored at UTC midnight prints as that day for a reader in Los Angeles', () => {
    expect(formatDay(OCT_6)).toBe('Oct 6, 2026')
    expect(formatDay('2026-10-06')).toBe('Oct 6, 2026')
  })

  it('a date is printed in American order with a short month', () => {
    expect(formatDay('2026-01-02')).toBe('Jan 2, 2026')
  })

  it('a date shows its year unless the caller says the year is already on the screen', () => {
    expect(formatDay(OCT_6)).toContain('2026')
    expect(formatDay(OCT_6, { year: false })).toBe('Oct 6')
  })

  it('a letter or a sentence spells the month out', () => {
    expect(formatDayLong(OCT_6)).toBe('October 6, 2026')
    expect(formatDayLong(OCT_6, { year: false })).toBe('October 6')
  })

  it('a day can lead with its weekday, short on a screen and long in a letter', () => {
    expect(formatDay(OCT_6, { weekday: true, year: false })).toBe('Tue, Oct 6')
    expect(formatDayLong(OCT_6, { weekday: true })).toBe('Tuesday, October 6, 2026')
  })

  it('a month prints as its short name and year', () => {
    expect(formatMonth(OCT_6)).toBe('Oct 2026')
    expect(formatMonth('2026-10')).toBe('Oct 2026')
    expect(formatMonth('2026-10-31')).toBe('Oct 2026')
  })

  it('a range inside one year says the year once', () => {
    expect(formatRange('2026-10-06', '2026-10-10')).toBe('Oct 6 – Oct 10, 2026')
  })

  it('a range across a new year names both years', () => {
    expect(formatRange('2025-12-29', '2026-01-02')).toBe('Dec 29, 2025 – Jan 2, 2026')
  })

  it('a range that starts and ends on one day is that day alone', () => {
    expect(formatRange(OCT_6, '2026-10-06')).toBe('Oct 6, 2026')
  })
})

describe('the formatter refuses nothing a screen hands it today', () => {
  it('takes a Date, an ISO day, and a Prisma DateTime as it arrives over JSON', () => {
    expect(formatDay(OCT_6)).toBe('Oct 6, 2026')
    expect(formatDay('2026-10-06')).toBe('Oct 6, 2026')
    // A Prisma DateTime is a Date on the server and this string in the browser.
    expect(formatDay(JSON.parse(JSON.stringify({ at: OCT_6 })).at)).toBe('Oct 6, 2026')
  })

  it('a missing date stays missing rather than becoming a made-up one', () => {
    expect(formatDay(null)).toBeNull()
    expect(formatDayLong(undefined)).toBeNull()
    expect(formatMonth(null)).toBeNull()
  })

  it('a bare timestamp number is refused in a sentence, because a moment is not a day', () => {
    expect(() => formatDay(Date.now() as unknown as string)).toThrow(/Pass a Date or an ISO day/)
    expect(() => formatDay('next Tuesday')).toThrow(/not a day the date formatter can read/)
  })
})

describe('a moment is printed on the day it happened for the person reading', () => {
  // 02:00 UTC on the 10th is still the evening of the 9th in Los Angeles.
  const ACROSS_MIDNIGHT = new Date('2026-09-10T02:00:00Z')

  it('a message sent late in Los Angeles reads as that evening there and the next day in London', () => {
    expect(dayOfMomentFor(ACROSS_MIDNIGHT, 'America/Los_Angeles')).toBe('Sep 9, 2026')
    expect(dayOfMomentFor(ACROSS_MIDNIGHT, 'Europe/London')).toBe('Sep 10, 2026')
  })

  it('today on a greeting is spelled out without the year', () => {
    expect(dayOfMomentFor(ACROSS_MIDNIGHT, 'Europe/London', { long: true, year: false })).toBe('September 10')
  })

  it('a zone nobody has heard of falls back to UTC rather than throwing', () => {
    expect(dayOfMomentFor(ACROSS_MIDNIGHT, 'Mars/Olympus')).toBe('Sep 10, 2026')
  })
})
