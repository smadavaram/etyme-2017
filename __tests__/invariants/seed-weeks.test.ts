import { describe, it, expect } from 'vitest'
import { PROGRAMMES, week, weeksSince } from '@/lib/seed-programmes'
import { officeWeek, nurseWeek } from '@/lib/seed-doors'
import { weekStart } from '@/lib/overtime'
import { day, seedWeek, signingDays, weekDeadlines, anchorSeed, forgetSeedAnchor } from '@/lib/seed-days'
import { calendarWeeks } from '@/lib/seed-doors'
import { settingsFrom } from '@/lib/days-off'

/**
 * A browser walk on 2026-09-30, a Wednesday, found Omar Haddad's weeks
 * filed Saturday to Wednesday — Sep 12–16 and Sep 19–23 — because every
 * seeded week was five days counted back from the day the seed ran. And
 * his placement began on August 16 with nothing filed until September,
 * which reads as missing hours.
 */

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('the weeks the demo world files', () => {
  it('a seeded week runs Sunday to Saturday with its hours on the weekdays, whatever day the world was born', () => {
    // Every weekday a world can be born on, 2026-10-04 (a Sunday) to 10-10.
    for (let born = 4; born <= 10; born++) {
      anchorSeed(new Date(Date.UTC(2026, 9, born, 15)))
      try {
        for (const w of [1, 2, 3, 6]) {
          for (const shape of [week(w), officeWeek(w), seedWeek(w, 45)]) {
            expect(shape.start.getUTCDay()).toBe(0)
            expect(shape.end.getUTCDay()).toBe(6)
            expect(iso(shape.start)).toBe(weekStart(iso(shape.end)))
            const days = Object.keys(shape.days)
            expect(days.map(weekday)).toEqual([1, 2, 3, 4, 5])
            expect(new Set(days.map(weekStart)).size).toBe(1)
            expect(days.every((d) => d > iso(shape.start) && d < iso(shape.end))).toBe(true)
          }
        }
        // And last week has ended at least a day before the world was born.
        expect(seedWeek(1, 40).end.getTime()).toBeLessThan(day(0).getTime())
      } finally {
        forgetSeedAnchor()
      }
    }
  })

  it('a seeded week holds the same five weekdays it held when weeks ran Monday to Friday, so no seeded figure moves', () => {
    for (let born = 4; born <= 10; born++) {
      anchorSeed(new Date(Date.UTC(2026, 9, born, 15)))
      try {
        // The rule the seed used before: the Monday of the week holding today, `w` weeks back.
        const today = day(0)
        const oldMonday = day(-(((today.getUTCDay() + 6) % 7) + 7 * 1))
        expect(Object.keys(seedWeek(1, 40).days)[0]).toBe(iso(oldMonday))
      } finally {
        forgetSeedAnchor()
      }
    }
  })

  it("a nurse's three twelve-hour shifts fall on Monday, Wednesday and Friday inside one Sunday-to-Saturday week", () => {
    const n = nurseWeek(2)
    expect(n.start.getUTCDay()).toBe(0)
    expect(n.end.getUTCDay()).toBe(6)
    expect(Object.keys(n.days).map(weekday)).toEqual([1, 3, 5])
    expect(new Set(Object.keys(n.days).map(weekStart))).toEqual(new Set([iso(n.start)]))
    expect(Object.values(n.days).reduce((a, b) => a + b, 0)).toBe(36)
  })

  it("a seeded week's hours are due the Monday after it ends and approved by the Wednesday, read from the company's week settings", () => {
    const wk = seedWeek(2, 40)
    const defaults = weekDeadlines(wk.start, settingsFrom(null))
    expect(defaults.hoursDueOn.getUTCDay()).toBe(1)
    expect((defaults.hoursDueOn.getTime() - wk.end.getTime()) / 86_400_000).toBe(2)
    expect(defaults.approveByOn.getUTCDay()).toBe(3)
    expect((defaults.approveByOn.getTime() - wk.end.getTime()) / 86_400_000).toBe(4)
    // A company that gave its approvers the extra week is read, not overridden.
    const later = weekDeadlines(wk.start, settingsFrom({ approvalExtraWeeks: 1 }))
    expect((later.approveByOn.getTime() - wk.end.getTime()) / 86_400_000).toBe(11)
    // Every signature lands after the Saturday and on or before the approval day.
    const sign = signingDays(wk.start, settingsFrom(null))
    for (const step of [0, 1, 2, 3]) {
      expect(sign.signedAt(step).getTime()).toBeGreaterThan(wk.end.getTime())
      expect(sign.signedAt(step).getTime()).toBeLessThanOrEqual(defaults.approveByOn.getTime())
    }
  })

  it('a month of calendar weeks opens each on its Sunday and closes on its Saturday, cut only at the contract’s own edges', () => {
    // 2026-08-01 is a Saturday, 08-31 a Monday.
    const weeks = calendarWeeks(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'))
    expect(weeks.map((w) => [iso(w.start), iso(w.end), Object.keys(w.days).length])).toEqual([
      ['2026-08-02', '2026-08-08', 5],
      ['2026-08-09', '2026-08-15', 5],
      ['2026-08-16', '2026-08-22', 5],
      ['2026-08-23', '2026-08-29', 5],
      ['2026-08-30', '2026-08-31', 1],
    ])
  })

  it('a week the placement starts inside is filed only for the days from its start', () => {
    const w = weeksSince(day(-45))[0]
    const whole = week(w)
    const from = new Date(whole.start.getTime() + 3 * 86_400_000) // the Wednesday
    const cut = week(w, 40, from)!
    expect(cut.start.getTime()).toBe(from.getTime())
    expect(Object.keys(cut.days).map(weekday)).toEqual([3, 4, 5])
  })

  it('a placement that starts after a week has ended files nothing for that week, never a backwards week with no hours', () => {
    // Marta Kowalczyk on a world born Sunday 2026-11-01: she starts on
    // Saturday 17 October, after the last working day of that week. It
    // was once written as a sheet from the 17th to the 16th, with no hours.
    for (const w of [1, 2, 3, 6]) {
      const whole = week(w)
      const saturday = whole.end
      expect(week(w, 40, saturday)).toBeNull()
      const friday = week(w, 40, new Date(whole.end.getTime() - 86_400_000))!
      expect(friday.start.getTime()).toBeLessThanOrEqual(friday.end.getTime())
      expect(Object.keys(friday.days).map(weekday)).toEqual([5])
    }
  })

  it('every week since a placement started is counted, and no week before it', () => {
    const start = day(-45)
    const ws = weeksSince(start)
    expect(week(ws[0]).end.getTime()).toBeGreaterThanOrEqual(start.getTime())
    expect(Math.max(...Object.keys(seedWeek(ws[0] + 1, 40).days).map((d) => +new Date(`${d}T00:00:00Z`)))).toBeLessThan(start.getTime())
    expect(ws[ws.length - 1]).toBe(1)
  })

  it("Omar Haddad's hours are filed from his start, with the most recent week left for the overtime somebody must decide", () => {
    const omar = PROGRAMMES.flatMap((p) => p.placements).find((pl) => pl.person === 'Omar Haddad')!
    expect(omar.filesFromStart).toBe(true)
    expect(omar.overtimeWeekHours).toBe(45)
    expect(omar.startedDaysAgo).toBe(45)
  })
})
