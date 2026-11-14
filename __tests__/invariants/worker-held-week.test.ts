import { describe, it, expect } from 'vitest'
import { owedByWeek, type OwedPayLine, type OwedSheet, type PayDate } from '@/lib/consultant-portfolio'
import { heldWeeksFor, heldWeekSays, heldWeeksNote, type HeldSheet } from '@/lib/consultant-portfolio/held-weeks'
import { payLineFor, judgedLine, type PayLine } from '@/lib/money/pay-line'
import type { WageLine } from '@/lib/money/sheet-overtime'
import type { RatePeriod } from '@/lib/contract-rate'

/**
 * Her own page never prices a week Payroll is holding.
 *
 * Found on a phone, 2026-11-14 (walker tpe, item 3). Payroll held Marisol
 * Quintero's 46-hour week of Oct 18 because nobody had recorded whether
 * she is exempt from overtime. Her page read "46 hours, none of them
 * overtime. It is due on your pay day, Nov 27 … $2,070.00": 46 x $45 at the
 * usual rate. Once "not exempt" was recorded, Payroll paid $2,205.00:
 * 40 x $45 = $1,800.00 plus 6 x $67.50 = $405.00.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const AT_45: RatePeriod[] = [{ id: 'r45', rateCents: 4_500, fromDate: d('2026-01-01'), toDate: null, approvalState: 'APPROVED' }]

/** The week of Sunday Oct 18: Mon to Thu at 9, Fri at 10, 46 hours. */
const LONG_WEEK = { '2026-10-19': 9, '2026-10-20': 9, '2026-10-21': 9, '2026-10-22': 9, '2026-10-23': 10 }
/** The week of Sunday Oct 11: 8 hours Mon to Fri, 40 hours. */
const PLAIN_WEEK = { '2026-10-12': 8, '2026-10-13': 8, '2026-10-14': 8, '2026-10-15': 8, '2026-10-16': 8 }

/** Brightmoor's every-other-week pay days from Oct 11: Oct 30, Nov 13, Nov 27. */
const PAY_DAYS: PayDate[] = ['2026-10-30', '2026-11-13', '2026-11-27'].map((x) => ({ kind: 'SALARY_PAY', dueOn: d(x), completedAt: null }))
const NOV_14 = d('2026-11-14')

function wage(status: 'NONEXEMPT' | 'EXEMPT' | null, contractType = 'W2'): WageLine {
  return {
    personName: 'Marisol Quintero',
    contractType,
    weAreTheEmployer: true,
    payModel: 'FIXED_HOURLY',
    rule: 'US_FLSA',
    assertion: status
      ? {
          status, basis: status === 'EXEMPT' ? 'PROFESSIONAL' : null, assertedByCompanyId: 'brightmoor',
          assertedByCompanyName: 'Brightmoor Staffing', assertedByName: 'Desmond Achebe', assertedAt: NOV_14, note: null, reviewBy: null,
        }
      : null,
    contractPremiumBps: 15_000,
    employerName: 'Brightmoor Staffing',
    cutOvertime: 'ABOVE_THE_LINE',
  }
}

function payLine(status: 'NONEXEMPT' | 'EXEMPT' | null, over: { contractType?: string; siteCountry?: string | null } = {}): PayLine {
  return payLineFor({
    buyAfterHours: null, sellAfterHours: null, personName: 'Marisol Quintero', employerName: 'Brightmoor Staffing',
    contractType: over.contractType ?? 'W2', weAreTheEmployer: true, exemptStatus: status,
    where: { wageRule: status ? 'US_FLSA' : null, payCurrency: 'USD', entityCountry: 'US', siteCountry: over.siteCountry ?? 'US' },
  })
}

function sheet(days: Record<string, number>, over: Partial<OwedSheet> = {}): OwedSheet & HeldSheet {
  const keys = Object.keys(days).sort()
  return {
    id: 'ts-' + keys[0], days, allDays: days, leaveDays: {}, accepted: null, acceptedAt: NOV_14,
    totalHours: Object.values(days).reduce((a, b) => a + b, 0),
    periodStart: d(keys[0]), periodEnd: d(keys[keys.length - 1]),
    ...over,
  } as OwedSheet & HeldSheet
}

