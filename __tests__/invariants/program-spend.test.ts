/**
 * What a program costs a month, computed once.
 *
 * The same assumption — an hourly rate times a flat 160-hour month — was
 * written out by hand on the program dashboard, in the per-supplier
 * spend beside it, in the org view's annualization and on the census
 * page. Four copies of one guess is four places for the guess to drift,
 * and the one that drifts is found by a CFO rather than by a test.
 *
 * These are the branches that carry money.
 */

import { describe, it, expect } from 'vitest'
import {
  HOURS_PER_MONTH,
  MONTHS_PER_YEAR,
  monthlyHours,
  monthlySpendMinor,
  annualSpendMinor,
  programMonthlySpend,
  basisSays,
} from '@/app/api/program/spend'

describe('what a contingent program costs a month', () => {
  it('values a full-time seat at four forty-hour weeks, which is where 160 came from', () => {
    expect(HOURS_PER_MONTH).toBe(160)
    expect(monthlyHours(null)).toBe(160)
    expect(monthlyHours(undefined)).toBe(160)
  })

  it('a contractor at one hundred and forty-five dollars an hour costs $23,200 a month', () => {
    expect(monthlySpendMinor(145_00)).toBe(23_200_00)
  })

  it('values a twenty-hour seat at twenty hours, not at a full-time week', () => {
    expect(monthlySpendMinor(145_00, 20)).toBe(11_600_00)
  })

  it('returns minor units, so nothing downstream has to know whether it was already divided', () => {
    expect(monthlySpendMinor(100_00)).toBe(1_600_000)
  })

  it('a seat with no rate on it is a blank and never a zero, because a free contractor is a wrong number', () => {
    expect(monthlySpendMinor(null)).toBeNull()
    expect(monthlySpendMinor(undefined)).toBeNull()
    expect(monthlySpendMinor(0)).toBeNull()
  })

  it('annualizes twelve months of the monthly figure', () => {
    expect(annualSpendMinor(145_00)).toBe(23_200_00 * MONTHS_PER_YEAR)
  })

  it('a three-year placement does not read as three years of one year’s budget', () => {
    expect(annualSpendMinor(100_00, { months: 36 })).toBe(annualSpendMinor(100_00, { months: 12 }))
  })

  it('a placement shorter than a year is annualized at its own length', () => {
    expect(annualSpendMinor(100_00, { months: 3 })).toBe(1_600_000 * 3)
  })

  it('a program of three priced seats totals the three', () => {
    const out = programMonthlySpend([
      { rateMinorPerHour: 100_00 },
      { rateMinorPerHour: 120_00 },
      { rateMinorPerHour: 80_00 },
    ])
    expect(out.totalMinor).toBe(300_00 * 160)
    expect(out.priced).toBe(3)
    expect(out.unpriced).toBe(0)
  })

  it('counts the seats it could not price apart, so a total is never the priced ones dressed as all of them', () => {
    const out = programMonthlySpend([
      { rateMinorPerHour: 100_00 },
      { rateMinorPerHour: null },
      { rateMinorPerHour: 0 },
    ])
    expect(out.totalMinor).toBe(1_600_000)
    expect(out.priced).toBe(1)
    expect(out.unpriced).toBe(2)
  })

  it('says what the figure rests on, because a number with no basis beside it is a bug', () => {
    const says = basisSays('Annualized from the rates this client is billed')
    expect(says).toContain('160 hours a month')
    expect(says).toContain('estimate')
  })
})
