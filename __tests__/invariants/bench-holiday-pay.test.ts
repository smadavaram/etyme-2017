/**
 * Holidays on the bench are a company setting, off by default.
 *
 * The founder, 2026-10-03: "A company setting, defaulting to no-pay, and
 * each candidate needs to be activated. GSI companies do autopay."
 *
 * Until this, `benchCost` and `burnOf` counted every public holiday as a
 * paid day for everybody (flagged in 0d3ee4195). Now whether a holiday is
 * paid is `holidayPayFor`'s answer — the firm's setting and the person's
 * switch — and every bench figure counts it through `benchDays`.
 *
 * The week used: Thanksgiving, Thursday 26 November 2026. Somebody whose
 * last billed day was Friday 20 November and who is still on the bench
 * on Monday 30 November has six weekdays on the bench, one a holiday.
 */

import { describe, it, expect } from 'vitest'
import {
  benchCost, benchDays, burnOf, holidayPayFor, latestSwitch,
  type HolidaySwitch, type Policy,
} from '@/lib/bench-policy'
import { usFederalHolidays } from '@/lib/holidays'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const US_2026 = new Set(usFederalHolidays(2026).map((h) => h.date))
const SINCE = D('2026-11-20')
const NOW = D('2026-11-30')
const IDLE = 10
const PAY = 6_400 // $64 an hour, $512 a day
const DAY = 51_200
const FULL: Policy = { policy: 'FULL_PAY' }

const rahul = (paid: boolean, at = '2026-10-03'): HolidaySwitch => ({ paid, byName: 'Rahul', at: D(at) })

describe('Who is paid for a holiday on the bench', () => {
  it('a bench supplier pays no holiday unless it turned holiday pay on and switched that person on', () => {
    // Nothing set: off for the firm.
    const nothing = holidayPayFor({ companyKind: 'VENDOR', firm: null, person: null })
    expect(nothing.paid).toBe(false)
    expect(nothing.source).toBe('FIRM_OFF')
    expect(nothing.says).toBe('Holidays not paid (off for this firm)')

    // Switched on for the person, but the firm never turned it on.
    const personOnly = holidayPayFor({ companyKind: 'VENDOR', firm: null, person: rahul(true) })
    expect(personOnly.paid).toBe(false)

    // The firm turned it on, and nobody switched this person on.
    const firmOnly = holidayPayFor({ companyKind: 'VENDOR', firm: rahul(true), person: null })
    expect(firmOnly.paid).toBe(false)
    expect(firmOnly.source).toBe('NOT_SWITCHED_ON')

    // Both.
    const both = holidayPayFor({ companyKind: 'VENDOR', firm: rahul(true), person: rahul(true) })
    expect(both.paid).toBe(true)
    expect(both.says).toBe('Paid for holidays: switched on by Rahul, Oct 3')
  })

  it('an integrator pays its people for holidays without anybody switching them on', () => {
    const a = holidayPayFor({ companyKind: 'GSI', firm: null, person: null })
    expect(a.paid).toBe(true)
    expect(a.firmPays).toBe(true)
    expect(a.source).toBe('INTEGRATOR_DEFAULT')
  })

  it('an integrator can switch one person off', () => {
    const off = holidayPayFor({ companyKind: 'GSI', firm: null, person: rahul(false) })
    expect(off.paid).toBe(false)
    expect(off.says).toBe('Holidays not paid: switched off by Rahul, Oct 3')
    // and the next person at the same firm is still paid
    expect(holidayPayFor({ companyKind: 'GSI', firm: null, person: null }).paid).toBe(true)
  })

  it('an integrator that turns holiday pay off for the firm pays nobody for a holiday, whoever was switched on', () => {
    const a = holidayPayFor({ companyKind: 'GSI', firm: rahul(false), person: rahul(true) })
    expect(a.paid).toBe(false)
    expect(a.firmSays).toBe('Holidays not paid (turned off for this firm by Rahul, Oct 3)')
  })

  it('the latest turn of a switch is the one in force, and the earlier turns stay as its history', () => {
    const turns = [rahul(true, '2026-10-01'), { paid: false, byName: 'Asha', at: D('2026-10-03') }, rahul(true, '2026-10-02')]
    const now = latestSwitch(turns)!
    expect(now.paid).toBe(false)
    expect(now.byName).toBe('Asha')
    expect(latestSwitch([])).toBeNull()
  })
})

