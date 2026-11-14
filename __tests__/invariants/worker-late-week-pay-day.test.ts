import { describe, it, expect } from 'vitest'
import { owedByWeek, type OwedPayLine, type OwedSheet, type PayDate } from '@/lib/consultant-portfolio'
import { periodPayDay } from '@/lib/money/payroll-rows'
import { paidByPayroll, workerPaidAs } from '@/lib/money/paid-through'
import { periodFor, type Terms } from '@/lib/periods'
import type { WageLine } from '@/lib/money/sheet-overtime'
import type { RatePeriod } from '@/lib/contract-rate'

/**
 * A week accepted late falls due on its own period's pay day, on her page
 * as on Payroll.
 *
 * Found by hand, 2026-11-14. Brightmoor Staffing pays every other week
 * from Sun Oct 11: Oct 11 – Oct 24 is paid Fri Oct 30, Oct 25 – Nov 7 on
 * Fri Nov 13, Nov 8 – Nov 21 on Fri Nov 27. Marisol Quintero's weeks of
 * Oct 11 and Oct 18 were accepted on Nov 14. Payroll named the period's
 * pay day, Oct 30, overdue. Her page named the next pay day after the
 * acceptance, Nov 27. Payroll pays a late week in its own period, so her
 * page now names Oct 30 and says it has not been paid.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const AT_45: RatePeriod[] = [{ id: 'r45', rateCents: 4_500, fromDate: d('2026-01-01'), toDate: null, approvalState: 'APPROVED' }]
const NOV_14 = d('2026-11-14')

/** Brightmoor's two-week periods from Sun Oct 11. */
const TERMS: Terms = { frequency: 'BIWEEKLY', anchor: 'CONTRACT', straddle: 'SPLIT', startedOn: d('2026-10-11') }
/** Its pay days, each the Friday six days after its period's Saturday. */
const PAY_DAYS: PayDate[] = ['2026-10-30', '2026-11-13', '2026-11-27'].map((x) => ({ kind: 'SALARY_PAY', dueOn: d(x), completedAt: null }))

/** Mon Oct 12 to Fri Oct 16 at 8: 40 hours. */
const WEEK_OF_OCT_11 = { '2026-10-12': 8, '2026-10-13': 8, '2026-10-14': 8, '2026-10-15': 8, '2026-10-16': 8 }
/** Mon Oct 19 to Thu Oct 22 at 9, Fri Oct 23 at 10: 46 hours. */
const WEEK_OF_OCT_18 = { '2026-10-19': 9, '2026-10-20': 9, '2026-10-21': 9, '2026-10-22': 9, '2026-10-23': 10 }

const WAGE: WageLine = {
  personName: 'Marisol Quintero',
  contractType: 'W2',
  weAreTheEmployer: true,
  payModel: 'FIXED_HOURLY',
  rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'brightmoor', assertedByCompanyName: 'Brightmoor Staffing',
    assertedByName: 'Desmond Achebe', assertedAt: NOV_14, note: null, reviewBy: null,
  },
  contractPremiumBps: 15_000,
  employerName: 'Brightmoor Staffing',
  cutOvertime: 'ABOVE_THE_LINE',
}

function line(over: Partial<OwedPayLine> = {}): OwedPayLine {
  return {
    contractRateCents: 4_500, periods: AT_45, afterHours: 40, method: 'US_REGULAR_RATE',
    wage: WAGE, currency: 'USD', payDates: PAY_DAYS, terms: TERMS, ...over,
  }
}

function sheet(days: Record<string, number>, acceptedAt: Date): OwedSheet {
  const keys = Object.keys(days).sort()
  return {
    id: 'ts-' + keys[0], days, allDays: days, leaveDays: {}, accepted: null, acceptedAt,
    totalHours: Object.values(days).reduce((a, b) => a + b, 0),
    periodStart: d(keys[0]), periodEnd: d(keys[keys.length - 1]),
  } as OwedSheet
}

const nothingPaid = () => undefined

