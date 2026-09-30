import { describe, it, expect } from 'vitest'
import { PROGRAMMES, week, weeksSince, mondayWeek } from '@/lib/seed-programmes'
import { officeWeek, nurseWeek } from '@/lib/seed-doors'
import { weekStart } from '@/lib/overtime'
import { day } from '@/lib/seed-days'

/**
 * A browser walk on 2026-09-30, a Wednesday, found Omar Haddad's weeks
 * filed Saturday to Wednesday — Sep 12–16 and Sep 19–23 — because every
 * seeded week was five days counted back from the day the seed ran. And
 * his placement began on August 16 with nothing filed until September,
 * which reads as missing hours.
 */

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

describe('the weeks the demo world files', () => {
  it('a seeded week runs Monday to Friday, whatever day the world was born', () => {
    for (const w of [1, 2, 3, 6]) {
      for (const shape of [week(w), officeWeek(w), mondayWeek(w, 45)]) {
        expect(shape.start.getUTCDay()).toBe(1)
        expect(shape.end.getUTCDay()).toBe(5)
        const days = Object.keys(shape.days)
        expect(days.map(weekday)).toEqual([1, 2, 3, 4, 5])
        expect(new Set(days.map(weekStart)).size).toBe(1)
      }
    }
  })

  it("a nurse's three twelve-hour shifts fall on Monday, Wednesday and Friday of one week", () => {
    const n = nurseWeek(2)
    expect(Object.keys(n.days).map(weekday)).toEqual([1, 3, 5])
    expect(Object.values(n.days).reduce((a, b) => a + b, 0)).toBe(36)
  })

  it('a week the placement starts inside is filed only for the days from its start', () => {
    const w = weeksSince(day(-45))[0]
    const whole = week(w)
    const from = new Date(whole.start.getTime() + 2 * 86_400_000) // the Wednesday
    const cut = week(w, 40, from)
    expect(cut.start.getTime()).toBe(from.getTime())
    expect(Object.keys(cut.days).map(weekday)).toEqual([3, 4, 5])
  })

  it('every week since a placement started is counted, and no week before it', () => {
    const start = day(-45)
    const ws = weeksSince(start)
    expect(week(ws[0]).end.getTime()).toBeGreaterThanOrEqual(start.getTime())
    expect(mondayWeek(ws[0] + 1, 40).end.getTime()).toBeLessThan(start.getTime())
    expect(ws[ws.length - 1]).toBe(1)
  })

  it("Omar Haddad's hours are filed from his start, with the most recent week left for the overtime somebody must decide", () => {
    const omar = PROGRAMMES.flatMap((p) => p.placements).find((pl) => pl.person === 'Omar Haddad')!
    expect(omar.filesFromStart).toBe(true)
    expect(omar.overtimeWeekHours).toBe(45)
    expect(omar.startedDaysAgo).toBe(45)
  })
})
