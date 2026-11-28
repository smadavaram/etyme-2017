import { describe, it, expect } from 'vitest'
import {
  periodFor, periodsBetween, isAPeriod, hoursInPeriod, collect,
  endOfMonth, daysInMonth, iso, billingStraddle,
  type Terms, type Sheet, type Period, type Straddle,
} from '@/lib/periods'

/**
 * The contract says what a period is. The timesheet does not.
 *
 * Invoice generation took the timesheets it was about to bill, found the
 * earliest, and called that the start of the period. Four weekly sheets
 * ending on the 3rd, 10th, 17th and 24th of August produced an invoice for
 * "28 July to 24 August" — a period in no contract, matching no purchase
 * order window, reconciling against nothing on the client's side.
 *
 * A contract that bills monthly bills for the month. How the hours arrived
 * is the consultant's business and the approver's; it changes nothing
 * about what is billed or when.
 */

function terms(over: Partial<Terms> = {}): Terms {
  return {
    frequency: 'MONTHLY',
    anchor: 'CALENDAR',
    straddle: 'SPLIT',
    startedOn: new Date('2026-03-12T00:00:00Z'),
    ...over,
  }
}

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('a calendar month', () => {
  it('runs the 1st to the last day', () => {
    const p = periodFor(d('2026-08-17'), terms())
    expect(iso(p.start)).toBe('2026-08-01')
    expect(iso(p.end)).toBe('2026-08-31')
    expect(p.label).toBe('August 2026')
  })

  it('is thirty days in September and thirty-one in August', () => {
    expect(daysInMonth(d('2026-09-10'))).toBe(30)
    expect(daysInMonth(d('2026-08-10'))).toBe(31)
  })

  it('is twenty-eight in February, and twenty-nine when it is not', () => {
    expect(daysInMonth(d('2026-02-10'))).toBe(28)
    expect(daysInMonth(d('2028-02-10'))).toBe(29)
  })

  it('handles the first and last day of a month without falling into the next one', () => {
    expect(iso(periodFor(d('2026-08-01'), terms()).start)).toBe('2026-08-01')
    expect(iso(periodFor(d('2026-08-31'), terms()).end)).toBe('2026-08-31')
    expect(periodFor(d('2026-08-31'), terms()).label).toBe('August 2026')
  })

  it('crosses a year end', () => {
    const p = periodFor(d('2026-12-31'), terms())
    expect(iso(p.end)).toBe('2026-12-31')
    expect(iso(periodFor(d('2027-01-01'), terms()).start)).toBe('2027-01-01')
  })
})

describe('a month anchored to the contract instead of the calendar', () => {
  const anniversary = terms({ anchor: 'CONTRACT', startedOn: d('2026-03-12') })

  it('runs the 12th to the 11th when the contract started on the 12th', () => {
    const p = periodFor(d('2026-08-20'), anniversary)
    expect(iso(p.start)).toBe('2026-08-12')
    expect(iso(p.end)).toBe('2026-09-11')
  })

  it('puts a date before the anchor day into the previous period', () => {
    const p = periodFor(d('2026-08-05'), anniversary)
    expect(iso(p.start)).toBe('2026-07-12')
    expect(iso(p.end)).toBe('2026-08-11')
  })

  it('starts on the last day a short month has, for a contract that began on the 31st', () => {
    // There is no 31st of September. Every payroll system in the world
    // uses the 30th, and so does a person.
    const thirtyFirst = terms({ anchor: 'CONTRACT', startedOn: d('2026-01-31') })
    const p = periodFor(d('2026-09-15'), thirtyFirst)
    expect(iso(p.start)).toBe('2026-08-31')
    expect(iso(p.end)).toBe('2026-09-29')
  })

  it('does not lose a day at the end of February', () => {
    const thirtyFirst = terms({ anchor: 'CONTRACT', startedOn: d('2026-01-31') })
    const p = periodFor(d('2026-03-01'), thirtyFirst)
    expect(iso(p.start)).toBe('2026-02-28')
    expect(iso(p.end)).toBe('2026-03-30')
  })
})

