/**
 * Overtime in a week paid at two rates.
 *
 * The founder, 2026-09-29: "Follow US law as recommendation, but allow
 * for user input if they want to change." The law is 29 CFR §778.115:
 * the regular rate is the week's straight-time pay divided by all hours
 * worked, and each overtime hour earns half of it on top of straight time.
 *
 * The worked example is his: forty-five hours in the week of a rise, 16
 * of them at $66 and 29 at $70.
 */

import { describe, it, expect } from 'vitest'
import {
  weekOvertime,
  firstFortyAtDayRates,
  regularRateCents,
  cutOrdinary,
  methodFor,
  weekOvertimeSays,
  OVERTIME_METHODS,
  type DayHours,
} from '@/lib/money/overtime-method'
import { sheetOvertime, workedByWeek, premiumTerms, type WageLine } from '@/lib/money/sheet-overtime'
import type { RatePeriod } from '@/lib/contract-rate'

// Monday and Tuesday at $66; the rise lands on Wednesday 1 July; Friday is
// a thirteen-hour day, so the week is forty-five hours.
const WEEK: DayHours[] = [
  { day: '2026-06-29', hours: 8, rateCents: 6_600 },
  { day: '2026-06-30', hours: 8, rateCents: 6_600 },
  { day: '2026-07-01', hours: 8, rateCents: 7_000 },
  { day: '2026-07-02', hours: 8, rateCents: 7_000 },
  { day: '2026-07-03', hours: 13, rateCents: 7_000 },
]
const FLSA = { multiplierBps: 15_000, floorBps: 15_000 }

describe('overtime in a week paid at two rates follows the US regular rate by default', () => {
  it('prices 16 hours at $66 and 29 at $70 as $3,086 straight time, a regular rate of $68.58 and a premium of $171.44', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'US_REGULAR_RATE' })
    expect(w.hours).toBe(45)
    expect(w.straightCents).toBe(308_600)
    expect(Math.round(w.regularRateCents!)).toBe(6_858)
    expect(Math.round(w.premiumCents)).toBe(17_144)
    expect(Math.round(w.totalCents)).toBe(325_744)
  })

  it('pays the same total as forty hours at the regular rate plus time and a half of it for the five over', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'US_REGULAR_RATE' })
    const rr = regularRateCents(WEEK)!
    const otherForm = rr * 40 + 1.5 * rr * 5
    expect(Math.round(otherForm)).toBe(Math.round(w.totalCents))
    expect(Math.abs(otherForm - w.totalCents)).toBeLessThan(0.000_01)
  })

  it('would underpay by $7.11 if the first forty hours were paid at their own day rates and only the five over at the regular rate', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'US_REGULAR_RATE' })
    const wrong = firstFortyAtDayRates(WEEK, 5, 15_000)
    expect(Math.round(w.totalCents) - Math.round(wrong)).toBe(711)
  })

  it('rounds once, at the end, and never the regular rate first — which would pay $171.45', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'US_REGULAR_RATE' })
    const roundedFirst = Math.round(0.5 * 6_858 * 5)
    expect(roundedFirst).toBe(17_145)
    expect(Math.round(w.premiumCents)).toBe(17_144)
  })

  it('puts the five overtime hours on the Friday they were worked, each carrying the same premium', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'US_REGULAR_RATE' })
    expect(w.overDays.map((d) => [d.day, d.hours, d.rateCents])).toEqual([['2026-07-03', 5, 7_000]])
  })

  it('says the week in a sentence a payroll clerk can check with a calculator', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'US_REGULAR_RATE' })
    const says = weekOvertimeSays('2026-06-29', w)
    expect(says).toContain('45 hours')
    expect(says).toContain('$3,086.00 straight time')
    expect(says).toContain('Regular rate $68.58')
    expect(says).toContain('$171.44')
    expect(says).toContain('29 CFR §778.115')
  })
})

describe('a paying firm may choose another method, and the law is still the floor', () => {
  it('prices the premium at the rate in force on each overtime day, where the firm chose that: $175 on a $70 Friday', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'RATE_ON_THE_DAY' })
    expect(Math.round(w.premiumCents)).toBe(17_500)
    expect(w.floorGoverns).toBe(false)
  })

  it('prices the premium on the higher of the two rates, where the firm chose that', () => {
    const w = weekOvertime({ worked: WEEK, overHours: 5, ...FLSA, method: 'HIGHER_RATE' })
    expect(Math.round(w.premiumCents)).toBe(17_500)
  })

  it('never pays a nonexempt worker less than the regular-rate premium, even where the firm chose the rate on the day and the rate fell mid-week', () => {
    // A cut from $70 to $66 on the Wednesday: the Friday overtime is on
    // the lower rate, so the day's rate would pay $165.00 and the law
    // requires half of a $67.42 regular rate — $168.56.
    const cut = WEEK.map((d) => ({ ...d, rateCents: d.day < '2026-07-01' ? 7_000 : 6_600 }))
    const w = weekOvertime({ worked: cut, overHours: 5, ...FLSA, method: 'RATE_ON_THE_DAY' })
    expect(Math.round(w.methodPremiumCents)).toBe(16_500)
    expect(w.floorGoverns).toBe(true)
    expect(Math.round(w.premiumCents)).toBe(16_856)
    expect(weekOvertimeSays('2026-06-29', w)).toContain('the law')
  })

  it('pays a week at one rate the same under every method', () => {
    const flat = WEEK.map((d) => ({ ...d, rateCents: 7_000 }))
    const premiums = OVERTIME_METHODS.map(
      (method) => weekOvertime({ worked: flat, overHours: 5, ...FLSA, method }).premiumCents
    )
    expect(new Set(premiums.map(Math.round))).toEqual(new Set([17_500]))
  })

  it('prices no premium where nothing requires one, whichever method was chosen', () => {
    for (const method of OVERTIME_METHODS) {
      const w = weekOvertime({ worked: WEEK, overHours: 5, multiplierBps: 10_000, floorBps: null, method })
      expect(w.premiumCents).toBe(0)
    }
  })

  it('uses the US regular rate on a line where nobody chose another method, and says no other method has been chosen', () => {
    const m = methodFor({ id: 'any buy line' })
    expect(m.method).toBe('US_REGULAR_RATE')
    expect(m.chosen).toBe(false)
    expect(m.says).toContain('No other method has been chosen')
  })
})

