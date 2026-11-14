import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_PAY_RHYTHM,
  FIRST_PERIOD_LABEL,
  FIRST_PERIOD_UNSET,
  PAY_CHANGE_FIELDS,
  checkFirstPeriodStart,
  checkPaySettings,
  firstPeriodSays,
  payPeriodHolding,
  payrollBody,
  rhythmFrom,
  type PayRhythm,
} from '@/lib/pay-dates'

/**
 * Where a company's first weekly or two-week pay period starts.
 *
 * The founder, 2026-11-14, for Tapin: "W2 first, outside payroll
 * provider, biweekly". The week runs Sunday to Saturday and hours are
 * accepted by the week, so a pay period is whole weeks from a Sunday the
 * Owner gives. He has not said which Sunday; every case covers all three
 * he may choose.
 *
 * Real days: Dec 6, 13 and 27, 2026 are Sundays; Dec 25, 2026 and
 * Jan 1, 2027 are Fridays.
 */

const SUNDAYS = ['2026-12-06', '2026-12-13', '2026-12-27'] as const

const biweekly = (first: string | null): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: [28], payFirstPeriodStart: first })
const weekly = (first: string | null): PayRhythm => ({ ...biweekly(first), payPeriod: 'WEEKLY' })
const HOLIDAYS = ['2026-12-25', '2027-01-01']

