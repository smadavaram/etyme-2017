/**
 * Which pay days a payroll run marks done.
 *
 * The run used to mark every open pay-day cycle dated from the start of
 * the period to four days after its end. The demo's employers now pay
 * monthly, nine days after the month ends (DEMO_MONTHLY_PAY in
 * lib/contract-cycles), and under that fixed window the run for July:
 *
 *   - missed July's own pay day, 7 August, four days is not nine; and
 *   - marked June's pay day, 7 July, done, because it falls inside July —
 *     telling a worker June was settled when nothing had paid it.
 *
 * The rule now comes from the cycles themselves: a pay day belongs to the
 * pay period holding most of the days since the pay day before it,
 * because pay follows the hours it pays. A tie goes to the period the pay
 * day falls in. Nothing about four days, or nine, is written anywhere.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payDaysToMark } from '@/lib/money/pay-day-period'
import { periodFor, type Terms } from '@/lib/periods'
import { generateCycles } from '@/lib/cycle-generator'
import { DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { getTemplatePack } from '@/lib/template-packs'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)
const MONTHLY: Terms = { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: d('2026-01-01') }
const month = (m: string) => periodFor(d(`${m}-01`), MONTHLY)
const periodOf = (x: Date) => periodFor(x, MONTHLY)

/** A line's pay days as the generator writes them, open unless named, with the day the line started. */
function payDays(start: string, end: string, defs: any[], done: string[] = []) {
  const cycles = generateCycles(d(start), d(end), defs)
    .filter((c) => c.kind === 'SALARY_PAY')
    .map((c, i) => ({ id: `c${i}-${iso(c.dueOn)}`, dueOn: c.dueOn, completedAt: done.includes(iso(c.dueOn)) ? d('2026-01-01') : null }))
  return Object.assign(cycles, { startedOn: d(start) })
}
const marked = (cycles: ReturnType<typeof payDays>, windows: string[], startedOn: Date | null = cycles.startedOn) =>
  payDaysToMark(cycles, windows.map((m) => month(m)), periodOf, startedOn).map((c) => iso(c.dueOn))

const FORTNIGHTLY = getTemplatePack('US_IT')!.cycleDefinitions

describe('a monthly pay day, nine days after the month', () => {
  const demo = () => payDays('2026-04-01', '2026-09-30', [...DEMO_MONTHLY_PAY])

  it('the demo line has one pay day a month, each in the month after the one it pays', () => {
    expect(demo().map((c) => iso(c.dueOn))).toEqual(['2026-05-08', '2026-06-09', '2026-07-09', '2026-08-07', '2026-09-09', '2026-10-09'])
  })

  it('a run for July marks July’s pay day done, 7 August, and leaves June’s pay day alone', () => {
    expect(marked(demo(), ['2026-07'])).toEqual(['2026-08-07'])
  })

  it('a run over June and July marks both months’ pay days', () => {
    expect(marked(demo(), ['2026-06', '2026-07'])).toEqual(['2026-07-09', '2026-08-07'])
  })

  it('a pay day that is already done is not marked again, and still dates the one after it', () => {
    const cycles = payDays('2026-04-01', '2026-09-30', [...DEMO_MONTHLY_PAY], ['2026-07-09'])
    expect(marked(cycles, ['2026-06'])).toEqual([])
    expect(marked(cycles, ['2026-07'])).toEqual(['2026-08-07'])
  })

  it('the first pay day of a placement belongs to the month before it, not the month it falls in', () => {
    expect(marked(demo(), ['2026-04'])).toEqual(['2026-05-08'])
    expect(marked(demo(), ['2026-05'])).toEqual(['2026-06-09'])
  })

  it('a placement with a single pay day marks it for the month it follows', () => {
    const one = payDays('2026-07-01', '2026-07-31', [...DEMO_MONTHLY_PAY])
    expect(one.map((c) => iso(c.dueOn))).toEqual(['2026-08-07'])
    expect(marked(one, ['2026-07'])).toEqual(['2026-08-07'])
    expect(marked(one, ['2026-08'])).toEqual([])
  })

  it('where the line’s start is not known, the first pay day covers as many days as the gap to the next one', () => {
    // 8 May, then 9 June: a span of 9 April to 8 May, mostly April.
    expect(marked(demo(), ['2026-04'], null)).toEqual(['2026-05-08'])
  })

  it('every month of Karthik’s three-month placement is marked by its own run, once', () => {
    const three = payDays('2026-06-01', '2026-08-31', [...DEMO_MONTHLY_PAY])
    const byRun = ['2026-06', '2026-07', '2026-08'].map((m) => marked(three, [m]))
    expect(byRun.map((x) => x.length)).toEqual([1, 1, 1])
    expect(new Set(byRun.flat()).size).toBe(3)
  })
})

describe('the fortnightly pack, paid on Fridays', () => {
  const fortnightly = () => payDays('2026-01-01', '2026-12-31', FORTNIGHTLY)

  it('a run for July marks the Fridays whose fortnight is mostly July, as the four-day window did', () => {
    const july = marked(fortnightly(), ['2026-07'])
    expect(july.length).toBeGreaterThanOrEqual(2)
    for (const p of july) {
      const due = d(p)
      // Inside July, or within the few days after it that a fortnight mostly in July can reach.
      expect(due.getTime()).toBeGreaterThanOrEqual(d('2026-07-01').getTime())
      expect(due.getTime()).toBeLessThanOrEqual(d('2026-08-07').getTime())
    }
  })

  it('every pay day of a year is marked by exactly one month’s run', () => {
    const all = fortnightly()
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
    const seen = months.flatMap((m) => marked(all, [m]))
    expect(seen.length).toBe(new Set(seen).size)
    expect(seen.sort()).toEqual(all.map((c) => iso(c.dueOn)).sort())
  })
})

describe('the run reads the pay day off the cycles', () => {
  it('the payroll run has no fixed number of days after a period in which its pay day must fall', () => {
    const run = readFileSync(join(__dirname, '..', '..', 'src/app/api/payroll/run/route.ts'), 'utf8')
    expect(run).not.toMatch(/SHIFT_DAYS/)
    expect(run).toContain('payDaysToMark(')
  })
})
