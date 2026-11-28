import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tenureView } from '@/app/dashboard/tenure/words'
import { TenureRefused } from '@/app/dashboard/tenure/refused'
import { isDeskless } from '@/lib/nav-table'
import { namesAPermission } from '@/lib/refusal-words'
import { askTheDesk } from '@/lib/permissions'
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

/**
 * Sign-up walk, round three. Member holds no permission, and its menu
 * shows none of the firm's pages — Tenure among them. The route asked
 * nothing, so the ledger the menu withheld opened by URL.
 */
describe('a seat with no desk cannot read the tenure ledger by URL', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/tenure/route.ts'), 'utf8')
  const get = route.slice(route.indexOf('export async function GET'))

  it('the tenure route refuses a seat holding no desk — no permission, or only the reads of its own work — by the same rule the menu hides the link by', () => {
    expect(isDeskless([])).toBe(true)
    expect(isDeskless(['assignments.read'])).toBe(true)
    expect(isDeskless(['assignments.read', 'consultants.read'])).toBe(false)
    expect(get).toContain('if (!seat && isDeskless(caller.permissions))')
    expect(get).toMatch(/isDeskless\(caller\.permissions\)\) \{[\s\S]*?status: 403/)
  })

  it('the refusal is a sentence naming the desk to ask, never a permission key', () => {
    const says = askTheDesk({
      doing: 'Reading the tenure ledger', needs: 'assignments.read', kind: 'CLIENT', companyName: 'Walk Co',
    })
    expect(namesAPermission(says)).toBe(false)
    expect(says).toMatch(/^Reading the tenure ledger is done by .+ at Walk Co[.,]/)
    expect(get).toContain('askTheDesk({')
  })

  it('a refused read of the tenure ledger still writes an access log row for every person it would have shown', () => {
    const refusal = get.slice(get.indexOf('if (!seat && isDeskless'), get.indexOf('status: 403'))
    expect(refusal).toContain('await recordRefusal(')
    expect(refusal).toContain('allowed: false')
    expect(refusal).toContain("action: 'TENURE_VIEW'")
  })

  it('the refusal comes before any person’s tenure is read', () => {
    expect(get.indexOf('if (!seat && isDeskless')).toBeLessThan(get.indexOf('const contracts = await prisma.sellContract.findMany'))
  })
})

/**
 * Sign-up walk, round four, problem 4. The route refused a Member and
 * the page drew "TRACKED 0 … OVER THE LIMIT 0" above the refusal, at a
 * client with a contractor 24 months in and past the limit. A zero says
 * nobody is over. The truth was "not yours to see".
 */
describe('a refused time-on-site page', () => {
  const says = 'Reading the tenure ledger is done by the Owner desk at Northbend Athletic. Ask them for it.'
  const page = readFileSync(join(process.cwd(), 'src/app/dashboard/tenure/page.tsx'), 'utf8')

  it('a refused tenure page shows the refusal sentence alone, and no count at all', () => {
    const html = renderToStaticMarkup(createElement(TenureRefused, { says }))
    // The shared refused state: no heading over the sentence, because a
    // heading over a refusal reads as a page that loaded and is empty.
    expect(html).toContain('data-state="refused"')
    expect(html).not.toContain('<h1')
    expect(html).toContain(says)
    expect(html).not.toMatch(/>\s*0\s*</)
    expect(html).not.toMatch(/Tracked|Approaching|Over the limit|Booked past the limit|In break|Eligible|Search/)
  })

  it('a refused tenure page names no client in a subtitle, because the reader was not shown whose it is', () => {
    const html = renderToStaticMarkup(createElement(TenureRefused, { says: 'Not yours.' }))
    expect(html).not.toContain('How long each person has worked')
  })

  it('whenever the tenure route refuses, the page is the refusal — whether or not it was still loading', () => {
    expect(tenureView({ loading: false, error: says, hasData: false })).toEqual({ show: 'refused', says })
    expect(tenureView({ loading: true, error: says, hasData: false })).toEqual({ show: 'refused', says })
  })

  it('no tenure count is drawn until the route has answered with figures', () => {
    expect(tenureView({ loading: true, error: null, hasData: false })).toEqual({ show: 'loading' })
    expect(tenureView({ loading: false, error: null, hasData: true })).toEqual({ show: 'page' })
    expect(page).not.toMatch(/summary \?\? \{ totalTracked: 0/)
    expect(page).toContain('{summary && (')
  })

  it('the tenure page returns the refusal before it draws a single count', () => {
    const refused = page.indexOf("if (view.show === 'refused') return <TenureRefused")
    expect(refused).toBeGreaterThan(-1)
    expect(page.indexOf('<p className="stat-label">Tracked</p>')).toBeGreaterThan(refused)
  })
})
