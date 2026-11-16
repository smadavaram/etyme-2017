import { describe, it, expect } from 'vitest'
import { windowBehind, daysPastWindow, weeksPastWindow, hoursIn, windowHeldSays, windowHeldAboveTableSays } from '@/lib/money/outside-pay-window'
import { heldWeeksCell, heldAboveTableSays, payStatusSays, payFileCsv } from '@/lib/money/pay-periods'
import { daysFor } from '@/lib/contract-links'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A placement extended before 2026-11-16 kept its pay window at the first
 * end. Payroll pays only the days a window covers, so a week after it was
 * nobody's: the page and the file left it out, and the run paid nothing,
 * and nobody was told. Now such a week is held on Payroll, by name and
 * week, with what a person does; never paid, never dropped silently.
 *
 * Every date is written out; nothing reads the clock or the seeded world.
 */

const u = (s: string) => new Date(`${s}T00:00:00.000Z`)
const FIRST_END = u('2026-11-07') // a Saturday
const EXTENDED_TO = u('2027-02-06')
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const left = [{ buyContractId: 'pay-1', effectiveFrom: u('2026-08-02'), effectiveTo: FIRST_END }]
const week = (sunday: string) => {
  const d = new Date(u(sunday))
  const out: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) out[new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10)] = 8
  return out
}

describe('a week outside every pay window of an extended placement', () => {
  it('a week outside every pay window of an extended placement is held on Payroll with a sentence, never paid and never dropped silently', () => {
    const behind = windowBehind(left, EXTENDED_TO)!
    expect(behind).toEqual({ buyContractId: 'pay-1', endedOn: '2026-11-07', sellEnds: '2027-02-06' })
    const filed = week('2026-11-08')
    // Payroll pays none of it: no window covers it.
    expect(daysFor('pay-1', left.map((l) => ({ ...l, sellContractId: 's' })), filed)).toEqual({})
    // And the held list names every hour of it.
    const past = daysPastWindow(filed, behind)
    expect(past).toEqual(filed)
    const weeks = weeksPastWindow(past, filed, behind.endedOn)
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ weekOf: '2026-11-08', endedOn: '2026-11-07', whole: true })
    expect(hoursIn(weeks[0], '2026-11-01', '2026-11-30')).toBe(40)
    expect(windowHeldSays('Lena Okafor', [{ ...weeks[0], hours: 40 }])).toBe(
      "Lena Okafor's week of Nov 8, 2026, 40 hours, is held off this pay. " +
        'It is after the pay window ended on Nov 7, 2026; the placement was extended. ' +
        'Ask whoever runs payroll here to repair the window before it is paid.',
    )
  })

  it('a week split by the window end holds only the hours after it, and says so', () => {
    const behind = windowBehind([{ ...left[0], effectiveTo: u('2026-11-04') }], EXTENDED_TO)!
    const filed = week('2026-11-01')
    const weeks = weeksPastWindow(daysPastWindow(filed, behind), filed, behind.endedOn)
    expect(weeks).toHaveLength(1)
    expect(weeks[0].whole).toBe(false)
    expect(Object.keys(weeks[0].days)).toEqual(['2026-11-05', '2026-11-06'])
    expect(windowHeldSays('Lena Okafor', [{ ...weeks[0], hours: 16 }])).toContain(
      "Lena Okafor's week of Nov 1, 2026, 16 hours, is held off this pay. Those hours are after the pay window ended on Nov 4, 2026",
    )
  })

  it('nothing is held where a window is still open, the placement ends where its window ends, or there is no window', () => {
    expect(windowBehind([{ ...left[0], effectiveTo: null }], EXTENDED_TO)).toBeNull()
    expect(windowBehind(left, FIRST_END)).toBeNull()
    expect(windowBehind(left, u('2026-11-01'))).toBeNull()
    expect(windowBehind([], EXTENDED_TO)).toBeNull()
    expect(windowBehind(left, null)).toBeNull()
  })

  it('a day after the placement itself ends is not held for the window, since moving the window would not reach it', () => {
    const behind = windowBehind(left, u('2026-11-10'))!
    expect(daysPastWindow(week('2026-11-08'), behind)).toEqual({ '2026-11-09': 8, '2026-11-10': 8 })
  })

  it('a later window on another pay line covers the days after an earlier one, and nothing is held', () => {
    const two = [...left, { buyContractId: 'pay-2', effectiveFrom: u('2026-11-08'), effectiveTo: EXTENDED_TO }]
    expect(windowBehind(two, EXTENDED_TO)).toBeNull()
  })

  it('two pay lines whose windows end on one day hold the week on one of them only, so it is never held twice', () => {
    const two = [...left, { buyContractId: 'pay-0', effectiveFrom: u('2026-08-02'), effectiveTo: FIRST_END }]
    expect(windowBehind(two, EXTENDED_TO)?.buyContractId).toBe('pay-0')
  })

  it('every sentence is short: none past twenty-five words', () => {
    const says = windowHeldSays('Lena Okafor', [
      { weekOf: '2026-11-08', endedOn: '2026-11-07', hours: 40, whole: true },
      { weekOf: '2026-11-01', endedOn: '2026-11-04', hours: 16, whole: false },
    ])!
    for (const sentence of says.split(/(?<=\.)\s+(?=[A-Z])/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
    expect(windowHeldSays('Lena Okafor', [])).toBeNull()
  })
})

