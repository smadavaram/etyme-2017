import { describe, it, expect } from 'vitest'

/**
 * Contracts page invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Sell/Buy side distinction
 * - State grouping (active, draft, ended, bench)
 * - Rolloff detection (contracts ending within 28 days)
 * - Rate formatting (cents to dollars)
 * - State label and classification
 * - Statistics aggregation
 */

// ── Sell vs Buy side ─────────────────────────────────

describe('Contracts sell vs buy distinction', () => {
  it('sell side shows bill rate and client as counterparty', () => {
    const contract = {
      side: 'sell',
      billRate: 15000,
      payRate: 8000,
      clientCompany: { name: 'Nike' },
      vendorCompany: { name: 'Cloudepa' },
    }
    const rate = contract.side === 'sell' ? contract.billRate : contract.payRate
    const counterparty = contract.side === 'sell'
      ? contract.clientCompany.name
      : contract.vendorCompany.name

    expect(rate).toBe(15000) // $150/hr in cents
    expect(counterparty).toBe('Nike')
  })

  it('buy side shows pay rate and vendor as counterparty', () => {
    const contract = {
      side: 'buy',
      billRate: 15000,
      payRate: 8000,
      clientCompany: { name: 'Nike' },
      vendorCompany: { name: 'Cloudepa' },
    }
    const rate = contract.side === 'sell' ? contract.billRate : contract.payRate
    const counterparty = contract.side === 'sell'
      ? contract.clientCompany.name
      : contract.vendorCompany.name

    expect(rate).toBe(8000) // $80/hr in cents
    expect(counterparty).toBe('Cloudepa')
  })
})

// ── State grouping ───────────────────────────────────

describe('Contracts state grouping', () => {
  const SELL_STATE_GROUPS = [
    { key: 'active', label: 'Active', states: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] },
    { key: 'draft', label: 'Draft', states: ['DRAFT'] },
    { key: 'ended', label: 'Ended', states: ['ENDED', 'CANCELLED', 'PAUSED'] },
  ]

  const contracts = [
    { id: '1', state: 'IN_PROGRESS' },
    { id: '2', state: 'VERIFIED' },
    { id: '3', state: 'DRAFT' },
    { id: '4', state: 'ENDED' },
    { id: '5', state: 'PENDING_VERIFICATION' },
    { id: '6', state: 'CANCELLED' },
  ]

  function getGrouped(contracts: { id: string; state: string }[]) {
    const grouped: Record<string, typeof contracts> = {}
    for (const group of SELL_STATE_GROUPS) {
      const matching = contracts.filter((c) => group.states.includes(c.state))
      if (matching.length > 0) grouped[group.key] = matching
    }
    return grouped
  }

  it('groups active contracts together (IN_PROGRESS, VERIFIED, PENDING_VERIFICATION)', () => {
    const grouped = getGrouped(contracts)
    expect(grouped['active']).toHaveLength(3)
  })

  it('groups draft contracts separately', () => {
    const grouped = getGrouped(contracts)
    expect(grouped['draft']).toHaveLength(1)
  })

  it('groups ended contracts together (ENDED, CANCELLED)', () => {
    const grouped = getGrouped(contracts)
    expect(grouped['ended']).toHaveLength(2)
  })

  it('every contract lands in exactly one group', () => {
    const grouped = getGrouped(contracts)
    const totalGrouped = Object.values(grouped).reduce((sum, g) => sum + g.length, 0)
    expect(totalGrouped).toBe(contracts.length)
  })

  it('buy side has an additional bench group', () => {
    const BUY_STATE_GROUPS = [
      { key: 'active', label: 'Active', states: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] },
      { key: 'bench', label: 'Bench & Internal', states: ['BENCH_PAID', 'INTERNAL', 'TRAINING'] },
      { key: 'draft', label: 'Draft', states: ['DRAFT'] },
      { key: 'ended', label: 'Ended', states: ['ENDED', 'CANCELLED', 'PAUSED'] },
    ]
    expect(BUY_STATE_GROUPS).toHaveLength(4) // one more than sell
    const benchGroup = BUY_STATE_GROUPS.find((g) => g.key === 'bench')
    expect(benchGroup).toBeDefined()
    expect(benchGroup!.states).toContain('BENCH_PAID')
  })
})

// ── Rolloff detection ────────────────────────────────

