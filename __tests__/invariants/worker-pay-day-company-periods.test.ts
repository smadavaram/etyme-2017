import { describe, it, expect } from 'vitest'
import {
  owedByWeek, workerPayDays, payCalendarWindow,
  type OwedSheet, type OwedPayLine, type PayDate,
} from '@/lib/consultant-portfolio'
import type { WageLine } from '@/lib/money/sheet-overtime'
import { workerPayCalendar, type PayRhythm } from '@/lib/money/pay-periods'
import { DEFAULT_PAY_RHYTHM } from '@/lib/pay-dates'
import type { Terms } from '@/lib/periods'

/**
 * The worker's own page reads her pay day by her employer's own pay
 * periods, the same day the Payroll page gives (found by hand, 2026-11-14:
 * her page read Jan 8 where Payroll read Dec 24).
 *
 * Calendar facts, worked by hand: Sunday Dec 6, 2026 starts the company's
 * first two-week period, which ends Saturday Dec 19. Its pay day is the
 * Saturday plus six days, Friday Dec 25. Christmas is a holiday, so the pay
 * day moves back to Thursday Dec 24. The next period, Dec 20 to Jan 2,
 * pays Friday Jan 8, 2027. Her own line was written to pay once a month,
 * and its own pay day for December is Friday Jan 8.
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DAY = 86_400_000
const plus = (s: string, n: number) => new Date(+d(s) + n * DAY).toISOString().slice(0, 10)

const TWO_WEEKS: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: '2026-12-06' }
const CHRISTMAS = { holidays: ['2026-12-25', '2027-01-01'], direction: 'BEFORE' as const, daysOff: [0, 6] }
const NO_HOLIDAYS = { holidays: [] as string[], direction: 'BEFORE' as const, daysOff: [0, 6] }
const WINDOW = { from: '2026-12-06', to: '2027-02-18' }

const W2: WageLine = {
  personName: 'Lena Brandt', contractType: 'W2', weAreTheEmployer: true, payModel: 'FIXED_HOURLY', rule: 'US_FLSA',
  assertion: {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'firm', assertedByCompanyName: 'Harbor Staffing',
    assertedByName: null, assertedAt: d('2026-12-01'), note: null, reviewBy: null,
  },
  contractPremiumBps: null, employerName: 'Harbor Staffing', cutOvertime: 'ABOVE_THE_LINE',
}

/** Eight hours on each day from `first` to `last`, accepted on the week's Saturday. */
function week(sunday: string, first: number, last: number, id: string): OwedSheet {
  const days: Record<string, number> = {}
  for (let i = first; i <= last; i++) days[plus(sunday, i)] = 8
  const hours = (last - first + 1) * 8
  return {
    id, days, leaveDays: {}, accepted: null, acceptedAt: d(plus(sunday, 6)), totalHours: hours,
    periodStart: d(sunday), periodEnd: d(plus(sunday, 6)),
  }
}

// Recorded on screen on Wed Dec 9: Wed to Fri of the week of Dec 6 (24
// hours) and Mon to Fri of the week of Dec 13 (40 hours), at $45 an hour.
const MID_PERIOD = [week('2026-12-06', 3, 5, 'ts1'), week('2026-12-13', 1, 5, 'ts2')]
const TODAY = d('2026-12-20')

// The line's own answer: once a month, from her own start.
const OWN_TERMS: Terms = { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: d('2026-12-09') }
const OWN_DATES: PayDate[] = [{ kind: 'SALARY_PAY', dueOn: d('2027-01-08'), completedAt: null }]

function priced(sheets: OwedSheet[], pay: { terms: Terms; payDates: PayDate[] }, employerName = 'Harbor Staffing') {
  const line: OwedPayLine = {
    contractRateCents: 4_500, periods: [], afterHours: 40, method: 'US_REGULAR_RATE',
    wage: { ...W2, employerName }, currency: 'USD', payDates: pay.payDates, terms: pay.terms,
  }
  return owedByWeek(sheets, line, () => undefined, TODAY)
}

const read = (sheets: OwedSheet[], own: { terms: Terms; payDates: PayDate[] }, rhythm: PayRhythm, rule: typeof CHRISTMAS, payrollPays = true) =>
  priced(sheets, workerPayDays(own, workerPayCalendar(rhythm, rule, own.terms.straddle, WINDOW), payrollPays))

