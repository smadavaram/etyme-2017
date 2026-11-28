import { describe, it, expect } from 'vitest'
import { generateCycles } from '@/lib/cycle-generator'
import { getTemplatePack } from '@/lib/template-packs'
import { daysOnSite, standingAgainstLimit } from '@/lib/tenure-days'
import { whenFree } from '@/lib/bench-filter'
import {
  calendarDayIn, lastDayOnSite, cyclesAtLastDay, moneyPastLastDay, pastLastDaySays, lastDaySays, payLinesAtLastDay,
  type StoredCycleRow, type WeekAfter,
} from '@/lib/money/early-end'

/**
 * Founder, 2026-11-16 ("go ahead with your recommendations"): when a
 * placement is ended early, record the real last day. Ending one kept its
 * planned end months away, so Bench and Today read her free only after it
 * and tenure counted days she was not on site.
 *
 * Pure fixtures with their own dates: nothing here reads the clock or the
 * seeded world.
 */

const u = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const key = (d: Date) => d.toISOString().slice(0, 10)
const US_IT = getTemplatePack('US_IT')!.cycleDefinitions

const START = u(2026, 1, 5)
const PLANNED = u(2026, 6, 30)

describe('the real last day of a placement ended early', () => {
  it('a placement ended early takes the day it ended as its last day on site, and keeps the planned end beside it', () => {
    const d = lastDayOnSite({ startDate: START, plannedEnd: PLANNED, today: u(2026, 3, 4) })
    expect(key(d.lastDay)).toBe('2026-03-04')
    expect(d.early).toBe(true)
    expect(key(d.plannedEnd!)).toBe('2026-06-30')
  })

  it('a placement ended on its planned last day, or after it, keeps its end date unchanged', () => {
    for (const today of [PLANNED, u(2026, 7, 2)]) {
      const d = lastDayOnSite({ startDate: START, plannedEnd: PLANNED, today })
      expect(key(d.lastDay)).toBe('2026-06-30')
      expect(d.early).toBe(false)
    }
  })

  it('a placement ended before its first day never ends before it began', () => {
    const d = lastDayOnSite({ startDate: u(2026, 3, 10), plannedEnd: PLANNED, today: u(2026, 3, 4) })
    expect(key(d.lastDay)).toBe('2026-03-10')
  })

  it('a placement with no planned end ends on the day it is ended', () => {
    const d = lastDayOnSite({ startDate: START, plannedEnd: null, today: u(2026, 3, 4) })
    expect(key(d.lastDay)).toBe('2026-03-04')
    expect(d.early).toBe(true)
  })

  it('the day an early end is pressed is the calendar day at the site, and an unknown zone reads as UTC', () => {
    const lateEvening = new Date('2026-03-05T03:00:00Z')
    expect(key(calendarDayIn(lateEvening, 'America/Chicago'))).toBe('2026-03-04')
    expect(key(calendarDayIn(lateEvening, 'Asia/Kolkata'))).toBe('2026-03-05')
    expect(key(calendarDayIn(lateEvening, 'Not/AZone'))).toBe('2026-03-05')
    expect(key(calendarDayIn(lateEvening, null))).toBe('2026-03-05')
  })

  it('the person who ends it reads the last day it recorded', () => {
    expect(lastDaySays(u(2026, 3, 4))).toBe('Last day on site: Mar 4, 2026.')
  })
})

