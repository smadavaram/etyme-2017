import { describe, it, expect } from 'vitest'
import { earlierEnds, follows, windowsAtNewEnd, payLineInForce } from '@/lib/money/extension-windows'
import { extensionPlan, type PlannedCycle } from '@/lib/contract-cycles'
import { generateCycles } from '@/lib/cycle-generator'
import { getTemplatePack } from '@/lib/template-packs'
import { daysFor } from '@/lib/contract-links'

/**
 * An extension moves the window her hours are paid through and her row on
 * the pay line with the end date (2026-11-16). Payroll narrows every week
 * to the days a link covers, so a window left at the first end read every
 * hour after it as nobody's. Each case is one placement with the dates
 * written out; nothing reads the clock.
 */

const u = (s: string) => new Date(`${s}T00:00:00.000Z`)
const FIRST_END = u('2026-10-24')
const NEW_END = u('2027-01-22')

describe('which windows follow the new end', () => {
  const none = earlierEnds([])

  it('a window the end bounded follows the new end, and the move says from and to', () => {
    const moves = windowsAtNewEnd({
      links: [{ id: 'l1', buyContractId: 'b1', effectiveTo: FIRST_END }],
      rows: [{ id: 'r1', buyContractId: 'b1', endDate: FIRST_END }],
      oldEnd: FIRST_END,
      earlier: none,
      newEnd: NEW_END,
    })
    expect(moves.links).toEqual([{ id: 'l1', from: '2026-10-24', to: '2027-01-22' }])
    expect(moves.rows).toEqual([{ id: 'r1', from: '2026-10-24', to: '2027-01-22' }])
    expect(moves.leftBehind).toEqual({ links: [], rows: [] })
  })

  it('a window an extension before the rule left at the first end is not moved by a guess, and is named for a person to repair', () => {
    // Extended once before the rule, from Oct 24 to Dec 31; now extended again to Jan 22.
    const moves = windowsAtNewEnd({
      links: [{ id: 'l1', buyContractId: 'b1', effectiveTo: FIRST_END }],
      rows: [{ id: 'r1', buyContractId: 'b1', endDate: FIRST_END }],
      oldEnd: u('2026-12-31'),
      earlier: earlierEnds(['2026-10-24T00:00:00.000Z']),
      newEnd: NEW_END,
    })
    expect(moves.links).toEqual([])
    expect(moves.rows).toEqual([])
    expect(moves.leftBehind).toEqual({ links: [{ id: 'l1', endsOn: '2026-10-24' }], rows: [{ id: 'r1', endsOn: '2026-10-24' }] })
  })

  it('a window a replacement or a change of supplier closed before the end stays closed, and so does her row on that line', () => {
    const moves = windowsAtNewEnd({
      links: [
        { id: 'old', buyContractId: 'b-old', effectiveTo: u('2026-09-15') },
        { id: 'now', buyContractId: 'b-now', effectiveTo: FIRST_END },
      ],
      rows: [
        { id: 'r-old', buyContractId: 'b-old', endDate: FIRST_END },
        { id: 'r-now', buyContractId: 'b-now', endDate: FIRST_END },
      ],
      oldEnd: FIRST_END,
      earlier: none,
      newEnd: NEW_END,
    })
    expect(moves.links.map((m) => m.id)).toEqual(['now'])
    expect(moves.rows.map((m) => m.id)).toEqual(['r-now'])
    expect(moves.leftBehind).toEqual({ links: [], rows: [] })
  })

  it('an open window stays open, and nothing ever moves earlier', () => {
    expect(follows(null, FIRST_END, NEW_END)).toBe(false)
    expect(follows(FIRST_END, FIRST_END, u('2026-10-20'))).toBe(false)
    expect(follows(FIRST_END, FIRST_END, FIRST_END)).toBe(false)
    expect(follows(FIRST_END, null, NEW_END)).toBe(false)
    const moves = windowsAtNewEnd({
      links: [{ id: 'l1', buyContractId: 'b1', effectiveTo: null }],
      rows: [{ id: 'r1', buyContractId: 'b1', endDate: FIRST_END }],
      oldEnd: FIRST_END,
      earlier: none,
      newEnd: NEW_END,
    })
    expect(moves.links).toEqual([])
    // Her row on an open window still follows the end it was bounded by.
    expect(moves.rows.map((m) => m.id)).toEqual(['r1'])
  })

  it('an earlier end is read only off a day an earlier extension wrote', () => {
    expect([...earlierEnds([null, undefined, 'not a day', '2026-10-24T00:00:00.000Z'])]).toEqual(['2026-10-24'])
  })
})

