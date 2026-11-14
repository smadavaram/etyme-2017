import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { paySavedSays, shiftSavedSays } from '@/app/api/settings/payroll/saved-says'
import { noCalendarSays } from '@/app/api/settings/no-calendar'
import { holidaysAddedSays } from '@/app/api/settings/holidays/says'
import { DEFAULT_PAY_RHYTHM, type PayRhythm } from '@/lib/pay-dates'
import { holidaysFrom } from '@/lib/pay-dates'
import { usFederalHolidays } from '@/lib/holidays'

/**
 * The press-pay walk of 2026-11-14 (walkers tpe and tpf, "smaller"): three
 * sentences on Settings that were untrue or empty. Sentences only; no
 * date and no rule moved.
 */

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const sentences = (s: string) => s.split(/(?<=\.)\s+(?=[A-Z])/)
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const BIWEEKLY_FROM_OCT_11: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: '2026-10-11' }
const BIWEEKLY_NO_SUNDAY: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: null }
const MONTHLY: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'MONTHLY', payFirstPeriodStart: null }

describe('saving the payroll setting says what is true', () => {
  it('on a company that pays by its own periods, it says the Payroll page and each worker’s page use them now, and only dates already written keep theirs', () => {
    expect(paySavedSays(BIWEEKLY_FROM_OCT_11)).toBe(
      'Saved. The Payroll page and each worker’s own page use these pay periods now. ' +
      'Pay days already written on a placement’s “What is due” list keep their dates.'
    )
  })

  it('on a company listed by calendar month, it says placements recorded from now on take the new pay dates', () => {
    for (const r of [MONTHLY, BIWEEKLY_NO_SUNDAY]) {
      expect(paySavedSays(r)).toBe(
        'Saved. Placements recorded from now on take these pay dates. ' +
        'Pay days already written on a placement’s “What is due” list keep their dates.'
      )
    }
  })

  it('it never says the change applies only from the next contract', () => {
    for (const r of [BIWEEKLY_FROM_OCT_11, MONTHLY]) expect(paySavedSays(r)).not.toContain('next contract')
    expect(src('src/app/api/settings/payroll/route.ts')).toContain('paySavedSays(result.settings)')
    expect(src('src/app/api/settings/payroll/route.ts')).not.toContain('this applies from the next contract')
  })

  it('a change to which way pay days move off a day nobody works says the Payroll page follows it at once, where pay runs by the company’s own periods', () => {
    expect(shiftSavedSays({ payChanged: true, byPeriod: true })).toBe(
      'Saved. Dates already written on a placement’s “What is due” list keep their dates. ' +
      'Placements recorded from now on take the new rule. ' +
      'Pay days on the Payroll page and each worker’s own page move by it now.'
    )
    expect(shiftSavedSays({ payChanged: false, byPeriod: true })).not.toContain('Payroll page')
    expect(shiftSavedSays({ payChanged: true, byPeriod: false })).not.toContain('Payroll page')
    expect(src('src/app/api/settings/route.ts')).not.toContain('this applies from the next contract')
  })

  it('the Cycles panel under the day-off choices no longer says a change applies from the next contract', () => {
    const page = src('src/app/dashboard/settings/page.tsx')
    expect(page).toContain('Dates already written on a placement’s “What is due” list keep their dates. Placements recorded from now on take the new rule.')
    expect(page).not.toContain('A change here applies from the next contract.')
  })
})

describe('Settings, Cycles, with no calendar of its own, says what happens to a W-2 placement recorded by hand', () => {
  const base = { companyName: 'Brightmoor Staffing', fallbackLabel: 'US weekly hours, biweekly pay', offer: { id: 'US_IT', label: 'US weekly hours, biweekly pay' }, canEdit: true }

  it('where the first pay period Sunday is set, it says no bill date is set and the Payroll page still lists the W-2 worker in the company’s pay periods', () => {
    const said = noCalendarSays({ ...base, payroll: 'BY_PERIOD' }).says
    expect(said.slice(2, 5)).toEqual([
      'A placement recorded by hand, or a submission turned into a contract, gets no due dates.',
      'So no timesheet is due on it, and no bill date is set.',
      'The Payroll page still lists a W-2 worker on it in your own pay periods.',
    ])
    expect(said.join(' ')).not.toContain('no bill or pay date')
  })

  it('where the company pays every other week and the Sunday is not set, it says a W-2 placement cannot be recorded by hand until that box is set, by its label on the screen', () => {
    const said = noCalendarSays({ ...base, payroll: 'FIRST_DAY_NEEDED' }).says
    expect(said.slice(3, 5)).toEqual([
      'So no timesheet is due on it, and no bill or pay date is set.',
      'A W-2 placement cannot be recorded by hand until "The Sunday your pay periods are counted from" is set.',
    ])
  })

  it('where the company never chose its payroll, it says no pay date is set, as before', () => {
    const said = noCalendarSays({ ...base, payroll: 'NONE' }).says
    expect(said[3]).toBe('So no timesheet is due on it, and no bill or pay date is set.')
    expect(said).toHaveLength(5)
  })

  it('every sentence it says is under twenty-five words', () => {
    for (const p of ['BY_PERIOD', 'FIRST_DAY_NEEDED', 'NONE'] as const) {
      for (const s of noCalendarSays({ ...base, payroll: p }).says) expect(words(s)).toBeLessThan(25)
    }
  })

  it('Settings decides the case from the same readers the Payroll page and Record a placement use', () => {
    const route = src('src/app/api/settings/route.ts')
    expect(route).toContain('paysByPeriod(rhythmFrom(company))')
    expect(route).toContain('firstDayNeededSays({ payroll: true, chosen: chosenPayroll(company) })')
    expect(src('src/app/api/contracts/route.ts')).toContain('firstDayNeededSays(')
  })
})

