import { describe, it, expect } from 'vitest'

/**
 * Alumni (Worked here before) logic tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * BRD + Addendum D: Alumni re-engagement is the strongest demand-side feature.
 * Addendum E §E.2.3: Alumni re-engagement must check the tenure ledger
 * before the action is offered.
 *
 * Tests the logic layer without rendering:
 * - State classification (placed / available / ended)
 * - Re-engagement eligibility against tenure rules
 * - Aggregation of months, hours, extensions
 */

// ── Types ─────────────────────────────────────────────────

type AlumniState = 'placed' | 'available' | 'ended'

type AlumniPerson = {
  name: string
  state: AlumniState
  totalMonths: number
  totalHours: number
  extensions: number
  canReengage: boolean
  reengageBlockReason: string | null
  eligibleDate: string | null
}

type ContractRecord = {
  personId: string
  startDate: Date
  endDate: Date | null
  state: 'IN_PROGRESS' | 'ENDED' | 'PAUSED'
  approvedHours: number
}

// ── State classification ──────────────────────────────────

describe('Alumni state classification', () => {
  function classifyState(opts: {
    hasActiveContract: boolean
    hasAvailableBenchListing: boolean
  }): AlumniState {
    if (opts.hasActiveContract) return 'placed'
    if (opts.hasAvailableBenchListing) return 'available'
    return 'ended'
  }

  it('a person with an active contract at this client is classified as placed', () => {
    expect(classifyState({
      hasActiveContract: true,
      hasAvailableBenchListing: true,
    })).toBe('placed')
  })

  it('a person whose vendor says they are available is classified as available', () => {
    expect(classifyState({
      hasActiveContract: false,
      hasAvailableBenchListing: true,
    })).toBe('available')
  })

  it('a person with no active contract and no availability is classified as ended', () => {
    expect(classifyState({
      hasActiveContract: false,
      hasAvailableBenchListing: false,
    })).toBe('ended')
  })
})

// ── Re-engagement eligibility ─────────────────────────────

