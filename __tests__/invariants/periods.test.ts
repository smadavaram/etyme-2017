import { describe, it, expect } from 'vitest'
import {
  periodFor, periodsBetween, isAPeriod, hoursInPeriod, collect,
  endOfMonth, daysInMonth, iso,
  type Terms, type Sheet, type Period,
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

describe('weekly and fortnightly, counted from the contract', () => {
  const fortnightly = terms({ frequency: 'BIWEEKLY', startedOn: d('2026-08-05') })

  it('pays Wednesday to Tuesday forever when the contract began on a Wednesday', () => {
    // Snapping to Mondays instead would silently pay somebody thirteen
    // days one time.
    const p = periodFor(d('2026-08-10'), fortnightly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-08-05', '2026-08-18'])
  })

  it('rolls into the next fortnight on the right day, not a day early', () => {
    expect(iso(periodFor(d('2026-08-18'), fortnightly).start)).toBe('2026-08-05')
    expect(iso(periodFor(d('2026-08-19'), fortnightly).start)).toBe('2026-08-19')
  })

  it('works backwards from the start date too', () => {
    const p = periodFor(d('2026-08-01'), fortnightly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-07-22', '2026-08-04'])
  })

  it('does a week the same way', () => {
    const weekly = terms({ frequency: 'WEEKLY', startedOn: d('2026-08-03') })
    const p = periodFor(d('2026-08-07'), weekly)
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-08-03', '2026-08-09'])
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

describe('is this a period the contract recognises', () => {
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
    // not a bug.
    expect(hoursInPeriod(straddler, JULY, 'END')).toBeNull()
    const august = hoursInPeriod(straddler, AUGUST, 'END')!
    expect(august.hours).toBe(40)
    expect(august.note).toMatch(/billed where it ends/)
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
