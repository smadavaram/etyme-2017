import { describe, it, expect } from 'vitest'
import { readWindow, billingWindow, inWindow } from '@/lib/money/invoice-window'
import { billableInPeriod, iso, type Terms } from '@/lib/periods'
import { policyOf } from '@/lib/overtime'

/**
 * The dates somebody asks a bill for are the bound on it.
 *
 * Found on the founder's lifecycle walk of 2026-09-28: a bill asked for
 * one week pulled three weeks of hours. The generator read the dates
 * asked for only to decide which timesheets to LOAD — anything touching
 * the window by a single day — and then priced every one of them
 * against the contract's whole billing period. On a monthly contract
 * that is the month, so a week that grazed the window on its last day
 * was billed whole, and the header said "September" over one week of
 * work. A period asked for under a name the route does not read was
 * worse: it was dropped without a word, and the run billed every
 * unbilled week the engagement had.
 *
 * So the window asked for is the billing period of the bill, cut to the
 * contract period it falls in, and a week crossing its edge follows the
 * straddle rule a bill can record — never an accident of which rows
 * happened to be loaded.
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function terms(over: Partial<Terms> = {}): Terms {
  return {
    frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT',
    startedOn: d('2026-06-01'),
    ...over,
  }
}

/** Five eight-hour days from a Monday. */
function week(monday: string) {
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(d(monday).getTime() + i * 86_400_000))] = 8
  return {
    id: monday, periodStart: d(monday),
    periodEnd: new Date(d(monday).getTime() + 6 * 86_400_000),
    days, totalHours: 40,
  }
}

const POLICY = policyOf({ overtimeAfterHours: null, overtimeMultiplierBps: 15_000 })

function asked(body: Record<string, unknown>) {
  const r = readWindow(body)
  if (!r.ok) throw new Error(r.says)
  return r
}

