/**
 * Holidays on the bench, as bench profit counts them and as a row on Our
 * bench shows them (CLAUDE.md, the bench section: "Holidays on the bench
 * are a company setting, off by default", 2026-10-03).
 *
 * The rule is money's (`holidayPayFor`, `benchDays`, `benchCost` in
 * lib/bench-policy) and the door is the architect's
 * (/api/settings/bench/people). This file proves that bench profit counts
 * through them rather than beside them, and that the switch on a row says
 * the rule's own words.
 *
 * The week used is the one money's tests use: Thanksgiving, Thursday 26
 * November 2026. Somebody whose last day was Friday 20 November and who
 * is still on the bench on Monday 30 November has six weekdays on the
 * bench, one a holiday.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { costOfDays, moveSaving, benchToBill, holidaySwitchView, type HolidayAnswerRow } from '@/lib/bench-profit'
import { mayChangeBenchPay } from '@/lib/bench-holiday-switch'
import type { Policy } from '@/lib/bench-policy'
import { usFederalHolidays } from '@/lib/holidays'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const US_2026 = new Set(usFederalHolidays(2026).map((h) => h.date))
const SINCE = D('2026-11-20')
const NOW = D('2026-11-30')
const HALF: Policy = { policy: 'REDUCED_RATE', benchRateBps: 5_000 }
const PAY = 6_400 // $64 an hour: $512 a day, $256 at half pay
const base = { days: 10, since: SINCE, policy: HALF, payRateCents: PAY, contractType: 'W2', currency: 'USD' }

describe('Bench profit counts a public holiday through the one count', () => {
  it('a holiday the firm does not pay comes off a person’s bench cost, and the line says how many were not paid', () => {
    const c = costOfDays({ ...base, holidayPay: { paid: false, calendar: US_2026 } })
    // Six weekdays after 20 November, Thanksgiving not paid: five at $256.
    expect(c.costCents).toBe(5 * 25_600)
    expect(c.counted).toBe('5 working days of 10 at 50% of $512.00 a day, 1 public holiday not paid')
    expect(c.says).toBe('5 working days of 10 at 50% of $512.00 a day, 1 public holiday not paid, under your bench pay policy: $1,280.00.')
  })

  it('a holiday the firm pays for this person stays in their bench cost, and nothing is said about it', () => {
    const c = costOfDays({ ...base, holidayPay: { paid: true, calendar: US_2026 } })
    expect(c.costCents).toBe(6 * 25_600)
    expect(c.counted).toBe('6 working days of 10 at 50% of $512.00 a day')
  })

  it('with no holiday answer the bench profit cost is what it was before', () => {
    const c = costOfDays(base)
    expect(c.costCents).toBe(6 * 25_600)
    expect(c.counted).toBe('6 working days of 10 at 50% of $512.00 a day')
  })

  it('with no first bench day a holiday that is not paid is said to be counted, never guessed out', () => {
    const c = costOfDays({ ...base, since: null, holidayPay: { paid: false, calendar: US_2026 } })
    expect(c.says).toContain('could not be taken out, so they are counted')
  })

  it('bench to bill carries the holiday answer to the cost on a person’s row', () => {
    const spell = { kind: 'NOW' as const, from: SINCE, to: NOW, days: 10, startsOn: null }
    const row = benchToBill({
      spell, policy: HALF, payRateCents: PAY, contractType: 'W2', currency: 'USD', earned: null,
      holidayPay: { paid: false, calendar: US_2026 },
    })
    expect(row.costCents).toBe(5 * 25_600)
    expect(row.leftCents).toBe(5 * 25_600)
  })

  it('the days between two projects of an internal move count a holiday the same way', () => {
    const m = moveSaving({
      oldEndsOn: SINCE, newStartsOn: NOW, policy: HALF, payRateCents: PAY, contractType: 'W2', currency: 'USD',
      holidayPay: { paid: false, calendar: US_2026 },
    })
    expect(m.gapDays).toBe(10)
    expect(m.gapCostCents).toBe(5 * 25_600)
  })
})

const answer = (a: Partial<HolidayAnswerRow> & Pick<HolidayAnswerRow, 'source' | 'says'>): HolidayAnswerRow => ({
  paid: false, turned: null, ...a,
})

describe('The holiday switch on a row of Our bench', () => {
  it('an integrator’s row reads on by default and offers to switch the person off', () => {
    const v = holidaySwitchView(answer({ paid: true, source: 'INTEGRATOR_DEFAULT', says: 'Paid for holidays: on for everybody here' }))
    expect(v).toMatchObject({ label: 'On by default', turnTo: false, button: 'Switch off' })
    expect(v.says).toBe('Paid for holidays: on for everybody here')
  })

  it('a person switched on reads who switched them on and when, and offers to switch them off', () => {
    const v = holidaySwitchView(answer({
      paid: true, source: 'PERSON_ON', says: 'Paid for holidays: switched on by Rahul, Oct 3',
      turned: 'Switched on by Rahul, Oct 3, 2026',
    }))
    expect(v).toMatchObject({ label: 'Paid', says: 'Paid for holidays: switched on by Rahul, Oct 3', turnTo: false, button: 'Switch off' })
  })

  it('a bench supplier’s row reads not paid while the firm has holiday pay off, and still lets a desk switch the person on ahead of it', () => {
    const v = holidaySwitchView(answer({ source: 'FIRM_OFF', says: 'Holidays not paid (off for this firm)' }))
    expect(v).toMatchObject({ label: 'Off for the firm', says: 'Holidays not paid (off for this firm)', turnTo: true, button: 'Switch on' })
  })

  it('somebody switched on while the firm has it off reads both, and the button switches them off again', () => {
    const v = holidaySwitchView(answer({
      source: 'FIRM_OFF', says: 'Holidays not paid (off for this firm)', turned: 'Switched on by Rahul, Oct 3, 2026',
    }))
    expect(v.says).toBe('Holidays not paid (off for this firm). Switched on by Rahul, Oct 3, 2026 for them, ready for when the firm turns it on.')
    expect(v).toMatchObject({ turnTo: false, button: 'Switch off' })
  })

  it('a person switched off at a firm that pays holidays reads not paid and offers to switch them on', () => {
    const v = holidaySwitchView(answer({ source: 'PERSON_OFF', says: 'Holidays not paid: switched off by Asha, Oct 3' }))
    expect(v).toMatchObject({ label: 'Not paid', turnTo: true, button: 'Switch on' })
  })

  it('the holiday switch is drawn only for the owner, the admin and the finance desk of a firm with a bench', () => {
    const seat = (roleName: string | null, companyKind = 'VENDOR') =>
      mayChangeBenchPay({ companyName: 'Pellwright', companyKind, roleName, consultantSeat: false }).ok
    expect(seat('Owner')).toBe(true)
    expect(seat('Admin')).toBe(true)
    expect(seat('Finance')).toBe(true)
    expect(seat('Finance', 'GSI')).toBe(true)
    expect(seat('Recruiter')).toBe(false)
    expect(seat('HR')).toBe(false)
    expect(seat('Owner', 'CLIENT')).toBe(false)
    expect(mayChangeBenchPay({ companyName: 'x', companyKind: 'VENDOR', roleName: 'Owner', consultantSeat: true }).ok).toBe(false)

    // Both screens draw the switch behind that rule and nothing looser.
    for (const f of ['src/app/dashboard/bench/page.tsx', 'src/app/dashboard/bench/bench-profit.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).toContain('mayChangeBenchPay(')
      expect(src, f).toContain('HolidaySwitchCell')
    }
  })
})