describe('semi-monthly', () => {
  const semi = terms({ frequency: 'SEMIMONTHLY' })

  it('runs the 1st to the 15th', () => {
    const p = periodFor(d('2026-08-09'), semi)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-08-01', '2026-08-15'])
    expect(p.label).toBe('1–15 August 2026')
  })

  it('runs the 16th to the end of the month, whatever the end is', () => {
    expect(iso(periodFor(d('2026-08-20'), semi).end)).toBe('2026-08-31')
    expect(iso(periodFor(d('2026-09-20'), semi).end)).toBe('2026-09-30')
    expect(iso(periodFor(d('2026-02-20'), semi).end)).toBe('2026-02-28')
  })

  it('puts the 15th and the 16th in different halves', () => {
    expect(iso(periodFor(d('2026-08-15'), semi).end)).toBe('2026-08-15')
    expect(iso(periodFor(d('2026-08-16'), semi).start)).toBe('2026-08-16')
  })
})

describe('weekly and fortnightly, Sunday to Saturday', () => {
  // Decided 2026-10-06. Wednesday 2 September 2026; the Sunday before is 30 August.
  const fortnightly = terms({ frequency: 'BIWEEKLY', startedOn: d('2026-09-02') })

  it('a biweekly pay period is two Sunday-to-Saturday weeks ending on a Saturday', () => {
    const p = periodFor(d('2026-09-20'), fortnightly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-09-13', '2026-09-26'])
    expect(p.start.getUTCDay()).toBe(0)
    expect(p.end.getUTCDay()).toBe(6)
    const next = periodFor(d('2026-09-27'), fortnightly)
    expect([iso(next.start), iso(next.end)]).toEqual(['2026-09-27', '2026-10-10'])
  })

  it('a contract starting midweek has a short first period that still ends on a Saturday', () => {
    const p = periodFor(d('2026-09-02'), fortnightly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-09-02', '2026-09-12'])
    expect(p.end.getUTCDay()).toBe(6)
    // Every day of the short period finds the same period.
    expect(iso(periodFor(d('2026-09-12'), fortnightly).start)).toBe('2026-09-02')
    expect(iso(periodFor(d('2026-09-13'), fortnightly).start)).toBe('2026-09-13')
  })

  it('a weekly pay period is the Sunday-to-Saturday week', () => {
    const weekly = terms({ frequency: 'WEEKLY', startedOn: d('2026-09-02') })
    const p = periodFor(d('2026-09-09'), weekly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-09-06', '2026-09-12'])
    const first = periodFor(d('2026-09-03'), weekly)
    expect([iso(first.start), iso(first.end)]).toEqual(['2026-09-02', '2026-09-05'])
  })

  it('days before the contract start sit in a period of their own, so no two periods overlap', () => {
    const p = periodFor(d('2026-08-31'), fortnightly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-08-30', '2026-09-01'])
    const before = periodFor(d('2026-08-20'), fortnightly)
    expect([iso(before.start), iso(before.end)]).toEqual(['2026-08-16', '2026-08-29'])
  })

  it('a contract starting on a Sunday has no short period', () => {
    const p = periodFor(d('2026-09-08'), terms({ frequency: 'BIWEEKLY', startedOn: d('2026-09-06') }))
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-09-06', '2026-09-19'])
  })

  it('listing the fortnights from a midweek start leaves no gap and no overlap', () => {
    const ps = periodsBetween(d('2026-09-02'), d('2026-10-31'), fortnightly)
    expect(ps.map((p) => `${iso(p.start)}..${iso(p.end)}`)).toEqual([
      '2026-09-02..2026-09-12', '2026-09-13..2026-09-26', '2026-09-27..2026-10-10',
      '2026-10-11..2026-10-24', '2026-10-25..2026-11-07',
    ])
  })
})

describe('listing the periods over a span', () => {
  it('gives every month in a quarter, back to back with no gap', () => {
    const ps = periodsBetween(d('2026-06-01'), d('2026-08-31'), terms())
    expect(ps.map((p) => p.label)).toEqual(['June 2026', 'July 2026', 'August 2026'])
    expect(iso(ps[0].end)).toBe('2026-06-30')
    expect(iso(ps[1].start)).toBe('2026-07-01')
  })

  it('stops rather than spinning on a bad end date', () => {
    expect(periodsBetween(d('2026-01-01'), d('2999-01-01'), terms()).length).toBe(400)
  })
})

describe('is this a period the contract recognizes', () => {
  it('accepts a real calendar month', () => {
    expect(isAPeriod(d('2026-08-01'), d('2026-08-31'), terms())).toBe(true)
  })

  it('rejects the span an invoice invents from its timesheets', () => {
    // "28 July to 24 August" — the four-weekly-timesheets case, and the
    // whole reason this file exists.
    expect(isAPeriod(d('2026-07-28'), d('2026-08-24'), terms())).toBe(false)
  })

  it('rejects a month that stops a day short', () => {
    expect(isAPeriod(d('2026-08-01'), d('2026-08-30'), terms())).toBe(false)
  })
})

// ── Hours, irrespective of how the timesheet arrived ─────────────────

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: 'ts1',
    periodStart: d('2026-08-03'),
    periodEnd: d('2026-08-09'),
    days: {
      '2026-08-03': 8, '2026-08-04': 8, '2026-08-05': 8,
      '2026-08-06': 8, '2026-08-07': 8,
    },
    totalHours: 40,
    ...over,
  }
}

const AUGUST: Period = { start: d('2026-08-01'), end: d('2026-08-31'), label: 'August 2026' }
const JULY: Period = { start: d('2026-07-01'), end: d('2026-07-31'), label: 'July 2026' }

describe('a timesheet that sits inside the period', () => {
  it('contributes all its hours, and is not a part-period line', () => {
    const h = hoursInPeriod(sheet(), AUGUST, 'SPLIT')!
    expect(h.hours).toBe(40)
    expect(h.partial).toBe(false)
    expect(h.note).toBeNull()
  })

  it('contributes nothing to a period it does not touch', () => {
    expect(hoursInPeriod(sheet(), JULY, 'SPLIT')).toBeNull()
  })
})

describe('a week that straddles the month end', () => {
  // Monday 27 July to Sunday 2 August: four working days in July, one in
  // August. This is the ordinary case, not the edge one.
  const straddler = sheet({
    id: 'ts-straddle',
    periodStart: d('2026-07-27'),
    periodEnd: d('2026-08-02'),
    days: {
      '2026-07-27': 8, '2026-07-28': 8, '2026-07-29': 8, '2026-07-30': 8,
      '2026-07-31': 8,
    },
    totalHours: 40,
  })

  it('splits by day, because the hours are recorded by day', () => {
    // Nothing apportioned, estimated or rounded. The days are read.
    const july = hoursInPeriod(straddler, JULY, 'SPLIT')!
    expect(july.hours).toBe(40)
    expect(july.partial).toBe(true)
    expect(july.note).toBe('5 days of a timesheet running 2026-07-27 to 2026-08-02')
  })

  it('gives August the days that fall in August', () => {
    const august = hoursInPeriod(
      { ...straddler, days: { ...straddler.days, '2026-08-01': 4 }, totalHours: 44 },
      AUGUST,
      'SPLIT'
    )!
    expect(august.hours).toBe(4)
    expect(august.partial).toBe(true)
  })

  it('never bills the same hour twice across the two periods', () => {
    const withBoth = {
      ...straddler,
      days: { ...straddler.days, '2026-08-01': 4, '2026-08-02': 2 },
      totalHours: 46,
    }
    const july = hoursInPeriod(withBoth, JULY, 'SPLIT')!
    const august = hoursInPeriod(withBoth, AUGUST, 'SPLIT')!
    expect(july.hours + august.hours).toBe(withBoth.totalHours)
  })

  it('can be told to move the whole thing to where it ends instead', () => {
    // Some clients will not accept a part-week line. That is a setting,
    // not a bug. Saturday 1 August carries hours, so the week ends in August.
    const withSaturday = { ...straddler, days: { ...straddler.days, '2026-08-01': 4 }, totalHours: 44 }
    expect(hoursInPeriod(withSaturday, JULY, 'END')).toBeNull()
    const august = hoursInPeriod(withSaturday, AUGUST, 'END')!
    expect(august.hours).toBe(44)
    expect(august.note).toMatch(/billed where its last worked day falls/)
  })

  it('or to where it starts', () => {
    const july = hoursInPeriod(straddler, JULY, 'START')!
    expect(july.hours).toBe(40)
    expect(hoursInPeriod(straddler, AUGUST, 'START')).toBeNull()
  })

  it('will not divide a total by seven when there is no daily breakdown', () => {
    // That looks exact and is a guess. It bills the whole thing where it
    // ends and says why.
    const noDays = { ...straddler, days: {} }
    const august = hoursInPeriod(noDays, AUGUST, 'SPLIT')!
    expect(august.hours).toBe(40)
    expect(august.partial).toBe(false)
    expect(august.note).toMatch(/no daily hours recorded/)
  })
})

/**
 * Decided 2026-10-06: START and END judge a week by the days that carry
 * hours, never by an empty Sunday or Saturday at its edge.
 */
describe('a week judged by its hours, not its empty edges', () => {
  const SEPTEMBER: Period = { start: d('2026-09-01'), end: d('2026-09-30'), label: 'September 2026' }
  const OCTOBER: Period = { start: d('2026-10-01'), end: d('2026-10-31'), label: 'October 2026' }

  it('under START a week bills where its first worked day falls, never on an empty Sunday', () => {
    // Sunday 30 August to Saturday 5 September, hours 1 to 4 September.
    const week = sheet({
      id: 'ts-empty-sunday',
      periodStart: d('2026-08-30'),
      periodEnd: d('2026-09-05'),
      days: { '2026-09-01': 8, '2026-09-02': 8, '2026-09-03': 8, '2026-09-04': 8 },
      totalHours: 32,
    })
    expect(hoursInPeriod(week, AUGUST, 'START')).toBeNull()
    const september = hoursInPeriod(week, SEPTEMBER, 'START')!
    expect(september.hours).toBe(32)
    expect(september.note).toMatch(/first worked day/)
  })

  it('under END a week bills where its last worked day falls, never on an empty Saturday', () => {
    // Sunday 27 September to Saturday 3 October, hours 28 to 30 September.
    const week = sheet({
      id: 'ts-empty-saturday',
      periodStart: d('2026-09-27'),
      periodEnd: d('2026-10-03'),
      days: { '2026-09-28': 8, '2026-09-29': 8, '2026-09-30': 8 },
      totalHours: 24,
    })
    expect(hoursInPeriod(week, OCTOBER, 'END')).toBeNull()
    expect(hoursInPeriod(week, SEPTEMBER, 'END')!.hours).toBe(24)
  })

  it('a week with hours on both sides of a month end still goes whole to the month its first (START) or last (END) worked day is in', () => {
    // Monday 31 August in August, Tuesday to Friday in September.
    const week = sheet({
      id: 'ts-both-sides',
      periodStart: d('2026-08-30'),
      periodEnd: d('2026-09-05'),
      days: { '2026-08-31': 9, '2026-09-01': 9, '2026-09-02': 9, '2026-09-03': 9, '2026-09-04': 9 },
      totalHours: 45,
    })
    expect(hoursInPeriod(week, AUGUST, 'START')!.hours).toBe(45)
    expect(hoursInPeriod(week, SEPTEMBER, 'START')).toBeNull()
    expect(hoursInPeriod(week, AUGUST, 'END')).toBeNull()
    expect(hoursInPeriod(week, SEPTEMBER, 'END')!.hours).toBe(45)
  })
})

/**
 * What a BILL can do with a straddling week, as opposed to what the
 * arithmetic can do with it.
 *
 * Splitting a week by day is exact. It is also unwritable: `InvoiceLine`
 * is unique on `(timesheetId, sellContractId)` — "one timesheet bills
 * once, ever", in the schema's own words, because it is the whole
 * anti-double-billing control — so the minority days of a straddling
 * week have no second line to go on, and no earlier invoice is coming
 * for them. Nine of Omar Haddad's hours were on no document at all
 * before this, at $1,188 on one week.
 */
describe('the straddle a bill can actually record', () => {

  it('the straddle a bill can record is named, and splitting a week by day is not one of them', () => {
    // Each of the three is a real answer to "what happens to a week that
    // crosses the boundary". Only two of them can be written down.
    const recordable: Straddle[] = ['END', 'START']
    for (const straddle of recordable) {
      expect(billingStraddle(straddle).straddle, straddle).toBe(straddle)
      expect(billingStraddle(straddle).instead, straddle).toBeNull()
    }

    expect(billingStraddle('SPLIT').straddle).toBe('END')
  })

  it('a document that asks for a week to be split is told which answer was used instead, and why', () => {
    const asked = billingStraddle('SPLIT')
    expect(asked.instead).toContain('one week bills once per contract')
    expect(asked.instead).toContain('billed in the period its last worked day falls in')
  })

  it('the week goes to the period it ends in rather than the one it starts in, so no client is billed for work nobody has done yet', () => {
    // A week beginning 29 September under START would reach the September
    // invoice with four unworked days on it. END never bills ahead of the
    // work, and that is the money reason the fallback is END.
    expect(billingStraddle('SPLIT').straddle).not.toBe('START')
  })

  it('asking how many hours of a week fall in a month still splits them by day, because a report is not a bill', () => {
    // `hoursInPeriod` answers a question. A report, a tenure count or a
    // spend-by-month panel may ask it and get the exact answer; nothing
    // there is constrained by how many lines an invoice may carry.
    const week = sheet({
      id: 'ts-report',
      periodStart: new Date('2026-08-31T00:00:00Z'),
      periodEnd: new Date('2026-09-04T00:00:00Z'),
      days: {
        '2026-08-31': 9, '2026-09-01': 9, '2026-09-02': 9,
        '2026-09-03': 9, '2026-09-04': 9,
      },
      totalHours: 45,
    })
    const august = hoursInPeriod(week, periodFor(new Date('2026-08-15T00:00:00Z'), terms()), 'SPLIT')!
    const september = hoursInPeriod(week, periodFor(new Date('2026-09-15T00:00:00Z'), terms()), 'SPLIT')!
    expect(august.hours).toBe(9)
    expect(september.hours).toBe(36)
    expect(august.partial).toBe(true)
  })
})

describe('a month billed from however many timesheets it arrived in', () => {
  it('gives the same answer for four weekly sheets as for one monthly one', () => {
    // This is the whole point: irrespective of whether the timesheet is
    // weekly.
    const weekly = [
      sheet({ id: 'w1', periodStart: d('2026-08-03'), periodEnd: d('2026-08-09'),
              days: { '2026-08-03': 8, '2026-08-04': 8, '2026-08-05': 8, '2026-08-06': 8, '2026-08-07': 8 }, totalHours: 40 }),
      sheet({ id: 'w2', periodStart: d('2026-08-10'), periodEnd: d('2026-08-16'),
              days: { '2026-08-10': 8, '2026-08-11': 8, '2026-08-12': 8, '2026-08-13': 8, '2026-08-14': 8 }, totalHours: 40 }),
      sheet({ id: 'w3', periodStart: d('2026-08-17'), periodEnd: d('2026-08-23'),
              days: { '2026-08-17': 8, '2026-08-18': 8, '2026-08-19': 8, '2026-08-20': 8, '2026-08-21': 8 }, totalHours: 40 }),
      sheet({ id: 'w4', periodStart: d('2026-08-24'), periodEnd: d('2026-08-30'),
              days: { '2026-08-24': 8, '2026-08-25': 8, '2026-08-26': 8, '2026-08-27': 8, '2026-08-28': 8 }, totalHours: 40 }),
    ]

    const monthly = [
      sheet({ id: 'm1', periodStart: d('2026-08-01'), periodEnd: d('2026-08-31'),
              days: {}, totalHours: 160 }),
    ]

    expect(collect(weekly, AUGUST, 'SPLIT').totalHours).toBe(160)
    expect(collect(monthly, AUGUST, 'SPLIT').totalHours).toBe(160)
  })

  it('says what it did, including how many lines were part-period', () => {
    const sheets = [
      sheet({ id: 'a' }),
      sheet({ id: 'b', periodStart: d('2026-07-27'), periodEnd: d('2026-08-02'),
              days: { '2026-08-01': 4, '2026-07-31': 8 }, totalHours: 12 }),
    ]
    expect(collect(sheets, AUGUST, 'SPLIT').says).toBe(
      '44h for August 2026, from 2 timesheets, 1 of them part-period.'
    )
  })

  it('says so plainly when a period has nothing in it', () => {
    expect(collect([sheet()], JULY, 'SPLIT').says).toBe('Nothing approved for July 2026.')
  })

  it('leaves out a timesheet that contributes no hours to this period', () => {
    const outside = sheet({
      id: 'none', periodStart: d('2026-07-27'), periodEnd: d('2026-08-02'),
      days: { '2026-07-27': 8, '2026-07-28': 8 }, totalHours: 16,
    })
    expect(collect([outside], AUGUST, 'SPLIT').lines).toHaveLength(0)
  })
})

describe('period boundaries do not move with whoever is reading them', () => {
  it('is the same period whatever time of day the date carries', () => {
    // A boundary that shifts with a timezone puts the same hour in two
    // months depending on who opened the screen.
    const morning = periodFor(new Date('2026-08-01T00:30:00Z'), terms())
    const night = periodFor(new Date('2026-08-31T23:30:00Z'), terms())
    expect(morning.label).toBe('August 2026')
    expect(night.label).toBe('August 2026')
  })

  it('reports the last day of the month as a date, not a timestamp', () => {
    expect(iso(endOfMonth(d('2026-02-10')))).toBe('2026-02-28')
  })
})