describe('a W-2 worker reads the pay day her employer’s own pay periods give', () => {
  it('a line recorded on Wed Dec 9 reads Thu Dec 24 for the weeks of Dec 6 and Dec 13, because Fri Dec 25 is Christmas, never Jan 8', () => {
    const weeks = read(MID_PERIOD, { terms: OWN_TERMS, payDates: OWN_DATES }, TWO_WEEKS, CHRISTMAS)
    // 24 x $45 = $1,080 and 40 x $45 = $1,800.
    expect(weeks.map((w) => [w.weekOf, w.owedCents, w.dueOn])).toEqual([
      ['2026-12-13', 180_000, '2026-12-24'],
      ['2026-12-06', 108_000, '2026-12-24'],
    ])
    expect(weeks[0].says).toContain('It is due on your pay day, Dec 24.')
  })

  it('with no holiday on the calendar the same two weeks read Fri Dec 25, the period’s Saturday Dec 19 plus six days', () => {
    const weeks = read(MID_PERIOD, { terms: OWN_TERMS, payDates: OWN_DATES }, TWO_WEEKS, NO_HOLIDAYS)
    expect(weeks.map((w) => w.dueOn)).toEqual(['2026-12-25', '2026-12-25'])
  })

  it('before this change the same line read Jan 8 off its own monthly pay day, which is what was found by hand', () => {
    const weeks = priced(MID_PERIOD, { terms: OWN_TERMS, payDates: OWN_DATES })
    expect(weeks.map((w) => w.dueOn)).toEqual(['2027-01-08', '2027-01-08'])
  })

  it('an open-ended line with no pay dates written reads Dec 24, never “has not set a pay date for this week”', () => {
    const own = { terms: OWN_TERMS, payDates: [] as PayDate[] }
    expect(priced(MID_PERIOD, own)[0].says).toContain('Harbor Staffing has not set a pay date for this week.')
    const weeks = read(MID_PERIOD, own, TWO_WEEKS, CHRISTMAS)
    expect(weeks.map((w) => w.dueOn)).toEqual(['2026-12-24', '2026-12-24'])
    expect(weeks[0].says).not.toContain('has not set a pay date')
  })

  it('a line that ends Fri Dec 18 reads Dec 24 for its last two weeks, the same as one with no end date', () => {
    const ending: PayDate[] = [{ kind: 'SALARY_PAY', dueOn: d('2027-01-08'), completedAt: null }]
    const weeks = read(MID_PERIOD, { terms: OWN_TERMS, payDates: ending }, TWO_WEEKS, CHRISTMAS)
    expect(weeks.map((w) => w.dueOn)).toEqual(['2026-12-24', '2026-12-24'])
  })

  it('an awarded line starting Wed Dec 16, whose own fortnights count from Sun Dec 13, reads the company’s fortnights: Dec 24 for the week of Dec 13, Jan 8 for the week of Dec 20', () => {
    // Her own fortnight would be Dec 13 to Dec 26. The company's are Dec 6
    // to Dec 19 (paid Dec 24) and Dec 20 to Jan 2 (paid Fri Jan 8).
    const own = { terms: { frequency: 'BIWEEKLY', anchor: 'CONTRACT', straddle: 'SPLIT', startedOn: d('2026-12-16') } as Terms, payDates: [] as PayDate[] }
    const sheets = [week('2026-12-13', 3, 5, 'a1'), week('2026-12-20', 1, 4, 'a2')]
    const weeks = read(sheets, own, TWO_WEEKS, CHRISTMAS)
    // 24 x $45 = $1,080; 32 x $45 = $1,440.
    expect(weeks.map((w) => [w.weekOf, w.owedCents, w.dueOn])).toEqual([
      ['2026-12-20', 144_000, '2027-01-08'],
      ['2026-12-13', 108_000, '2026-12-24'],
    ])
  })
})

describe('where the company does not pay by its own periods, nothing changes', () => {
  const own = { terms: OWN_TERMS, payDates: OWN_DATES }

  it('a company that pays once a month keeps the line’s own pay day, Jan 8', () => {
    const weeks = read(MID_PERIOD, own, { ...DEFAULT_PAY_RHYTHM, payPeriod: 'MONTHLY' }, CHRISTMAS)
    expect(weeks.map((w) => w.dueOn)).toEqual(['2027-01-08', '2027-01-08'])
  })

  it('a company that has not said which Sunday its first pay period starts on keeps the line’s own pay day, Jan 8', () => {
    const weeks = read(MID_PERIOD, own, { ...TWO_WEEKS, payFirstPeriodStart: null }, CHRISTMAS)
    expect(weeks.map((w) => w.dueOn)).toEqual(['2027-01-08', '2027-01-08'])
  })

  it('a 1099 or corp-to-corp line, which payroll does not pay, keeps its own answer even where the company pays every other week', () => {
    const cal = workerPayCalendar(TWO_WEEKS, CHRISTMAS, 'SPLIT', WINDOW)
    expect(cal).not.toBeNull()
    expect(workerPayDays(own, cal, false)).toEqual({ ...own, from: 'LINE' })
  })
})

describe('a person with two employers reads each firm’s own pay days', () => {
  it('the week of Dec 6 is due Dec 24 from the firm paying every other week, and Fri Dec 18 from the firm paying every week', () => {
    // The weekly firm's period Dec 6 to Dec 12 pays Sat Dec 12 plus six, Fri Dec 18.
    const weekOf6 = [week('2026-12-06', 1, 5, 'x1')]
    const own = { terms: OWN_TERMS, payDates: OWN_DATES }
    const twoWeeks = priced(weekOf6, workerPayDays(own, workerPayCalendar(TWO_WEEKS, CHRISTMAS, 'SPLIT', WINDOW), true), 'Harbor Staffing')
    const weekly = priced(
      weekOf6,
      workerPayDays(own, workerPayCalendar({ ...TWO_WEEKS, payPeriod: 'WEEKLY' }, NO_HOLIDAYS, 'SPLIT', WINDOW), true),
      'Lakeside Care',
    )
    expect(twoWeeks[0].dueOn).toBe('2026-12-24')
    expect(weekly[0].dueOn).toBe('2026-12-18')
  })
})

describe('the days her page reads the company’s pay calendar across', () => {
  it('run from her earliest week, Dec 6, to sixty days past today, Dec 20, which is Feb 18, 2027', () => {
    expect(payCalendarWindow(MID_PERIOD, TODAY)).toEqual({ from: '2026-12-06', to: '2027-02-18' })
  })

  it('run to sixty days past her latest week where it ends after today: Sat Mar 6, 2027 plus sixty days is May 5', () => {
    expect(payCalendarWindow([...MID_PERIOD, week('2027-02-28', 1, 5, 'late')], TODAY)).toEqual({ from: '2026-12-06', to: '2027-05-05' })
  })

  it('are none where she has sent no week, so no calendar is read', () => {
    expect(payCalendarWindow([], TODAY)).toBeNull()
  })
})