describe('"Add US holidays for the rest of 2026" names the days it added', () => {
  // The rest of 2026 from Nov 14: Veterans Day (Nov 11) is gone, so two days remain.
  const offered = holidaysFrom(usFederalHolidays(2026), '2026-11-14').map((h) => ({ date: h.date, name: h.name }))
  const thanksgiving = offered.find((h) => h.date === '2026-11-26')!
  const christmas = offered.find((h) => h.date === '2026-12-25')!

  it('the rest of 2026 from Nov 14 is Thanksgiving Day on Nov 26 and Christmas Day on Dec 25', () => {
    expect(offered.map((h) => h.date)).toEqual(['2026-11-26', '2026-12-25'])
  })

  it('it answers "Added Thanksgiving Day, Nov 26, and Christmas Day, Dec 25." where both were new', () => {
    expect(holidaysAddedSays({ year: 2026, rest: true, offered, added: offered, payDaysOnAdded: [], payMoves: true }))
      .toBe(`Added ${thanksgiving.name}, Nov 26, and ${christmas.name}, Dec 25.`)
    expect(christmas.name).toBe('Christmas Day')
  })

  it('where one was already on the calendar, it names the one it added and the one that was there', () => {
    expect(holidaysAddedSays({ year: 2026, rest: true, offered, added: [christmas], payDaysOnAdded: [], payMoves: true }))
      .toBe(`Added Christmas Day, Dec 25. ${thanksgiving.name}, Nov 26 was already on your calendar.`)
  })

  it('where every day was there already, it says nothing was added and why', () => {
    expect(holidaysAddedSays({ year: 2026, rest: true, offered, added: [], payDaysOnAdded: [], payMoves: true }))
      .toBe('Nothing was added. Every public holiday for the rest of 2026 is already on your calendar.')
  })

  it('a whole year of eleven days is one short sentence naming the first and the last', () => {
    const year = usFederalHolidays(2027).map((h) => ({ date: h.date, name: h.name }))
    const said = holidaysAddedSays({ year: 2027, rest: false, offered: year, added: year, payDaysOnAdded: [], payMoves: true })
    expect(year).toHaveLength(11)
    expect(said).toBe(`Added 11 public holidays, from ${year[0].name}, Jan 1, to Christmas Day, Dec 25.`)
    expect(words(said)).toBeLessThan(25)
  })

  it('a pay day already written on a placement for Christmas Day is said, keeps its date, and the Owner is told to record holidays before placements', () => {
    const said = holidaysAddedSays({
      year: 2026, rest: true, offered, added: offered,
      payDaysOnAdded: [{ date: '2026-12-25', person: 'Marisol Quintero' }, { date: '2026-12-25', person: 'Marisol Quintero' }],
      payMoves: true,
    })
    expect(said).toBe(
      'Added Thanksgiving Day, Nov 26, and Christmas Day, Dec 25. ' +
      'Pay days already written for Marisol Quintero fall on Christmas Day, Dec 25, and keep their dates. ' +
      'Record holidays before you record a placement, and its pay days move off them.'
    )
    for (const s of sentences(said)) expect(words(s)).toBeLessThan(25)
  })

  it('a company that keeps pay days on a day off is not told they will move', () => {
    const said = holidaysAddedSays({
      year: 2026, rest: true, offered, added: offered,
      payDaysOnAdded: [{ date: '2026-11-26', person: 'Omar Haddad' }], payMoves: false,
    })
    expect(said).toContain('Pay days already written for Omar Haddad fall on Thanksgiving Day, Nov 26, and keep their dates.')
    expect(said).toContain('Your pay days are set to stay on a day off, so new ones do not move either.')
    expect(said).not.toContain('move off them')
  })

  it('a pay day on a day that was already on the calendar is not said, because nothing was just added there', () => {
    const said = holidaysAddedSays({
      year: 2026, rest: true, offered, added: [thanksgiving],
      payDaysOnAdded: [{ date: '2026-12-25', person: 'Marisol Quintero' }], payMoves: true,
    })
    expect(said).not.toContain('Marisol')
  })

  it('no year is left: it says so', () => {
    expect(holidaysAddedSays({ year: 2026, rest: true, offered: [], added: [], payDaysOnAdded: [], payMoves: true }))
      .toBe('No public holidays are left in 2026.')
  })

  it('the route moves no date: it writes holidays and reads pay days, and updates no cycle', () => {
    const route = src('src/app/api/settings/holidays/route.ts')
    expect(route).toContain('holidaysAddedSays(')
    expect(route).not.toMatch(/cycle\.(update|updateMany|delete|deleteMany|create)/)
  })
})
