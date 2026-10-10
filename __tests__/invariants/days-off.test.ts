import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_WEEK_DUE,
  TOO_MANY_EXTRA_WEEKS,
  checkWeekSettings,
  deadlinesFor,
  isDayOff,
  settingsFrom,
} from '@/lib/days-off'
import { policyFrom, shiftToWorkingDay } from '@/lib/cycle-shift'
import { weekday } from '@/lib/seed-days'

/**
 * The company's week, decided by the founder on 2026-09-30: which days
 * are off is a company setting, Saturday and Sunday by default; a week's
 * hours are due on the Monday after it ends and approved by the
 * Wednesday; approvers may be given one extra week and never more.
 *
 * Every date is a real day. 2 October 2026 is a Friday, the 3rd a
 * Saturday, the 4th a Sunday.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const key = (d: Date) => d.toISOString().slice(0, 10)
const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const FRIDAY = utc(2026, 10, 2)
const SATURDAY = utc(2026, 10, 3)
const SUNDAY = utc(2026, 10, 4)
const MONDAY = utc(2026, 10, 5)

describe('which days of the week a company has off', () => {
  it('a company with nothing set has Saturday and Sunday off', () => {
    const s = settingsFrom(null)
    expect(s.daysOff).toEqual([0, 6])
    expect(isDayOff(SATURDAY, s.daysOff)).toBe(true)
    expect(isDayOff(SUNDAY, s.daysOff)).toBe(true)
    expect(isDayOff(FRIDAY, s.daysOff)).toBe(false)
    expect(isDayOff(MONDAY)).toBe(false)
  })

  it('a company in Dubai may mark Friday alone as its day off, and Saturday then counts as a working day', () => {
    const check = checkWeekSettings(DEFAULT_WEEK_DUE, { daysOff: [5] })
    expect(check.ok).toBe(true)
    const daysOff = check.ok ? check.daysOff! : []
    expect(daysOff).toEqual([5])
    expect(isDayOff(FRIDAY, daysOff)).toBe(true)
    expect(isDayOff(SATURDAY, daysOff)).toBe(false)
    expect(isDayOff(SUNDAY, daysOff)).toBe(false)
  })

  it('a company may mark Friday and Saturday off together', () => {
    const check = checkWeekSettings(DEFAULT_WEEK_DUE, { daysOff: [6, 5, 5] })
    expect(check.ok && check.daysOff).toEqual([5, 6])
  })

  it('a company may mark no days off', () => {
    const check = checkWeekSettings(DEFAULT_WEEK_DUE, { daysOff: [] })
    expect(check.ok && check.daysOff).toEqual([])
    for (const d of [FRIDAY, SATURDAY, SUNDAY, MONDAY]) expect(isDayOff(d, [])).toBe(false)
  })

  it('a week with every day off is refused, because somebody has to work one of them', () => {
    const check = checkWeekSettings(DEFAULT_WEEK_DUE, { daysOff: [0, 1, 2, 3, 4, 5, 6] })
    expect(check).toEqual({ ok: false, field: 'daysOff', message: 'At least one day of the week has to be a working day.' })
  })

  it('a day that is not a day of the week is refused in a sentence', () => {
    const check = checkWeekSettings(DEFAULT_WEEK_DUE, { daysOff: [7] })
    expect(check.ok).toBe(false)
    expect(!check.ok && check.message).toBe('A day off is a day of the week, from Sunday (0) to Saturday (6).')
  })

  it('a stored week nobody could have chosen reads as Saturday and Sunday rather than as no answer', () => {
    expect(settingsFrom({ daysOff: [0, 1, 2, 3, 4, 5, 6] }).daysOff).toEqual([0, 6])
    expect(settingsFrom({ daysOff: [9] }).daysOff).toEqual([0, 6])
  })
})

describe('a date that lands on a day off', () => {
  it('a date that lands on a company’s day off shifts around that day, not around Saturday', () => {
    const friday = local(2026, 10, 2)
    const saturday = local(2026, 10, 3)
    // Dubai, Friday off: a Friday date moves to the Thursday or the Saturday.
    expect(localKey(shiftToWorkingDay(friday, [], 'BEFORE', [5]))).toBe('2026-10-01')
    expect(localKey(shiftToWorkingDay(friday, [], 'AFTER', [5]))).toBe('2026-10-03')
    // And a Saturday date stays where it is, because Saturday is worked there.
    expect(localKey(shiftToWorkingDay(saturday, [], 'AFTER', [5]))).toBe('2026-10-03')
  })

  it('a caller that passes no days off still moves a Saturday date to the Monday, as before', () => {
    expect(localKey(shiftToWorkingDay(local(2026, 10, 3), [], 'AFTER'))).toBe('2026-10-05')
  })

  it('the company’s days off travel on its shift policy when they are loaded, and are left off when they are not', () => {
    expect(policyFrom({ daysOff: [5] }).daysOff).toEqual([5])
    expect(policyFrom({}).daysOff).toBeUndefined()
  })

  it('a seeded meeting at a firm with Friday off moves off the Friday, not off the weekend', () => {
    expect(key(weekday(FRIDAY, false, [5]))).toBe('2026-10-03')
    expect(key(weekday(SATURDAY, false))).toBe('2026-10-05')
    expect(key(weekday(SUNDAY, true))).toBe('2026-10-02')
  })
})

describe('when a week’s hours are due and approved', () => {
  const WEEK = utc(2026, 9, 27) // Sunday 27 September to Saturday 3 October

  it('a week’s hours are due on the Monday after it ends and approved by the Wednesday, unless the company said otherwise', () => {
    const { hoursDueOn, approveByOn } = deadlinesFor(WEEK)
    expect(key(hoursDueOn)).toBe('2026-10-05')
    expect(key(approveByOn)).toBe('2026-10-07')
    expect(settingsFrom({})).toMatchObject(DEFAULT_WEEK_DUE)
  })

  it('approvers may be given one extra week and never two, and the refusal says why', () => {
    const one = checkWeekSettings(DEFAULT_WEEK_DUE, { approvalExtraWeeks: 1 })
    expect(one.ok).toBe(true)
    expect(key(deadlinesFor(WEEK, one.ok ? one.due : DEFAULT_WEEK_DUE).approveByOn)).toBe('2026-10-14')

    const two = checkWeekSettings(DEFAULT_WEEK_DUE, { approvalExtraWeeks: 2 })
    expect(two).toEqual({ ok: false, field: 'approvalExtraWeeks', message: TOO_MANY_EXTRA_WEEKS })
    expect(TOO_MANY_EXTRA_WEEKS).toBe(
      'Approvers may have at most one extra week. Every day an approval waits is a day the bill and the pay wait behind it.'
    )
  })

  it('with the extra week, approval falls by the following Wednesday at the latest', () => {
    const late = checkWeekSettings(DEFAULT_WEEK_DUE, { approvalExtraWeeks: 1, approveByWeekday: 4 })
    expect(late.ok).toBe(false)
    expect(!late.ok && late.message).toContain('following Wednesday at the latest')
  })

  it('hours cannot be approved before the day they are due', () => {
    const early = checkWeekSettings(DEFAULT_WEEK_DUE, { hoursDueWeekday: 4, approveByWeekday: 3 })
    expect(early.ok).toBe(false)
    expect(!early.ok && early.message).toBe(
      'Hours due on Thursday cannot be approved by the Wednesday before it. Pick an approval day on or after the day hours are due.'
    )
  })

  it('a company may move both days, and the deadlines follow', () => {
    const moved = checkWeekSettings(DEFAULT_WEEK_DUE, { hoursDueWeekday: 0, approveByWeekday: 2 })
    expect(moved.ok).toBe(true)
    const d = deadlinesFor(WEEK, moved.ok ? moved.due : DEFAULT_WEEK_DUE)
    expect(key(d.hoursDueOn)).toBe('2026-10-04')
    expect(key(d.approveByOn)).toBe('2026-10-06')
  })
})

describe('a day off is never a reason to refuse hours', () => {
  /**
   * The founder, 2026-09-30: "In India too it's normal for people to work
   * Saturdays to help a release." A day off decides what a sheet expects;
   * the filing path must not read it at all.
   */
  const ROOT = join(__dirname, '..', '..', 'src')
  const filingPaths = [
    join(ROOT, 'app', 'api', 'timesheets'),
    join(ROOT, 'app', 'api', 'me'),
  ]
  const files = (dir: string): string[] => {
    let out: string[] = []
    let names: string[] = []
    try { names = readdirSync(dir) } catch { return out }
    for (const n of names) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) out = out.concat(files(p))
      else if (/\.tsx?$/.test(n)) out.push(p)
    }
    return out
  }

  it('a day off never stops a worker filing hours on it', () => {
    const offenders = filingPaths
      .flatMap(files)
      .filter((f) => /from '@\/lib\/days-off'|isDayOff\(|isWorkingDay\(/.test(readFileSync(f, 'utf8')))
    expect(offenders, 'The filing path reads days off; a day off decides what is expected, never what may be filed').toEqual([])
  })
})
