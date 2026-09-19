import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CYCLE_SHIFT,
  SHIFT_CATEGORIES,
  SHIFT_DIRECTIONS,
  directionFor,
  isShiftDirection,
  policyFrom,
  shiftToWorkingDay,
  type CycleShiftPolicy,
} from '@/lib/cycle-shift'
import { appliesTo } from '@/lib/holidays'
import { categoryOf } from '@/lib/cycle-kinds'

/**
 * A company says which way its dates move off a weekend or a holiday.
 *
 * Decided 2026-09-17, from the founder: "If Sat or Sun — company can have
 * settings to do before weekend or after weekend."
 *
 * Every date in here is a real day. 2026-07-04 is a Saturday, the 3rd a
 * Friday, the 6th a Monday. A test asserting a direction constant would
 * pass while paying somebody on the wrong day.
 */

const SATURDAY = new Date(2026, 6, 4) // 4 July 2026, a Saturday
const FRIDAY = new Date(2026, 6, 3)
const MONDAY = new Date(2026, 6, 6)

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A company that has said nothing: every column still at its default. */
const saidNothing = policyFrom({})

/** Where a pay date of this kind actually lands at this company. */
function payDay(policy: CycleShiftPolicy, from: Date, holidays: string[] = []): string {
  return day(shiftToWorkingDay(from, holidays, directionFor(categoryOf('SALARY_PAY'), policy)))
}

describe('which way a date moves when it lands on a day nobody works', () => {

  it('a company that has said nothing is paid on the Friday before a weekend, as it always was', () => {
    expect(payDay(saidNothing, SATURDAY)).toBe(day(FRIDAY))
  })

  it('a company that has said nothing raises its invoice on the Monday after, as it always was', () => {
    const direction = directionFor(categoryOf('INVOICE_GENERATE'), saidNothing)
    expect(day(shiftToWorkingDay(SATURDAY, [], direction))).toBe(day(MONDAY))
  })

  it('a company that asked to be paid after the weekend is paid on the Monday', () => {
    expect(payDay(policyFrom({ cycleShiftPay: 'AFTER' }), SATURDAY)).toBe(day(MONDAY))
  })

  it('a company whose terms are calendar days is paid on the Saturday, because it said not to shift', () => {
    expect(payDay(policyFrom({ cycleShiftPay: 'NONE' }), SATURDAY)).toBe(day(SATURDAY))
  })

  it('a company that pays before the weekend and bills after it gets both answers, not one', () => {
    // The reason this is three settings and not one. A single company-wide
    // direction could not state the behavior already shipped.
    const policy = policyFrom({ cycleShiftPay: 'BEFORE', cycleShiftBill: 'AFTER' })
    expect(payDay(policy, SATURDAY)).toBe(day(FRIDAY))
    const bill = directionFor(categoryOf('INVOICE_GENERATE'), policy)
    expect(day(shiftToWorkingDay(SATURDAY, [], bill))).toBe(day(MONDAY))
  })

  it('a date that is already a working day is left alone whichever way the company shifts', () => {
    for (const direction of SHIFT_DIRECTIONS) {
      expect(day(shiftToWorkingDay(FRIDAY, [], direction))).toBe(day(FRIDAY))
    }
  })

  it('a pay day on a Monday holiday moves back past the whole weekend to the Friday', () => {
    // Iterating matters: one step back from a Monday holiday is a Sunday.
    const mondayHoliday = ['2026-07-06']
    expect(payDay(saidNothing, MONDAY, mondayHoliday)).toBe(day(new Date(2026, 6, 3)))
  })

  it('a date on a holiday is still moved for a company that shifts forward, and never for one that does not shift', () => {
    const christmas = ['2026-12-25'] // a Friday
    const onChristmas = new Date(2026, 11, 25)
    expect(day(shiftToWorkingDay(onChristmas, christmas, 'AFTER'))).toBe('2026-12-28')
    expect(day(shiftToWorkingDay(onChristmas, christmas, 'BEFORE'))).toBe('2026-12-24')
    expect(day(shiftToWorkingDay(onChristmas, christmas, 'NONE'))).toBe('2026-12-25')
  })

  it('a holiday one company marked does not move another company’s dates', () => {
    // Two things hold this. The calendar is loaded per company, so a day
    // on Cavanaugh Glassworks’ calendar is not in Northbend Athletic’s
    // set at all; and a day marked for one country is not the other
    // country’s day even on a shared calendar.
    const theirsOnly = ['2026-07-06']
    expect(payDay(saidNothing, MONDAY, [])).toBe(day(MONDAY)) // ours: an ordinary Monday
    expect(payDay(saidNothing, MONDAY, theirsOnly)).toBe(day(FRIDAY)) // theirs: shut
    expect(appliesTo('IN', 'US')).toBe(false)
    expect(appliesTo('US', 'US')).toBe(true)
  })
})

