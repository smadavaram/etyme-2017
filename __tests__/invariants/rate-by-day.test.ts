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
import { buildExport, type SheetToPay } from '@/lib/payroll-export'

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

// ── The payroll file, one line per rate ───────────────────────────────


const sheet = (weeks: SheetToPay['weeks'], over: Partial<SheetToPay> = {}): SheetToPay => ({
  personName: 'Priya Venkataraman',
  payrollId: 'E20061',
  contractType: 'W2',
  weAreTheEmployer: true,
  periodStart: new Date('2026-06-29T00:00:00Z'),
  periodEnd: new Date('2026-07-10T00:00:00Z'),
  weeks,
  submittedHours: weeks.reduce((n, w) => n + w.regularHours + w.leaveHours + w.overHours, 0),
  acceptedHours: null,
  employerAcceptedAt: new Date('2026-07-12T00:00:00Z'),
  payRateCents: 6_600,
  payModel: 'FIXED_HOURLY',
  paidOnSalaryBasis: false,
  rule: 'US_FLSA',
  assertion: null,
  currency: 'USD',
  costCode: null,
  orderNumber: null,
  ...over,
})

const straddling = {
  weekOf: '2026-06-29',
  regularHours: 40,
  leaveHours: 0,
  overHours: 0,
  client: { treatment: null, appliedBps: null },
  payRateCents: 6_600,
  rates: [
    { rateCents: 6_600, hours: 16 },
    { rateCents: 7_000, hours: 24 },
  ],
}
const after = {
  weekOf: '2026-07-06',
  regularHours: 40,
  leaveHours: 0,
  overHours: 0,
  client: { treatment: null, appliedBps: null },
  payRateCents: 7_000,
  rates: null,
}

describe('a payroll file pays hours worked at two rates as two lines', () => {
  it('puts the week of the rise on the file as sixteen hours at $66 and twenty-four at $70', () => {
    const e = buildExport('GENERIC', [sheet([straddling])])
    expect(e.lines.map((l) => [l.hours, l.rateCents, l.regularCents])).toEqual([
      [16, 6_600, 16 * 6_600],
      [24, 7_000, 24 * 7_000],
    ])
  })

  it('pays a whole week after the rise at $70 even though the sheet began at $66', () => {
    const e = buildExport('GENERIC', [sheet([straddling, after])])
    const at70 = e.lines.find((l) => l.rateCents === 7_000)!
    expect(at70.hours).toBe(64)
    expect(e.totalCents).toBe(16 * 6_600 + 64 * 7_000)
  })

  it('takes hours the employer did not accept off the latest rate of the latest week first', () => {
    const e = buildExport('GENERIC', [sheet([straddling], { acceptedHours: 36 })])
    expect(e.lines.map((l) => [l.hours, l.rateCents])).toEqual([
      [16, 6_600],
      [20, 7_000],
    ])
  })

  it('overtime in a week paid at two rates uses a regular rate weighted across both (29 CFR §778.115), not the rate on the first day', () => {
    // Forty-five hours in the week of the rise: 16 at $66, then 29 at $70
    // with the five over the line on the Friday. The founder decided on
    // 2026-09-29: US law by default. Straight time $3,086, a regular rate
    // of $3,086 / 45 = $68.58, and a premium of half of it on each of the
    // five hours: $171.44. The whole week is $3,257.44.
    const worked = [
      { day: '2026-06-29', hours: 8, rateCents: 6_600 },
      { day: '2026-06-30', hours: 8, rateCents: 6_600 },
      { day: '2026-07-01', hours: 8, rateCents: 7_000 },
      { day: '2026-07-02', hours: 8, rateCents: 7_000 },
      { day: '2026-07-03', hours: 13, rateCents: 7_000 },
    ]
    const e = buildExport('GENERIC', [
      sheet([{ ...straddling, overHours: 5, worked }], {
        assertion: {
          status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'co', assertedByCompanyName: null,
          assertedByName: null, assertedAt: new Date('2026-06-01T00:00:00Z'), note: null, reviewBy: null,
        },
      }),
    ])
    expect(e.skipped).toEqual([])
    expect(e.lines.map((l) => [l.rateCents, l.hours, l.overtimeHours, l.regularCents, l.overtimeCents])).toEqual([
      [6_600, 16, 0, 16 * 6_600, 0],
      // Five overtime hours on the $70 line: 5 × $70 straight time plus
      // the $171.44 premium, rounded once for the line.
      [7_000, 24, 5, 24 * 7_000, 5 * 7_000 + 17_144],
    ])
    expect(e.totalCents).toBe(325_744)
    expect(e.caveats.join(' ')).toContain('Regular rate $68.58')
    // Not the rate on the first day: that would have been $66 × 1.5 on
    // the five hours, and not $70 × 1.5 either.
    expect(e.totalCents).not.toBe(16 * 6_600 + 24 * 7_000 + Math.round(5 * 6_600 * 1.5))
    expect(e.totalCents).not.toBe(16 * 6_600 + 24 * 7_000 + Math.round(5 * 7_000 * 1.5))
  })
})
