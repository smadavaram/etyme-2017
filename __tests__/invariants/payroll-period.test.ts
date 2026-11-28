import { describe, it, expect } from 'vitest'
import { periodFor, hoursInPeriod, type Terms, type Sheet } from '@/lib/periods'
import { rateInForce } from '@/lib/contract-rate'

/**
 * Payroll had the same period bug as billing, on the side the consultant
 * checks — plus two of its own.
 *
 *   const filteredTimesheets = period
 *     ? linkedTimesheets.filter((ts) => ts.periodStart.startsWith(period))
 *     : linkedTimesheets
 *
 * A string prefix on the start date, and no filter at all by default.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const MONTHLY: Terms = {
  frequency: 'MONTHLY',
  anchor: 'CALENDAR',
  straddle: 'SPLIT',
  startedOn: d('2026-03-01'),
}

function week(from: string, to: string, days: Record<string, number>): Sheet {
  return {
    id: from,
    periodStart: d(from),
    periodEnd: d(to),
    days,
    totalHours: Object.values(days).reduce((a, b) => a + b, 0),
  }
}

const WEEKS = [
  week('2026-07-27', '2026-08-02', {
    '2026-07-27': 8, '2026-07-28': 8, '2026-07-29': 8, '2026-07-30': 8, '2026-07-31': 8,
  }),
  week('2026-08-03', '2026-08-09', {
    '2026-08-03': 8, '2026-08-04': 8, '2026-08-05': 8, '2026-08-06': 8, '2026-08-07': 8,
  }),
  week('2026-08-10', '2026-08-16', {
    '2026-08-10': 8, '2026-08-11': 8, '2026-08-12': 8, '2026-08-13': 8, '2026-08-14': 8,
  }),
  week('2026-08-17', '2026-08-23', {
    '2026-08-17': 8, '2026-08-18': 8, '2026-08-19': 8, '2026-08-20': 8, '2026-08-21': 8,
  }),
  week('2026-08-24', '2026-08-30', {
    '2026-08-24': 8, '2026-08-25': 8, '2026-08-26': 8, '2026-08-27': 8, '2026-08-28': 8,
  }),
]

function hoursFor(month: string): number {
  const period = periodFor(d(`${month}-01`), MONTHLY)
  return WEEKS
    .map((w) => hoursInPeriod(w, period, 'SPLIT'))
    .filter((h): h is NonNullable<typeof h> => h !== null)
    .reduce((sum, h) => sum + h.hours, 0)
}

describe('a pay period is the contract’s, not a string match on the start date', () => {
  it('pays August the hours worked in August', () => {
    expect(hoursFor('2026-08')).toBe(160)
  })

  it('pays July the days of the straddling week that fall in July', () => {
    // Under the old prefix match the whole week went to July because it
    // started there. Here it goes to July because its days are July days,
    // which is the same answer for the right reason — and a different
    // answer the moment the week has August days in it.
    expect(hoursFor('2026-07')).toBe(40)
  })

  it('never pays the same hour in two periods', () => {
    const total = WEEKS.reduce((s, w) => s + w.totalHours, 0)
    expect(hoursFor('2026-07') + hoursFor('2026-08')).toBe(total)
  })

  it('splits a week that genuinely has days on both sides', () => {
    const both = week('2026-07-27', '2026-08-02', {
      '2026-07-30': 8, '2026-07-31': 8, '2026-08-01': 4,
    })
    const july = hoursInPeriod(both, periodFor(d('2026-07-01'), MONTHLY), 'SPLIT')!
    const august = hoursInPeriod(both, periodFor(d('2026-08-01'), MONTHLY), 'SPLIT')!
    expect(july.hours).toBe(16)
    expect(august.hours).toBe(4)
    // The old prefix match gave July all twenty and August nothing.
    expect(july.hours + august.hours).toBe(both.totalHours)
  })
})

describe('asking for no period must not mean every hour ever worked', () => {
  it('falls back to the period containing the most recent work', () => {
    // The default view summed every timesheet linked to the contract —
    // 200 hours here instead of 160, and a five-figure overpayment on a
    // book with a year of history.
    const latest = WEEKS.reduce<Date>((l, w) => (w.periodEnd > l ? w.periodEnd : l), WEEKS[0].periodEnd)
    const fallback = periodFor(latest, MONTHLY)
    expect(fallback.label).toBe('August 2026')

    const paid = WEEKS
      .map((w) => hoursInPeriod(w, fallback, 'SPLIT'))
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .reduce((sum, h) => sum + h.hours, 0)

    expect(paid).toBe(160)
    expect(paid).not.toBe(200)
  })
})

describe('an hour is paid at the rate in force when it was worked', () => {
  const rise = [
    { id: 'r1', rateCents: 8500, fromDate: d('2026-03-01'), toDate: d('2026-07-31'), approvalState: 'APPROVED' },
    { id: 'r2', rateCents: 9500, fromDate: d('2026-08-01'), toDate: null, approvalState: 'APPROVED' },
  ]

  it('pays July at July’s rate and August at August’s', () => {
    // Gross pay used the candidate's rate as it stands today, so a rise
    // agreed in August silently repaid every hour worked since March.
    expect(rateInForce(9500, rise, d('2026-07-15')).rateCents).toBe(8500)
    expect(rateInForce(9500, rise, d('2026-08-15')).rateCents).toBe(9500)
  })

  it('ignores a rise nobody has approved yet', () => {
    const pending = [
      { id: 'r3', rateCents: 12000, fromDate: d('2026-08-01'), toDate: null, approvalState: 'PENDING' },
    ]
    expect(rateInForce(9500, pending, d('2026-08-15')).rateCents).toBe(9500)
  })

  it('falls back to the contract rate before any history starts', () => {
    expect(rateInForce(8000, rise, d('2026-01-15')).rateCents).toBe(8000)
  })
})
