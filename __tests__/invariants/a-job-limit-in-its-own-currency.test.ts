import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { evaluateRequisition, valueIn, type ApprovalRuleFacts, type RequisitionFacts } from '@/lib/requisition-approval'
import { spendInReporting, type ReportingRate } from '@/lib/money/reporting-currency'

/**
 * Decided by the coordinator, 2026-11-08, reversible by the founder in a
 * sentence: a job's value is compared with an approval limit or a cost
 * center's budget in the limit's own currency, converted at the company's
 * own rate where one is set; with no rate between the two, the job is not
 * cleared by rule and a person decides, told why in one sentence. Never
 * compared as raw numbers, never passed silently. One currency behaves
 * exactly as before.
 */
const ON = new Date('2026-11-08T00:00:00Z')
/** The company's own rate, as money keeps it: units of USD per one INR. */
const OWN: ReportingRate[] = [{ from: 'INR', to: 'USD', rate: 0.012, effectiveOn: new Date('2026-10-01T00:00:00Z'), source: 'manual', recordedAt: null, setBy: 'Rosalind Tay' }]
/** Money's own conversion over the company's own rates, as the route builds it. */
const atOwnRates = (rates: ReportingRate[]) => (minor: number, from: string, to: string) => {
  const total = spendInReporting([{ currency: from, minor }], to, rates, ON).total
  return total ? total.minor : null
}

const VP: ApprovalRuleFacts = { id: 'r-vp', name: 'Over $250k', kind: 'VALUE', approverId: 'p-chen', approverName: 'Marcus Chen', thresholdCents: 250_000_00, rank: 1 }
const cc = { id: 'cc', code: 'TBC-4100', approvedHeads: 10, committedHeads: 1, annualBudgetCents: 500_000_00, committedSpendCents: 100_000_00 }
const facts = (over: Partial<RequisitionFacts> = {}): RequisitionFacts => ({
  annualValueCents: 10_000_000_00, // ₹10,000,000 a year
  valueBasis: 'BUDGET', valueSays: 'the ₹10,000,000 budget you stated',
  headcount: 1, billMaxCents: null, skillMedianCents: null, costCenter: cc, months: 12,
  currency: 'INR', limitCurrency: 'USD',
  ...over,
})
const check = (d: ReturnType<typeof evaluateRequisition>, code: string) => d.checks.find((c) => c.code === code)!

describe('a job’s value against a limit written in another currency', () => {
  it('a rupee job under a dollar limit at the company’s own rate clears the limit and the budget by rule', () => {
    // ₹10,000,000 × 0.012 = $120,000: under the $250,000 limit, inside the $400,000 left.
    const d = evaluateRequisition(facts({ convert: atOwnRates(OWN) }), [VP])
    expect(check(d, 'VALUE').outcome).toBe('PASS')
    expect(check(d, 'BUDGET')).toMatchObject({ outcome: 'PASS', reason: '$280,000 left in TBC-4100' })
  })

  it('a rupee job over a dollar limit at the company’s own rate goes to the person over the limit, the limit said in dollars', () => {
    const d = evaluateRequisition(facts({ annualValueCents: 30_000_000_00, valueSays: 'the ₹30,000,000 budget you stated', convert: atOwnRates(OWN) }), [VP])
    expect(check(d, 'VALUE').outcome).toBe('ROUTE')
    expect(check(d, 'VALUE').reason).toContain('is over the $250,000 limit, so Marcus Chen signs it')
  })

  it('with no rate between the two currencies set, the job goes to a person and says why', () => {
    const d = evaluateRequisition(facts({ convert: atOwnRates([]) }), [VP])
    expect(check(d, 'VALUE')).toMatchObject({ outcome: 'ROUTE', reason: 'Its value is in INR and the limit is in USD, and no rate between them is set, so a person decides' })
    expect(check(d, 'BUDGET')).toMatchObject({ outcome: 'ROUTE', reason: 'Its value is in INR and TBC-4100’s budget is in USD, and no rate between them is set, so a person decides' })
    // Marcus Chen, who approves over the limit, decides; it does not clear itself.
    expect(d.state).not.toBe('AUTO_APPROVED')
    expect(d.steps.some((st) => st.approverName === 'Marcus Chen' && st.outcome === 'PENDING')).toBe(true)
  })

  it('with no converter at all, two currencies are never compared as raw numbers', () => {
    // ₹10,000,000 is 1,000,000,000 minor units: as a raw number it is over $250,000, and as rupees it is not. Neither is guessed.
    const d = evaluateRequisition(facts({ annualValueCents: 100_00, valueSays: 'the ₹100 budget you stated' }), [VP])
    expect(check(d, 'VALUE').reason).toContain('no rate between them is set, so a person decides')
  })

  it('a job and a limit in one currency behave exactly as before, with nothing converted', () => {
    const convert = vi.fn()
    const one = evaluateRequisition(facts({ currency: 'USD', limitCurrency: 'USD', annualValueCents: 200_000_00, valueSays: 'the $200,000 budget you stated', convert }), [VP])
    const before = evaluateRequisition(facts({ currency: 'USD', limitCurrency: null, annualValueCents: 200_000_00, valueSays: 'the $200,000 budget you stated' }), [VP])
    expect(one).toEqual(before)
    expect(convert).not.toHaveBeenCalled()
    expect(check(one, 'BUDGET').reason).toBe('$200,000 left in TBC-4100')
  })

  it('a job in rupees over a limit in rupees says the limit in rupees, not dollars', () => {
    const d = evaluateRequisition(
      facts({ limitCurrency: null, annualValueCents: 30_000_000_00, valueSays: 'the ₹30,000,000 budget you stated', costCenter: null }),
      [{ ...VP, thresholdCents: 20_000_000_00 }],
    )
    expect(check(d, 'VALUE').reason).toContain('is over the ₹20,000,000 limit, so Marcus Chen signs it')
  })

  it('a value is itself in its own currency, converted only where the two differ, and nothing where the conversion has no answer', () => {
    expect(valueIn(500, 'USD', 'usd', null)).toBe(500)
    expect(valueIn(10_000_000_00, 'INR', 'USD', atOwnRates(OWN))).toBe(120_000_00)
    expect(valueIn(1_000_000_00, 'INR', 'USD', atOwnRates([]))).toBeNull()
    expect(valueIn(1_000_000_00, 'INR', 'USD', null)).toBeNull()
  })
})
