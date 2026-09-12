/**
 * The contract is the authority on price.
 *
 * These tests exist because the first attempt got it wrong. When an invoice
 * billed a rate the contract did not carry, the fix offered was an AP
 * waiver — a clerk writing "rate amendment signed, not yet keyed" on that
 * one invoice. It clears the invoice and records the real price nowhere a
 * system can read, so next month's invoice fails identically and is waived
 * identically.
 *
 * The right remedy is to amend the contract, effective from the date the
 * change actually took effect, with approval. Then the invoice matches
 * because it is correct, not because somebody signed it off.
 */

import { describe, it, expect } from 'vitest'
import {
  rateInForce,
  spansRateChange,
  assessRateChange,
  type RatePeriod,
} from '@/lib/contract-rate'

const CONTRACT_RATE = 12_000 // $120/hr

function period(over: Partial<RatePeriod> = {}): RatePeriod {
  return {
    id: 'r1',
    rateCents: 15_000,
    fromDate: new Date('2026-08-12T00:00:00Z'),
    toDate: null,
    approvalState: 'APPROVED',
    ...over,
  }
}

// ── The rate on the day ────────────────────────────────────

describe('The rate billed is the rate in force on the day worked', () => {

  it('with no amendments, the contract rate applies', () => {
    const r = rateInForce(CONTRACT_RATE, [], new Date('2026-08-20T00:00:00Z'))
    expect(r.rateCents).toBe(12_000)
    expect(r.source).toBe('CONTRACT')
  })

  it('work after the amendment bills at the new rate', () => {
    const r = rateInForce(CONTRACT_RATE, [period()], new Date('2026-08-20T00:00:00Z'))
    expect(r.rateCents).toBe(15_000)
    expect(r.source).toBe('AMENDMENT')
  })

  it('work before the amendment still bills at the old rate', () => {
    // The point of effective dating: amending forward does not rewrite
    // history, so past invoices stay correct.
    const r = rateInForce(CONTRACT_RATE, [period()], new Date('2026-08-01T00:00:00Z'))
    expect(r.rateCents).toBe(12_000)
    expect(r.source).toBe('CONTRACT')
  })

  it('work on the first day of the amendment bills at the new rate', () => {
    const r = rateInForce(CONTRACT_RATE, [period()], new Date('2026-08-12T00:00:00Z'))
    expect(r.rateCents).toBe(15_000)
  })

  it('an amendment that has ended no longer applies', () => {
    const r = rateInForce(
      CONTRACT_RATE,
      [period({ toDate: new Date('2026-08-31T00:00:00Z') })],
      new Date('2026-09-15T00:00:00Z')
    )
    expect(r.rateCents).toBe(12_000)
  })

  it('the latest amendment covering a day wins', () => {
    const r = rateInForce(CONTRACT_RATE, [
      period({ id: 'r1', rateCents: 15_000, fromDate: new Date('2026-08-12T00:00:00Z') }),
      period({ id: 'r2', rateCents: 16_000, fromDate: new Date('2026-09-01T00:00:00Z') }),
    ], new Date('2026-09-10T00:00:00Z'))
    expect(r.rateCents).toBe(16_000)
    expect(r.periodId).toBe('r2')
  })
})

// ── Approval is what makes it real ─────────────────────────

describe('An unapproved rate change does not bill', () => {

  it('a proposed amendment is ignored until somebody approves it', () => {
    const r = rateInForce(
      CONTRACT_RATE,
      [period({ approvalState: 'PROPOSED' })],
      new Date('2026-08-20T00:00:00Z')
    )
    expect(r.rateCents).toBe(12_000)
  })

  it('a rejected amendment never bills', () => {
    const r = rateInForce(
      CONTRACT_RATE,
      [period({ approvalState: 'REJECTED' })],
      new Date('2026-08-20T00:00:00Z')
    )
    expect(r.rateCents).toBe(12_000)
  })

  it('an approved amendment bills even when a later one is still proposed', () => {
    const r = rateInForce(CONTRACT_RATE, [
      period({ id: 'r1', rateCents: 15_000, fromDate: new Date('2026-08-12T00:00:00Z'), approvalState: 'APPROVED' }),
      period({ id: 'r2', rateCents: 18_000, fromDate: new Date('2026-08-15T00:00:00Z'), approvalState: 'PROPOSED' }),
    ], new Date('2026-08-20T00:00:00Z'))
    expect(r.rateCents).toBe(15_000)
  })
})

// ── A change landing mid-timesheet ─────────────────────────

describe('A rate change inside a timesheet period is named, not averaged', () => {

  it('a change mid-period is detected, with the date', () => {
    const s = spansRateChange(
      [period()],
      new Date('2026-08-08T00:00:00Z'),
      new Date('2026-08-15T00:00:00Z')
    )
    expect(s.spans).toBe(true)
    expect(s.changeDate?.toISOString().slice(0, 10)).toBe('2026-08-12')
  })

  it('a change before the period is not a mid-period change', () => {
    const s = spansRateChange(
      [period()],
      new Date('2026-08-16T00:00:00Z'),
      new Date('2026-08-23T00:00:00Z')
    )
    expect(s.spans).toBe(false)
  })

  it('a change exactly on the period start is not a split', () => {
    // The whole period is already at the new rate.
    const s = spansRateChange(
      [period()],
      new Date('2026-08-12T00:00:00Z'),
      new Date('2026-08-19T00:00:00Z')
    )
    expect(s.spans).toBe(false)
  })

  it('a proposed change does not split anything', () => {
    const s = spansRateChange(
      [period({ approvalState: 'PROPOSED' })],
      new Date('2026-08-08T00:00:00Z'),
      new Date('2026-08-15T00:00:00Z')
    )
    expect(s.spans).toBe(false)
  })
})

// ── Which changes need a human ─────────────────────────────

describe('A rate change is approved in proportion to its size', () => {

  it('a small annual uplift clears without a human', () => {
    const a = assessRateChange(12_000, 12_500)
    expect(a.needsApproval).toBe(false)
    expect(a.changePercent).toBeCloseTo(4.2, 1)
  })

  it('a quarter added to the rate goes for approval', () => {
    const a = assessRateChange(12_000, 15_000)
    expect(a.needsApproval).toBe(true)
    expect(a.reason).toContain('25% from $120 to $150/hr')
  })

  it('a rate cut needs no approval — the vendor agreeing is the approval', () => {
    const a = assessRateChange(15_000, 12_000)
    expect(a.direction).toBe('DECREASE')
    expect(a.needsApproval).toBe(false)
  })

  it('no change is no change', () => {
    const a = assessRateChange(12_000, 12_000)
    expect(a.direction).toBe('NONE')
    expect(a.needsApproval).toBe(false)
  })

  it('the reason always names both rates so an approver can judge it', () => {
    const a = assessRateChange(12_000, 15_000)
    expect(a.reason).toContain('$120')
    expect(a.reason).toContain('$150')
  })
})
