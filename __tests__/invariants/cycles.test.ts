import { describe, it, expect } from 'vitest'

/**
 * Cycle generation invariants — from CLAUDE.md §Hardest Things #1.
 *
 * "Nineteen kinds, five frequencies, business-day shifting against a
 * per-company holiday calendar, month ends, February, and idempotency
 * on extension."
 *
 * Port the arithmetic, not the architecture, and write the tests first.
 */

import { generateCycles, type CycleDefinition } from '@/lib/cycle-generator'

const WEEKLY_SUBMIT: CycleDefinition = {
  kind: 'TIMESHEET_SUBMIT',
  frequency: 'WEEKLY',
  offsetDays: 1, // due Monday after the week ends
}

const BIWEEKLY_PAY: CycleDefinition = {
  kind: 'SALARY_PAY',
  frequency: 'BIWEEKLY',
  offsetDays: 5, // 5 days after period end
}

const MONTHLY_INVOICE: CycleDefinition = {
  kind: 'INVOICE_GENERATE',
  frequency: 'MONTHLY',
  offsetDays: 3,
}

const SEMIMONTHLY_PAY: CycleDefinition = {
  kind: 'SALARY_PAY',
  frequency: 'SEMIMONTHLY',
  offsetDays: 2,
}

const ON_COMPLETION: CycleDefinition = {
  kind: 'INVOICE_DUE',
  frequency: 'ON_COMPLETION',
  offsetDays: 0,
}

describe('Cycle Generation (CLAUDE.md §Hardest Things #1)', () => {
  describe('Weekly frequency', () => {
    it('generates one cycle per week for a 4-week assignment', () => {
      const start = new Date('2026-08-03') // Monday
      const end = new Date('2026-08-28') // Friday

      const cycles = generateCycles(start, end, [WEEKLY_SUBMIT])

      // Should generate cycles for each Friday: Aug 7, 14, 21, 28
      expect(cycles.length).toBeGreaterThanOrEqual(3)
      expect(cycles.every((c) => c.kind === 'TIMESHEET_SUBMIT')).toBe(true)
    })

    it('shifts weekend due dates to Monday', () => {
      // With offset 1, due date would land on Saturday after a Friday period end
      const start = new Date('2026-08-03')
      const end = new Date('2026-08-14')

      const cycles = generateCycles(start, end, [WEEKLY_SUBMIT])

      for (const c of cycles) {
        const day = c.dueOn.getDay()
        expect(day).not.toBe(0) // Not Sunday
        expect(day).not.toBe(6) // Not Saturday
      }
    })
  })

  describe('Biweekly frequency', () => {
    it('generates cycles every 14 days', () => {
      const start = new Date('2026-08-01')
      const end = new Date('2026-09-30')

      const cycles = generateCycles(start, end, [BIWEEKLY_PAY])

      // ~4 biweekly periods in 2 months
      expect(cycles.length).toBeGreaterThanOrEqual(3)
      expect(cycles.length).toBeLessThanOrEqual(6)
    })
  })

  describe('Semimonthly frequency', () => {
    it('generates two cycles per month (15th and last day)', () => {
      const start = new Date('2026-08-01')
      const end = new Date('2026-08-31')

      const cycles = generateCycles(start, end, [SEMIMONTHLY_PAY])

      expect(cycles.length).toBe(2) // 15th and 31st
    })

    it('handles February correctly (28 days, not 30)', () => {
      const start = new Date('2027-02-01')
      const end = new Date('2027-02-28')

      const cycles = generateCycles(start, end, [SEMIMONTHLY_PAY])

      // 15th and 28th
      expect(cycles.length).toBe(2)
    })
  })

  describe('Monthly frequency', () => {
    it('generates one cycle per month', () => {
      const start = new Date('2026-01-01')
      const end = new Date('2026-06-30')

      const cycles = generateCycles(start, end, [MONTHLY_INVOICE])

      expect(cycles.length).toBe(6) // Jan through June
    })

    it('handles year boundary (December → January)', () => {
      const start = new Date('2026-11-01')
      const end = new Date('2027-02-28')

      const cycles = generateCycles(start, end, [MONTHLY_INVOICE])

      expect(cycles.length).toBe(4) // Nov, Dec, Jan, Feb
    })
  })

  describe('ON_COMPLETION frequency', () => {
    it('generates exactly one cycle at the end date', () => {
      const start = new Date('2026-08-01')
      const end = new Date('2026-12-31')

      const cycles = generateCycles(start, end, [ON_COMPLETION])

      expect(cycles.length).toBe(1)
    })
  })

  describe('Business day shifting', () => {
    it('shifts all due dates off weekends', () => {
      const start = new Date('2026-01-01')
      const end = new Date('2026-12-31')

      const cycles = generateCycles(start, end, [
        WEEKLY_SUBMIT,
        MONTHLY_INVOICE,
        SEMIMONTHLY_PAY,
      ])

      for (const c of cycles) {
        const day = c.dueOn.getDay()
        expect(day).not.toBe(0) // Sunday
        expect(day).not.toBe(6) // Saturday
      }
    })

    it('shifts holidays to the next business day', () => {
      const start = new Date('2026-12-01')
      const end = new Date('2026-12-31')

      // Christmas is on a Friday in 2026
      const holidays = ['2026-12-25']

      const cycles = generateCycles(start, end, [MONTHLY_INVOICE], holidays)

      // The monthly cycle due ~Jan 3 should skip Dec 25 if it lands there
      for (const c of cycles) {
        const dateStr = c.dueOn.toISOString().slice(0, 10)
        expect(dateStr).not.toBe('2026-12-25')
      }
    })
  })

  describe('Idempotency on extension', () => {
    it('does not regenerate cycles that already exist', () => {
      const start = new Date('2026-08-01')
      const end = new Date('2026-10-31')

      // First generation
      const first = generateCycles(start, end, [MONTHLY_INVOICE])

      // Build existing dates map
      const existing = new Map<string, Set<string>>()
      for (const c of first) {
        const dateStr = c.dueOn.toISOString().slice(0, 10)
        if (!existing.has(c.kind)) existing.set(c.kind, new Set())
        existing.get(c.kind)!.add(dateStr)
      }

      // Extend to December
      const extendedEnd = new Date('2026-12-31')
      const second = generateCycles(start, extendedEnd, [MONTHLY_INVOICE], [], existing)

      // Should only have the NEW months (Nov, Dec), not re-generate Aug-Oct
      expect(second.length).toBe(2)
    })
  })

  describe('Multiple cycle kinds', () => {
    it('generates interleaved cycles sorted by date', () => {
      const start = new Date('2026-08-01')
      const end = new Date('2026-08-31')

      const cycles = generateCycles(start, end, [
        WEEKLY_SUBMIT,
        MONTHLY_INVOICE,
      ])

      // Should have weekly + monthly cycles, sorted by date
      expect(cycles.length).toBeGreaterThan(1)

      for (let i = 1; i < cycles.length; i++) {
        expect(cycles[i].dueOn.getTime()).toBeGreaterThanOrEqual(cycles[i - 1].dueOn.getTime())
      }
    })
  })
})

