import { describe, it, expect } from 'vitest'
import { resolvedEndClientId, endClientFilter } from '@/lib/resolve-end-client'

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
 * at a given end client, across all vendor companies.
 *
 * Addendum C "layer cake": the paying customer (clientCompanyId) can differ
 * from the end client (endClientCompanyId). Tenure aggregates at the END
 * CLIENT, not the paying customer.
 */

type SellContract = {
  personId: string
  clientCompanyId: string
  endClientCompanyId?: string | null  // where the consultant actually works
  companyId: string        // the vendor
  startDate: Date
  endDate: Date | null
  state: 'IN_PROGRESS' | 'ENDED' | 'PAUSED' | 'CANCELLED'
}

/**
 * Calculate total tenure in days for a person at an end client, across all vendors.
 * Uses resolvedEndClientId to determine where the consultant actually works —
 * endClientCompanyId if set, otherwise clientCompanyId (direct placement).
 */
function calculateTenure(
  personId: string,
  endClientId: string,
  contracts: SellContract[]
): { totalDays: number; vendors: string[]; contracts: number } {
  const relevant = contracts.filter(
    (c) => c.personId === personId
      && resolvedEndClientId(c) === endClientId
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

  describe('End client resolution (Addendum C layer cake)', () => {
    it('tenure aggregates at the end client, not the paying customer', () => {
      // Two contracts billed through different paying customers but
      // the consultant works at the same end client
      const contracts: SellContract[] = [
        {
          personId: 'person-1',
          clientCompanyId: 'msp-1',          // paying customer is MSP
          endClientCompanyId: 'enterprise-1', // works at Enterprise
          companyId: 'vendor-a',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2024-01-01'),
          state: 'ENDED',
        },
        {
          personId: 'person-1',
          clientCompanyId: 'prime-si-1',      // paying customer is Prime SI
          endClientCompanyId: 'enterprise-1', // still works at Enterprise
          companyId: 'vendor-b',
          startDate: new Date('2024-02-01'),
          endDate: new Date('2025-02-01'),
          state: 'ENDED',
        },
      ]

      // Tenure at the enterprise should combine both contracts
      const tenure = calculateTenure('person-1', 'enterprise-1', contracts)
      expect(tenure.totalDays).toBeGreaterThanOrEqual(730) // ~24 months
      expect(tenure.vendors).toHaveLength(2)
      expect(tenure.contracts).toBe(2)

      // Tenure at the MSP or Prime SI should be zero — they're paying customers, not end clients
      const tenureMsp = calculateTenure('person-1', 'msp-1', contracts)
      expect(tenureMsp.contracts).toBe(0)
      expect(tenureMsp.totalDays).toBe(0)
    })

    it('direct placement counts paying customer as end client', () => {
      const contracts: SellContract[] = [
        {
          personId: 'person-1',
          clientCompanyId: 'client-1',
          endClientCompanyId: null,  // direct placement
          companyId: 'vendor-a',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2024-01-01'),
          state: 'ENDED',
        },
      ]

      // With no endClientCompanyId, clientCompanyId IS the end client
      const tenure = calculateTenure('person-1', 'client-1', contracts)
      expect(tenure.contracts).toBe(1)
      expect(tenure.totalDays).toBeGreaterThanOrEqual(365)
    })

    it('mixed direct and MSP contracts at the same end client aggregate correctly', () => {
      const contracts: SellContract[] = [
        {
          personId: 'person-1',
          clientCompanyId: 'enterprise-1',    // direct placement
          endClientCompanyId: null,
          companyId: 'vendor-a',
          startDate: new Date('2022-01-01'),
          endDate: new Date('2023-01-01'),
          state: 'ENDED',
        },
        {
          personId: 'person-1',
          clientCompanyId: 'msp-1',           // later placed via MSP
          endClientCompanyId: 'enterprise-1', // same end client
          companyId: 'vendor-b',
          startDate: new Date('2023-06-01'),
          endDate: new Date('2024-06-01'),
          state: 'ENDED',
        },
      ]

      // Both should aggregate at enterprise-1
      const tenure = calculateTenure('person-1', 'enterprise-1', contracts)
      expect(tenure.contracts).toBe(2)
      expect(tenure.vendors).toContain('vendor-a')
      expect(tenure.vendors).toContain('vendor-b')
      expect(tenure.totalDays).toBeGreaterThanOrEqual(730)
    })
  })

  describe('endClientFilter Prisma helper', () => {
    it('generates OR clause matching end client or direct placement', () => {
      const filter = endClientFilter('enterprise-1')
      expect(filter.OR).toHaveLength(2)
      expect(filter.OR[0]).toEqual({ endClientCompanyId: 'enterprise-1' })
      expect(filter.OR[1]).toEqual({
        clientCompanyId: 'enterprise-1',
        endClientCompanyId: null,
      })
    })
  })
})
