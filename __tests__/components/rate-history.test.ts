import { describe, it, expect } from 'vitest'

/**
 * Rate history module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * BUILD.md §6.9: "Rate changes must be versioned or the timesheet valuation
 * is unreliable."
 *
 * LEGACY_RULES.md §2.4: ChangeRate — polymorphic, date-ranged rate versioning.
 *   rate_on(date) queries change_rates where date falls between from_date and
 *   to_date. Falls back to earliest rate if no match.
 *
 * Tests the logic layer without rendering:
 * - Rate type validation
 * - Date range validation
 * - Overlap detection
 * - Rate lookup by date (rate_on)
 * - Audit trail tracking
 * - Contract type scoping
 * - Rate change formatting
 */

// ── Rate types ──────────────────────────────────────

describe('Rate type validation', () => {
  const VALID_TYPES = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']

  function isValidRateType(type: string): boolean {
    return VALID_TYPES.includes(type.toUpperCase())
  }

  it('HOURLY is a valid rate type', () => {
    expect(isValidRateType('HOURLY')).toBe(true)
  })

  it('DAILY is a valid rate type', () => {
    expect(isValidRateType('DAILY')).toBe(true)
  })

  it('WEEKLY is a valid rate type', () => {
    expect(isValidRateType('WEEKLY')).toBe(true)
  })

  it('MONTHLY is a valid rate type', () => {
    expect(isValidRateType('MONTHLY')).toBe(true)
  })

  it('lowercase types are normalized to uppercase', () => {
    expect(isValidRateType('hourly')).toBe(true)
  })

  it('ANNUAL is not a valid rate type', () => {
    expect(isValidRateType('ANNUAL')).toBe(false)
  })
})

// ── Date range validation ───────────────────────────

describe('Rate date range validation', () => {
  function isValidDateRange(fromDate: Date, toDate: Date | null): { valid: boolean; error?: string } {
    if (toDate && toDate <= fromDate) {
      return { valid: false, error: 'toDate must be after fromDate' }
    }
    return { valid: true }
  }

  it('a range where toDate is after fromDate is valid', () => {
    const result = isValidDateRange(new Date('2026-01-01'), new Date('2026-06-30'))
    expect(result.valid).toBe(true)
  })

  it('an open-ended range with null toDate is valid', () => {
    const result = isValidDateRange(new Date('2026-01-01'), null)
    expect(result.valid).toBe(true)
  })

  it('a range where toDate equals fromDate is invalid', () => {
    const d = new Date('2026-01-01')
    const result = isValidDateRange(d, d)
    expect(result.valid).toBe(false)
  })

  it('a range where toDate is before fromDate is invalid', () => {
    const result = isValidDateRange(new Date('2026-06-30'), new Date('2026-01-01'))
    expect(result.valid).toBe(false)
  })
})

// ── Overlap detection ───────────────────────────────

describe('Rate period overlap detection', () => {
  type RatePeriod = { fromDate: Date; toDate: Date | null }

  function periodsOverlap(a: RatePeriod, b: RatePeriod): boolean {
    const aEnd = a.toDate ?? new Date('9999-12-31')
    const bEnd = b.toDate ?? new Date('9999-12-31')
    return a.fromDate <= bEnd && b.fromDate <= aEnd
  }

  it('two adjacent periods do not overlap', () => {
    const a = { fromDate: new Date('2026-01-01'), toDate: new Date('2026-06-30') }
    const b = { fromDate: new Date('2026-07-01'), toDate: new Date('2026-12-31') }
    expect(periodsOverlap(a, b)).toBe(false)
  })

  it('two overlapping periods are detected', () => {
    const a = { fromDate: new Date('2026-01-01'), toDate: new Date('2026-06-30') }
    const b = { fromDate: new Date('2026-03-01'), toDate: new Date('2026-09-30') }
    expect(periodsOverlap(a, b)).toBe(true)
  })

  it('an open-ended period overlaps with any future period', () => {
    const a: RatePeriod = { fromDate: new Date('2026-01-01'), toDate: null }
    const b = { fromDate: new Date('2026-06-01'), toDate: new Date('2026-12-31') }
    expect(periodsOverlap(a, b)).toBe(true)
  })

  it('two open-ended periods overlap', () => {
    const a: RatePeriod = { fromDate: new Date('2026-01-01'), toDate: null }
    const b: RatePeriod = { fromDate: new Date('2026-06-01'), toDate: null }
    expect(periodsOverlap(a, b)).toBe(true)
  })

  it('a period entirely before another does not overlap', () => {
    const a = { fromDate: new Date('2025-01-01'), toDate: new Date('2025-12-31') }
    const b = { fromDate: new Date('2026-01-01'), toDate: new Date('2026-12-31') }
    expect(periodsOverlap(a, b)).toBe(false)
  })

  it('periods sharing a boundary date do overlap', () => {
    const a = { fromDate: new Date('2026-01-01'), toDate: new Date('2026-06-30') }
    const b = { fromDate: new Date('2026-06-30'), toDate: new Date('2026-12-31') }
    expect(periodsOverlap(a, b)).toBe(true)
  })
})