describe('which pay line moves with the placement', () => {
  it('the pay line moved is the one in force at the end, never the first link on the record', () => {
    const links = [
      { buyContractId: 'b-old', effectiveFrom: u('2026-07-26'), effectiveTo: u('2026-09-15') },
      { buyContractId: 'b-now', effectiveFrom: u('2026-09-16'), effectiveTo: FIRST_END },
    ]
    expect(payLineInForce(links, FIRST_END, new Set())).toBe('b-now')
  })

  it('a pay line whose window an earlier extension left behind is still the one in force', () => {
    const links = [{ buyContractId: 'b1', effectiveFrom: u('2026-07-26'), effectiveTo: FIRST_END }]
    expect(payLineInForce(links, u('2026-12-31'), earlierEnds(['2026-10-24']))).toBe('b1')
    expect(payLineInForce(links, u('2026-12-31'), new Set())).toBeNull()
  })

  it('two pay lines starting the same day are a question for a person, and neither is moved', () => {
    const links = [
      { buyContractId: 'b1', effectiveFrom: u('2026-07-26'), effectiveTo: FIRST_END },
      { buyContractId: 'b2', effectiveFrom: u('2026-07-26'), effectiveTo: FIRST_END },
    ]
    expect(payLineInForce(links, FIRST_END, new Set())).toBeNull()
  })

  it('an open-ended pay line is the one in force', () => {
    expect(payLineInForce([{ buyContractId: 'b1', effectiveFrom: u('2026-07-26'), effectiveTo: null }], FIRST_END, new Set())).toBe('b1')
  })
})

describe('what the moved window does to her pay', () => {
  const week = { '2026-10-26': 8, '2026-10-27': 8, '2026-10-28': 8, '2026-10-29': 8, '2026-10-30': 8 }

  it("an extended placement's added days are paid like the days before", () => {
    const before = [{ buyContractId: 'b1', sellContractId: 's1', effectiveFrom: u('2026-07-26'), effectiveTo: FIRST_END }]
    expect(daysFor('b1', before, week)).toEqual({})
    const after = [{ ...before[0], effectiveTo: NEW_END }]
    expect(daysFor('b1', after, week)).toEqual(week)
  })
})

describe('a processed pay period is never reopened by an extension', () => {
  const US_IT = getTemplatePack('US_IT')!.cycleDefinitions
  const START = u('2026-01-05')
  const WED = u('2026-02-25')
  const rows = (end: Date) =>
    generateCycles(START, end, US_IT)
      .filter((c) => c.kind === 'TIMESHEET_SUBMIT')
      .map((c) => ({ sellContractId: 's1', kind: c.kind, dueOn: c.dueOn, periodStart: c.periodStart, periodEnd: c.periodEnd }) as PlannedCycle)

  it('a processed pay run is never reopened by an extension: its period keeps its last day, and an open one is widened', () => {
    const before = rows(WED)
    const stored = before.map((c, i) => ({
      id: `c${i}`, sellContractId: 's1', buyContractId: null, kind: c.kind, periodStart: c.periodStart, periodEnd: c.periodEnd,
      completedAt: null as Date | null,
    }))
    const full = rows(u('2026-03-31'))
    const added = full.filter((c) => c.periodStart.getTime() > WED.getTime())

    const open = extensionPlan(stored, full, added)
    expect(open.widen.map((w) => w.id)).toEqual([stored[stored.length - 1].id])
    expect(open.kept).toBe(0)

    stored[stored.length - 1].completedAt = u('2026-03-02')
    const done = extensionPlan(stored, full, added)
    expect(done.widen).toEqual([])
    expect(done.kept).toBe(1)
    // And the period it covered is not written a second time.
    expect(done.write.some((c) => c.periodStart.getTime() === stored[stored.length - 1].periodStart!.getTime())).toBe(false)
  })
})