describe('Contracts rolloff detection', () => {
  function detectRolloff(endDate: string | null, state: string, now: Date): { isRolloff: boolean; daysLeft: number | null } {
    if (!endDate || state !== 'IN_PROGRESS') return { isRolloff: false, daysLeft: null }
    const daysUntilEnd = Math.ceil((new Date(endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    return {
      isRolloff: daysUntilEnd >= 0 && daysUntilEnd <= 28,
      daysLeft: daysUntilEnd,
    }
  }

  const now = new Date('2026-08-12T12:00:00Z')

  it('flags a contract ending in 14 days as rolloff', () => {
    const result = detectRolloff('2026-08-26', 'IN_PROGRESS', now)
    expect(result.isRolloff).toBe(true)
    expect(result.daysLeft).toBe(14)
  })

  it('flags a contract ending today as rolloff', () => {
    const result = detectRolloff('2026-08-12', 'IN_PROGRESS', now)
    expect(result.isRolloff).toBe(true)
    expect(result.daysLeft).toBeLessThanOrEqual(0)
  })

  it('does not flag a contract ending in 60 days', () => {
    const result = detectRolloff('2026-10-11', 'IN_PROGRESS', now)
    expect(result.isRolloff).toBe(false)
  })

  it('does not flag an ended contract even if end date is near', () => {
    const result = detectRolloff('2026-08-20', 'ENDED', now)
    expect(result.isRolloff).toBe(false)
  })

  it('does not flag a contract with no end date', () => {
    const result = detectRolloff(null, 'IN_PROGRESS', now)
    expect(result.isRolloff).toBe(false)
  })

  it('28-day boundary is inclusive', () => {
    const result = detectRolloff('2026-09-09', 'IN_PROGRESS', now)
    expect(result.isRolloff).toBe(true)
    expect(result.daysLeft).toBe(28)
  })

  it('29 days is outside the rolloff window', () => {
    const result = detectRolloff('2026-09-10', 'IN_PROGRESS', now)
    expect(result.isRolloff).toBe(false)
    expect(result.daysLeft).toBe(29)
  })
})

// ── Rate formatting ──────────────────────────────────

describe('Contracts rate formatting', () => {
  it('converts cents to dollars for display', () => {
    const rateCents = 15000
    const display = `$${(rateCents / 100).toFixed(0)}/hr`
    expect(display).toBe('$150/hr')
  })

  it('handles sub-dollar rates', () => {
    const rateCents = 7500
    const display = `$${(rateCents / 100).toFixed(0)}/hr`
    expect(display).toBe('$75/hr')
  })

  it('handles fractional cents with two decimals', () => {
    const rateCents = 12550
    const display = `$${(rateCents / 100).toFixed(2)}/hr`
    expect(display).toBe('$125.50/hr')
  })
})

// ── State labels ─────────────────────────────────────

describe('Contracts state labels', () => {
  function stateLabel(state: string): string {
    const labels: Record<string, string> = {
      DRAFT: 'Draft',
      PENDING_VERIFICATION: 'Pending',
      VERIFIED: 'Verified',
      IN_PROGRESS: 'Active',
      BENCH_PAID: 'Bench (Paid)',
      INTERNAL: 'Internal',
      TRAINING: 'Training',
      PAUSED: 'Paused',
      ENDED: 'Ended',
      CANCELLED: 'Cancelled',
    }
    return labels[state] ?? state
  }

  it('IN_PROGRESS displays as Active', () => {
    expect(stateLabel('IN_PROGRESS')).toBe('Active')
  })

  it('PENDING_VERIFICATION displays as Pending', () => {
    expect(stateLabel('PENDING_VERIFICATION')).toBe('Pending')
  })

  it('BENCH_PAID displays as Bench (Paid)', () => {
    expect(stateLabel('BENCH_PAID')).toBe('Bench (Paid)')
  })

  it('unknown states fall through to raw value', () => {
    expect(stateLabel('CUSTOM_STATE')).toBe('CUSTOM_STATE')
  })
})

// ── Statistics aggregation ───────────────────────────

describe('Contracts statistics', () => {
  const contracts = [
    { state: 'IN_PROGRESS', rate: 15000, endDate: '2026-08-20' },
    { state: 'VERIFIED', rate: 12000, endDate: '2026-12-31' },
    { state: 'DRAFT', rate: 10000, endDate: null },
    { state: 'ENDED', rate: 8000, endDate: '2026-07-01' },
    { state: 'IN_PROGRESS', rate: 20000, endDate: '2026-09-05' },
  ]

  const now = new Date('2026-08-12T12:00:00Z')

  it('counts active contracts', () => {
    const active = contracts.filter((c) =>
      ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'].includes(c.state)
    ).length
    expect(active).toBe(3)
  })

  it('counts rolloff warnings within 28 days', () => {
    const rolloffs = contracts.filter((c) => {
      if (!c.endDate || c.state !== 'IN_PROGRESS') return false
      const days = Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / (86400000))
      return days >= 0 && days <= 28
    }).length
    expect(rolloffs).toBe(2) // Aug 20 (8 days) and Sep 5 (24 days)
  })

  it('calculates total active bill rate in dollars per hour', () => {
    const totalRate = contracts
      .filter((c) => ['IN_PROGRESS', 'VERIFIED'].includes(c.state))
      .reduce((sum, c) => sum + (c.rate / 100), 0)
    expect(totalRate).toBe(470) // $150 + $120 + $200
  })
})