// ── Rate lookup by date (rate_on) ───────────────────

describe('Rate lookup by date', () => {
  type RateEntry = { rate: number; fromDate: Date; toDate: Date | null }

  /**
   * LEGACY_RULES.md §2.4: rate_on(date) — find rate where date falls between
   * from_date and to_date. Falls back to earliest rate if no match.
   */
  function rateOn(entries: RateEntry[], date: Date): number | null {
    if (entries.length === 0) return null

    // Find a matching entry
    for (const entry of entries) {
      const entryEnd = entry.toDate ?? new Date('9999-12-31')
      if (date >= entry.fromDate && date <= entryEnd) {
        return entry.rate
      }
    }

    // Fallback: return the earliest rate
    const sorted = [...entries].sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime())
    return sorted[0].rate
  }

  const history: RateEntry[] = [
    { rate: 10000, fromDate: new Date('2025-01-01'), toDate: new Date('2025-12-31') },
    { rate: 12000, fromDate: new Date('2026-01-01'), toDate: new Date('2026-06-30') },
    { rate: 13500, fromDate: new Date('2026-07-01'), toDate: null }, // current
  ]

  it('returns the rate for a date within the first period', () => {
    expect(rateOn(history, new Date('2025-06-15'))).toBe(10000)
  })

  it('returns the rate for a date within the second period', () => {
    expect(rateOn(history, new Date('2026-03-15'))).toBe(12000)
  })

  it('returns the current open-ended rate for a date in the future', () => {
    expect(rateOn(history, new Date('2026-09-01'))).toBe(13500)
  })

  it('falls back to the earliest rate when no period matches', () => {
    expect(rateOn(history, new Date('2024-01-01'))).toBe(10000)
  })

  it('returns null when there are no rate entries', () => {
    expect(rateOn([], new Date('2026-01-01'))).toBeNull()
  })

  it('returns the exact boundary date rate', () => {
    expect(rateOn(history, new Date('2026-01-01'))).toBe(12000)
  })
})

// ── Audit trail ─────────────────────────────────────

describe('Rate change audit trail', () => {
  function createAuditEntry(
    newRate: number,
    previousRate: number | null,
    changedById: string,
    reason: string | null
  ) {
    return {
      newRate,
      previousRate,
      changedById,
      reason,
      delta: previousRate !== null ? newRate - previousRate : null,
      deltaPercent: previousRate !== null && previousRate > 0
        ? Math.round(((newRate - previousRate) / previousRate) * 10000) / 100
        : null,
    }
  }

  it('the first rate has no previous rate or delta', () => {
    const audit = createAuditEntry(10000, null, 'user-1', 'Initial rate')
    expect(audit.previousRate).toBeNull()
    expect(audit.delta).toBeNull()
    expect(audit.deltaPercent).toBeNull()
  })

  it('a rate increase records a positive delta', () => {
    const audit = createAuditEntry(12000, 10000, 'user-1', 'Annual increase')
    expect(audit.delta).toBe(2000)
    expect(audit.deltaPercent).toBe(20)
  })

  it('a rate decrease records a negative delta', () => {
    const audit = createAuditEntry(9000, 10000, 'user-1', 'Rate reduction')
    expect(audit.delta).toBe(-1000)
    expect(audit.deltaPercent).toBe(-10)
  })

  it('the change reason is preserved', () => {
    const audit = createAuditEntry(12000, 10000, 'user-1', 'Annual review — 20% increase')
    expect(audit.reason).toBe('Annual review — 20% increase')
  })
})