/** Her page for one sheet, read the way /api/me/work reads it: Payroll's held weeks first, then the price. */
function herWeek(
  status: 'NONEXEMPT' | 'EXEMPT' | null,
  s: OwedSheet & HeldSheet,
  opts: { contractType?: string; siteCountry?: string | null; paidHours?: (id: string, day: string) => number; payDates?: PayDate[]; today?: Date } = {}
) {
  const line = payLine(status, opts)
  const held = heldWeeksFor({ line, sheets: [s], cutOvertime: 'ABOVE_THE_LINE', paidHours: opts.paidHours ?? (() => 0) })
  const at = judgedLine(line)
  const owedLine: OwedPayLine = {
    contractRateCents: 4_500, periods: AT_45, afterHours: line.afterHours, method: 'US_REGULAR_RATE',
    wage: wage(status, opts.contractType), currency: 'USD', payDates: opts.payDates ?? PAY_DAYS,
    held: held.length > 0 && at != null ? { weeks: held, line: at } : undefined,
  }
  const [week] = owedByWeek([s], owedLine, () => undefined, opts.today ?? NOV_14)
  return { held, week }
}

describe('a week Payroll holds for the overtime answer is never priced on her page', () => {
  it('a week held for the overtime answer is not shown to the worker as owed at the usual rate: 46 x $45 = $2,070.00 is nowhere on it', () => {
    const { held, week } = herWeek(null, sheet(LONG_WEEK))
    // Payroll's own reader holds it: 46 worked, 6 over the law's 40.
    expect(held).toEqual([{ weekOf: '2026-10-18', workedHours: 46, overHours: 6 }])
    expect(week.held).toBe(true)
    expect(week.priced).toBe(false)
    expect(week.owedCents).toBeNull()
    expect(week.stillOwedCents).toBeNull()
    expect(week.hours).toBeNull()
    expect(week.says).not.toContain('$')
    expect(week.says).not.toContain('none of them overtime')
  })

  it('her page says the week is held and why, with no amount and no pay day', () => {
    const { week } = herWeek(null, sheet(LONG_WEEK))
    expect(week.dueOn).toBeNull()
    expect(week.overdue).toBe(false)
    expect(week.says).toBe(
      'Brightmoor Staffing is holding this week, 46 hours, until it records whether you are paid overtime for hours over 40. ' +
        'It is then paid once, with any overtime owed.'
    )
    expect(week.says).not.toMatch(/Nov 27|Oct 30|due|exempt/)
  })

  it('the line under "What you are owed" names the held week and the firm, never a figure', () => {
    expect(heldWeeksNote('Brightmoor Staffing', ['Oct 18'], 40)).toBe(
      'Your week of Oct 18 is held until Brightmoor Staffing records whether you are paid overtime for hours over 40.'
    )
    expect(heldWeeksNote('Brightmoor Staffing', ['Oct 18', 'Oct 25'], 40)).toBe(
      '2 weeks are held until Brightmoor Staffing records whether you are paid overtime for hours over 40.'
    )
    expect(heldWeeksNote('Brightmoor Staffing', [], 40)).toBeNull()
    expect(heldWeekSays('Brightmoor Staffing', 1, 40)).toContain('this week, 1 hour, until')
  })

  it('once not exempt is recorded her page reads $2,205.00 for 46 hours at $45, 40 x 45 + 6 x 67.50', () => {
    const { held, week } = herWeek('NONEXEMPT', sheet(LONG_WEEK))
    expect(held).toEqual([])
    expect(week.held).toBeUndefined()
    expect(week.priced).toBe(true)
    // 40 x 4,500 = 180,000 and 6 x 6,750 = 40,500: 220,500 cents.
    expect(week.owedCents).toBe(40 * 4_500 + 6 * 6_750)
    expect(week.owedCents).toBe(220_500)
    expect(week.ordinaryHours).toBe(40)
    expect(week.overtimeHours).toBe(6)
    // The premium alone: 6 x $22.50 = $135.00.
    expect(week.premiumCents).toBe(13_500)
    expect(week.says).toContain('46 hours: 40 ordinary and 6 overtime.')
    expect(week.says).toContain('extra $135.00')
  })

  it('once exempt is recorded her page reads $2,070.00, 46 x 45, every hour at the usual rate', () => {
    const { held, week } = herWeek('EXEMPT', sheet(LONG_WEEK))
    expect(held).toEqual([])
    expect(week.priced).toBe(true)
    expect(week.owedCents).toBe(46 * 4_500)
    expect(week.owedCents).toBe(207_000)
    expect(week.overtimeHours).toBe(0)
  })

  it('once recorded, a week accepted on Nov 14 after its period paid on Oct 30 reads Oct 30, overdue, the day Payroll names, never Nov 27', () => {
    // The week of Oct 18 ends Sat Oct 24; the first pay day on or after it is Fri Oct 30.
    // Accepting it on Nov 14 does not move that day.
    const { week } = herWeek('NONEXEMPT', sheet(LONG_WEEK))
    expect(week.dueOn).toBe('2026-10-30')
    expect(week.overdue).toBe(true)
    expect(week.says).toContain('It fell due on your pay day of Oct 30 and has not been paid.')
    expect(week.says).not.toContain('Nov 27')
  })
})

