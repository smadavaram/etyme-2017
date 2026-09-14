import { describe, it, expect } from 'vitest'
import { splitWeeks, valueOfWeek, weekStart, policyOf, says, STRAIGHT_TIME } from '@/lib/overtime'

/**
 * Overtime, asked for directly: "please allow overtime".
 *
 * The whole risk in this file is one mistake — treating a pay period as
 * a week. Forty-five hours in a week is five hours of overtime; the
 * same forty-five spread over two weeks is none. A semi-monthly client
 * has periods holding two and a bit weeks, and the wrong arithmetic
 * there pays overtime on hours nobody worked overtime for, on an
 * invoice, before anybody notices.
 */

const OT = { afterHours: 40, multiplierBps: 15_000 }

/** Mon 7 Sep 2026 through the following Sunday. */
const week = (from: string, hours: number[]): Record<string, number> => {
  const out: Record<string, number> = {}
  const d = new Date(`${from}T00:00:00.000Z`)
  hours.forEach((h, i) => {
    const day = new Date(d)
    day.setUTCDate(d.getUTCDate() + i)
    out[day.toISOString().slice(0, 10)] = h
  })
  return out
}

describe('which week an hour belongs to', () => {
  it('a week begins on Monday, and Sunday belongs to the week that began six days earlier', () => {
    expect(weekStart('2026-09-07')).toBe('2026-09-07') // Monday
    expect(weekStart('2026-09-11')).toBe('2026-09-07') // Friday
    expect(weekStart('2026-09-13')).toBe('2026-09-07') // Sunday
    expect(weekStart('2026-09-14')).toBe('2026-09-14') // the next Monday
  })
})

describe('splitting a week into regular and overtime', () => {
  it('forty hours is forty regular and no overtime', () => {
    const s = splitWeeks(week('2026-09-07', [8, 8, 8, 8, 8]), OT)
    expect(s.regularHours).toBe(40)
    expect(s.overtimeHours).toBe(0)
  })

  it('forty-five hours is forty regular and five over', () => {
    const s = splitWeeks(week('2026-09-07', [9, 9, 9, 9, 9]), OT)
    expect(s.regularHours).toBe(40)
    expect(s.overtimeHours).toBe(5)
  })

  it('the same forty-five across two weeks is no overtime at all — the mistake this file exists to stop', () => {
    const days = { ...week('2026-09-10', [9, 9]), ...week('2026-09-14', [9, 9, 9]) }
    const s = splitWeeks(days, OT)
    expect(s.overtimeHours).toBe(0)
    expect(s.regularHours).toBe(45)
    expect(s.weeks).toHaveLength(2)
  })

  it('a period holding two full weeks pays overtime on each week that earned it, and not on the one that did not', () => {
    const days = { ...week('2026-09-07', [10, 10, 10, 10, 10]), ...week('2026-09-14', [8, 8, 8, 8, 8]) }
    const s = splitWeeks(days, OT)
    expect(s.overtimeHours).toBe(10)
    expect(s.weeks.map((w) => w.overtimeHours)).toEqual([10, 0])
  })

  it('straight time is the default, so nothing multiplies itself because a field was left empty', () => {
    const s = splitWeeks(week('2026-09-07', [12, 12, 12, 12, 12]), STRAIGHT_TIME)
    expect(s.overtimeHours).toBe(0)
    expect(s.regularHours).toBe(60)
    expect(policyOf(null).afterHours).toBeNull()
    expect(policyOf({ overtimeAfterHours: null }).afterHours).toBeNull()
  })

  it('ignores a day with no hours, and a day somebody typed nonsense into', () => {
    const s = splitWeeks({ '2026-09-07': 8, '2026-09-08': 0, '2026-09-09': NaN as unknown as number }, OT)
    expect(s.regularHours).toBe(8)
  })
})

describe('what the hours are worth', () => {
  it('overtime is time and a half on the rate, and regular hours are untouched', () => {
    const v = valueOfWeek(week('2026-09-07', [9, 9, 9, 9, 9]), 10_000, OT)
    expect(v.regularCents).toBe(40 * 10_000)
    expect(v.overtimeCents).toBe(5 * 10_000 * 1.5)
    expect(v.totalCents).toBe(40 * 10_000 + 5 * 15_000)
  })

  it('double time past a threshold is the same arithmetic with a different number, not a code change', () => {
    const v = valueOfWeek(week('2026-09-07', [12, 12, 12, 12, 12]), 10_000, { afterHours: 40, multiplierBps: 20_000 })
    expect(v.split.overtimeHours).toBe(20)
    expect(v.overtimeCents).toBe(20 * 20_000)
  })

  it('a straight-time week is worth exactly hours times rate, as it always was', () => {
    const v = valueOfWeek(week('2026-09-07', [9, 9, 9, 9, 9]), 10_000, STRAIGHT_TIME)
    expect(v.totalCents).toBe(45 * 10_000)
    expect(v.overtimeCents).toBe(0)
  })

  it('rounds once per band rather than per day, so a line agrees with the invoice it sits on', () => {
    // A third of an hour a day at a rate that does not divide cleanly.
    const days = week('2026-09-07', [8.33, 8.33, 8.33, 8.33, 8.33])
    const v = valueOfWeek(days, 3_333, OT)
    expect(v.regularCents + v.overtimeCents).toBe(v.totalCents)
    expect(Number.isInteger(v.totalCents)).toBe(true)
  })
})

describe('what the terms say on a screen', () => {
  it('names time and a half, double time, and anything else, in the trade’s words', () => {
    expect(says({ afterHours: 40, multiplierBps: 15_000 })).toBe('Over 40 hours in a week is time and a half.')
    expect(says({ afterHours: 60, multiplierBps: 20_000 })).toBe('Over 60 hours in a week is double time.')
    expect(says({ afterHours: 40, multiplierBps: 12_500 })).toMatch(/1\.25×/)
  })

  it('says straight time plainly rather than leaving the reader to infer it from a blank', () => {
    expect(says(STRAIGHT_TIME)).toMatch(/every hour at the same rate/)
  })
})