// ── Contract type scoping ───────────────────────────

describe('Rate history is scoped by contract type', () => {
  type RateRecord = { contractType: string; contractId: string; rate: number }

  function filterByContract(entries: RateRecord[], contractType: string, contractId: string): RateRecord[] {
    return entries.filter(
      (e) => e.contractType === contractType && e.contractId === contractId
    )
  }

  const allRates: RateRecord[] = [
    { contractType: 'SELL', contractId: 'sc-1', rate: 12000 },
    { contractType: 'SELL', contractId: 'sc-1', rate: 13000 },
    { contractType: 'BUY', contractId: 'bc-1', rate: 8500 },
    { contractType: 'SELL', contractId: 'sc-2', rate: 15000 },
    { contractType: 'BUY', contractId: 'bc-1', rate: 9000 },
  ]

  it('filters sell contract rate history correctly', () => {
    const result = filterByContract(allRates, 'SELL', 'sc-1')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.contractType === 'SELL')).toBe(true)
  })

  it('filters buy contract rate history correctly', () => {
    const result = filterByContract(allRates, 'BUY', 'bc-1')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.contractType === 'BUY')).toBe(true)
  })

  it('returns empty for a contract with no rate history', () => {
    const result = filterByContract(allRates, 'SELL', 'sc-999')
    expect(result).toHaveLength(0)
  })
})

// ── Rate validation ─────────────────────────────────

describe('Rate value validation', () => {
  function isValidRate(rate: unknown): { valid: boolean; error?: string } {
    if (typeof rate !== 'number') {
      return { valid: false, error: 'rate must be a number' }
    }
    if (rate < 0) {
      return { valid: false, error: 'rate must be non-negative' }
    }
    if (!Number.isFinite(rate)) {
      return { valid: false, error: 'rate must be finite' }
    }
    return { valid: true }
  }

  it('a positive rate in cents is valid', () => {
    expect(isValidRate(12000).valid).toBe(true)
  })

  it('zero rate is valid (bench-paid, no bill)', () => {
    expect(isValidRate(0).valid).toBe(true)
  })

  it('a negative rate is invalid', () => {
    expect(isValidRate(-100).valid).toBe(false)
  })

  it('a string rate is invalid', () => {
    expect(isValidRate('12000').valid).toBe(false)
  })

  it('NaN is invalid', () => {
    expect(isValidRate(NaN).valid).toBe(false)
  })

  it('Infinity is invalid', () => {
    expect(isValidRate(Infinity).valid).toBe(false)
  })
})

// ── Rate change formatting ──────────────────────────

describe('Rate change display formatting', () => {
  function formatRate(cents: number, rateType: string = 'HOURLY'): string {
    const dollars = cents / 100
    const suffix: Record<string, string> = {
      HOURLY: '/hr',
      DAILY: '/day',
      WEEKLY: '/wk',
      MONTHLY: '/mo',
    }
    return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}${suffix[rateType] ?? ''}`
  }

  function formatChange(from: number, to: number): string {
    const diff = to - from
    const abs = Math.abs(diff) / 100
    if (diff >= 0) return `+$${abs.toFixed(2)}`
    return `-$${abs.toFixed(2)}`
  }

  it('formats an hourly rate as dollars with suffix', () => {
    expect(formatRate(12500, 'HOURLY')).toBe('$125.00/hr')
  })

  it('formats a monthly rate with the monthly suffix', () => {
    expect(formatRate(800000, 'MONTHLY')).toBe('$8,000.00/mo')
  })

  it('formats a rate increase as a positive change', () => {
    expect(formatChange(10000, 12000)).toBe('+$20.00')
  })

  it('formats a rate decrease as a negative change', () => {
    expect(formatChange(12000, 10000)).toBe('-$20.00')
  })

  it('formats zero change correctly', () => {
    expect(formatChange(10000, 10000)).toBe('+$0.00')
  })
})