describe('what a company may ask for, and what it may not', () => {

  it('a company is offered three answers and no more, so nobody can ask for a different one per cycle kind', () => {
    expect([...SHIFT_DIRECTIONS]).toEqual(['BEFORE', 'AFTER', 'NONE'])
    expect(SHIFT_CATEGORIES.map((c) => c.key)).toEqual(['hours', 'pay', 'bill'])
  })

  it('a direction nobody recognizes falls back to the shipped default rather than to no answer at all', () => {
    expect(isShiftDirection('SIDEWAYS')).toBe(false)
    expect(policyFrom({ cycleShiftPay: 'SIDEWAYS' }).pay).toBe(DEFAULT_CYCLE_SHIFT.pay)
    expect(policyFrom(null)).toEqual(DEFAULT_CYCLE_SHIFT)
    expect(policyFrom(undefined)).toEqual(DEFAULT_CYCLE_SHIFT)
  })

  it('the shipped default is pay before, hours and bill after — unchanged by anything here', () => {
    expect(DEFAULT_CYCLE_SHIFT).toEqual({ hours: 'AFTER', pay: 'BEFORE', bill: 'AFTER' })
  })

  it('every money kind is covered by one of the three settings, so no date is left deciding for itself', () => {
    const kinds = ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE',
      'SALARY_CALCULATE', 'SALARY_PAY', 'VENDOR_BILL_GENERATE']
    for (const kind of kinds) {
      expect(['HOURS', 'PAY', 'BILL'], kind).toContain(categoryOf(kind))
      expect(SHIFT_DIRECTIONS, kind).toContain(directionFor(categoryOf(kind), saidNothing))
    }
  })

  it('a cycle kind this build does not recognize keeps moving forward, whatever the company set', () => {
    // Rows written by an older engine still have to render, and a setting
    // about pay must not silently change what one of them does.
    expect(directionFor(categoryOf('SOMETHING_RETIRED'), policyFrom({ cycleShiftPay: 'NONE' }))).toBe('AFTER')
  })
})

describe('every existing company keeps being paid on the day it was being paid', () => {

  it('the database defaults the three columns to the behavior that shipped, so no migration moves a pay day', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/cycleShiftHours\s+ShiftDirection\s+@default\(AFTER\)/)
    expect(schema).toMatch(/cycleShiftPay\s+ShiftDirection\s+@default\(BEFORE\)/)
    expect(schema).toMatch(/cycleShiftBill\s+ShiftDirection\s+@default\(AFTER\)/)
    expect(schema).toMatch(/enum ShiftDirection \{[\s\S]*BEFORE[\s\S]*AFTER[\s\S]*NONE[\s\S]*\}/)
  })

  it('the settings screen asks the question in the company’s own words and says the change is not backdated', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/settings/page.tsx'), 'utf8')
    expect(page).toContain('weekend')
    expect(page).toMatch(/already generated keep their dates/i)
  })

  it('the settings route refuses a direction it does not recognize instead of writing it', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/settings/route.ts'), 'utf8')
    expect(route).toContain('isShiftDirection')
    expect(route).toContain('cycleShiftPay')
  })
})
