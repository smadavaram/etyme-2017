import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  periodHolding, periodsAround, periodsPayingBetween, periodAfter, periodBefore, paysByPeriod,
  periodWords, periodShownSays, calendarMonthSays, nothingToPaySays, payFileCsv, payFileName,
  isDayKey, PAY_FILE_NOTE, PAY_FILE_COLUMNS, WHERE_FIRST_DAY_IS_SET, type PayFileRow,
} from '@/lib/money/pay-periods'
import { DEFAULT_PAY_RHYTHM, checkFirstPeriodStart, type PayRhythm } from '@/lib/pay-dates'
import { shiftToWorkingDay, localDayKey, DEFAULT_CYCLE_SHIFT } from '@/lib/cycle-shift'
import { holidayKeysFrom } from '@/lib/holidays'
import { payFileHref } from '@/lib/money/payroll-rows'

/**
 * The company's own pay periods on the Payroll page (2026-11-14). The
 * founder, for Tapin: "W2 first, outside payroll provider, biweekly". He
 * has not said which Sunday the first period starts on, so every case
 * runs for each of the three he may choose.
 *
 * Calendar facts used: Dec 6, 13, 20 and 27, 2026 are Sundays; Dec 25,
 * 2026 and Jan 1, 2027 are Fridays.
 */

const SUNDAYS = ['2026-12-06', '2026-12-13', '2026-12-27'] as const
const HOLIDAYS = ['2026-12-25', '2027-01-01']

const biweekly = (first: string | null): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: [28], payFirstPeriodStart: first })
const weekly = (first: string | null): PayRhythm => ({ ...biweekly(first), payPeriod: 'WEEKLY' })

