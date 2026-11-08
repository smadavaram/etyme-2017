import { describe, it, expect } from 'vitest'
import { generateCycles, localKey } from '@/lib/cycle-generator'

/**
 * CLAUDE.md, "The cycle engine, honestly", item 9 (etyme-money,
 * 2026-09-22): `dayInMonth` built each month's date at local midnight and
 * checked it against the contract's UTC-midnight start and end, so under
 * TZ=America/New_York a twelve-month monthly billing series wrote eleven
 * dates: the last month's invoice date fell "after" the contract's last
 * day by five hours and was dropped. A month of revenue with no invoice
 * date. The check is now by calendar day, so the count is the same in
 * every zone and nothing moves under UTC, which is where production runs.
 */

// Contract dates are stored as UTC midnights.
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

function inZone<T>(zone: string, fn: () => T): T {
  const tz = process.env.TZ
  try { process.env.TZ = zone; return fn() } finally { process.env.TZ = tz }
}

const MONTHLY = [{ kind: 'INVOICE_GENERATE' as const, frequency: 'MONTHLY' as const, dayOfMonth: 28 }]
const SEMI = [{ kind: 'INVOICE_GENERATE' as const, frequency: 'SEMIMONTHLY' as const, dayOfMonth: 15 }]

describe('a monthly cycle writes one date per month in every time zone', () => {
  for (const zone of ['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata']) {
    it(`a twelve-month contract billed at month end has twelve invoice dates under ${zone}`, () => {
      const keys = inZone(zone, () => generateCycles(utc(2026, 1, 1), utc(2026, 12, 31), MONTHLY).map((c) => localKey(c.dueOn)))
      expect(keys.length, keys.join(' ')).toBe(12)
      // December 31, 2026 is a Thursday: the last month's date is the contract's last day.
      expect(keys).toContain('2026-12-31')
    })

    it(`a semimonthly contract over a year has as many invoice dates as under UTC, under ${zone}`, () => {
      const n = inZone(zone, () => generateCycles(utc(2026, 1, 1), utc(2026, 12, 31), SEMI).length)
      expect(n).toBe(inZone('UTC', () => generateCycles(utc(2026, 1, 1), utc(2026, 12, 31), SEMI).length))
    })
  }

  it('a month-end date that falls on the contract’s last day is kept, and one the day after it is not', () => {
    const kept = inZone('America/New_York', () => generateCycles(utc(2026, 1, 1), utc(2026, 3, 31), MONTHLY).length)
    const cut = inZone('America/New_York', () => generateCycles(utc(2026, 1, 1), utc(2026, 3, 30), MONTHLY).length)
    expect(kept).toBe(3)
    expect(cut).toBe(2)
  })

  it('under UTC the dates are exactly what they were before the fix', () => {
    const keys = inZone('UTC', () => generateCycles(utc(2026, 1, 1), utc(2026, 6, 30), MONTHLY).map((c) => localKey(c.dueOn)))
    expect(keys).toEqual(['2026-02-02', '2026-03-02', '2026-03-31', '2026-04-30', '2026-06-01', '2026-06-30'])
  })
})