describe('Counting a holiday on the bench', () => {
  it('a holiday the firm does not pay is taken out of the paid bench days, and one it pays is left in', () => {
    const notPaid = benchDays(SINCE, NOW, { paid: false, calendar: US_2026 })
    expect(notPaid).toEqual({ weekdays: 6, holidays: 1, paidDays: 5 })
    const paid = benchDays(SINCE, NOW, { paid: true, calendar: US_2026 })
    expect(paid.paidDays).toBe(6)
  })

  it('a holiday on another country’s calendar is not taken out, because the calendar passed is the site’s', () => {
    // India's calendar has no 26 November.
    const india = new Set(['2026-10-02', '2026-08-15', '2026-01-26'])
    expect(benchDays(SINCE, NOW, { paid: false, calendar: india }).paidDays).toBe(6)
  })

  it('bench cost and burn agree on a holiday', () => {
    for (const paid of [true, false]) {
      const holidayPay = { paid, calendar: US_2026 }
      const cost = benchCost(FULL, { idleDays: IDLE, since: SINCE, billingDayRateCents: DAY, holidayPay })
      const burn = burnOf({ payRateCents: PAY, billing: false, benchSince: SINCE, holidayPay }, NOW)
      expect(cost.paidWorkingDays).toBe(burn.workingDays)
      expect(cost.costCents).toBe(burn.toDateCents)
      expect(cost.paidWorkingDays).toBe(paid ? 6 : 5)
    }
  })

  // Bench profit prices its days through `benchCost` (`costOfDays` in
  // lib/bench-profit), so it agrees the moment it passes the holiday answer
  // through. That file is etyme-supply's and does not pass it yet.
  it.todo('bench profit counts a holiday the same way, once lib/bench-profit passes holidayPay to benchCost (etyme-supply)')

  it('the bench cost says how many public holidays it did not pay', () => {
    const c = benchCost(FULL, { idleDays: IDLE, since: SINCE, billingDayRateCents: DAY, holidayPay: { paid: false, calendar: US_2026 } })
    expect(c.holidays).toBe('NOT_PAID')
    expect(c.holidaysOnBench).toBe(1)
    expect(c.costCents).toBe(5 * DAY)
    expect(c.says).toContain('1 public holiday not paid.')
  })

  it('the burn names the unpaid holiday beside the working days', () => {
    const b = burnOf({ payRateCents: PAY, billing: false, benchSince: SINCE, holidayPay: { paid: false, calendar: US_2026 } }, NOW)
    expect(b.holidaysNotPaid).toBe(1)
    expect(b.says).toBe('5 working days (10 calendar days, 1 public holiday not paid) at $512.00 a day.')
  })

  it('a holiday is only taken out inside the carry limit, because days past it are not paid at all', () => {
    // Carried four calendar days from Fri 20 Nov: Mon 23 and Tue 24 — before Thanksgiving.
    const c = benchCost({ policy: 'FULL_PAY', carryDays: 4 }, {
      idleDays: IDLE, since: SINCE, billingDayRateCents: DAY, holidayPay: { paid: false, calendar: US_2026 },
    })
    expect(c.paidWorkingDays).toBe(2)
    expect(c.holidaysOnBench).toBe(0)
  })

  it('without a holiday answer the bench cost counts holidays as paid days and says nobody asked', () => {
    const c = benchCost(FULL, { idleDays: IDLE, since: SINCE, billingDayRateCents: DAY })
    expect(c.paidWorkingDays).toBe(6)
    expect(c.holidays).toBe('NOT_ASKED')
  })

  it('a firm that does not pay holidays, with no first bench day to place them on, is told they could not be taken out rather than given a guess', () => {
    const c = benchCost(FULL, { idleDays: IDLE, billingDayRateCents: DAY, holidayPay: { paid: false, calendar: US_2026 } })
    expect(c.holidays).toBe('NOT_KNOWN')
    expect(c.counted).toBe('ESTIMATED')
    expect(c.says).toContain('could not be taken out')
  })
})