const DAY = 86_400_000
const plus = (k: string, n: number) => new Date(Date.parse(`${k}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const weekday = (k: string) => new Date(`${k}T00:00:00Z`).getUTCDay()
const daysIn = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY + 1
/** The one rule every pay date follows, asked directly: lib/cycle-shift. */
const oneRule = (k: string, holidays: string[] = HOLIDAYS, direction = DEFAULT_CYCLE_SHIFT.pay, daysOff?: number[]) => {
  const [y, m, d] = k.split('-').map(Number)
  return localDayKey(shiftToWorkingDay(new Date(y, m - 1, d), new Set(holidays), direction, daysOff))
}

const zone = process.env.TZ
afterEach(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

for (const first of SUNDAYS) {
  describe(`with the first pay period starting on ${first}`, () => {
    const r = biweekly(first)

    it('a two-week period runs fourteen days from a Sunday to a Saturday and never splits a week', () => {
      for (let i = -40; i <= 40; i++) {
        const day = plus(first, i)
        const p = periodHolding(day, r)!
        expect(weekday(p.start), p.start).toBe(0)
        expect(weekday(p.end), p.end).toBe(6)
        expect(daysIn(p.start, p.end)).toBe(14)
        // Every day of the day's own week is in the same period.
        const sunday = plus(day, -weekday(day))
        for (let k = 0; k < 7; k++) expect(periodHolding(plus(sunday, k), r)!.start).toBe(p.start)
      }
      expect(periodHolding(first, r)!).toMatchObject({ start: first, end: plus(first, 13) })
    })

    it('the week before the first period falls in the period before it', () => {
      const firstPeriod = periodHolding(first, r)!
      const before = periodHolding(plus(first, -7), r)!
      expect(before).toMatchObject({ start: plus(first, -14), end: plus(first, -1) })
      expect(periodBefore(firstPeriod, r).start).toBe(before.start)
      expect(periodAfter(before, r).start).toBe(first)
    })

    it('a pay day is the period’s Saturday plus the company’s offset, moved by the one rule when it lands on a day off', () => {
      for (let n = -3; n <= 3; n++) {
        const p = periodHolding(plus(first, 14 * n), r, { holidays: HOLIDAYS })!
        expect(p.payOnUnmoved).toBe(plus(p.end, r.payDayOffsetDays))
        expect(p.calcOnUnmoved).toBe(plus(p.end, r.payCalcOffsetDays))
        expect(p.payOn).toBe(oneRule(p.payOnUnmoved))
        expect(p.calcOn).toBe(oneRule(p.calcOnUnmoved))
      }
      // A company that takes Fridays off: the Friday pay day is its day off,
      // and the one rule moves it to the Thursday.
      const fridayOff = { daysOff: [5, 6], holidays: [] as string[] }
      const p = periodHolding(first, r, fridayOff)!
      expect(p.payOn).toBe(oneRule(p.payOnUnmoved, [], 'BEFORE', [5, 6]))
      expect(weekday(p.payOn)).toBe(4)
    })

    it('a period that ends on 2026-12-19 or 2026-12-26 pays on the day the one rule gives for a Friday that is a public holiday', () => {
      const ends = [-3, -2, -1, 0, 1].map((n) => periodHolding(plus(first, 14 * n), r, { holidays: HOLIDAYS })!)
      const p = ends.find((x) => x.end === '2026-12-19' || x.end === '2026-12-26')!
      expect(p, 'one period in this family ends on Dec 19 or Dec 26').toBeTruthy()
      // Its Friday pay day is Christmas Day or New Year's Day.
      expect(HOLIDAYS).toContain(p.payOnUnmoved)
      expect(weekday(p.payOnUnmoved)).toBe(5)
      // The one rule, with the company's default direction (the working day
      // before): Thursday Dec 24, 2026 for Christmas, Thursday Dec 31, 2026
      // for New Year's Day.
      expect(p.payOn).toBe(oneRule(p.payOnUnmoved))
      expect(weekday(p.payOn)).toBe(4)
      // With the working day after, the next Monday; left where it falls, on the holiday.
      expect(periodHolding(p.start, r, { holidays: HOLIDAYS, direction: 'AFTER' })!.payOn).toBe(oneRule(p.payOnUnmoved, HOLIDAYS, 'AFTER'))
      expect(periodHolding(p.start, r, { holidays: HOLIDAYS, direction: 'NONE' })!.payOn).toBe(p.payOnUnmoved)
      // A holiday nobody put on the company's calendar moves nothing.
      expect(periodHolding(p.start, r)!.payOn).toBe(p.payOnUnmoved)
    })

    it('a year’s end does not break a period', () => {
      // Dec 31, 2026 is a Thursday, so the period holding it also holds
      // New Year's Day and runs into January.
      const p = periodHolding('2026-12-31', r)!
      expect(p.start <= '2026-12-31').toBe(true)
      expect(p.end >= '2027-01-02').toBe(true)
      expect(daysIn(p.start, p.end)).toBe(14)
      expect(weekday(p.start)).toBe(0)
      expect(weekday(p.end)).toBe(6)
      expect(periodHolding('2027-01-01', r)!.start).toBe(p.start)
      // The periods on either side meet with no gap and no overlap.
      expect(periodAfter(p, r).start).toBe(plus(p.end, 1))
      expect(periodBefore(p, r).end).toBe(plus(p.start, -1))
      // The first period of 2027 still counts from the Owner's Sunday.
      expect((Date.parse(`${periodHolding('2027-01-10', r)!.start}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY % 14).toBe(0)
    })

    it('a weekly company’s periods are seven days', () => {
      const w = weekly(first)
      for (let i = -20; i <= 20; i++) {
        const p = periodHolding(plus(first, i), w)!
        expect(daysIn(p.start, p.end)).toBe(7)
        expect(weekday(p.start)).toBe(0)
        expect(p.payOnUnmoved).toBe(plus(p.end, 6))
      }
    })

    it('a first day that is not a Sunday is refused naming its weekday', () => {
      const monday = plus(first, 1)
      const r1 = checkFirstPeriodStart(monday)
      expect(r1.ok).toBe(false)
      expect(!r1.ok && r1.message).toMatch(/ is a Monday\. A pay period starts on a Sunday: pick /)
      // A first day that is not a Sunday lists nothing by period.
      expect(paysByPeriod(biweekly(monday))).toBe(false)
      expect(periodHolding(monday, biweekly(monday))).toBeNull()
    })

    it('the picker lists the current period first, then the next, then the earlier ones newest first', () => {
      const list = periodsAround('2026-12-30', r, {}, { earlier: 3, later: 1 })!
      const current = periodHolding('2026-12-30', r)!
      expect(list.map((p) => p.start)).toEqual([
        current.start, plus(current.start, 14), plus(current.start, -14), plus(current.start, -28), plus(current.start, -42),
      ])
    })

    it('the periods paying in a window are each period whose moved pay day falls in it, oldest first', () => {
      const due = periodsPayingBetween('2026-12-01', '2027-01-31', r, { holidays: HOLIDAYS })
      expect(due.length).toBeGreaterThanOrEqual(4)
      for (const p of due) expect(p.payOn >= '2026-12-01' && p.payOn <= '2027-01-31').toBe(true)
      for (let i = 1; i < due.length; i++) expect(due[i].start).toBe(plus(due[i - 1].start, 14))
      // A pay day moved back across the month's edge counts in the month it moved to.
      const jan = periodsPayingBetween('2027-01-01', '2027-01-31', r, { holidays: HOLIDAYS })
      expect(jan.every((p) => p.payOn >= '2027-01-01')).toBe(true)
    })
  })
}