describe('what the bill was asked for', () => {
  it('a bill asked for with no dates covers the whole billing period the latest work falls in', () => {
    const w = billingWindow(asked({}), d('2026-09-20'), terms())
    expect(iso(w.window.start)).toBe('2026-09-01')
    expect(iso(w.window.end)).toBe('2026-09-30')
    expect(w.window.label).toBe('September 2026')
    expect(w.narrowed).toBe(false)
  })

  it('a bill asked for one week of a monthly contract is bounded by that week, not by the month', () => {
    const w = billingWindow(asked({ periodStart: '2026-09-14', periodEnd: '2026-09-20' }), d('2026-09-27'), terms())
    expect(iso(w.window.start)).toBe('2026-09-14')
    expect(iso(w.window.end)).toBe('2026-09-20')
    expect(iso(w.contractPeriod.start)).toBe('2026-09-01')
    expect(w.narrowed).toBe(true)
    expect(w.window.label).toBe('2026-09-14 to 2026-09-20, part of September 2026')
  })

  it('a bill asked for with only a start date runs from that date to the end of its billing period', () => {
    const w = billingWindow(asked({ periodStart: '2026-09-14' }), d('2026-10-20'), terms())
    expect(iso(w.window.start)).toBe('2026-09-14')
    expect(iso(w.window.end)).toBe('2026-09-30')
  })

  it('a bill asked for with only an end date runs from the start of its billing period to that date', () => {
    const w = billingWindow(asked({ periodEnd: '2026-09-20' }), d('2026-10-20'), terms())
    expect(iso(w.window.start)).toBe('2026-09-01')
    expect(iso(w.window.end)).toBe('2026-09-20')
  })

  it('dates that run past the end of the billing period are cut at the period end, and the bill says so', () => {
    const w = billingWindow(asked({ periodStart: '2026-09-28', periodEnd: '2026-10-04' }), d('2026-10-04'), terms())
    expect(iso(w.window.start)).toBe('2026-09-28')
    expect(iso(w.window.end)).toBe('2026-09-30')
    expect(w.clipped).toContain('September 2026')
    expect(w.clipped).toContain('next')
  })

  it('a bill asked for with its end before its start is refused in a sentence', () => {
    const r = readWindow({ periodStart: '2026-09-20', periodEnd: '2026-09-14' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toMatch(/before it starts/)
  })

  it('a date that is not a date is refused rather than ignored', () => {
    const r = readWindow({ periodStart: 'last week' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.field).toBe('periodStart')
      expect(r.says).toContain('last week')
    }
  })

  it('a period asked for under a name the generator does not read is refused rather than billing every week', () => {
    for (const key of ['from', 'to', 'start', 'end', 'period', 'weekOf', 'startDate', 'endDate']) {
      const r = readWindow({ [key]: '2026-09-14' })
      expect(r.ok, key).toBe(false)
      if (!r.ok) expect(r.says).toContain('periodStart')
    }
  })

  it('a date with a time on it is read as the calendar day it names', () => {
    const r = asked({ periodStart: '2026-09-14T17:30:00.000Z' })
    expect(iso(r.start!)).toBe('2026-09-14')
    expect(r.start!.getUTCHours()).toBe(0)
  })
})

describe('which weeks the window bills', () => {
  // Three consecutive weeks inside September, all signed and unbilled.
  const W1 = week('2026-09-07'), W2 = week('2026-09-14'), W3 = week('2026-09-21')
  const window = billingWindow(
    asked({ periodStart: '2026-09-14', periodEnd: '2026-09-20' }), d('2026-09-27'), terms()
  ).window
  const bills = (s: ReturnType<typeof week>, straddle: Terms['straddle'] = 'SPLIT') =>
    billableInPeriod(s, window, straddle, 10_000, POLICY)

  it('an invoice generated for one week bills only that week\'s hours', () => {
    const billed = [W1, W2, W3].map((s) => bills(s)).filter(Boolean)
    expect(billed).toHaveLength(1)
    expect(billed[0]!.hours).toBe(40)
    expect(billed[0]!.value.totalCents).toBe(400_000)
  })

  it('a week touching the dates asked for by one day is not billed on that bill when it ends outside them', () => {
    // Asked for the 13th to the 20th: the week of the 7th ends on the
    // 13th and belongs here; the week of the 14th ends on the 20th and
    // belongs here; the week of the 21st does not start until after.
    const w = billingWindow(asked({ periodStart: '2026-09-13', periodEnd: '2026-09-20' }), d('2026-09-27'), terms()).window
    const got = [W1, W2, W3].map((s) => billableInPeriod(s, w, 'END', 10_000, POLICY)?.hours ?? 0)
    expect(got).toEqual([40, 40, 0])

    // And one day later the week of the 7th is somebody else's bill.
    const w2 = billingWindow(asked({ periodStart: '2026-09-14', periodEnd: '2026-09-21' }), d('2026-09-27'), terms()).window
    const got2 = [W1, W2, W3].map((s) => billableInPeriod(s, w2, 'END', 10_000, POLICY)?.hours ?? 0)
    expect(got2).toEqual([0, 40, 0])
  })

  it('a week crossing the edge of the dates asked for is billed whole where it ends, under the straddle rule a bill can record', () => {
    // Asked for the 10th to the 16th. The week of the 7th ends on the
    // 13th, inside: billed whole, never four-sevenths of it.
    const w = billingWindow(asked({ periodStart: '2026-09-10', periodEnd: '2026-09-16' }), d('2026-09-27'), terms()).window
    const split = billableInPeriod(W1, w, 'SPLIT', 10_000, POLICY)
    expect(split?.hours).toBe(40)
    expect(split?.share.note).toMatch(/billed in the period it ends in/)
    // The week of the 14th ends on the 20th, outside: not on this bill.
    expect(billableInPeriod(W2, w, 'SPLIT', 10_000, POLICY)).toBeNull()
  })

  it('a week crossing the edge under START is billed whole where it starts', () => {
    const w = billingWindow(asked({ periodStart: '2026-09-10', periodEnd: '2026-09-16' }), d('2026-09-27'), terms({ straddle: 'START' })).window
    expect(billableInPeriod(W1, w, 'START', 10_000, POLICY)).toBeNull()
    expect(billableInPeriod(W2, w, 'START', 10_000, POLICY)?.hours).toBe(40)
  })

  it('an expense or a milestone rides on a windowed bill only when it falls inside the window', () => {
    expect(inWindow(d('2026-09-18'), window)).toBe(true)
    expect(inWindow(d('2026-09-13'), window)).toBe(false)
    expect(inWindow(d('2026-09-21'), window)).toBe(false)
    // A timestamp late on the last day is still that day.
    expect(inWindow(new Date('2026-09-20T23:59:00.000Z'), window)).toBe(true)
  })
})