// ── The pack's day is honoured ────────────────────────────────────────
//
// Every case below was silently wrong: the engine hard-coded Friday, the
// 15th and month-end and the callers dropped the pack's day fields on
// the way in. These are the dates a pack actually asks for.

describe('the day a pack asks for is the day it gets', () => {
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)

  it('a Monday approval lands on Monday, not on the default Friday', () => {
    const cycles = generateCycles(on(2026, 3, 2), on(2026, 3, 29), [
      { kind: 'TIMESHEET_APPROVE', frequency: 'WEEKLY', dayOfWeek: 1 },
    ])
    expect(cycles.length).toBeGreaterThan(0)
    for (const c of cycles) expect(c.dueOn.getDay()).toBe(1)
  })

  it('a vendor bill due on the 15th lands on the 15th, not at month-end', () => {
    const cycles = generateCycles(on(2026, 1, 1), on(2026, 3, 31), [
      { kind: 'VENDOR_BILL_DUE', frequency: 'MONTHLY', dayOfMonth: 15 },
    ])
    // Jan 15 2026 is a Thursday, Feb 15 a Sunday → Mon 16, Mar 15 a Sunday → Mon 16
    expect(cycles.map((c) => ymd(c.dueOn))).toEqual(['2026-01-15', '2026-02-16', '2026-03-16'])
  })

  it('the 30th in February is the 28th, or the 29th in a leap year', () => {
    const plain = generateCycles(on(2026, 2, 1), on(2026, 2, 28), [
      { kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 30 },
    ])
    // 30 is at or past 28, so it means month-end: Sat 28 Feb 2026 → Mon 2 Mar
    expect(plain.map((c) => ymd(c.dueOn))).toEqual(['2026-03-02'])

    const leap = generateCycles(on(2028, 2, 1), on(2028, 2, 29), [
      { kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 30 },
    ])
    // Tue 29 Feb 2028 — a working day, stays put
    expect(leap.map((c) => ymd(c.dueOn))).toEqual(['2028-02-29'])
  })

  it('a day at or past 28 means month-end whatever the month has', () => {
    const cycles = generateCycles(on(2026, 4, 1), on(2026, 5, 31), [
      { kind: 'INVOICE_DUE', frequency: 'MONTHLY', dayOfMonth: 28 },
    ])
    // Apr 30 2026 is a Thursday; May 31 a Sunday → Mon 1 Jun
    expect(cycles.map((c) => ymd(c.dueOn))).toEqual(['2026-04-30', '2026-06-01'])
  })

  it('a semimonthly cycle cut on the 1st gives the 1st and the last of each month', () => {
    const cycles = generateCycles(on(2026, 3, 1), on(2026, 4, 30), [
      { kind: 'INVOICE_GENERATE', frequency: 'SEMIMONTHLY', dayOfMonth: 1 },
    ])
    // Sun 1 Mar → Mon 2; Tue 31 Mar; Wed 1 Apr; Thu 30 Apr
    expect(cycles.map((c) => ymd(c.dueOn))).toEqual(['2026-03-02', '2026-03-31', '2026-04-01', '2026-04-30'])
  })

  it('a compliance kind in a definition is refused, not generated', () => {
    const cycles = generateCycles(on(2026, 1, 1), on(2026, 12, 31), [
      { kind: 'GST_RETURN', frequency: 'MONTHLY', dayOfMonth: 20 },
      { kind: 'IR35_ASSESSMENT', frequency: 'ON_COMPLETION' },
      { kind: 'INVOICE_DUE', frequency: 'MONTHLY' },
    ])
    expect(cycles.map((c) => c.kind)).not.toContain('GST_RETURN')
    expect(cycles.map((c) => c.kind)).not.toContain('IR35_ASSESSMENT')
    expect(cycles.some((c) => c.kind === 'INVOICE_DUE')).toBe(true)
  })
})
