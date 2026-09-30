import { describe, it, expect } from 'vitest'
import { owedByWeek, type OwedSheet, type OwedPayLine, type PaidSoFar } from '@/lib/consultant-portfolio'
import type { WageLine } from '@/lib/money/sheet-overtime'
import type { RatePeriod } from '@/lib/contract-rate'
import type { Terms } from '@/lib/periods'

/**
 * A week that crosses two months, on the worker's own page, is paid the
 * way the payroll run pays it.
 *
 * Payroll reads a line's pay periods and straddle through
 * `periodTermsFor('BUY', …)` and splits a crossing week by day unless the
 * order or the line says END. The seeded runs paid Karthik Menon's
 * Jun 29–30 on Jul 10 with June, and his Jul 1–3 on Aug 10 with July,
 * while his page showed one date for the week. These are the sentences
 * the page now keeps.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const W2: WageLine = {
  personName: 'Karthik Menon',
  contractType: 'W2',
  weAreTheEmployer: true,
  payModel: 'FIXED_HOURLY',
  rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'teleworld', assertedByCompanyName: 'Teleworld Solutions',
    assertedByName: null, assertedAt: d('2026-01-01'), note: null, reviewBy: null,
  },
  contractPremiumBps: 15_000,
  employerName: 'Teleworld Solutions',
  cutOvertime: 'ABOVE_THE_LINE',
}
const AT_89: RatePeriod[] = [{ id: 'r', rateCents: 8_900, fromDate: d('2026-01-01'), toDate: null, approvalState: 'APPROVED' }]

/** Pay days the demo uses: the 10th of the month after. */
const PAY_DAYS = ['2026-07-10', '2026-08-10', '2026-09-10'].map((x) => ({ kind: 'SALARY_PAY', dueOn: d(x), completedAt: null }))

const monthly = (straddle: Terms['straddle']): Terms => ({
  frequency: 'MONTHLY', anchor: 'CALENDAR', straddle, startedOn: d('2026-06-01'),
})

function line(terms: Terms | undefined): OwedPayLine {
  return {
    contractRateCents: 8_900, periods: AT_89, afterHours: 40, method: 'US_REGULAR_RATE',
    wage: W2, currency: 'USD', payDates: PAY_DAYS, terms,
  }
}

/** Monday Jun 29 to Friday Jul 3, eight hours a day, accepted Jul 6. */
const CROSSING: OwedSheet = {
  id: 'ts',
  days: { '2026-06-29': 8, '2026-06-30': 8, '2026-07-01': 8, '2026-07-02': 8, '2026-07-03': 8 },
  leaveDays: {},
  accepted: null,
  acceptedAt: d('2026-07-06'),
  totalHours: 40,
  periodStart: d('2026-06-29'),
  periodEnd: d('2026-07-03'),
}

/** What the seeded runs did: June's days paid Jul 10, July's Aug 10. */
function paidAsTheRunPaid(_: string, day: string): PaidSoFar | undefined {
  return { hours: 8, straightCents: 8 * 8_900, premiumHours: 0, premiumCents: 0, paidOn: day < '2026-07-01' ? '2026-07-10' : '2026-08-10' }
}
const nothingPaid = () => undefined

describe('a week crossing two months is paid as the payroll run pays it', () => {
  it('a week crossing two months shows the June days paid with June and the July days paid with July, as the payroll run paid them', () => {
    const [w] = owedByWeek([CROSSING], line(monthly('SPLIT')), paidAsTheRunPaid, d('2026-09-30'))
    expect(w.stage).toBe('PAID')
    expect(w.parts).toHaveLength(2)
    const [june, july] = w.parts!
    expect([june.from, june.to, june.hours, june.owedCents, june.paidOn]).toEqual(['2026-06-29', '2026-06-30', 16, 16 * 8_900, '2026-07-10'])
    expect([july.from, july.to, july.hours, july.owedCents, july.paidOn]).toEqual(['2026-07-01', '2026-07-03', 24, 24 * 8_900, '2026-08-10'])
    expect(w.says).toContain('Jun 29 – Jun 30: 16 hours, $1,424.00, paid on Jul 10.')
    expect(w.says).toContain('Jul 1 – Jul 3: 24 hours, $2,136.00, paid on Aug 10.')
  })

  it('each part of a crossing week falls due on the first pay day after its own month ends and after the week was accepted', () => {
    const [w] = owedByWeek([CROSSING], line(monthly('SPLIT')), nothingPaid, d('2026-07-08'))
    const [june, july] = w.parts!
    expect(june.dueOn).toBe('2026-07-10')
    expect(july.dueOn).toBe('2026-08-10')
    // The week's own date is the first part still owed.
    expect(w.dueOn).toBe('2026-07-10')
    expect(w.says).toContain('is due on your pay day, Jul 10.')
    expect(w.says).toContain('is due on your pay day, Aug 10.')
  })

  it('a part paid and a part still owed are each said as they stand', () => {
    const [w] = owedByWeek(
      [CROSSING],
      line(monthly('SPLIT')),
      (id, day) => (day < '2026-07-01' ? paidAsTheRunPaid(id, day) : undefined),
      d('2026-07-20')
    )
    expect(w.stage).toBe('OWED')
    expect(w.parts!.map((p) => p.stage)).toEqual(['PAID', 'OWED'])
    expect(w.stillOwedCents).toBe(24 * 8_900)
    expect(w.dueOn).toBe('2026-08-10')
  })

  it('a week whose line pays a crossing week on its last day shows one pay date', () => {
    const [w] = owedByWeek([CROSSING], line(monthly('END')), nothingPaid, d('2026-07-08'))
    expect(w.parts).toBeNull()
    // The whole week goes with July, the month its last day is in.
    expect(w.dueOn).toBe('2026-08-10')
    expect(w.says).toBe('40 hours, none of them overtime. It is due on your pay day, Aug 10.')
  })

  it('a week inside one month is one part, due after its month ends rather than on a pay day in the middle of it', () => {
    const inside: OwedSheet = {
      ...CROSSING,
      days: { '2026-07-06': 8, '2026-07-07': 8, '2026-07-08': 8, '2026-07-09': 8, '2026-07-10': 8 },
      acceptedAt: d('2026-07-10'),
      periodStart: d('2026-07-06'),
      periodEnd: d('2026-07-10'),
    }
    const [w] = owedByWeek([inside], line(monthly('SPLIT')), nothingPaid, d('2026-07-10'))
    expect(w.parts).toBeNull()
    // July is paid on Aug 10; Jul 10 is June's pay day.
    expect(w.dueOn).toBe('2026-08-10')
  })

  it('without the line’s terms a crossing week is one part, due after its last day, as it was', () => {
    const [w] = owedByWeek([CROSSING], line(undefined), nothingPaid, d('2026-07-08'))
    expect(w.parts).toBeNull()
    expect(w.dueOn).toBe('2026-07-10')
  })

  it('the parts of a week add up to the week', () => {
    const [w] = owedByWeek([CROSSING], line(monthly('SPLIT')), nothingPaid, d('2026-07-08'))
    expect(w.parts!.reduce((n, p) => n + p.hours, 0)).toBe(w.hours)
    expect(w.parts!.reduce((n, p) => n + p.owedCents, 0)).toBe(w.owedCents)
  })
})
