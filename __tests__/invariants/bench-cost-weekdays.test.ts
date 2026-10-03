/**
 * The bench cost counts the days a firm actually pays, not an average.
 *
 * Found by the bench tester, 2026-10-03: bench profit counted five of
 * every seven calendar days as working days, rounded, while the bench
 * burn beside it counted the real Monday-to-Friday days. Sixty days on
 * the bench is 42, 43 or 44 weekdays depending on the day it starts —
 * never "about 43" — so one person's bench read two different counts on
 * two pages. Where the first day is known, the real weekdays are counted;
 * where it is not, the answer says it is an estimate.
 *
 * Public holidays are counted here because no holiday answer is passed.
 * Since the founder's decision of 2026-10-03 whether one is paid is a
 * company setting and a per-person switch — bench-holiday-pay.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { benchCost, burnOf, workingDaysBetween, type Policy } from '@/lib/bench-policy'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DAY = 51_200 // $512 a day, $64/hr
const FULL: Policy = { policy: 'FULL_PAY' }

describe('Bench cost, counted in real weekdays', () => {
  it('the bench cost counts the real weekdays between two dates rather than five of every seven', () => {
    // Sixty days from Friday 7 August 2026: the weekdays from Sat 8 Aug
    // through Tue 6 Oct are 42 — not the 43 five-in-seven rounds to.
    const c = benchCost(FULL, { idleDays: 60, billingDayRateCents: DAY, since: D('2026-08-07') })
    expect(c.paidWorkingDays).toBe(42)
    expect(c.costCents).toBe(42 * DAY)
    expect(c.counted).toBe('WEEKDAYS')
  })

  it('the same sixty days starting on a different weekday is a different count, because the weekends fall differently', () => {
    const fromMonday = benchCost(FULL, { idleDays: 60, billingDayRateCents: DAY, since: D('2026-08-02') })
    // Sun 2 Aug: Mon 3 Aug through Thu 1 Oct is 44 weekdays.
    expect(fromMonday.paidWorkingDays).toBe(44)
  })

  it('the bench cost and the bench burn count the same days for the same person', () => {
    const since = D('2026-06-15')
    const now = D('2026-10-03')
    const idle = Math.round((now.getTime() - since.getTime()) / 86_400_000)
    const cost = benchCost(FULL, { idleDays: idle, billingDayRateCents: DAY, since })
    const burn = burnOf({ payRateCents: 6_400, billing: false, benchSince: since }, now)
    expect(cost.paidWorkingDays).toBe(burn.workingDays)
    expect(cost.costCents).toBe(burn.toDateCents)
  })

  it('a carry limit stops paying on the last weekday inside it', () => {
    const c = benchCost({ policy: 'FULL_PAY', carryDays: 14 }, { idleDays: 60, billingDayRateCents: DAY, since: D('2026-08-07') })
    expect(c.paidWorkingDays).toBe(workingDaysBetween(D('2026-08-07'), D('2026-08-21')))
    expect(c.paidWorkingDays).toBe(10)
  })

  it('without a first day the count is five in seven and says it is an estimate', () => {
    const c = benchCost(FULL, { idleDays: 60, billingDayRateCents: DAY })
    expect(c.paidWorkingDays).toBe(43)
    expect(c.counted).toBe('ESTIMATED')
  })

  it('no bill, no pay counts no paid days whatever the dates', () => {
    expect(benchCost({ policy: 'NO_PAY' }, { idleDays: 60, billingDayRateCents: DAY, since: D('2026-08-07') }).paidWorkingDays).toBe(0)
  })
})
