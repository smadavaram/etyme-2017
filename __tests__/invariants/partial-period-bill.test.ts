/**
 * A bill for part of a billing period is a bill, not a violation.
 *
 * ── What this was ────────────────────────────────────────────────────
 *
 * Every one of a seeded client's eleven invoices failed the match on
 * the same check, and on nothing else:
 *
 *   "Bills 2026-08-08 to 2026-08-26. The contract bills August 2026 —
 *    2026-08-01 to 2026-08-31."
 *
 * Three signed weeks inside one August, billed in August, refused. The
 * check asked for the invoice's dates to EQUAL the contract's billing
 * period, and no invoice raised from the weeks somebody actually signed
 * ever does — the first week starts after the 1st and the last ends
 * before the 31st.
 *
 * ── The rule it should have asked ────────────────────────────────────
 *
 * SAP's shape, which is the one CLAUDE.md settles on: the receipt is
 * what a bill is matched to. Signed weeks are the receipt. A bill for
 * the weeks signed so far, inside one billing period, is a partial bill
 * — ordinary, and the thing a supplier does when a placement starts
 * mid-month or ends mid-month.
 *
 * What is genuinely wrong is a bill whose dates CROSS a billing period
 * boundary: four weekly sheets producing "28 July to 24 August" is a
 * period in no contract, matching no purchase order window, reconciling
 * against nothing the client holds. That is what the check exists for
 * and it still fails.
 */

import { describe, it, expect } from 'vitest'
import { threeWayMatch, type MatchInput } from '@/lib/three-way-match'

const AUGUST = {
  start: new Date('2026-08-01T00:00:00Z'),
  end: new Date('2026-08-31T00:00:00Z'),
  label: 'August 2026',
}

/**
 * The seeded shape: three signed weeks, billed as one invoice, on a
 * contract that bills the calendar month.
 */
function bill(overrides: Partial<MatchInput['invoice']> = {}, extra: Partial<MatchInput> = {}): MatchInput {
  return {
    invoice: {
      id: 'inv1',
      totalCents: 1_560_000,
      periodStart: new Date('2026-08-08T00:00:00Z'),
      periodEnd: new Date('2026-08-26T00:00:00Z'),
      contractPeriod: AUGUST,
      ...overrides,
    },
    lines: [{
      id: 'l1', timesheetId: 'ts1', personName: 'Helena Marsh',
      hours: 120, rateCents: 13_000, amountCents: 1_560_000,
    }],
    timesheets: {
      ts1: {
        id: 'ts1', status: 'APPROVED', approvedHours: 120, contractRateCents: 13_000,
        periodStart: new Date('2026-08-08T00:00:00Z'),
        periodEnd: new Date('2026-08-26T00:00:00Z'),
      },
    },
    po: null,
    poRequired: false,
    ...extra,
  }
}

const period = (r: ReturnType<typeof threeWayMatch>) =>
  r.checks.find((c) => c.code === 'CONTRACT_PERIOD')!

describe('A bill for part of a billing period is a bill, not a violation', () => {

  it('bills the eighth to the twenty-sixth of August against an August contract and matches', () => {
    const r = threeWayMatch(bill())
    expect(r.matched).toBe(true)
    expect(period(r).outcome).toBe('PASS')
  })

  it('says the bill covers part of August rather than implying it covers all of it', () => {
    expect(period(threeWayMatch(bill())).reason).toContain('part of August 2026')
  })

  it('bills the whole of August against an August contract and says that is what the contract bills', () => {
    const r = threeWayMatch(bill({ periodStart: AUGUST.start, periodEnd: AUGUST.end }))
    expect(period(r).outcome).toBe('PASS')
    expect(period(r).reason).toContain('which is what the contract bills')
  })

  it('bills a single day inside August and still matches, because a day is inside the month', () => {
    const r = threeWayMatch(bill({
      periodStart: new Date('2026-08-12T00:00:00Z'),
      periodEnd: new Date('2026-08-12T00:00:00Z'),
    }))
    expect(period(r).outcome).toBe('PASS')
  })
})

describe('A bill that crosses from one billing period into the next says so', () => {

  it('refuses a bill running from the twenty-eighth of July to the twenty-fourth of August', () => {
    const r = threeWayMatch(bill({
      periodStart: new Date('2026-07-28T00:00:00Z'),
      periodEnd: new Date('2026-08-24T00:00:00Z'),
    }))
    expect(period(r).outcome).toBe('FAIL')
    expect(r.matched).toBe(false)
  })

  it('says a bill starting before August began covers more than one billing period', () => {
    const reason = period(threeWayMatch(bill({
      periodStart: new Date('2026-07-28T00:00:00Z'),
      periodEnd: new Date('2026-08-24T00:00:00Z'),
    }))).reason
    expect(reason).toContain('before August 2026 begins on 2026-08-01')
    expect(reason).toContain('more than one billing period')
  })

  it('says a bill running past the end of August covers more than one billing period', () => {
    const reason = period(threeWayMatch(bill({
      periodStart: new Date('2026-08-10T00:00:00Z'),
      periodEnd: new Date('2026-09-07T00:00:00Z'),
    }))).reason
    expect(reason).toContain('past the end of August 2026')
    expect(reason).toContain('2026-08-31')
  })

  it('never says a code where a sentence belongs', () => {
    const reason = period(threeWayMatch(bill({
      periodStart: new Date('2026-07-28T00:00:00Z'),
      periodEnd: new Date('2026-08-24T00:00:00Z'),
    }))).reason
    expect(reason).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
  })

  it('lets somebody with authority record an exception against it, because a final part-period bill is real', () => {
    const straddle = {
      periodStart: new Date('2026-07-28T00:00:00Z'),
      periodEnd: new Date('2026-08-24T00:00:00Z'),
    }
    const r = threeWayMatch(bill(straddle, {
      overrides: [{
        code: 'CONTRACT_PERIOD',
        reason: 'Final bill on a mid-month termination, agreed with the client.',
        byName: 'Dana Whitfield',
        at: new Date('2026-09-01T00:00:00Z'),
      }],
    }))
    expect(period(r).outcome).toBe('OVERRIDDEN')
    expect(r.matched).toBe(true)
    expect(r.cleanMatch).toBe(false)
  })
})

describe('A bill with no contract terms behind it is asked nothing about billing periods', () => {

  it('says nothing at all where the contract carries no period', () => {
    const r = threeWayMatch(bill({ contractPeriod: null }))
    expect(r.checks.some((c) => c.code === 'CONTRACT_PERIOD')).toBe(false)
  })
})