const zone = process.env.TZ
afterEach(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

describe('the first pay period starts on a Sunday the Owner gives', () => {
  it('each of the three Sundays the founder may choose is accepted as the first day', () => {
    for (const day of SUNDAYS) expect(checkFirstPeriodStart(day)).toEqual({ ok: true, day })
  })

  it('a day that is not a Sunday is refused in a sentence naming its weekday and offering the Sunday before and the Sunday after', () => {
    expect(checkFirstPeriodStart('2026-12-09')).toEqual({
      ok: false,
      field: 'payFirstPeriodStart',
      message: 'December 9, 2026 is a Wednesday. A pay period starts on a Sunday: pick December 6, 2026 or December 13, 2026.',
    })
    expect(checkFirstPeriodStart('2026-12-12')).toMatchObject({
      ok: false,
      message: 'December 12, 2026 is a Saturday. A pay period starts on a Sunday: pick December 6, 2026 or December 13, 2026.',
    })
  })

  it('a day just before the new year is offered the Sundays on either side of it, each with its own year', () => {
    expect(checkFirstPeriodStart('2026-12-30')).toMatchObject({
      ok: false,
      message: 'December 30, 2026 is a Wednesday. A pay period starts on a Sunday: pick December 27, 2026 or January 3, 2027.',
    })
  })

  it('a day that does not exist, or a box that is not a date, is refused rather than moved to another day', () => {
    for (const v of ['2026-02-30', '2026-13-01', 'next Sunday', 42]) {
      const r = checkFirstPeriodStart(v)
      expect(r.ok, String(v)).toBe(false)
      expect(!r.ok && r.message).toMatch(/^Enter the first pay period’s first day as a date/)
    }
  })

  it('the first day may be cleared, and an empty box clears it', () => {
    expect(checkFirstPeriodStart(null)).toEqual({ ok: true, day: null })
    expect(checkFirstPeriodStart('')).toEqual({ ok: true, day: null })
    const r = checkPaySettings({ payFirstPeriodStart: null }, biweekly('2026-12-06'))
    expect(r.ok && r.rhythm.payFirstPeriodStart).toBeNull()
    expect(r.ok && r.changed).toEqual(['payFirstPeriodStart'])
  })

  it('a refused first day is said by the payroll door and nothing else in the answer changes', () => {
    const r = checkPaySettings({ payPeriod: 'WEEKLY', payFirstPeriodStart: '2026-12-07' }, biweekly(null))
    expect(r).toMatchObject({ ok: false, field: 'payFirstPeriodStart' })
    expect(!r.ok && r.message).toContain('December 7, 2026 is a Monday.')
  })

  it('twice a month and once a month keep the first day they were given but never store a change to it', () => {
    const monthly = { ...biweekly('2026-12-06'), payPeriod: 'MONTHLY' as const }
    const r = checkPaySettings({ payFirstPeriodStart: '2026-12-13' }, monthly)
    expect(r.ok && r.changed).toEqual([])
    expect(r.ok && r.rhythm.payFirstPeriodStart).toBe('2026-12-06')
    expect(rhythmFrom({ payPeriod: 'MONTHLY', payFirstPeriodStart: new Date('2026-12-06T00:00:00Z') }).payFirstPeriodStart).toBe('2026-12-06')
  })

  it('a stored first day that is not a Sunday reads as never set, never as a period nobody chose', () => {
    expect(rhythmFrom({ payPeriod: 'BIWEEKLY', payFirstPeriodStart: new Date('2026-12-07T00:00:00Z') }).payFirstPeriodStart).toBeNull()
    expect(rhythmFrom({ payPeriod: 'BIWEEKLY', payFirstPeriodStart: new Date('2026-12-13T00:00:00Z') }).payFirstPeriodStart).toBe('2026-12-13')
    expect(rhythmFrom(null).payFirstPeriodStart).toBeNull()
  })
})

describe('the pay periods counted from that Sunday', () => {
  it('for each of the three Sundays, the first two-week period runs Sunday to the second Saturday, is worked out the Wednesday after and paid the Friday after', () => {
    const want = {
      '2026-12-06': { start: '2026-12-06', end: '2026-12-19', calcOn: '2026-12-23', payOn: '2026-12-25' },
      '2026-12-13': { start: '2026-12-13', end: '2026-12-26', calcOn: '2026-12-30', payOn: '2027-01-01' },
      '2026-12-27': { start: '2026-12-27', end: '2027-01-09', calcOn: '2027-01-13', payOn: '2027-01-15' },
    }
    for (const day of SUNDAYS) {
      expect(payPeriodHolding(day, biweekly(day)), day).toMatchObject(want[day])
    }
  })

  it('periods run forward and back from the first day without end, so a week worked before the first period still falls in a period', () => {
    for (const first of SUNDAYS) {
      const r = biweekly(first)
      const before = payPeriodHolding('2026-11-30', r)!
      const after = payPeriodHolding('2027-03-03', r)!
      for (const p of [before, after]) {
        const days = (Date.parse(p.start) - Date.parse(first)) / 86_400_000
        expect(Number.isInteger(days / 14), `${first}: ${p.start}`).toBe(true)
        expect(new Date(p.start).getUTCDay()).toBe(0)
        expect(new Date(p.end).getUTCDay()).toBe(6)
        expect((Date.parse(p.end) - Date.parse(p.start)) / 86_400_000).toBe(13)
      }
      expect(before.start <= '2026-11-30' && before.end >= '2026-11-30').toBe(true)
    }
    expect(payPeriodHolding('2026-11-30', biweekly('2026-12-06'))).toMatchObject({ start: '2026-11-22', end: '2026-12-05' })
    expect(payPeriodHolding('2026-11-30', biweekly('2026-12-13'))).toMatchObject({ start: '2026-11-29', end: '2026-12-12' })
    expect(payPeriodHolding('2026-11-30', biweekly('2026-12-27'))).toMatchObject({ start: '2026-11-29', end: '2026-12-12' })
  })

  it('a week belongs to the period that holds its Sunday, so no week is split between two periods', () => {
    for (const first of SUNDAYS) {
      for (let w = -6; w <= 6; w++) {
        const sunday = new Date(Date.parse(first) + w * 7 * 86_400_000)
        const ofSunday = payPeriodHolding(sunday, biweekly(first))!
        for (let d = 1; d <= 6; d++) {
          const day = new Date(sunday.getTime() + d * 86_400_000)
          expect(payPeriodHolding(day, biweekly(first))!.start, `${first} week ${w} day ${d}`).toBe(ofSunday.start)
        }
      }
    }
  })

  it('every week counts one-week periods from the first day, paid the Friday after each Saturday', () => {
    expect(payPeriodHolding('2026-12-16', weekly('2026-12-06'))).toMatchObject({
      start: '2026-12-13', end: '2026-12-19', calcOn: '2026-12-23', payOn: '2026-12-25',
    })
    expect(payPeriodHolding('2026-12-06', weekly('2026-12-27'))).toMatchObject({ start: '2026-12-06', end: '2026-12-12', payOn: '2026-12-18' })
  })

  it('a pay day on Christmas Day or New Year’s Day on the company’s calendar moves to the working day before, as every pay date does', () => {
    const rule = { holidays: HOLIDAYS }
    expect(payPeriodHolding('2026-12-06', biweekly('2026-12-06'), rule)).toMatchObject({
      calcOn: '2026-12-23', payOn: '2026-12-24', payOnUnmoved: '2026-12-25',
    })
    expect(payPeriodHolding('2026-12-13', biweekly('2026-12-13'), rule)).toMatchObject({
      calcOn: '2026-12-30', payOn: '2026-12-31', payOnUnmoved: '2027-01-01',
    })
    expect(payPeriodHolding('2026-12-27', biweekly('2026-12-27'), rule)).toMatchObject({ payOn: '2027-01-15', payOnUnmoved: '2027-01-15' })
  })

  it('a public holiday the company has not put on its calendar does not move the pay day', () => {
    expect(payPeriodHolding('2026-12-06', biweekly('2026-12-06'))!.payOn).toBe('2026-12-25')
  })

  it('a company that chose the working day after, or to leave pay dates where they fall, has its own choice followed', () => {
    expect(payPeriodHolding('2026-12-06', biweekly('2026-12-06'), { holidays: HOLIDAYS, direction: 'AFTER' })!.payOn).toBe('2026-12-28')
    expect(payPeriodHolding('2026-12-06', biweekly('2026-12-06'), { holidays: HOLIDAYS, direction: 'NONE' })!.payOn).toBe('2026-12-25')
  })

  it('a pay day on a company’s own day off moves too: a Friday-off company is paid the Thursday', () => {
    expect(payPeriodHolding('2026-12-27', biweekly('2026-12-27'), { daysOff: [5, 6] })!.payOn).toBe('2027-01-14')
  })

  it('no time zone moves a pay period or its pay day', () => {
    const want = payPeriodHolding('2026-12-13', biweekly('2026-12-13'), { holidays: HOLIDAYS })
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz
      expect(payPeriodHolding('2026-12-13', biweekly('2026-12-13'), { holidays: HOLIDAYS }), tz).toEqual(want)
      expect(payPeriodHolding(new Date('2026-12-19T00:00:00Z'), biweekly('2026-12-13'), { holidays: HOLIDAYS }), tz).toEqual(want)
      expect(checkFirstPeriodStart('2026-12-13'), tz).toEqual({ ok: true, day: '2026-12-13' })
    }
  })

  it('a company that has not set its first day, or pays by the month, has no pay period worked out at all', () => {
    expect(payPeriodHolding('2026-12-16', biweekly(null))).toBeNull()
    expect(payPeriodHolding('2026-12-16', { ...biweekly('2026-12-06'), payPeriod: 'MONTHLY' })).toBeNull()
    expect(payPeriodHolding('2026-12-16', { ...biweekly('2026-12-06'), payPeriod: 'SEMIMONTHLY', payDaysOfMonth: [15, 28] })).toBeNull()
    expect(payPeriodHolding('2026-12-16', biweekly('2026-12-07'))).toBeNull()
  })

  it('the first period is said in a payroll person’s words, with the day the pay day moved from', () => {
    expect(firstPeriodSays(payPeriodHolding('2026-12-27', biweekly('2026-12-27'))!)).toBe(
      'The first period is Dec 27, 2026 – Jan 9, 2027. Its pay is worked out Wed, Jan 13, 2027 and paid Fri, Jan 15, 2027.'
    )
    expect(firstPeriodSays(payPeriodHolding('2026-12-06', biweekly('2026-12-06'), { holidays: HOLIDAYS })!)).toBe(
      'The first period is Dec 6 – Dec 19, 2026. Its pay is worked out Wed, Dec 23, 2026 and paid Thu, Dec 24, 2026.' +
      ' The pay day moved from Fri, Dec 25, 2026, a day off or a holiday.'
    )
  })
})