describe('what was right before stays right', () => {
  it('a week of 40 hours with no answer recorded is not held: 40 x $45 = $1,800.00, due on the first pay day after it was accepted on Oct 26, Oct 30', () => {
    const { held, week } = herWeek(null, sheet(PLAIN_WEEK, { acceptedAt: d('2026-10-26') }), { today: d('2026-10-27') })
    expect(held).toEqual([])
    expect(week.priced).toBe(true)
    expect(week.owedCents).toBe(40 * 4_500)
    expect(week.owedCents).toBe(180_000)
    expect(week.dueOn).toBe('2026-10-30')
    expect(week.says).toBe('40 hours, none of them overtime. It is due on your pay day, Oct 30.')
  })

  it('a week of 46 hours filed and 40 accepted is not held: it is the usual rate either way, 40 x $45 = $1,800.00', () => {
    const { held, week } = herWeek(null, sheet(LONG_WEEK, { accepted: { hours: 40, from: null, to: null } }))
    expect(held).toEqual([])
    expect(week.priced).toBe(true)
    expect(week.owedCents).toBe(180_000)
    expect(week.says).toContain('You filed 46 hours and Brightmoor Staffing accepted 40.')
  })

  it('the held-week reader never holds a line that is not a W-2: fed one directly, it prices 46 x $45 = $2,070.00 (her page never feeds it a 1099 line; see worker-late-week-pay-day)', () => {
    const { held, week } = herWeek(null, sheet(LONG_WEEK), { contractType: 'IND_1099' })
    expect(held).toEqual([])
    expect(week.held).toBeUndefined()
    expect(week.owedCents).toBe(207_000)
  })

  it('a worker outside the US is never held on the US forty: her week of 46 at $45 reads $2,070.00 as before', () => {
    const { held, week } = herWeek(null, sheet(LONG_WEEK), { siteCountry: 'GB' })
    expect(held).toEqual([])
    expect(week.priced).toBe(true)
    expect(week.owedCents).toBe(207_000)
  })

  it('a firm paying by the month holds the same week the same way, and its 40-hour week falls due on its monthly pay day, Nov 6', () => {
    const MONTHLY: PayDate[] = ['2026-11-06', '2026-12-07'].map((x) => ({ kind: 'SALARY_PAY', dueOn: d(x), completedAt: null }))
    const held = herWeek(null, sheet(LONG_WEEK, { acceptedAt: d('2026-10-26') }), { payDates: MONTHLY, today: d('2026-10-27') })
    expect(held.week.held).toBe(true)
    expect(held.week.dueOn).toBeNull()
    const plain = herWeek(null, sheet(PLAIN_WEEK, { acceptedAt: d('2026-10-26') }), { payDates: MONTHLY, today: d('2026-10-27') })
    expect(plain.week.owedCents).toBe(180_000)
    expect(plain.week.dueOn).toBe('2026-11-06')
  })

  it('a held week an earlier run already paid in full is not held, as Payroll lets it go', () => {
    const paidAll = (_id: string, day: string) => (LONG_WEEK as Record<string, number>)[day] ?? 0
    const { held } = herWeek(null, sheet(LONG_WEEK), { paidHours: paidAll })
    expect(held).toEqual([])
  })
})
