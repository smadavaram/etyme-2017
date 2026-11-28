import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { negotiation, mayMove, messageFor } from '@/lib/rate-negotiation'
import { screenExemption, weekWage } from '@/lib/worker-classification'
import { deriveStartPacket, explainDerivation } from '@/lib/packet-derivation'
import { evaluateRequisition, annualValue, overTheLimitSays, type RequisitionFacts } from '@/lib/requisition-approval'

/**
 * The "₫170.00" class, in regulatory's files (2026-11-08): a figure divided
 * by a hundred with a dollar sign in front. Every amount says its own
 * currency through money's one formatter, with the currency's own decimals:
 * a rate in dong reads whole dong, dollars keep their cents.
 */
const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')
const AT = new Date('2026-11-01T00:00:00Z')

describe('the rate a consultant negotiates is said in its own currency', () => {
  it('a rate in dong reads whole dong, with no cents and no dollar sign', () => {
    const s = negotiation([{ at: AT, by: 'VENDOR', move: 'OFFER', cents: 170_000 }], 'VND')
    expect(s.says).toBe('They have offered ₫170,000/hr. It is with you.')
    expect(messageFor({ at: AT, by: 'VENDOR', move: 'OFFER', cents: 170_000 }, 'Halcyon Talent', 'VND')).toBe('Halcyon Talent proposed ₫170,000/hr.')
  })

  it('a rate in dollars keeps its cents, and drops them only where they are zero', () => {
    expect(negotiation([{ at: AT, by: 'CANDIDATE', move: 'OFFER', cents: 13_050 }]).says).toBe('You asked for $130.50/hr. Waiting on them.')
    const agreed = negotiation([
      { at: AT, by: 'VENDOR', move: 'OFFER', cents: 13_000 },
      { at: new Date(AT.getTime() + 1), by: 'CANDIDATE', move: 'ACCEPT' },
    ])
    expect(agreed.says).toBe('Agreed at $130/hr. Neither side can change it now.')
    expect(mayMove(agreed, 'VENDOR', 'OFFER').reason).toBe('This was agreed at $130/hr. Neither side can reopen it.')
  })

  it('a rate in rupees is said in rupees', () => {
    const s = negotiation([{ at: AT, by: 'VENDOR', move: 'OFFER', cents: 250_000 }], 'INR')
    expect(mayMove(s, 'CANDIDATE', 'ACCEPT').reason).toBe('Accepting ₹2,500/hr.')
  })
})

describe('overtime and the exemption screen say the line’s own currency', () => {
  it('an hourly pay rate in dollars under the FLSA is said with its cents beside the floors in dollars', () => {
    const s = screenExemption({ payModel: 'FIXED_HOURLY', payRateCents: 2_550, paidOnSalaryBasis: false }, 'US_FLSA')
    expect(s.says).toContain('Paid $25.50 an hour')
    expect(s.says).toMatch(/\$27\.63 an hour/)
  })

  it('a line paid in another currency is never compared against floors written in dollars: Etyme cannot say', () => {
    const s = screenExemption({ payModel: 'FIXED_HOURLY', payRateCents: 170_000, paidOnSalaryBasis: false, payCurrency: 'VND' }, 'US_FLSA')
    expect(s.outcome).toBe('ETYME_CANNOT_SAY')
    expect(s.says).toContain('Paid in VND')
    expect(s.says).not.toMatch(/\$/)
  })

  const nonexempt = {
    status: 'NONEXEMPT' as const, basis: null, assertedByCompanyId: 'co-csi', assertedByCompanyName: 'Computer Systems Inc',
    assertedByName: 'Ruth Calloway', assertedAt: AT, note: null, reviewBy: null,
  }
  const week = { weekOf: '2026-11-01', regularHours: 40, leaveHours: 0, overHours: 4 }
  const at = (payCurrency?: string) => ({
    personName: 'Rosa Delgado', contractType: 'W2', weAreTheEmployer: true,
    pay: { payModel: 'FIXED_HOURLY', payRateCents: 4_000, paidOnSalaryBasis: false, payCurrency },
    rule: 'US_FLSA' as const, assertion: nonexempt, client: { treatment: 'PREMIUM' as const, appliedBps: 15_000 },
  })

  it('what the employer owes for a week’s overtime in dollars keeps its cents', () => {
    expect(weekWage(week, at()).says).toContain('at time and a half — $240.00.')
  })

  it('what the employer owes for a week’s overtime on a line paid in pounds is said in pounds', () => {
    expect(weekWage(week, at('GBP')).says).toContain('— £240.00.')
  })
})

describe('the size of an engagement and a job’s money are said in their own currency', () => {
  it('a start packet for a large engagement says its value in that engagement’s currency', () => {
    const d = deriveStartPacket({ country: 'US', valueCents: 600_000_00, valueCurrency: 'USD' })
    expect(explainDerivation(d, { country: 'US', valueCents: 600_000_00, valueCurrency: 'USD' })).toContain('$600,000 a year')
  })

  const facts = (over: Partial<RequisitionFacts> = {}): RequisitionFacts => ({
    annualValueCents: 200_000_00, headcount: 1, billMaxCents: 13_000, skillMedianCents: 10_000, costCenter: null, months: 12, ...over,
  })

  it('a job’s rate against the going rate reads in dollars for a dollar job', () => {
    const d = evaluateRequisition(facts(), [])
    expect(d.checks.find((c) => c.code === 'RATE_BAND')!.reason).toBe('$130/hr is 30% above the $100/hr you already pay for this skill')
  })

  it('a job’s rate in dong reads whole dong against the going rate in dong', () => {
    const d = evaluateRequisition(facts({ currency: 'VND', billMaxCents: 260_000, skillMedianCents: 200_000 }), [])
    expect(d.checks.find((c) => c.code === 'RATE_BAND')!.reason).toBe('₫260,000/hr is 30% above the ₫200,000/hr you already pay for this skill')
  })

  it('a job’s estimated value reads in its own currency, and the limit it is over in the company’s', () => {
    const v = annualValue({ billMaxCents: 260_000, headcount: 1, months: 12, currency: 'VND' })
    expect(v.says).toBe('about ₫499,200,000, estimated from ₫260,000/hr at 40 hours a week for 12 months')
    expect(overTheLimitSays({ valueSays: v.says, estimated: true, rules: [{ approverId: 'p', approverName: 'Dana Whitfield', thresholdCents: 400_000_000 }], currency: 'VND' }))
      .toMatch(/^About ₫499,200,000 is over the ₫400,000,000 limit, so Dana Whitfield signs it\./)
  })

  it('a stated budget in dollars reads in dollars, as it always did', () => {
    expect(annualValue({ budgetCents: 180_000_00, billMaxCents: null, headcount: 1, months: 12 }).says).toBe('the $180,000 budget you stated')
  })

  it('none of the four files divides a figure by a hundred behind a dollar sign', () => {
    for (const f of ['lib/rate-negotiation.ts', 'lib/worker-classification.ts', 'lib/packet-derivation.ts', 'lib/requisition-approval.ts']) {
      expect(src(f), f).not.toMatch(/`\$\$\{[^}]*\/ ?100/)
    }
  })
})
