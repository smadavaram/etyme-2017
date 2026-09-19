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
  kind: 'INVOICE_GENERATE',
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

// ── The pack's day is honored ────────────────────────────────────────
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

  it('a vendor bill raised on the 15th lands on the 15th, not at month-end', () => {
    const cycles = generateCycles(on(2026, 1, 1), on(2026, 3, 31), [
      { kind: 'VENDOR_BILL_GENERATE', frequency: 'MONTHLY', dayOfMonth: 15 },
    ])
    // Jan 15 2026 is a Thursday. Feb 15 and Mar 15 are both Sundays, and a
    // vendor bill is money going out, so each lands on the Friday before
    // rather than the Monday after.
    expect(cycles.map((c) => ymd(c.dueOn))).toEqual(['2026-01-15', '2026-02-13', '2026-03-13'])
  })

  it('the 30th in February is the 28th, or the 29th in a leap year', () => {
    const plain = generateCycles(on(2026, 2, 1), on(2026, 2, 28), [
      { kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 30 },
    ])
    // 30 is at or past 28, so it means month-end: Sat 28 Feb 2026. A pay
    // day moves back to the Friday, not on to the Monday.
    expect(plain.map((c) => ymd(c.dueOn))).toEqual(['2026-02-27'])

    const leap = generateCycles(on(2028, 2, 1), on(2028, 2, 29), [
      { kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 30 },
    ])
    // Tue 29 Feb 2028 — a working day, stays put
    expect(leap.map((c) => ymd(c.dueOn))).toEqual(['2028-02-29'])
  })

  it('a day at or past 28 means month-end whatever the month has', () => {
    const cycles = generateCycles(on(2026, 4, 1), on(2026, 5, 31), [
      { kind: 'INVOICE_GENERATE', frequency: 'MONTHLY', dayOfMonth: 28 },
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

  it('two period ends that fall on the same working day raise one invoice, not two', () => {
    // Sat 31 Oct 2026 is a month-end cut and Sun 1 Nov is the next month's
    // first cut. Both move forward to Mon 2 Nov. Before this, both were
    // written — one day carrying two invoices for one period.
    const cycles = generateCycles(on(2026, 10, 25), on(2026, 11, 5), [
      { kind: 'INVOICE_GENERATE', frequency: 'SEMIMONTHLY', dayOfMonth: 1 },
    ])
    const days = cycles.map((c) => ymd(c.dueOn))
    expect(new Set(days).size).toBe(days.length)
    expect(days.filter((d) => d === '2026-11-02')).toHaveLength(1)
  })

  it('a pay day on a Saturday is paid on the Friday before, not the Monday after', () => {
    // Sat 4 Jul 2026. Moving it forward pays somebody after the period it
    // covers and leaves them short over the weekend, which is why US
    // payroll has always paid it early.
    const pay = generateCycles(on(2026, 7, 1), on(2026, 7, 31), [
      { kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 4 },
    ])
    expect(ymd(pay[0].dueOn)).toBe('2026-07-03')
  })

  it('an invoice falling on a Saturday is raised on the Monday', () => {
    // The other direction on purpose: raising a client's invoice early
    // is the surprise on that side, so billing moves forward.
    const bill = generateCycles(on(2026, 7, 1), on(2026, 7, 31), [
      { kind: 'INVOICE_GENERATE', frequency: 'MONTHLY', dayOfMonth: 4 },
    ])
    expect(ymd(bill[0].dueOn)).toBe('2026-07-06')
  })

  it('a pay day lands before a holiday, and skips back over the weekend behind it', () => {
    // Fri 3 Jul 2026 observed for Independence Day. Back one is a Friday
    // holiday, back again is Thursday.
    const pay = generateCycles(
      on(2026, 7, 1),
      on(2026, 7, 31),
      [{ kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 4 }],
      ['2026-07-03']
    )
    expect(ymd(pay[0].dueOn)).toBe('2026-07-02')
  })

  it('a holiday shifts the due date whatever timezone the server is in', () => {
    // The holiday key was read back out of the date in UTC while the date
    // itself was built at local midnight, so east of Greenwich every
    // lookup missed by a day and no holiday shifted anything at all.
    //
    // Read in local parts, because `ymd` above converts to UTC and is the
    // very confusion under test.
    const localYmd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const tz = process.env.TZ
    for (const zone of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
      try {
        process.env.TZ = zone
        const cycles = generateCycles(
          on(2026, 7, 1),
          on(2026, 7, 31),
          [{ kind: 'INVOICE_GENERATE', frequency: 'MONTHLY', dayOfMonth: 6 }],
          ['2026-07-06']
        )
        // Mon 6 Jul is a holiday, so the invoice moves to the Tuesday.
        expect(localYmd(cycles[0].dueOn), `under ${zone}`).toBe('2026-07-07')
      } finally {
        process.env.TZ = tz
      }
    }
  })

  it('generating twice adds nothing the second time', () => {
    const defs = [{ kind: 'TIMESHEET_SUBMIT' as const, frequency: 'WEEKLY' as const }]
    const first = generateCycles(on(2026, 1, 1), on(2026, 3, 31), defs)
    expect(first.length).toBeGreaterThan(0)

    const already = new Map([['TIMESHEET_SUBMIT', new Set(first.map((c) => ymd(c.dueOn)))]])
    const second = generateCycles(on(2026, 1, 1), on(2026, 3, 31), defs, [], already)
    expect(second).toEqual([])
  })

  it('extending a contract adds the new months and leaves the old dates alone', () => {
    const defs = [{ kind: 'TIMESHEET_SUBMIT' as const, frequency: 'WEEKLY' as const }]
    const before = generateCycles(on(2026, 1, 1), on(2026, 3, 31), defs)
    const already = new Map([['TIMESHEET_SUBMIT', new Set(before.map((c) => ymd(c.dueOn)))]])

    // The same contract, three months longer, generated over its whole life.
    const added = generateCycles(on(2026, 1, 1), on(2026, 6, 30), defs, [], already)

    expect(added.length).toBeGreaterThan(0)
    for (const c of added) expect(c.dueOn > on(2026, 3, 31)).toBe(true)
    // And nothing from the original run comes back a second time.
    const old = new Set(before.map((c) => ymd(c.dueOn)))
    for (const c of added) expect(old.has(ymd(c.dueOn))).toBe(false)
  })

  it('a fortnightly cycle keeps its original weeks when the contract is extended', () => {
    // Restarting the count at the old end date lands on the wrong weeks
    // half the time, which is why generation runs over the whole contract
    // and drops what is already written.
    const defs = [{ kind: 'SALARY_PAY' as const, frequency: 'BIWEEKLY' as const }]
    const before = generateCycles(on(2026, 1, 1), on(2026, 3, 31), defs)
    const already = new Map([['SALARY_PAY', new Set(before.map((c) => ymd(c.dueOn)))]])
    const added = generateCycles(on(2026, 1, 1), on(2026, 6, 30), defs, [], already)

    const last = before[before.length - 1].dueOn
    const gap = (added[0].dueOn.getTime() - last.getTime()) / 86_400_000
    expect(gap).toBe(14)
  })

  it('a compliance kind in a definition is refused, not generated', () => {
    const cycles = generateCycles(on(2026, 1, 1), on(2026, 12, 31), [
      { kind: 'GST_RETURN', frequency: 'MONTHLY', dayOfMonth: 20 },
      { kind: 'IR35_ASSESSMENT', frequency: 'ON_COMPLETION' },
      { kind: 'INVOICE_GENERATE', frequency: 'MONTHLY' },
    ])
    expect(cycles.map((c) => c.kind)).not.toContain('GST_RETURN')
    expect(cycles.map((c) => c.kind)).not.toContain('IR35_ASSESSMENT')
    expect(cycles.some((c) => c.kind === 'INVOICE_GENERATE')).toBe(true)
  })
})