describe('what a payroll person reads about the period', () => {
  const r = biweekly('2026-12-06')
  const p = periodHolding('2026-12-06', r, { holidays: HOLIDAYS })!

  it('a period on the picker reads its two dates and its pay day', () => {
    expect(periodWords(p)).toBe(`Dec 6 – Dec 19, 2026 · paid Thu, Dec 24, 2026`)
  })

  it('the period shown says how often the company pays, the period, its work-out day and its pay day, and the day the pay day moved from', () => {
    expect(periodShownSays('Tapin', r, p)).toBe(
      'Tapin pays every other week. This period is Dec 6 – Dec 19, 2026. ' +
      'Its pay is worked out Wed, Dec 23, 2026 and paid Thu, Dec 24, 2026. ' +
      'It moved from Fri, Dec 25, 2026, a day off or a holiday.',
    )
  })

  it('a two-week company with no first day is told the page lists by calendar month and where the Owner sets the day', () => {
    expect(calendarMonthSays('Tapin', biweekly(null))).toBe(
      "Tapin pays every other week, but this page lists pay by calendar month until the first pay period's first day is set. " +
      WHERE_FIRST_DAY_IS_SET,
    )
    expect(WHERE_FIRST_DAY_IS_SET).toBe('The Owner sets it in Settings, under Cycles, then Payroll: "First pay period starts on".')
  })

  it('a company that pays twice a month or once a month keeps the calendar month, with nothing to set', () => {
    expect(calendarMonthSays('Tapin', { ...biweekly('2026-12-06'), payPeriod: 'MONTHLY' })).toBe('Tapin pays once a month, so this page lists pay by calendar month.')
    expect(paysByPeriod({ ...biweekly('2026-12-06'), payPeriod: 'SEMIMONTHLY', payDaysOfMonth: [15, 28] })).toBe(false)
  })

  it('a period that holds nothing to pay says so and offers nothing to run', () => {
    expect(nothingToPaySays(p)).toBe('Nothing is owed for Dec 6 – Dec 19, 2026. No accepted hours fall in it, so there is nothing to work out or pay.')
  })

  it('the line beside the pay file says the payroll provider holds the W-4, bank details and tax number, and the file carries hours and gross pay', () => {
    expect(PAY_FILE_NOTE).toBe('Your payroll provider collects each person’s W-4, bank details and tax number. This file carries hours and gross pay.')
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/payroll/page.tsx'), 'utf8')
    expect(page).toContain('{payFileNote}')
    const route = readFileSync(join(process.cwd(), 'src/app/api/payroll/route.ts'), 'utf8')
    expect(route).toContain('payFileNote: PAY_FILE_NOTE')
  })

  it('every sentence a payroll person reads here is under twenty-five words and says neither desk nor program office', () => {
    const said = [
      periodShownSays('Tapin', r, p), calendarMonthSays('Tapin', biweekly(null)), nothingToPaySays(p), PAY_FILE_NOTE,
    ]
    for (const text of said) {
      for (const sentence of text.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(25)
      }
      expect(text).not.toMatch(/\bdesk\b|program office/i)
    }
  })

  it('no time zone moves a period or its pay day', () => {
    const want = periodHolding('2026-12-13', biweekly('2026-12-13'), { holidays: HOLIDAYS })
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz
      expect(periodHolding('2026-12-13', biweekly('2026-12-13'), { holidays: HOLIDAYS }), tz).toEqual(want)
      expect(periodsAround(new Date('2026-12-20T00:00:00Z'), biweekly('2026-12-13'), { holidays: HOLIDAYS })![0], tz).toEqual(want)
    }
  })
})