describe('a week accepted after its pay day reads the pay day Payroll names', () => {
  it('a 40-hour week of Oct 11 accepted on Nov 14 fell due on Oct 30, its period’s pay day, and reads overdue: 40 x $45 = $1,800.00', () => {
    // Oct 11 + 13 days = Sat Oct 24; + 6 days = Fri Oct 30.
    const [w] = owedByWeek([sheet(WEEK_OF_OCT_11, NOV_14)], line(), nothingPaid, NOV_14)
    expect(w.owedCents).toBe(40 * 4_500)
    expect(w.owedCents).toBe(180_000)
    expect(w.dueOn).toBe('2026-10-30')
    expect(w.overdue).toBe(true)
    expect(w.says).toBe('40 hours, none of them overtime. It fell due on your pay day of Oct 30 and has not been paid.')
  })

  it('the 46-hour week of Oct 18 accepted on Nov 14 fell due on Oct 30 too: 40 x $45 + 6 x $67.50 = $2,205.00, overdue', () => {
    const [w] = owedByWeek([sheet(WEEK_OF_OCT_18, NOV_14)], line(), nothingPaid, NOV_14)
    expect(w.owedCents).toBe(40 * 4_500 + 6 * 6_750)
    expect(w.owedCents).toBe(220_500)
    expect(w.dueOn).toBe('2026-10-30')
    expect(w.overdue).toBe(true)
    expect(w.says).toContain('It fell due on your pay day of Oct 30 and has not been paid.')
  })

  it('a late week is never moved to a later pay day: neither Nov 13 nor Nov 27 is named for the period of Oct 11 – Oct 24', () => {
    const [w] = owedByWeek([sheet(WEEK_OF_OCT_11, NOV_14)], line(), nothingPaid, NOV_14)
    expect(w.says).not.toContain('Nov 13')
    expect(w.says).not.toContain('Nov 27')
  })

  it('a week accepted before its pay day reads that same day, Oct 30, and is not overdue on Oct 27', () => {
    const [w] = owedByWeek([sheet(WEEK_OF_OCT_11, d('2026-10-26'))], line(), nothingPaid, d('2026-10-27'))
    expect(w.dueOn).toBe('2026-10-30')
    expect(w.overdue).toBe(false)
    expect(w.says).toBe('40 hours, none of them overtime. It is due on your pay day, Oct 30.')
  })

  it('her page names the day Payroll’s own reader gives the period Oct 11 – Oct 24, where each pay day row names its period', () => {
    // Pay day rows as the cycle writer writes them since 2026-11-09, each with its period's last day.
    const rows = [
      { id: 'c1', kind: 'SALARY_PAY', dueOn: d('2026-10-30'), completedAt: null, periodEnd: d('2026-10-24') },
      { id: 'c2', kind: 'SALARY_PAY', dueOn: d('2026-11-13'), completedAt: null, periodEnd: d('2026-11-07') },
      { id: 'c3', kind: 'SALARY_PAY', dueOn: d('2026-11-27'), completedAt: null, periodEnd: d('2026-11-21') },
    ]
    const period = periodFor(d('2026-10-12'), TERMS)
    const payroll = periodPayDay(rows, period, (x) => periodFor(x, TERMS), TERMS.startedOn)
    expect(payroll).toBe('2026-10-30')
    const [w] = owedByWeek([sheet(WEEK_OF_OCT_11, NOV_14)], line({ payDates: rows }), nothingPaid, NOV_14)
    expect(w.dueOn).toBe(payroll)
  })

  it('a pay day row that names its own period pays that period even where it falls after the next one ends: Oct 11 – Oct 24 paid on Nov 9 reads Nov 9', () => {
    // The row says it pays the period ending Oct 24; the first pay day after Oct 24 on the line would be Nov 6.
    const rows = [
      { kind: 'SALARY_PAY', dueOn: d('2026-11-06'), completedAt: null, periodEnd: d('2026-11-07') },
      { kind: 'SALARY_PAY', dueOn: d('2026-11-09'), completedAt: null, periodEnd: d('2026-10-24') },
    ]
    const [w] = owedByWeek([sheet(WEEK_OF_OCT_11, NOV_14)], line({ payDates: rows }), nothingPaid, NOV_14)
    expect(w.dueOn).toBe('2026-11-09')
    expect(w.overdue).toBe(true)
  })
})

describe('a 1099 individual reads no wages on her page', () => {
  it('a 1099 line is not paid by payroll, so her page carries no wage figure and no pay day for it, and reads it as her own bill', () => {
    // Brightmoor pays an independent contractor's invoice; it runs no payroll for her.
    expect(paidByPayroll({ contractType: 'IND_1099' })).toBe(false)
    expect(workerPaidAs({ contractType: 'IND_1099' }, [])).toBe('OWN_COMPANY_BILLS')
    // The W-2 line beside it is paid by payroll.
    expect(paidByPayroll({ contractType: 'W2' })).toBe(true)
  })
})
