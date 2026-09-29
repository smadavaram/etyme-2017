/**
 * Every hour at the rate in force on the day it was worked.
 *
 * Found on 2026-09-29 by walking a $66 → $70 pay rise, effective on a
 * Wednesday, through the seeded world. Payroll priced a week at the rate
 * on its first day, so the Wednesday to Friday of the week of the rise
 * were paid at $66; the payroll run skipped the question and paid every
 * hour ever worked at today's rate; and the margin screen priced pay at
 * the client's bill rate. `priceByDay` is the one place a set of days
 * becomes money, and every one of those readers now asks it.
 */

import { describe, it, expect } from 'vitest'
import { priceByDay, segmentsSay, type RatePeriod } from '@/lib/contract-rate'

const OLD = 6_600
const RISE: RatePeriod = {
  id: 'rise',
  rateCents: 7_000,
  fromDate: new Date('2026-07-01T00:00:00Z'), // a Wednesday
  toDate: null,
  approvalState: 'APPROVED',
}

// The week of Monday 29 June: two days before the rise, three after.
const WEEK = {
  '2026-06-29': 8,
  '2026-06-30': 8,
  '2026-07-01': 8,
  '2026-07-02': 8,
  '2026-07-03': 8,
}

describe('a week that crosses a rate change is paid by the day', () => {
  it('pays an hour worked on the Tuesday before the rise at $66 and the Wednesday at $70', () => {
    const p = priceByDay({ contractRateCents: OLD, periods: [RISE], days: WEEK })
    expect(p.days.find((d) => d.day === '2026-06-30')!.rateCents).toBe(6_600)
    expect(p.days.find((d) => d.day === '2026-07-01')!.rateCents).toBe(7_000)
  })

  it('adds up to sixteen hours at $66 and twenty-four at $70, and nothing else', () => {
    const p = priceByDay({ contractRateCents: OLD, periods: [RISE], days: WEEK })
    expect(p.hours).toBe(40)
    expect(p.cents).toBe(16 * 6_600 + 24 * 7_000)
    expect(p.straddles).toBe(true)
    expect(p.segments.map((s) => [s.hours, s.rateCents])).toEqual([[16, 6_600], [24, 7_000]])
  })

  it('says both rates in a sentence where there were two', () => {
    const p = priceByDay({ contractRateCents: OLD, periods: [RISE], days: WEEK })
    const says = segmentsSay(p.segments)!
    expect(says).toContain('16 hours at $66')
    expect(says).toContain('24 hours at $70')
  })

  it('says nothing extra about a week with one rate', () => {
    const p = priceByDay({ contractRateCents: OLD, periods: [RISE], days: { '2026-07-06': 8 } })
    expect(p.straddles).toBe(false)
    expect(segmentsSay(p.segments)).toBeNull()
  })

  it('ignores a rise nobody has approved', () => {
    const p = priceByDay({
      contractRateCents: OLD,
      periods: [{ ...RISE, approvalState: 'PROPOSED' }],
      days: WEEK,
    })
    expect(p.cents).toBe(40 * 6_600)
  })

  it('ignores a rise that was rejected', () => {
    const p = priceByDay({
      contractRateCents: OLD,
      periods: [{ ...RISE, approvalState: 'REJECTED' }],
      days: WEEK,
    })
    expect(p.cents).toBe(40 * 6_600)
  })

  it('pays only the days inside the pay period it is asked about', () => {
    const july = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-31T00:00:00Z') }
    const p = priceByDay({ contractRateCents: OLD, periods: [RISE], days: WEEK, within: july })
    expect(p.hours).toBe(24)
    expect(p.cents).toBe(24 * 7_000)
  })

  it('takes a cut in accepted hours off the latest days first', () => {
    // Thirty-eight of forty accepted: the two hours come off Friday, which
    // is a $70 day.
    const p = priceByDay({ contractRateCents: OLD, periods: [RISE], days: WEEK, hours: 38 })
    expect(p.hours).toBe(38)
    expect(p.cents).toBe(16 * 6_600 + 22 * 7_000)
  })

  it('prices a week with no daily hours at the rate on its first day, and says the week crossed a change', () => {
    const p = priceByDay({
      contractRateCents: OLD,
      periods: [RISE],
      days: {},
      hours: 40,
      periodStart: new Date('2026-06-29T00:00:00Z'),
      periodEnd: new Date('2026-07-03T00:00:00Z'),
    })
    expect(p.cents).toBe(40 * 6_600)
    expect(p.note).toContain('No daily hours')
  })

  it('reads a closed rate row as over the day after it closes', () => {
    const closed: RatePeriod = {
      id: 'opening',
      rateCents: 6_600,
      fromDate: new Date('2026-02-02T00:00:00Z'),
      toDate: new Date('2026-06-30T00:00:00Z'),
      approvalState: 'APPROVED',
    }
    // A line whose recorded rate is something else entirely still reads
    // its opening row on the Tuesday and the rise on the Wednesday.
    const p = priceByDay({ contractRateCents: 9_999, periods: [closed, RISE], days: WEEK })
    expect(p.cents).toBe(16 * 6_600 + 24 * 7_000)
  })
})
