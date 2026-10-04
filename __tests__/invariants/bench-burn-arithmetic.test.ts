import { describe, it, expect } from 'vitest'
import { burnOf, workingDaysBetween } from '@/lib/bench-policy'

/**
 * Only people who are not billing are a bench cost, and the days are
 * named. Found 2026-09-30 as Techpeple: Helena Marsh, placed and billing,
 * read "$720/day · 129d on bench · $66.2k burned".
 */

const now = new Date('2026-09-30T12:00:00Z')

describe('bench cost counts only people who are not billing, in working days it names', () => {
  it('a placed person who is billing costs the bench nothing', () => {
    const b = burnOf({ payRateCents: 9_000, billing: true, benchSince: new Date('2026-05-24T00:00:00Z') }, now)
    expect(b.onBench).toBe(false)
    expect(b.dailyCents).toBeNull()
    expect(b.toDateCents).toBeNull()
    expect(b.says).toBe('Placed and billing, so not a bench cost.')
  })

  it('a person between projects costs pay × 8 a working day, in cents', () => {
    const b = burnOf({ payRateCents: 8_600, billing: false, benchSince: new Date('2026-09-23T00:00:00Z') }, now)
    expect(b.dailyCents).toBe(68_800)
    // Thu 24, Fri 25, Mon 28, Tue 29, Wed 30.
    expect(b.workingDays).toBe(5)
    expect(b.calendarDays).toBe(7)
    expect(b.toDateCents).toBe(344_000)
    expect(b.says).toBe('5 working days (7 calendar days) at $688.00 a day.')
  })

  it('the figure to date is the daily cost times the working days it says, so a reader can check it with one multiplication', () => {
    const b = burnOf({ payRateCents: 9_000, billing: false, benchSince: new Date('2026-05-24T00:00:00Z') }, now)
    expect(b.calendarDays).toBe(129)
    expect(b.toDateCents).toBe(b.dailyCents! * b.workingDays)
    expect(b.says).toMatch(/^\d+ working days \(129 calendar days\) at \$720\.00 a day\.$/)
  })

  it('a weekend is not a working day', () => {
    // Fri 25 Sep to Mon 28 Sep: Saturday and Sunday are skipped.
    expect(workingDaysBetween(new Date('2026-09-25T00:00:00Z'), new Date('2026-09-28T00:00:00Z'))).toBe(1)
  })
})
