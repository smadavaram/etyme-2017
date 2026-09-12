import { describe, it, expect } from 'vitest'
import { assessRule, assessDeletion } from '@/lib/governance-authorship'

/**
 * Governance decides what everybody else needs permission for. Whoever
 * edits the approval chain can, in one save, remove every approval their
 * own spend would have needed.
 *
 * The system already refuses to let somebody approve their own rate rise.
 * These tests apply the same control to the thing that decides whether an
 * approval is needed at all.
 */

const AUTHOR = 'person-author'
const OTHER = 'person-other'
const THIRD = 'person-third'

function draft(over: Partial<Parameters<typeof assessRule>[0]> = {}) {
  return {
    authorPersonId: AUTHOR,
    approverPersonIds: [OTHER],
    thresholdCents: 25_000_00,
    name: 'Departmental — above $25k',
    ...over,
  }
}

const QUIET = { otherRuleApproverIds: [], otherActiveRules: 2 }

describe('writing an approval rule', () => {
  it('lets somebody write a rule that sends decisions to another person', () => {
    const a = assessRule(draft(), QUIET)
    expect(a.allowed).toBe(true)
  })

  it('refuses a rule where its author is the only approver', () => {
    // Otherwise the author can route their own spend to themselves, and
    // nothing they ever buy is seen by anybody else.
    const a = assessRule(draft({ approverPersonIds: [AUTHOR] }), QUIET)
    expect(a.allowed).toBe(false)
    expect(a.checks.find((c) => c.code === 'SELF_APPROVAL')?.outcome).toBe('BLOCK')
  })

  it('allows the author to sit in a chain alongside others, and records that they do', () => {
    // A programme manager who writes the chain and sits in it is ordinary.
    // Being the whole chain is not.
    const a = assessRule(draft({ approverPersonIds: [AUTHOR, OTHER] }), QUIET)
    expect(a.allowed).toBe(true)
    expect(a.checks.find((c) => c.code === 'SELF_IN_CHAIN')?.outcome).toBe('WARN')
  })

  it('refuses a rule with no approver at all, because it silently clears everything', () => {
    const a = assessRule(draft({ approverPersonIds: [] }), QUIET)
    expect(a.allowed).toBe(false)
    expect(a.checks.find((c) => c.code === 'NO_APPROVER')?.outcome).toBe('BLOCK')
  })

  it('refuses the same person twice in one chain', () => {
    // It asks them to approve the same thing twice, and stalls when they
    // do it once.
    const a = assessRule(draft({ approverPersonIds: [OTHER, THIRD, OTHER] }), QUIET)
    expect(a.allowed).toBe(false)
    expect(a.checks.find((c) => c.code === 'DUPLICATE_APPROVER')?.outcome).toBe('BLOCK')
  })

  it('refuses a threshold below zero', () => {
    const a = assessRule(draft({ thresholdCents: -1 }), QUIET)
    expect(a.allowed).toBe(false)
  })

  it('warns when a company’s only rule would send every requisition to a person', () => {
    // Most requisitions must clear without a human. Governance slower than
    // the workaround produces the workaround.
    const a = assessRule(
      draft({ thresholdCents: null }),
      { otherRuleApproverIds: [], otherActiveRules: 0 }
    )
    expect(a.allowed).toBe(true)
    expect(a.checks.find((c) => c.code === 'CATCHES_EVERYTHING')?.outcome).toBe('WARN')
  })

  it('does not warn about a catch-all rule when other rules already exist', () => {
    const a = assessRule(draft({ thresholdCents: null }), QUIET)
    expect(a.checks.find((c) => c.code === 'CATCHES_EVERYTHING')).toBeUndefined()
  })

  it('explains a refusal in words that say what to do about it', () => {
    const a = assessRule(draft({ approverPersonIds: [AUTHOR] }), QUIET)
    expect(a.summary).toMatch(/add another approver/i)
  })

  it('never silently permits — every assessment carries at least one check', () => {
    for (const d of [draft(), draft({ approverPersonIds: [AUTHOR] }), draft({ thresholdCents: null })]) {
      expect(assessRule(d, QUIET).checks.length).toBeGreaterThan(0)
    }
  })
})

describe('removing an approval rule', () => {
  it('warns, but permits, removing the last rule a company has', () => {
    // A company is entitled to decide it needs no approvals. It is not
    // entitled to discover that by accident six months later.
    const c = assessDeletion({ otherActiveRules: 0 })
    expect(c.outcome).toBe('WARN')
    expect(c.reason).toMatch(/every requisition clears/i)
  })

  it('says nothing special about removing one rule of several', () => {
    expect(assessDeletion({ otherActiveRules: 3 }).outcome).toBe('PASS')
  })
})
