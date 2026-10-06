import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkHealth, bucketOf } from '@/app/api/compliance/health'
import { twoPopulations, sayRule, sayEnforcement, sayRuleParameters } from '@/app/dashboard/compliance/says'

/**
 * The compliance page, as Northbend Athletic's compliance officer read
 * it on 2026-09-30: "Nothing is outstanding… 100% clear, 0 flagged",
 * while the dashboard one click away said Ingrid Sørensen could not start
 * without her I-9, Brightmoor's insurance read "Expiring" under the 100%,
 * and the rate range read "max Rate: 15000 · min Rate: 7000".
 */

const ON = new Date('2026-09-30T00:00:00Z')
const inDays = (n: number) => new Date(ON.getTime() + n * 86_400_000).toISOString()

describe('what the checks on the compliance page add up to', () => {
  it('flags a certificate nineteen days from running out rather than counting it clear', () => {
    const h = checkHealth([{ status: 'CLEAR', standing: 'EXPIRING', expiresAt: inDays(19) }], ON)
    expect(h.clear).toBe(0)
    expect(h.expiring).toBe(1)
    expect(h.flagged).toBe(1)
    expect(h.clearPercentage).toBe(0)
  })

  it('counts a check that ran out as run out, even where its stored status still says clear', () => {
    expect(bucketOf({ status: 'CLEAR', expiresAt: inDays(-1) }, ON)).toBe('lapsed')
  })

  it('counts cover that has not started yet as holding nothing today', () => {
    expect(bucketOf({ status: 'CLEAR', standing: 'NOT_YET_VALID' }, ON)).toBe('lapsed')
  })

  it('flags a document on file with no expiry recorded on a kind that expires', () => {
    expect(bucketOf({ status: 'CLEAR', standing: 'NO_EXPIRY_RECORDED' }, ON)).toBe('expiring')
  })

  it('counts a clear check with months left on it as clear', () => {
    expect(bucketOf({ status: 'CLEAR', expiresAt: inDays(200) }, ON)).toBe('clear')
  })

  it('reads a provider answer that was not clear as flagged', () => {
    expect(bucketOf({ status: 'FAILED' }, ON)).toBe('failed')
  })

  it('gives no clear rate at all over no checks, rather than a hundred percent', () => {
    expect(checkHealth([], ON).clearPercentage).toBeNull()
  })

  it('says the clear rate of twenty checks with one running out is ninety-five, not a hundred', () => {
    const checks = [
      ...Array.from({ length: 19 }, () => ({ status: 'CLEAR', expiresAt: inDays(300) })),
      { status: 'CLEAR', standing: 'EXPIRING', expiresAt: inDays(19) },
    ]
    const h = checkHealth(checks, ON)
    expect(h.totalChecks).toBe(20)
    expect(h.clearPercentage).toBe(95)
    expect(h.flagged).toBe(1)
  })
})

describe('the sentence at the top of a client’s compliance page', () => {
  it('says who cannot start, rather than what the client is paid on', () => {
    const said = twoPopulations(0, 0, 20, 95, { heldStarts: 1, blockedStarts: 1, flagged: 1, client: true })
    expect(said).toContain('1 person cannot start until their paperwork is on file.')
    expect(said).not.toContain('Nothing is outstanding')
    expect(said).not.toContain('paid on')
  })

  it('says a certificate needing action in words beside the clear rate', () => {
    const said = twoPopulations(0, 0, 20, 95, { flagged: 1, client: true })
    expect(said).toContain('95% of them clear today')
    expect(said).toContain('1 needs somebody to act')
  })

  it('tells a client with nobody held up that nothing is holding up a start', () => {
    expect(twoPopulations(0, 0, 4, 100, { client: true })).toContain('Nothing is holding up a start here.')
  })

  it('still speaks to a supplier about the lines it is paid on', () => {
    expect(twoPopulations(0, 0, 4, 100)).toContain('Nothing is outstanding on the lines this firm is paid on')
  })
})

describe('the rules, in a program manager’s words', () => {
  it('calls the tenure cap the time limit', () => {
    expect(sayRule('TENURE_CAP')).toBe('Time limit')
  })

  it('never shows a rule as its machine name', () => {
    for (const t of ['TENURE_CAP', 'BREAK_IN_SERVICE', 'RATE_BAND', 'INSURANCE_REQUIRED']) {
      expect(sayRule(t)).not.toMatch(/_|Tenure Cap|Break In Service/)
    }
  })

  it('says blocks and warns rather than BLOCK and WARN', () => {
    expect(sayEnforcement('BLOCK')).toBe('Blocks')
    expect(sayEnforcement('WARN')).toBe('Warns and records a reason')
  })

  it('reads a rate range in dollars an hour, never in cents', () => {
    const said = sayRuleParameters('RATE_BAND', { minRate: 7000, maxRate: 15000 })
    expect(said).toBe('$70 to $150 an hour')
    expect(said).not.toContain('15000')
  })

  it('reads a time limit in months across every supplier, and a break in days', () => {
    expect(sayRuleParameters('TENURE_CAP', { maxMonths: 18 })).toBe('18 months at most, across every supplier')
    expect(sayRuleParameters('BREAK_IN_SERVICE', { breakDays: 90 })).toBe('90 days away before coming back')
  })

  it('still shows a setting nobody has named, rather than hiding what a client configured', () => {
    expect(sayRuleParameters('VENDOR_TIER', { minimumTier: 'APPROVED' })).toBe('Minimum tier: approved')
  })
})

describe('the compliance page reads the verdict the start button runs', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/compliance/route.ts'), 'utf8')

  it('runs every line that has not started through the same clearance, with the line’s own required set', () => {
    expect(route).toContain('contractClearance({')
    expect(route).toContain('...(await lineExtras({ sellContractId: c.id }))')
    expect(route).toMatch(/state: \{ in: \['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'\] \}/)
  })

  it('names the screening company behind a background check rather than a bare clear', () => {
    expect(route).toContain('readVerdict({')
    expect(route).toContain('orderedNotCollected(v.type)')
  })
})

describe('the compliance page and the program dashboard give one number', () => {
  it('says suppliers with people on site and no agreement on file, which the dashboard counts in what needs you', () => {
    const said = twoPopulations(0, 0, 20, 95, { heldStarts: 2, blockedStarts: 2, noAgreement: 1, client: true })
    expect(said).toContain('2 people cannot start until their paperwork is on file.')
    expect(said).toContain('1 supplier has people on site with no agreement on file.')
    expect(said).not.toContain('Nothing is holding up a start here.')
  })

  it('does not say nothing is holding anybody up while a supplier is on site with no agreement', () => {
    const said = twoPopulations(0, 0, 0, null, { noAgreement: 2, client: true })
    expect(said).toContain('2 suppliers have people on site with no agreement on file.')
    expect(said).not.toContain('Nothing is holding up')
  })
})