describe('the hours a regular rate is worked out from', () => {
  const RISE: RatePeriod = {
    id: 'rise', rateCents: 7_000, fromDate: new Date('2026-07-01T00:00:00Z'), toDate: null, approvalState: 'APPROVED',
  }

  it('leaves paid leave out of the regular rate, because leave was paid but not worked', () => {
    const weeks = workedByWeek({
      days: { '2026-06-29': 8, '2026-06-30': 8, '2026-07-01': 8 },
      leaveDays: { '2026-06-29': 8 },
      contractRateCents: 6_600,
      periods: [RISE],
    })
    expect(weeks.get('2026-06-29')!.map((d) => [d.day, d.hours, d.rateCents])).toEqual([
      ['2026-06-30', 8, 6_600],
      ['2026-07-01', 8, 7_000],
    ])
  })

  it('takes hours an employer struck out off the ordinary hours before the overtime, never off the overtime', () => {
    const cut = cutOrdinary(WEEK, 5, 3)
    // Friday keeps its five overtime hours and loses three ordinary ones.
    expect(cut.find((d) => d.day === '2026-07-03')!.hours).toBe(10)
    expect(cut.reduce((n, d) => n + d.hours, 0)).toBe(42)
  })

  const nonexempt: WageLine = {
    personName: 'Priya Venkataraman',
    contractType: 'W2',
    weAreTheEmployer: true,
    payModel: 'FIXED_HOURLY',
    rule: 'US_FLSA',
    assertion: {
      status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'co', assertedByCompanyName: null,
      assertedByName: null, assertedAt: new Date('2026-06-01T00:00:00Z'), note: null, reviewBy: null,
    },
    contractPremiumBps: null,
    cutOvertime: 'ABOVE_THE_LINE',
  }
  const days = Object.fromEntries(WEEK.map((d) => [d.day, d.hours]))

  it('prices a nonexempt worker\'s sheet week by week on the regular rate, from the days and the rate history', () => {
    const [w] = sheetOvertime({
      days, afterHours: 40, contractRateCents: 6_600, periods: [RISE], method: 'US_REGULAR_RATE', line: nonexempt,
    })
    expect(w.weekOf).toBe('2026-06-29')
    expect(w.terms.priced).toBe(true)
    expect(Math.round(w.overtime!.premiumCents)).toBe(17_144)
  })

  it('prices no week over a line nobody drew', () => {
    expect(sheetOvertime({ days, afterHours: null, contractRateCents: 6_600, periods: [RISE], method: 'US_REGULAR_RATE', line: nonexempt })).toEqual([])
  })

  it('leaves the premium unpriced, and says why, where nobody has recorded whether the worker is exempt', () => {
    const [w] = sheetOvertime({
      days, afterHours: 40, contractRateCents: 6_600, periods: [RISE], method: 'US_REGULAR_RATE',
      line: { ...nonexempt, assertion: null },
    })
    expect(w.terms.priced).toBe(false)
    expect(w.overtime).toBeNull()
    expect(w.terms.says).toContain('Priya Venkataraman')
  })

  it('pays an exempt worker straight time over the line unless the contract promised a premium', () => {
    const exempt = { ...nonexempt, assertion: { ...nonexempt.assertion!, status: 'EXEMPT' as const, basis: 'COMPUTER' as const } }
    const plain = sheetOvertime({ days, afterHours: 40, contractRateCents: 6_600, periods: [RISE], method: 'US_REGULAR_RATE', line: exempt })
    expect(plain[0].overtime!.premiumCents).toBe(0)
    const promised = sheetOvertime({
      days, afterHours: 40, contractRateCents: 6_600, periods: [RISE], method: 'US_REGULAR_RATE',
      line: { ...exempt, contractPremiumBps: 15_000 },
    })
    expect(Math.round(promised[0].overtime!.premiumCents)).toBe(17_144)
    expect(promised[0].terms.floorBps).toBeNull()
  })

  it('reads a corp-to-corp company as settled on its own contract, not refused', () => {
    const t = premiumTerms(
      { ok: false, code: 'NOT_A_WAGE', regularCents: null, overtimeCents: null, appliedBps: null, uncoveredPremiumCents: null, says: '', action: null, caveats: [] },
      null
    )
    expect(t.priced).toBe(true)
    expect(t.multiplierBps).toBe(10_000)
  })
})