describe('no week or bill falls after the real last day', () => {
  const stored = (cs: ReturnType<typeof generateCycles>): (StoredCycleRow & { kind: string; dueOn: Date })[] =>
    cs.map((c, i) => ({ id: `c${i}`, kind: c.kind, dueOn: c.dueOn, completedAt: null, periodStart: c.periodStart, periodEnd: c.periodEnd }))
  const shape = (c: { kind: string; dueOn: Date; periodStart: Date | null; periodEnd: Date | null }) =>
    `${c.kind} ${c.dueOn.toISOString()} ${key(c.periodStart!)}..${key(c.periodEnd!)}`

  // A Wednesday, a Saturday, a month's last day and a mid-month Monday.
  for (const last of [u(2026, 3, 4), u(2026, 3, 7), u(2026, 3, 31), u(2026, 4, 13)]) {
    it(`cutting a placement's dates at a real last day of ${key(last)} leaves exactly the dates of one planned to end that day`, () => {
      const rows = stored(generateCycles(START, PLANNED, US_IT))
      const plan = cyclesAtLastDay(rows, last)
      const removed = new Set(plan.remove)
      const cut = new Map(plan.cut.map((c) => [c.id, c.periodEnd]))
      const after = rows
        .filter((r) => !removed.has(r.id))
        .map((r) => ({ ...r, periodEnd: cut.get(r.id) ?? r.periodEnd }))
      const expected = generateCycles(START, last, US_IT)
      expect(after.map(shape).sort()).toEqual(expected.map(shape).sort())
      expect(after.every((r) => key(r.periodStart!) <= key(last) && key(r.periodEnd!) <= key(last))).toBe(true)
    })
  }

  it('a cycle already completed is never moved or removed by an early end', () => {
    const plan = cyclesAtLastDay(
      [
        { id: 'paid', completedAt: u(2026, 3, 6), periodStart: u(2026, 3, 1), periodEnd: u(2026, 3, 14) },
        { id: 'later', completedAt: u(2026, 3, 20), periodStart: u(2026, 3, 15), periodEnd: u(2026, 3, 28) },
      ],
      u(2026, 3, 4),
    )
    expect(plan.remove).toEqual([])
    expect(plan.cut).toEqual([])
  })

  it('a date written before periods were recorded is left as written, and counted so the log says so', () => {
    const plan = cyclesAtLastDay([{ id: 'old', completedAt: null, periodStart: null, periodEnd: null }], u(2026, 3, 4))
    expect(plan).toEqual({ remove: [], cut: [], unplaced: 1 })
  })
})