describe('what Payroll shows for a week held outside the pay window', () => {
  it("the pay file's held list names the week, its hours and the window it is after", () => {
    expect(heldWeeksCell([{ weekOf: '2026-11-08', hours: 40, reason: 'WINDOW', endedOn: '2026-11-07' }])).toBe(
      'Week of November 8, 2026, 40 hours, after the pay window ended on November 7, 2026, window to repair',
    )
    // The overtime hold keeps its own words.
    expect(heldWeeksCell([{ weekOf: '2026-11-08', hours: 46 }])).toBe('Week of November 8, 2026, 46 hours, exempt or not exempt not recorded')
  })

  it('a person whose only hours in the period are held is on the pay file, reading nothing to pay and the week held', () => {
    const csv = payFileCsv([{
      person: { name: 'Lena Okafor' }, totalApprovedHours: 0, payRate: 4_500, grossPay: 0, payCurrency: 'USD', payStatus: 'NO_HOURS',
      heldWeeks: [{ weekOf: '2026-11-08', hours: 40, reason: 'WINDOW', endedOn: '2026-11-07' }],
    }], { start: '2026-11-01', end: '2026-11-14', calcOn: '2026-11-16', payOn: '2026-11-20' } as never)
    const line = csv.trim().split('\n')[1]
    expect(line.startsWith('Lena Okafor,0,')).toBe(true)
    expect(line).toContain('"Nothing to pay, week held"')
    expect(line).toContain('after the pay window ended on November 7, 2026')
    expect(payStatusSays('NO_HOURS', 40)).toBe('Nothing to pay, week held')
  })

  it('above the table, a week held for the window is said apart from a week held for the overtime answer', () => {
    const r = (name: string, heldHours: number, windowHeldHours = 0) => ({ person: { name }, heldHours, windowHeldHours })
    expect(heldAboveTableSays([r('Lena Okafor', 40, 40)])).toBe(
      'Lena Okafor has a week held off this pay because it is after the pay window ended. The row says which week and what to do.',
    )
    expect(heldAboveTableSays([r('Lena Okafor', 40, 40), r('Omar Haddad', 46)])).toBe(
      'Omar Haddad has a week held off this pay until you record on the row whether the person is exempt from overtime. ' +
        'Lena Okafor has a week held off this pay because it is after the pay window ended. The row says which week and what to do.',
    )
    expect(windowHeldAboveTableSays(['A', 'B', 'C', 'D'])).toBe(
      '4 people have a week held off this pay because it is after the pay window ended. The row says which week and what to do.',
    )
  })

  it('the payroll page, its count and the run each read the held week', () => {
    const route = src('src/app/api/payroll/route.ts')
    expect(route).toContain('windowHeld: windowHeldSaid')
    expect(route).toContain("reason: 'WINDOW' as const")
    expect(route).toContain('weeksHeld:')
    const run = src('src/app/api/payroll/run/route.ts')
    expect(run).toContain('windowHeld: windowHeldSays(cand.person.name, windowHere)')
    const page = src('src/app/dashboard/payroll/page.tsx')
    expect(page).toContain('{row.windowHeld}')
    // Never "all clear" while a week is held.
    expect(page).toContain('stats.weeksHeld > 0')
  })
})
