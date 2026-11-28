import { describe, it, expect } from 'vitest'
import { generateCycles, generatePayCycles, localKey } from '@/lib/cycle-generator'
import { categoryOf, shiftCategoryOf } from '@/lib/cycle-kinds'
import { DEFAULT_CYCLE_SHIFT, directionFor, shiftToWorkingDay } from '@/lib/cycle-shift'

/**
 * The founder, 2026-11-09: a pay date on a day off moves to the working day
 * before, so the worker is never paid late; a bill date moves to the working
 * day after. Coordinator's call, reversible by the founder in a sentence:
 * the day a supplier's invoice is generated or received is a bill date, so
 * it moves after and never back into the month before the work ends; the
 * day we pay that supplier is a pay date and moves before.
 */

const u = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const keys = (cs: { dueOn: Date }[]) => cs.map((c) => localKey(c.dueOn))

describe('a pay date moves to the working day before, a bill date to the working day after', () => {
  it('a pay date on a Saturday moves to the Friday before', () => {
    // Monthly pay at month end: January 31, 2026 is a Saturday.
    const pay = generatePayCycles(u(2026, 1, 1), u(2026, 1, 31), { payPeriod: 'MONTHLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3 })
    expect(keys(pay.filter((c) => c.kind === 'SALARY_PAY'))).toEqual(['2026-01-30'])
  })

  it('an invoice date on a Saturday moves to the Monday after', () => {
    const bills = generateCycles(u(2026, 1, 1), u(2026, 1, 31), [{ kind: 'INVOICE_GENERATE', frequency: 'MONTHLY', dayOfMonth: 28 }])
    expect(keys(bills)).toEqual(['2026-02-02'])
  })

  it('a pay date on a holiday Friday moves to the Thursday', () => {
    // Every other week, paid the Friday after the period's Saturday: Jan 23, 2026, a holiday here.
    const pay = generatePayCycles(u(2026, 1, 4), u(2026, 1, 17), { payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3 }, ['2026-01-23'])
    expect(keys(pay.filter((c) => c.kind === 'SALARY_PAY'))).toEqual(['2026-01-22'])
  })

  it('a supplier’s invoice for January is never dated before January ends', () => {
    // The supplier's invoice receipt on the 15th and at month end; January 31, 2026 is a Saturday.
    const got = keys(generateCycles(u(2026, 1, 1), u(2026, 1, 31), [{ kind: 'VENDOR_BILL_GENERATE', frequency: 'SEMIMONTHLY', dayOfMonth: 15 }]))
    expect(got).toEqual(['2026-01-15', '2026-02-02'])
    expect(got).not.toContain('2026-01-30')
  })

  it('a supplier’s invoice dated the 1st after a weekend month end moves to the Monday, never back into the month before', () => {
    // UK pack shape: month end + 1. November 1, 2026 is a Sunday.
    const got = keys(generateCycles(u(2026, 10, 1), u(2026, 10, 31), [{ kind: 'VENDOR_BILL_GENERATE', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 1 }]))
    expect(got).toEqual(['2026-11-02'])
  })

  it('the date we pay a supplier on a Saturday moves to the Friday before', () => {
    expect(shiftCategoryOf('VENDOR_BILL_DUE')).toBe('PAY')
    const day = shiftToWorkingDay(local(2026, 1, 31), [], directionFor(shiftCategoryOf('VENDOR_BILL_DUE'), DEFAULT_CYCLE_SHIFT))
    expect(localKey(day)).toBe('2026-01-30')
  })

  it('the supplier’s invoice still reads as money out on the placement, only its weekend direction is a bill’s', () => {
    expect(categoryOf('VENDOR_BILL_GENERATE')).toBe('PAY')
    expect(shiftCategoryOf('VENDOR_BILL_GENERATE')).toBe('BILL')
    expect(shiftCategoryOf('SALARY_PAY')).toBe('PAY')
    expect(shiftCategoryOf('INVOICE_GENERATE')).toBe('BILL')
  })
})