describe('an early end past a week already billed or paid', () => {
  const week = (over: Partial<WeekAfter>): WeekAfter => ({
    id: 'w1', periodStart: u(2026, 3, 1), periodEnd: u(2026, 3, 7), days: { '2026-03-02': 8, '2026-03-05': 8 }, totalHours: 16,
    billed: false, paid: false, paidOn: () => false, ...over,
  })

  it('an early end past a week already billed is refused in a sentence naming the week and the day', () => {
    const r = moneyPastLastDay([week({ billed: true })], u(2026, 3, 4), 'Lena Okafor')
    expect(r?.stage).toBe('BILLED')
    expect(r?.says).toBe('The week of Mar 1, 2026 is already billed, with hours on Mar 5, 2026. End Lena Okafor\'s placement on or after that day.')
  })

  it('an early end past a week already paid is refused in a sentence naming the week, paid before billed', () => {
    const r = moneyPastLastDay([week({ billed: true, paidOn: (d) => d === '2026-03-05' })], u(2026, 3, 4), 'Lena Okafor')
    expect(r?.stage).toBe('PAID')
    expect(r?.says).toBe('The week of Mar 1, 2026 is already paid, with hours on Mar 5, 2026. End Lena Okafor\'s placement on or after that day.')
  })

  it('hours filed after the last day and not yet billed refuse it too, and say how to clear them', () => {
    const r = moneyPastLastDay([week({})], u(2026, 3, 4), 'Lena Okafor')
    expect(r?.stage).toBe('FILED')
    expect(r?.says).toBe(pastLastDaySays('FILED', u(2026, 3, 1), '2026-03-05', 'Lena Okafor'))
    expect(r?.says).toMatch(/^The week of Mar 1, 2026 has hours filed on Mar 5, 2026\. Have that week corrected/)
  })

  it('hours on or before the last day, or none after it, never refuse an early end', () => {
    expect(moneyPastLastDay([week({ billed: true })], u(2026, 3, 5), 'Lena Okafor')).toBeNull()
    expect(moneyPastLastDay([week({ billed: true, days: { '2026-03-02': 8, '2026-03-05': 0 } })], u(2026, 3, 4), 'Lena Okafor')).toBeNull()
  })

  it('every refusal is one or two short sentences, never past twenty-five words each', () => {
    for (const stage of ['PAID', 'BILLED', 'FILED'] as const) {
      for (const noDays of [false, true]) {
        const says = pastLastDaySays(stage, u(2026, 3, 1), '2026-03-05', 'Lena Okafor', noDays)
        for (const sentence of says.split(/(?<=\.)\s+(?=[A-Z])/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
      }
    }
  })

  it('an early end is refused past a week with hours and no daily breakdown', () => {
    const total = week({ days: {}, totalHours: 40 })
    const r = moneyPastLastDay([total], u(2026, 3, 4), 'Lena Okafor')
    expect(r?.stage).toBe('FILED')
    expect(r?.noDays).toBe(true)
    // The week's own last day: its hours may be on any of its days.
    expect(r?.day).toBe('2026-03-07')
    expect(r?.says).toBe(
      "The week of Mar 1, 2026 has a weekly total filed with no daily hours, through Mar 7, 2026. Have that week corrected, or end Lena Okafor's placement on or after that day.",
    )
    expect(moneyPastLastDay([week({ days: {}, totalHours: 40, billed: true })], u(2026, 3, 4), 'Lena Okafor')?.says).toBe(
      "The week of Mar 1, 2026 is already billed, as a weekly total with no daily hours, through Mar 7, 2026. End Lena Okafor's placement on or after that day.",
    )
    expect(moneyPastLastDay([week({ days: {}, totalHours: 40, billed: true, paid: true })], u(2026, 3, 4), 'Lena Okafor')?.stage).toBe('PAID')
  })

  it('a week with no daily breakdown and no hours is refused only where it is billed or paid', () => {
    expect(moneyPastLastDay([week({ days: {}, totalHours: 0 })], u(2026, 3, 4), 'Lena Okafor')).toBeNull()
    expect(moneyPastLastDay([week({ days: {}, totalHours: 0, billed: true })], u(2026, 3, 4), 'Lena Okafor')?.stage).toBe('BILLED')
    expect(moneyPastLastDay([week({ days: {}, totalHours: 0, paid: true })], u(2026, 3, 4), 'Lena Okafor')?.stage).toBe('PAID')
  })

  it('a week with no daily breakdown ending on or before the last day never refuses an early end', () => {
    expect(moneyPastLastDay([week({ days: {}, totalHours: 40, billed: true, paid: true })], u(2026, 3, 7), 'Lena Okafor')).toBeNull()
    expect(moneyPastLastDay([week({ days: {}, totalHours: 40 })], u(2026, 3, 9), 'Lena Okafor')).toBeNull()
  })

  it('a week any paid record names is called paid, never filed, whatever day the record put its hours on', () => {
    // A pay run before 2026-11-16 paid it as one lump on its first day; no pay day was settled over it.
    const r = moneyPastLastDay([week({ paid: true })], u(2026, 3, 4), 'Lena Okafor')
    expect(r?.stage).toBe('PAID')
    expect(r?.says).toBe("The week of Mar 1, 2026 is already paid, with hours on Mar 5, 2026. End Lena Okafor's placement on or after that day.")
  })
})

describe('what the real last day does to tenure and the bench', () => {
  it('tenure at the client counts days on site up to the real last day, a day counted once', () => {
    const last = lastDayOnSite({ startDate: START, plannedEnd: PLANNED, today: u(2026, 3, 4) }).lastDay
    // The same person on a second rung over the first ten days: one stretch.
    const lines = [
      { startDate: START, endDate: last },
      { startDate: START, endDate: u(2026, 1, 14) },
    ]
    const later = u(2026, 5, 1)
    // January 5 to March 4, both counted: 27 + 28 + 4.
    expect(daysOnSite(lines, later)).toBe(59)
    const standing = standingAgainstLimit(lines.map((l) => ({ ...l, live: false })), { capMonths: 18, breakDays: 90 }, later)
    expect(standing.daysOnSite).toBe(59)
    expect(key(standing.lastDay!)).toBe('2026-03-04')
    // The break starts the day after the last day on site.
    expect(key(standing.breakEndsOn!)).toBe(key(new Date(u(2026, 3, 5).getTime() + 90 * 86_400_000)))
  })

  it('the person reads free from the day after her real last day', () => {
    const last = u(2026, 3, 4)
    expect(whenFree({ lines: [], lastEnded: last, availableFrom: null, onBenchSince: u(2026, 1, 1), now: new Date('2026-03-04T15:00:00Z') }).says)
      .toBe('Free from Mar 5, 2026')
    expect(whenFree({ lines: [], lastEnded: last, availableFrom: null, onBenchSince: u(2026, 1, 1), now: new Date('2026-03-05T09:00:00Z') }).state)
      .toBe('NOW')
  })
})

describe('which pay lines an early end cuts', () => {
  it('her row on a pay line another open placement of hers still pays through is not ended, and neither is the line', () => {
    const cut = payLinesAtLastDay({
      moving: ['shared', 'own'],
      onlyHers: ['shared', 'own'],
      otherOpen: [{ buyContractId: 'shared', sellContractId: 'second-placement' }],
    })
    expect(cut.rowsEnding).toEqual(['own'])
    expect(cut.linesEnding).toEqual(['own'])
    expect(cut.keptOpen).toEqual([{ buyContractId: 'shared', sellContractId: 'second-placement' }])
  })

  it('a pay line that holds other people keeps its own end, and her row on it ends', () => {
    const cut = payLinesAtLastDay({ moving: ['team'], onlyHers: [], otherOpen: [] })
    expect(cut.rowsEnding).toEqual(['team'])
    expect(cut.linesEnding).toEqual([])
  })
})
