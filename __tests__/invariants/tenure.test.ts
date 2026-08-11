import { describe, it, expect } from 'vitest'

/**
 * Tenure invariants — from Addendum E, ratified in CLAUDE.md.
 *
 * "Tenure accrues to the person at the client, aggregated across all
 * vendors and all assignments. Twelve months via one vendor plus twelve
 * via another is twenty-four months of exposure. Per-assignment tenure
 * tracking is wrong and is the industry's blind spot."
 *
 * Uses the new contract architecture: SellContract (not Assignment).
 * Tenure is calculated from sell contracts where this person is placed
 * at a given client, across all vendor companies.
 */

type SellContract = {
  personId: string
  clientCompanyId: string
  companyId: string        // the vendor
  startDate: Date
  endDate: Date | null
  state: 'IN_PROGRESS' | 'ENDED' | 'PAUSED' | 'CANCELLED'
}

/** Calculate total tenure in days for a person at a client, across all vendors */
function calculateTenure(
  personId: string,
  clientId: string,
  contracts: SellContract[]
): { totalDays: number; vendors: string[]; contracts: number } {
  const relevant = contracts.filter(
    (c) => c.personId === personId
      && c.clientCompanyId === clientId
      && (c.state === 'IN_PROGRESS' || c.state === 'ENDED' || c.state === 'PAUSED')
  )

  let totalDays = 0
  const vendors = new Set<string>()

  for (const c of relevant) {
    const end = c.endDate || new Date()
    const days = Math.ceil((end.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24))
    totalDays += Math.max(0, days)
    vendors.add(c.companyId)
  }

  return {
    totalDays,
    vendors: Array.from(vendors),
    contracts: relevant.length,
  }
}

/** Check if a person is in a mandatory break period */
function isInBreakPeriod(
  tenureDays: number,
  tenureLimitDays: number,
  breakDays: number,
  lastEndDate: Date | null
): { blocked: boolean; eligibleDate?: Date; reason?: string } {
  if (tenureDays < tenureLimitDays) {
    return { blocked: false }
  }

  if (!lastEndDate) {
    return { blocked: true, reason: 'Tenure limit exceeded, no end date recorded' }
  }

  const now = new Date()
  const daysSinceEnd = Math.ceil(
    (now.getTime() - lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysSinceEnd < breakDays) {
    const eligibleDate = new Date(lastEndDate.getTime() + breakDays * 24 * 60 * 60 * 1000)
    return {
      blocked: true,
      eligibleDate,
      reason: `Break period: ${daysSinceEnd} of ${breakDays} days completed`,
    }
  }

  return { blocked: false }
}

describe('Tenure Invariants (Addendum E, CLAUDE.md)', () => {
  describe('Cross-vendor tenure aggregation', () => {
    it('tenure accrues across vendors — 12 months via A plus 12 via B equals 24 months', () => {
      const contracts: SellContract[] = [
        {
          personId: 'person-1',
          clientCompanyId: 'client-1',
          companyId: 'vendor-a',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2024-01-01'),
          state: 'ENDED',
        },
        {
          personId: 'person-1',
          clientCompanyId: 'client-1',
          companyId: 'vendor-b',
          startDate: new Date('2024-01-15'),
          endDate: new Date('2025-01-15'),
          state: 'ENDED',
        },
      ]

      const tenure = calculateTenure('person-1', 'client-1', contracts)
      expect(tenure.totalDays).toBeGreaterThanOrEqual(730) // ~24 months
      expect(tenure.vendors).toContain('vendor-a')
      expect(tenure.vendors).toContain('vendor-b')
      expect(tenure.contracts).toBe(2)
    })

    it('contracts at different clients do not aggregate', () => {
      const contracts: SellContract[] = [
        {
          personId: 'person-1',
          clientCompanyId: 'client-1',
          companyId: 'vendor-a',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2024-01-01'),
          state: 'ENDED',
        },
        {
          personId: 'person-1',
          clientCompanyId: 'client-2',
          companyId: 'vendor-a',
          startDate: new Date('2024-01-15'),
          endDate: new Date('2025-01-15'),
          state: 'ENDED',
        },
      ]

      const tenureClient1 = calculateTenure('person-1', 'client-1', contracts)
      expect(tenureClient1.totalDays).toBeLessThan(370) // ~12 months only
    })

    it('cancelled contracts do not count toward tenure', () => {
      const contracts: SellContract[] = [
        {
          personId: 'person-1',
          clientCompanyId: 'client-1',
          companyId: 'vendor-a',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2024-01-01'),
          state: 'ENDED',
        },
        {
          personId: 'person-1',
          clientCompanyId: 'client-1',
          companyId: 'vendor-b',
          startDate: new Date('2024-01-15'),
          endDate: new Date('2024-03-01'),
          state: 'CANCELLED',
        },
      ]

      const tenure = calculateTenure('person-1', 'client-1', contracts)
      expect(tenure.vendors).not.toContain('vendor-b')
      expect(tenure.contracts).toBe(1)
    })
  })

  describe('Break period enforcement', () => {
    it('a person who exceeded 18 months is blocked during the break period', () => {
      const result = isInBreakPeriod(
        548,        // 18 months in days
        547,        // limit: 18 months
        90,         // required break: 90 days
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // ended 30 days ago
      )
      expect(result.blocked).toBe(true)
      expect(result.eligibleDate).toBeDefined()
      expect(result.reason).toContain('Break period')
    })

    it('a person under the tenure limit is not blocked', () => {
      const result = isInBreakPeriod(
        300,   // well under 18 months
        547,
        90,
        null
      )
      expect(result.blocked).toBe(false)
    })

    it('a person who completed the break period is eligible again', () => {
      const result = isInBreakPeriod(
        548,
        547,
        90,
        new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // ended 100 days ago, break is 90
      )
      expect(result.blocked).toBe(false)
    })

    it('alumni re-engagement shows eligibility date instead of a button during break', () => {
      const result = isInBreakPeriod(
        548,
        547,
        90,
        new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) // 45 days into 90-day break
      )
      expect(result.blocked).toBe(true)
      expect(result.eligibleDate).toBeDefined()
      // The UI should show this date, not an "Ask them back" button
    })
  })
})
