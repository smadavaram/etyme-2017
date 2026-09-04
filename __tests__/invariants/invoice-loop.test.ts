import { describe, it, expect } from 'vitest'
import { asFindings } from '@/lib/invoice-loop'
import type { MatchResult } from '@/lib/three-way-match'

/**
 * The three-way match was the least accountable check in the build. It
 * blocks a payment on a receipt check, and nothing anywhere counted
 * whether that check had ever been right, how often it needed a second
 * go, or what it cost. It could have been wrong for six months.
 *
 * The arithmetic is untouched — it was correct and had forty-two tests
 * before any of this. What changed is that it now answers to somebody.
 */

function result(over: Partial<MatchResult> = {}): MatchResult {
  return {
    matched: true,
    cleanMatch: true,
    summary: 'Matched',
    poAfter: null,
    checks: [
      { code: 'RECEIPT', outcome: 'PASS', reason: 'All 4 lines are backed by an approved timesheet' },
    ],
    ...over,
  }
}

describe('every verdict the match made is kept', () => {
  it('turns each check into a finding the harness can record', () => {
    const f = asFindings(result())[0]
    expect(f.code).toBe('RECEIPT')
    expect(f.verdict).toBe('PASS')
    expect(f.checker).toBe('RULE')
  })

  it('carries which lines failed, because that is what an AP clerk needs first', () => {
    const f = asFindings(
      result({
        checks: [
          { code: 'QUANTITY', outcome: 'FAIL', reason: 'billed 40h, approved 36h', lines: ['l1', 'l2'] },
        ],
      })
    )[0]
    expect(f.verdict).toBe('FAIL')
    expect(f.evidence).toBe('lines: l1, l2')
  })

  it('leaves the evidence empty rather than inventing one', () => {
    expect(asFindings(result())[0].evidence).toBeNull()
  })

  it('records a waived check as passed, with the waiver in the reason', () => {
    // It is what an override is: somebody with authority said proceed.
    // The record has to show both that it failed and that it was waived.
    const f = asFindings(
      result({
        checks: [
          { code: 'PO_BALANCE', outcome: 'OVERRIDDEN', reason: 'Waived by Kate Rowe — PO being topped up' },
        ],
      })
    )[0]
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/Waived by Kate Rowe/)
  })

  it('keeps every check, not only the failures', () => {
    // A ledger of failures alone cannot say whether a check has ever
    // passed, which is the question the whole surface exists to answer.
    const many = asFindings(
      result({
        checks: [
          { code: 'RECEIPT', outcome: 'PASS', reason: 'ok' },
          { code: 'PERIOD', outcome: 'FAIL', reason: 'wrong month' },
          { code: 'PRICE', outcome: 'PASS', reason: 'ok' },
        ],
      })
    )
    expect(many).toHaveLength(3)
    expect(many.filter((f) => f.verdict === 'PASS')).toHaveLength(2)
  })
})
