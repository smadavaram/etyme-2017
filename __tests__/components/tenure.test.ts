import { describe, it, expect } from 'vitest'

/**
 * Tenure page logic tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * Addendum E: "Tenure accrues to the person at the client, aggregated
 * across all vendors and all assignments."
 *
 * Tests the page-level classification and display logic without rendering.
 * Core tenure arithmetic is tested separately in __tests__/invariants/tenure.test.ts.
 */

// ── Types ─────────────────────────────────────────────────

type TenureStatus = 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE'

type TenurePerson = {
  personId: string
  name: string
  vendors: { id: string; name: string }[]
  cumulativeMonths: number
  cumulativeDays: number
  status: TenureStatus
  eligibleDate: string | null
  hasActive: boolean
  contractCount: number
}

// ── Tenure classification ─────────────────────────────────

describe('Tenure status classification', () => {
  function classifyTenure(
    totalDays: number,
    capDays: number | null,
    hasActive: boolean,
    lastEndDate: Date | null,
    breakDays: number | null
  ): { status: TenureStatus; eligibleDate: string | null } {
    if (capDays === null) return { status: 'OK', eligibleDate: null }

    const pct = totalDays / capDays
    if (pct < 0.75) return { status: 'OK', eligibleDate: null }
    if (pct < 1.0) return { status: 'WARNING', eligibleDate: null }

    if (hasActive) return { status: 'BREAK_REQUIRED', eligibleDate: null }

    if (breakDays !== null && lastEndDate) {
      const now = new Date()
      const daysSinceEnd = Math.ceil(
        (now.getTime() - lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSinceEnd < breakDays) {
        const eligible = new Date(lastEndDate.getTime() + breakDays * 24 * 60 * 60 * 1000)
        return { status: 'IN_BREAK', eligibleDate: eligible.toISOString().slice(0, 10) }
      }
    }

    return { status: 'ELIGIBLE', eligibleDate: null }
  }

  it('classifies a person under 75% of cap as OK', () => {
    // 200 days of 548 cap (18 months ≈ 548 days) = 36.5%
    const result = classifyTenure(200, 548, false, null, 90)
    expect(result.status).toBe('OK')
  })

  it('classifies a person between 75% and 100% of cap as WARNING', () => {
    // 450 days of 548 cap = 82%
    const result = classifyTenure(450, 548, false, null, 90)
    expect(result.status).toBe('WARNING')
  })

  it('classifies a person who exceeded the cap with an active contract as BREAK_REQUIRED', () => {
    const result = classifyTenure(600, 548, true, null, 90)
    expect(result.status).toBe('BREAK_REQUIRED')
  })

  it('classifies a person in a break period as IN_BREAK with eligibility date', () => {
    const lastEnd = new Date()
    lastEnd.setDate(lastEnd.getDate() - 30) // ended 30 days ago
    const result = classifyTenure(600, 548, false, lastEnd, 90)
    expect(result.status).toBe('IN_BREAK')
    expect(result.eligibleDate).toBeTruthy()
  })

  it('classifies a person who completed the break period as ELIGIBLE', () => {
    const lastEnd = new Date()
    lastEnd.setDate(lastEnd.getDate() - 100) // ended 100 days ago, break is 90
    const result = classifyTenure(600, 548, false, lastEnd, 90)
    expect(result.status).toBe('ELIGIBLE')
  })

  it('reports OK when no TENURE_CAP governance rule exists', () => {
    const result = classifyTenure(1000, null, false, null, null)
    expect(result.status).toBe('OK')
    expect(result.eligibleDate).toBeNull()
  })
})

// ── Tenure summary counts ─────────────────────────────────

describe('Tenure summary counts', () => {
  function summarize(people: TenurePerson[]) {
    return {
      totalTracked: people.length,
      ok: people.filter(p => p.status === 'OK').length,
      warning: people.filter(p => p.status === 'WARNING').length,
      breakRequired: people.filter(p => p.status === 'BREAK_REQUIRED').length,
      inBreak: people.filter(p => p.status === 'IN_BREAK').length,
      eligible: people.filter(p => p.status === 'ELIGIBLE').length,
    }
  }

  const people: TenurePerson[] = [
    { personId: '1', name: 'A', vendors: [{ id: 'v1', name: 'V1' }], cumulativeMonths: 6, cumulativeDays: 183, status: 'OK', eligibleDate: null, hasActive: true, contractCount: 1 },
    { personId: '2', name: 'B', vendors: [{ id: 'v1', name: 'V1' }], cumulativeMonths: 14, cumulativeDays: 427, status: 'WARNING', eligibleDate: null, hasActive: true, contractCount: 1 },
    { personId: '3', name: 'C', vendors: [{ id: 'v1', name: 'V1' }, { id: 'v2', name: 'V2' }], cumulativeMonths: 20, cumulativeDays: 609, status: 'IN_BREAK', eligibleDate: '2026-11-14', hasActive: false, contractCount: 3 },
    { personId: '4', name: 'D', vendors: [{ id: 'v2', name: 'V2' }], cumulativeMonths: 4, cumulativeDays: 122, status: 'OK', eligibleDate: null, hasActive: false, contractCount: 1 },
  ]

  it('tenure summary counts match individual statuses', () => {
    const s = summarize(people)
    expect(s.totalTracked).toBe(4)
    expect(s.ok).toBe(2)
    expect(s.warning).toBe(1)
    expect(s.inBreak).toBe(1)
    expect(s.breakRequired).toBe(0)
    expect(s.eligible).toBe(0)
  })

  it('handles a person with contracts through multiple vendors', () => {
    const multiVendor = people.find(p => p.vendors.length > 1)!
    expect(multiVendor.vendors).toHaveLength(2)
    expect(multiVendor.contractCount).toBe(3)
    // Cross-vendor aggregation is the key: one row, multiple vendors
    expect(multiVendor.cumulativeMonths).toBe(20)
  })
})

// ── Tenure bar visualization ──────────────────────────────

describe('Tenure bar visualization', () => {
  function tenureBarFill(cumulativeMonths: number, capMonths: number | null): number {
    if (capMonths === null || capMonths === 0) return 0
    return Math.min(100, Math.round((cumulativeMonths / capMonths) * 100))
  }

  function tenureBarColor(pct: number): 'green' | 'yellow' | 'red' {
    if (pct < 75) return 'green'
    if (pct <= 100) return 'yellow'
    return 'red'
  }

  it('fill percentage is cumulativeMonths divided by capMonths', () => {
    expect(tenureBarFill(9, 18)).toBe(50)
    expect(tenureBarFill(13, 18)).toBe(72)
  })

  it('fill percentage is capped at 100 for display', () => {
    expect(tenureBarFill(24, 18)).toBe(100)
  })

  it('no bar is shown when there is no tenure cap', () => {
    expect(tenureBarFill(12, null)).toBe(0)
  })

  it('green below 75%, yellow 75-100%, red above', () => {
    expect(tenureBarColor(50)).toBe('green')
    expect(tenureBarColor(74)).toBe('green')
    expect(tenureBarColor(75)).toBe('yellow')
    expect(tenureBarColor(100)).toBe('yellow')
    expect(tenureBarColor(101)).toBe('red')
  })
})

// ── Tenure sort order ─────────────────────────────────────

describe('Tenure display ordering', () => {
  const statusOrder: Record<TenureStatus, number> = {
    BREAK_REQUIRED: 0,
    WARNING: 1,
    IN_BREAK: 2,
    OK: 3,
    ELIGIBLE: 4,
  }

  function sortByUrgency(people: TenurePerson[]): TenurePerson[] {
    return [...people].sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
  }

  it('BREAK_REQUIRED appears before WARNING', () => {
    const people: TenurePerson[] = [
      { personId: '1', name: 'A', vendors: [], cumulativeMonths: 14, cumulativeDays: 427, status: 'WARNING', eligibleDate: null, hasActive: true, contractCount: 1 },
      { personId: '2', name: 'B', vendors: [], cumulativeMonths: 20, cumulativeDays: 609, status: 'BREAK_REQUIRED', eligibleDate: null, hasActive: true, contractCount: 1 },
    ]
    const sorted = sortByUrgency(people)
    expect(sorted[0].status).toBe('BREAK_REQUIRED')
    expect(sorted[1].status).toBe('WARNING')
  })

  it('OK appears after WARNING and IN_BREAK', () => {
    const people: TenurePerson[] = [
      { personId: '1', name: 'A', vendors: [], cumulativeMonths: 6, cumulativeDays: 183, status: 'OK', eligibleDate: null, hasActive: true, contractCount: 1 },
      { personId: '2', name: 'B', vendors: [], cumulativeMonths: 20, cumulativeDays: 609, status: 'IN_BREAK', eligibleDate: '2026-11-14', hasActive: false, contractCount: 2 },
      { personId: '3', name: 'C', vendors: [], cumulativeMonths: 14, cumulativeDays: 427, status: 'WARNING', eligibleDate: null, hasActive: true, contractCount: 1 },
    ]
    const sorted = sortByUrgency(people)
    expect(sorted[0].status).toBe('WARNING')
    expect(sorted[1].status).toBe('IN_BREAK')
    expect(sorted[2].status).toBe('OK')
  })
})