describe('Alumni re-engagement eligibility', () => {
  function checkReengagement(opts: {
    state: AlumniState
    totalDays: number
    capDays: number | null
    breakDays: number | null
    lastEndDate: Date | null
  }): { canReengage: boolean; reason: string | null; eligibleDate: string | null } {
    // Already placed — no action needed
    if (opts.state === 'placed') {
      return { canReengage: false, reason: null, eligibleDate: null }
    }

    // No tenure cap — always eligible
    if (opts.capDays === null) {
      return { canReengage: true, reason: null, eligibleDate: null }
    }

    // Under cap — eligible
    if (opts.totalDays < opts.capDays) {
      return { canReengage: true, reason: null, eligibleDate: null }
    }

    // Over cap — check break period
    if (opts.breakDays !== null && opts.lastEndDate) {
      const now = new Date()
      const daysSinceEnd = Math.ceil(
        (now.getTime() - opts.lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSinceEnd < opts.breakDays) {
        const eligible = new Date(opts.lastEndDate.getTime() + opts.breakDays * 24 * 60 * 60 * 1000)
        return {
          canReengage: false,
          reason: `Break period: ${daysSinceEnd} of ${opts.breakDays} days completed`,
          eligibleDate: eligible.toISOString().slice(0, 10),
        }
      }
    }

    // Break completed or no break rule — eligible again
    return { canReengage: true, reason: null, eligibleDate: null }
  }

  it('an available person under the tenure cap can be re-engaged', () => {
    const result = checkReengagement({
      state: 'available',
      totalDays: 200,
      capDays: 548,
      breakDays: 90,
      lastEndDate: new Date(),
    })
    expect(result.canReengage).toBe(true)
  })

  it('an available person in a break period cannot be re-engaged', () => {
    const lastEnd = new Date()
    lastEnd.setDate(lastEnd.getDate() - 30) // ended 30 days ago
    const result = checkReengagement({
      state: 'available',
      totalDays: 600,
      capDays: 548,
      breakDays: 90,
      lastEndDate: lastEnd,
    })
    expect(result.canReengage).toBe(false)
    expect(result.eligibleDate).toBeTruthy()
  })

  it('an available person who completed the break period can be re-engaged', () => {
    const lastEnd = new Date()
    lastEnd.setDate(lastEnd.getDate() - 100) // ended 100 days ago, break is 90
    const result = checkReengagement({
      state: 'available',
      totalDays: 600,
      capDays: 548,
      breakDays: 90,
      lastEndDate: lastEnd,
    })
    expect(result.canReengage).toBe(true)
  })

  it('a placed person does not show a re-engage action regardless of tenure', () => {
    const result = checkReengagement({
      state: 'placed',
      totalDays: 100,
      capDays: 548,
      breakDays: 90,
      lastEndDate: null,
    })
    expect(result.canReengage).toBe(false)
  })

  it('re-engagement shows the eligibility date when blocked by break period', () => {
    const lastEnd = new Date()
    lastEnd.setDate(lastEnd.getDate() - 45)
    const result = checkReengagement({
      state: 'available',
      totalDays: 600,
      capDays: 548,
      breakDays: 90,
      lastEndDate: lastEnd,
    })
    expect(result.canReengage).toBe(false)
    expect(result.eligibleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The date should be 90 days after lastEnd, which is 45 days from now
    const expected = new Date(lastEnd.getTime() + 90 * 24 * 60 * 60 * 1000)
    expect(result.eligibleDate).toBe(expected.toISOString().slice(0, 10))
  })

  it('a person with no tenure cap can always be re-engaged', () => {
    const result = checkReengagement({
      state: 'available',
      totalDays: 1000,
      capDays: null,
      breakDays: null,
      lastEndDate: new Date(),
    })
    expect(result.canReengage).toBe(true)
  })
})

// ── Alumni aggregation ────────────────────────────────────

describe('Alumni aggregation', () => {
  function aggregate(contracts: ContractRecord[]) {
    const now = new Date()
    let totalDays = 0
    let totalHours = 0

    for (const c of contracts) {
      const end = c.endDate ?? now
      const days = Math.max(0, Math.ceil(
        (end.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)
      ))
      totalDays += days
      totalHours += c.approvedHours
    }

    return {
      totalMonths: Math.round(totalDays / 30.44),
      totalHours,
      extensions: Math.max(0, contracts.length - 1),
    }
  }

  it('total months is computed from all contracts at this client', () => {
    const result = aggregate([
      { personId: '1', startDate: daysAgo(365), endDate: daysAgo(0), state: 'ENDED', approvedHours: 100 },
    ])
    expect(result.totalMonths).toBe(12)
  })

  it('total hours is the sum of approved timesheet hours', () => {
    const result = aggregate([
      { personId: '1', startDate: daysAgo(180), endDate: daysAgo(0), state: 'ENDED', approvedHours: 500 },
      { personId: '1', startDate: daysAgo(360), endDate: daysAgo(180), state: 'ENDED', approvedHours: 300 },
    ])
    expect(result.totalHours).toBe(800)
  })

  it('extensions are the count of distinct contracts minus one', () => {
    const result = aggregate([
      { personId: '1', startDate: daysAgo(540), endDate: daysAgo(360), state: 'ENDED', approvedHours: 100 },
      { personId: '1', startDate: daysAgo(360), endDate: daysAgo(180), state: 'ENDED', approvedHours: 100 },
      { personId: '1', startDate: daysAgo(180), endDate: daysAgo(0), state: 'ENDED', approvedHours: 100 },
    ])
    expect(result.extensions).toBe(2)
  })

  it('a single contract has zero extensions', () => {
    const result = aggregate([
      { personId: '1', startDate: daysAgo(180), endDate: daysAgo(0), state: 'ENDED', approvedHours: 100 },
    ])
    expect(result.extensions).toBe(0)
  })

  it('an empty contract list returns zeros', () => {
    const result = aggregate([])
    expect(result.totalMonths).toBe(0)
    expect(result.totalHours).toBe(0)
    expect(result.extensions).toBe(0)
  })
})

// ── Alumni detail formatting ──────────────────────────────

describe('Alumni detail formatting', () => {
  function formatDetail(state: AlumniState, vendorName: string | null): string {
    switch (state) {
      case 'placed': return 'On contract here'
      case 'available': return `Available now · ${vendorName ?? 'Unknown'}`
      case 'ended': return `Released · ${vendorName ?? 'Unknown'}`
    }
  }

  it('the detail field for placed alumni says On contract here', () => {
    expect(formatDetail('placed', 'TechVista')).toBe('On contract here')
  })

  it('the detail field names the current vendor for available alumni', () => {
    expect(formatDetail('available', 'TechVista')).toBe('Available now · TechVista')
  })

  it('the detail field names the last vendor for ended alumni', () => {
    expect(formatDetail('ended', 'Cloudepa')).toBe('Released · Cloudepa')
  })
})

// ── Helpers ───────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
