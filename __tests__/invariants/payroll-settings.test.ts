import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_PAY_RHYTHM,
  PAY_BEFORE_WORKED_OUT,
  PAY_PERIOD_WORDS,
  STATE_PAY_NOTE,
  checkPaySettings,
  paySettingsFrom,
  payDatesFor,
  payDatesInMonth,
  type PayRhythm,
} from '@/lib/payroll-settings'
import { offsetWords, payPreview, rhythmFrom } from '@/lib/pay-dates'

/**
 * Payroll is the company's choice. The founder, 2026-10-07: "Give choice
 * to businesses when they want to configure payroll." The pack's rhythm
 * is the default and a company may change it.
 *
 * Every date is a real day: 10 October 2026 is a Saturday.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const key = (d: Date) => d.toISOString().slice(0, 10)
const keys = (p: { calcOn: Date; payOn: Date }) => ({ calcOn: key(p.calcOn), payOn: key(p.payOn) })

const ok = (r: ReturnType<typeof checkPaySettings>): PayRhythm => {
  if (!r.ok) throw new Error(r.message)
  return r.rhythm
}

describe('payroll is the company’s choice', () => {
  it('a company with nothing set pays every other week, worked out the Wednesday and paid the Friday after the period’s Saturday', () => {
    const s = paySettingsFrom(null)
    expect(s).toMatchObject({ payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, setAt: null, setById: null })
    const dates = payDatesFor(utc(2026, 10, 10), s)
    expect(keys(dates)).toEqual({ calcOn: '2026-10-14', payOn: '2026-10-16' })
    expect(dates.calcOn.getUTCDay()).toBe(3)
    expect(dates.payOn.getUTCDay()).toBe(5)
  })

  it('a company may pay monthly on the 28th and work it out on the 25th', () => {
    const s = ok(checkPaySettings({ payPeriod: 'MONTHLY', payDaysOfMonth: [28], payCalcDaysBefore: 3 }))
    // 28 means month end, as in the cycle generator; worked out on the
    // 25th of every month, which is today's pack.
    expect(keys(payDatesFor(utc(2026, 10, 31), s))).toEqual({ calcOn: '2026-10-25', payOn: '2026-10-31' })
    expect(payDatesInMonth(2027, 2, s).map(keys)).toEqual([{ calcOn: '2027-02-25', payOn: '2027-02-28' }])
    expect(payDatesInMonth(2026, 9, s).map(keys)).toEqual([{ calcOn: '2026-09-25', payOn: '2026-09-30' }])
  })

  it('a company may pay twice a month on the 15th and the 28th', () => {
    const s = ok(checkPaySettings({ payPeriod: 'SEMIMONTHLY', payDaysOfMonth: [28, 15] }))
    expect(s.payDaysOfMonth).toEqual([15, 28])
    expect(payDatesInMonth(2026, 10, s).map(keys)).toEqual([
      { calcOn: '2026-10-12', payOn: '2026-10-15' },
      { calcOn: '2026-10-25', payOn: '2026-10-31' },
    ])
    expect(keys(payDatesFor(utc(2026, 10, 15), s))).toEqual({ calcOn: '2026-10-12', payOn: '2026-10-15' })
    // A period ending after the last pay day of December is paid in January.
    expect(keys(payDatesFor(utc(2027, 1, 1), s)).payOn).toBe('2027-01-15')
  })

  it('twice a month needs two pay days and once a month needs one', () => {
    const two = checkPaySettings({ payPeriod: 'SEMIMONTHLY' })
    expect(two).toMatchObject({ ok: false, field: 'payDaysOfMonth' })
    expect(!two.ok && two.message).toContain('two different pay days')
    expect(checkPaySettings({ payPeriod: 'MONTHLY', payDaysOfMonth: [15, 28] })).toMatchObject({ ok: false, field: 'payDaysOfMonth' })
  })

  it('every week and every other week ignore the days of the month', () => {
    const r = checkPaySettings({ payPeriod: 'WEEKLY', payDaysOfMonth: [40, 2, 3] })
    expect(r.ok).toBe(true)
    expect(r.ok && r.changed).toEqual(['payPeriod'])
    expect(r.ok && r.rhythm.payDaysOfMonth).toEqual([28])
  })

  it('pay cannot go out before it is worked out, and the refusal says so', () => {
    const r = checkPaySettings({ payCalcOffsetDays: 6, payDayOffsetDays: 4 })
    expect(r).toEqual({ ok: false, field: 'payDayOffsetDays', message: PAY_BEFORE_WORKED_OUT })
    expect(PAY_BEFORE_WORKED_OUT).toBe('Pay cannot go out before it is worked out.')
    // The same day is allowed.
    expect(checkPaySettings({ payCalcOffsetDays: 6, payDayOffsetDays: 6 }).ok).toBe(true)
  })

  it('a day of month past the 28th is refused, because every month has a 28th', () => {
    const r = checkPaySettings({ payPeriod: 'MONTHLY', payDaysOfMonth: [31] })
    expect(r).toMatchObject({ ok: false, field: 'payDaysOfMonth' })
    expect(!r.ok && r.message).toContain('every month has a 28th')
    expect(checkPaySettings({ payPeriod: 'MONTHLY', payDaysOfMonth: [0] }).ok).toBe(false)
  })

  it('a pay period that is not one of the four, and an offset past thirty days, are refused in sentences', () => {
    const p = checkPaySettings({ payPeriod: 'DAILY' })
    expect(p).toMatchObject({ ok: false, field: 'payPeriod' })
    expect(!p.ok && p.message).toBe('Pay is run every week, every other week, twice a month or once a month.')
    expect(checkPaySettings({ payDayOffsetDays: 31 })).toMatchObject({ ok: false, field: 'payDayOffsetDays' })
    expect(checkPaySettings({ payCalcOffsetDays: -1 })).toMatchObject({ ok: false, field: 'payCalcOffsetDays' })
    expect(checkPaySettings({ payCalcDaysBefore: 1.5 })).toMatchObject({ ok: false, field: 'payCalcDaysBefore' })
  })

  it('a stored answer the door would refuse reads as the default, never as a pay day nobody chose', () => {
    expect(rhythmFrom({ payPeriod: 'FORTNIGHTLY' })).toEqual({ ...DEFAULT_PAY_RHYTHM })
    expect(rhythmFrom({ payPeriod: 'BIWEEKLY', payCalcOffsetDays: 9, payDayOffsetDays: 2 })).toEqual({ ...DEFAULT_PAY_RHYTHM })
  })

  it('who changed payroll and when is recorded', () => {
    const at = new Date('2026-10-07T15:00:00Z')
    const s = paySettingsFrom({ payPeriod: 'WEEKLY', paySettingsSetAt: at, paySettingsSetById: 'person-1' })
    expect(s).toMatchObject({ payPeriod: 'WEEKLY', setAt: at, setById: 'person-1' })
    const door = readFileSync(join(process.cwd(), 'src/lib/payroll-settings.ts'), 'utf8')
    expect(door).toMatch(/paySettingsSetAt: new Date\(\)/)
    expect(door).toMatch(/paySettingsSetById: byId/)
  })

  it('the settings screen shows the week and payroll in the trade’s words and previews the next dates', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/settings/page.tsx'), 'utf8')
    for (const words of [
      'title="Your week"', 'Days off', 'Hours due', 'Approved by', 'Give approvers one extra week',
      'title="Payroll"', 'Pay period', 'Worked out on', 'Paid on', 'Pay day', 'Worked out',
    ]) {
      expect(page, words).toContain(words)
    }
    expect(page).toContain("fetch('/api/settings/week'")
    expect(page).toContain("fetch('/api/settings/payroll'")
    expect(page).toContain('{STATE_PAY_NOTE}')
    expect(page).toContain('payPreview(')
    // Above the weekend-and-holiday section, in that order.
    const tab = page.slice(page.indexOf('function CyclesTab'))
    const at = (s: string) => tab.indexOf(s)
    expect(at('<WeekPanel')).toBeGreaterThan(0)
    expect(at('<WeekPanel')).toBeLessThan(at('<PayrollPanel'))
    expect(at('<PayrollPanel')).toBeLessThan(at('<WeekendShiftPanel'))

    expect(Object.values(PAY_PERIOD_WORDS)).toEqual(['Every other week', 'Every week', 'Twice a month', 'Once a month'])
    expect(STATE_PAY_NOTE).toBe('Some US states require pay at least twice a month.')
    expect(offsetWords(4)).toBe('Wednesday after the period ends')
    expect(offsetWords(6)).toBe('Friday after the period ends')
    expect(offsetWords(11)).toBe('Wednesday, a week later')
    expect(payPreview(DEFAULT_PAY_RHYTHM, utc(2026, 10, 7)))
      .toBe('A period ending Sat, Oct 10 is worked out Wed, Oct 14 and paid Fri, Oct 16.')
    expect(payPreview(ok(checkPaySettings({ payPeriod: 'MONTHLY' })), utc(2026, 10, 7)))
      .toBe('The next pay day, Sat, Oct 31, is worked out Sun, Oct 25.')
  })
})