describe('the pay file for one period carries the row’s own figures', () => {
  const p = periodHolding('2026-12-06', biweekly('2026-12-06'), { holidays: HOLIDAYS })!
  const rows: PayFileRow[] = [
    {
      person: { name: 'Marisol Quintero' }, totalApprovedHours: 80, payRate: 5_000,
      rates: [{ rateCents: 4_500, hours: 56 }, { rateCents: 5_000, hours: 24 }],
      overtimeHours: 0, premiumCents: 0, grossPay: 372_000, payCurrency: 'USD', payStatus: 'PENDING',
    },
    { person: { name: 'Lee, Ana' }, totalApprovedHours: 42, payRate: 4_000, overtimeHours: 2, premiumCents: 4_000, grossPay: 172_000, payCurrency: 'USD', payStatus: 'CALCULATED' },
    { person: { name: 'Nobody This Period' }, totalApprovedHours: 0, payRate: 4_000, grossPay: 0, payCurrency: 'USD', payStatus: 'NO_HOURS' },
  ]
  const [head, ...lines] = payFileCsv(rows, p).trim().split('\n')

  it('the pay file’s figures are the row’s figures: name, hours, rate and gross pay in dollars, with the period’s two dates and pay day', () => {
    expect(head).toBe(PAY_FILE_COLUMNS.join(','))
    expect(head).toBe('Name,Hours,Pay rate,Overtime hours,Overtime premium,Gross pay,Paid already,Currency,Period start,Period end,Pay day,Status')
    expect(lines[0]).toBe('Marisol Quintero,80,45.00 for 56 hours; 50.00 for 24 hours,0,0.00,3720.00,0.00,USD,2026-12-06,2026-12-19,2026-12-24,Not worked out yet')
    expect(lines[1]).toBe('"Lee, Ana",42,40.00,2,40.00,1720.00,0.00,USD,2026-12-06,2026-12-19,2026-12-24,"Worked out, not paid"')
  })

  it('a person with no hours in the period is not on the pay file', () => {
    expect(lines).toHaveLength(2)
    expect(lines.join('\n')).not.toContain('Nobody This Period')
  })

  it('the pay file is named by the period it pays, and the button for a pay period asks the payroll page for it', () => {
    expect(payFileName(p)).toBe('payroll-2026-12-06-to-2026-12-19.csv')
    expect(payFileHref('2026-12-06')).toBe('/api/payroll?period=2026-12-06&format=csv')
    expect(payFileHref('2026-12')).toBe('/api/payroll/export?provider=GENERIC&format=csv&from=2026-12-01&to=2026-12-31')
    expect(isDayKey('2026-12-06')).toBe(true)
    expect(isDayKey('2026-02-30')).toBe(false)
    expect(isDayKey('2026-12')).toBe(false)
  })
})

describe('a holiday that comes back every year is the same calendar day in every time zone', () => {
  const christmas = [{ date: new Date('2025-12-25T00:00:00.000Z'), isRecurring: true, country: null }]

  it('Christmas on the calendar as a yearly holiday is December 25 in every year, wherever the server runs', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz
      const keys = holidayKeysFrom(christmas, 2026, 2027)
      expect([...keys].sort(), tz).toEqual(['2025-12-25', '2026-12-25', '2027-12-25'])
    }
  })

  it('a yearly holiday on February 29 is kept only in a year that has one, never moved to March 1', () => {
    const leap = [{ date: new Date('2028-02-29T00:00:00.000Z'), isRecurring: true, country: null }]
    expect([...holidayKeysFrom(leap, 2027, 2029)].sort()).toEqual(['2028-02-29'])
  })

  it('so a pay day on a yearly Christmas is moved in every time zone', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata']) {
      process.env.TZ = tz
      const keys = [...holidayKeysFrom(christmas, 2026, 2027)]
      // Fri Dec 25, 2026 moves back to Thu Dec 24, read through the one rule.
      expect(periodHolding('2026-12-06', biweekly('2026-12-06'), { holidays: keys })!.payOn, tz).toBe(oneRule('2026-12-25', ['2026-12-25']))
    }
  })
})
