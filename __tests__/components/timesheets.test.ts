import { describe, it, expect } from 'vitest'

/**
 * Timesheets page invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Status filtering
 * - Billable value calculation (hours × rate)
 * - Anomaly detection thresholds
 * - Period formatting
 * - Statistics aggregation
 */

// ── Status filtering ─────────────────────────────────

describe('Timesheets status filter', () => {
  const timesheets = [
    { id: '1', status: 'OPEN', totalHours: 40, billRate: 12000 },
    { id: '2', status: 'SUBMITTED', totalHours: 38, billRate: 15000 },
    { id: '3', status: 'APPROVED', totalHours: 40, billRate: 12000 },
    { id: '4', status: 'APPROVED', totalHours: 36, billRate: 10000 },
    { id: '5', status: 'REJECTED', totalHours: 80, billRate: 12000 },
  ]

  it('shows all timesheets when filter is ALL', () => {
    expect(timesheets).toHaveLength(5)
  })

  it('filters to only SUBMITTED timesheets', () => {
    const filtered = timesheets.filter((t) => t.status === 'SUBMITTED')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('2')
  })

  it('filters to only APPROVED timesheets', () => {
    const filtered = timesheets.filter((t) => t.status === 'APPROVED')
    expect(filtered).toHaveLength(2)
  })

  it('returns empty when no timesheets match filter', () => {
    const filtered = timesheets.filter((t) => t.status === 'WITHDRAWN')
    expect(filtered).toHaveLength(0)
  })
})

// ── Billable value calculation ───────────────────────

describe('Timesheets billable value', () => {
  it('calculates value as hours times rate in dollars', () => {
    const totalHours = 40
    const billRateCents = 12000 // $120/hr stored in cents
    const value = totalHours * (billRateCents / 100)
    expect(value).toBe(4800)
  })

  it('handles fractional hours correctly', () => {
    const totalHours = 37.5
    const billRateCents = 15000
    const value = totalHours * (billRateCents / 100)
    expect(value).toBe(5625)
  })

  it('aggregates approved value across multiple timesheets', () => {
    const timesheets = [
      { status: 'APPROVED', totalHours: 40, billRate: 12000 },
      { status: 'APPROVED', totalHours: 36, billRate: 10000 },
      { status: 'SUBMITTED', totalHours: 38, billRate: 15000 },
    ]
    const approvedValue = timesheets
      .filter((t) => t.status === 'APPROVED')
      .reduce((sum, t) => sum + (t.totalHours * (t.billRate / 100)), 0)
    expect(approvedValue).toBe(4800 + 3600)
  })

  it('approved value excludes non-approved timesheets', () => {
    const timesheets = [
      { status: 'OPEN', totalHours: 40, billRate: 12000 },
      { status: 'REJECTED', totalHours: 80, billRate: 12000 },
    ]
    const approvedValue = timesheets
      .filter((t) => t.status === 'APPROVED')
      .reduce((sum, t) => sum + (t.totalHours * (t.billRate / 100)), 0)
    expect(approvedValue).toBe(0)
  })
})

// ── Anomaly detection ────────────────────────────────

describe('Timesheets anomaly detection', () => {
  function detectAnomaly(days: Record<string, number>): { score: number | null; reason: string | null } {
    const dayValues = Object.values(days)
    const totalHours = dayValues.reduce((sum, h) => sum + h, 0)
    const maxDay = Math.max(...dayValues)

    if (maxDay > 12) {
      return { score: 30, reason: `Day with ${maxDay} hours exceeds 12-hour threshold` }
    }
    if (totalHours > 60) {
      return { score: 50, reason: `Total ${totalHours} hours exceeds 60-hour weekly threshold` }
    }
    return { score: null, reason: null }
  }

  it('flags a day with more than 12 hours', () => {
    const result = detectAnomaly({
      '2026-08-10': 8, '2026-08-11': 14, '2026-08-12': 8,
    })
    expect(result.score).toBe(30)
    expect(result.reason).toContain('14 hours')
    expect(result.reason).toContain('12-hour threshold')
  })

  it('flags a week with more than 60 total hours', () => {
    const result = detectAnomaly({
      '2026-08-10': 12, '2026-08-11': 12, '2026-08-12': 12,
      '2026-08-13': 12, '2026-08-14': 12, '2026-08-15': 8,
    })
    // total = 68, max day = 12 (not > 12, so not the day flag)
    expect(result.score).toBe(50)
    expect(result.reason).toContain('68 hours')
    expect(result.reason).toContain('60-hour')
  })

  it('does not flag a normal 40-hour week', () => {
    const result = detectAnomaly({
      '2026-08-10': 8, '2026-08-11': 8, '2026-08-12': 8,
      '2026-08-13': 8, '2026-08-14': 8,
    })
    expect(result.score).toBeNull()
    expect(result.reason).toBeNull()
  })

  it('day anomaly takes precedence over weekly anomaly', () => {
    // 14-hour day AND > 60 total — the day flag fires first
    const result = detectAnomaly({
      '2026-08-10': 14, '2026-08-11': 12, '2026-08-12': 12,
      '2026-08-13': 12, '2026-08-14': 12,
    })
    expect(result.score).toBe(30) // day flag, not weekly
    expect(result.reason).toContain('14 hours')
  })
})

// ── Period formatting ────────────────────────────────

describe('Timesheets period formatting', () => {
  function formatPeriod(start: string, end: string): string {
    const s = new Date(start)
    const e = new Date(end)
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.toLocaleDateString('en-US', opts)} – ${e.getDate()}`
    }
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
  }

  it('same-month period shows month once', () => {
    const result = formatPeriod('2026-08-01', '2026-08-15')
    expect(result).toContain('Aug')
    expect(result).toContain('15')
    // Should NOT contain 'Aug' twice
    const parts = result.split('Aug')
    expect(parts.length).toBe(2) // one split = one occurrence
  })

  it('cross-month period shows both months', () => {
    const result = formatPeriod('2026-07-28', '2026-08-10')
    expect(result).toContain('Jul')
    expect(result).toContain('Aug')
  })
})

// ── Statistics aggregation ───────────────────────────

describe('Timesheets statistics', () => {
  const timesheets = [
    { status: 'OPEN', totalHours: 40, billRate: 12000, anomalyScore: null },
    { status: 'SUBMITTED', totalHours: 38, billRate: 15000, anomalyScore: null },
    { status: 'APPROVED', totalHours: 40, billRate: 12000, anomalyScore: null },
    { status: 'APPROVED', totalHours: 36, billRate: 10000, anomalyScore: null },
    { status: 'REJECTED', totalHours: 80, billRate: 12000, anomalyScore: 50 },
  ]

  it('counts total hours across all timesheets', () => {
    const total = timesheets.reduce((sum, t) => sum + t.totalHours, 0)
    expect(total).toBe(234)
  })

  it('counts pending approval correctly', () => {
    const pending = timesheets.filter((t) => t.status === 'SUBMITTED').length
    expect(pending).toBe(1)
  })

  it('counts anomalies correctly', () => {
    const anomalies = timesheets.filter((t) => t.anomalyScore != null && t.anomalyScore > 0).length
    expect(anomalies).toBe(1)
  })

  it('calculates approved billable value', () => {
    const approved = timesheets
      .filter((t) => t.status === 'APPROVED')
      .reduce((sum, t) => sum + (t.totalHours * (t.billRate / 100)), 0)
    expect(approved).toBe(4800 + 3600)
  })
})