describe('the settings screen and the payroll route ask for the same answers', () => {
  const PANEL = readFileSync(join(process.cwd(), 'src/components/settings/payroll-panel.tsx'), 'utf8')
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/settings/payroll/route.ts'), 'utf8')

  it('every answer the payroll route takes, the settings screen sends when Save payroll is pressed, the first day included', () => {
    for (const first of [...SUNDAYS, null]) {
      const body = payrollBody(biweekly(first))
      expect(Object.keys(body).sort()).toEqual([...PAY_CHANGE_FIELDS].sort())
      expect(body.payFirstPeriodStart).toBe(first)
      // What the screen sends, the door accepts.
      expect(checkPaySettings(body, DEFAULT_PAY_RHYTHM)).toMatchObject({ ok: true })
    }
    expect(PANEL).toContain('JSON.stringify(payrollBody(draft))')
    expect(ROUTE).toContain('PAY_CHANGE_FIELDS.map((f) => [f, body?.[f]])')
  })

  it('the screen draws "First pay period starts on" as a date box for a weekly or two-week company, with the one line saying what it does', () => {
    expect(FIRST_PERIOD_LABEL).toBe('First pay period starts on')
    const weekBranch = PANEL.slice(PANEL.indexOf('{byWeek ? ('), PANEL.indexOf(') : (', PANEL.indexOf('{byWeek ? (')))
    expect(weekBranch).toContain('label={FIRST_PERIOD_LABEL}')
    expect(weekBranch).toContain('type="date"')
    expect(weekBranch).toContain('{FIRST_PERIOD_HELP}')
    expect(weekBranch).toContain('firstPeriodSays(firstSaved)')
    expect(weekBranch).toContain('FIRST_PERIOD_UNSET')
    expect(FIRST_PERIOD_UNSET).toBe('Until this is set, the Payroll page lists pay by calendar month.')
  })
})
