/**
 * Requisition approval — does it clear itself, or does it need a person?
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Addendum E: "Most requisitions must clear without human approval.
 * Governance slower than the workaround produces the workaround."
 *
 * That sentence is the specification. If these tests show most ordinary
 * requisitions routing to a human, the governance is wrong — a hiring
 * manager who waits three days for a rubber stamp goes back to email, and
 * then the platform sees none of it.
 *
 * The opposite failure is just as real: silently permitting. Every
 * clearance carries its reason, so an auto-approved requisition can be
 * audited later as a decision rather than an absence of one.
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateRequisition,
  annualisedValueCents,
  advanceApprovalChain,
  mayDistribute,
  type PendingApproval,
  type RequisitionFacts,
  type ApprovalRuleFacts,
} from '@/lib/requisition-approval'

// A department comfortably inside its plan and budget.
function healthyCostCenter(overrides: Partial<NonNullable<RequisitionFacts['costCenter']>> = {}) {
  return {
    id: 'cc-1',
    code: 'TBC-4100',
    approvedHeads: 10,
    committedHeads: 4,
    annualBudgetCents: 500_000_00, // $500,000
    committedSpendCents: 100_000_00, // $100,000
    ...overrides,
  }
}

function facts(overrides: Partial<RequisitionFacts> = {}): RequisitionFacts {
  return {
    annualValueCents: 200_000_00, // $200,000
    headcount: 1,
    billMaxCents: 13_000, // $130/hr
    skillMedianCents: 13_400, // $134/hr — asking slightly under the going rate
    costCenter: healthyCostCenter(),
    months: 12,
    ...overrides,
  }
}

const DEPT_APPROVER: ApprovalRuleFacts = {
  id: 'rule-dept',
  name: 'Departmental',
  approverId: 'p-whitfield',
  approverName: 'Dana Whitfield',
  thresholdCents: 250_000_00, // $250k
  rank: 1,
}

const EXCEPTION_APPROVER: ApprovalRuleFacts = {
  id: 'rule-exception',
  name: 'Exceptions',
  approverId: 'p-mbeki',
  approverName: 'Joyce Mbeki',
  thresholdCents: null, // catch-all: only when a check routes
  rank: 2,
}

const RULES = [DEPT_APPROVER, EXCEPTION_APPROVER]

// ── The default must be to clear ───────────────────────

describe('An ordinary requisition clears without a human', () => {

  it('inside plan, inside budget and at the going rate, it approves itself', () => {
    const d = evaluateRequisition(facts(), RULES)
    expect(d.state).toBe('AUTO_APPROVED')
    expect(d.route).toHaveLength(0)
  })

  it('an auto-clearance still says why, so it can be audited later', () => {
    const d = evaluateRequisition(facts(), RULES)
    expect(d.summary).toContain('within plan, budget and rate')
    expect(d.checks.every(c => c.reason.length > 0)).toBe(true)
  })

  it('every check reports a reason whether it passes or routes', () => {
    const d = evaluateRequisition(facts({ headcount: 20 }), RULES)
    for (const c of d.checks) {
      expect(c.reason).toBeTruthy()
    }
  })

  it('asking slightly under the going rate is not a reason to stop anyone', () => {
    const d = evaluateRequisition(
      facts({ billMaxCents: 12_000, skillMedianCents: 13_400 }),
      RULES
    )
    expect(d.state).toBe('AUTO_APPROVED')
  })

  it('a modest premium within tolerance still clears', () => {
    // $148 against a $134 median is about 10% — inside the 15% tolerance
    const d = evaluateRequisition(
      facts({ billMaxCents: 14_800, skillMedianCents: 13_400 }),
      RULES
    )
    expect(d.state).toBe('AUTO_APPROVED')
  })
})

// ── When it must route ─────────────────────────────────

describe('A requisition routes to a person when a fact demands it', () => {

  it('going over the approved headcount routes for approval', () => {
    const d = evaluateRequisition(
      facts({ headcount: 8, costCenter: healthyCostCenter({ committedHeads: 4, approvedHeads: 10 }) }),
      RULES
    )
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.checks.find(c => c.code === 'HEADCOUNT_PLAN')?.outcome).toBe('ROUTE')
    expect(d.checks.find(c => c.code === 'HEADCOUNT_PLAN')?.reason).toContain('12 of 10')
  })

  it('exceeding the budget routes, and says by how much', () => {
    const d = evaluateRequisition(
      facts({
        annualValueCents: 450_000_00,
        costCenter: healthyCostCenter({ annualBudgetCents: 500_000_00, committedSpendCents: 100_000_00 }),
      }),
      RULES
    )
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.checks.find(c => c.code === 'BUDGET')?.reason).toContain('Exceeds TBC-4100 budget by $50,000')
  })

  it('a rate well above what the client already pays routes with the comparison', () => {
    const d = evaluateRequisition(
      facts({ billMaxCents: 17_000, skillMedianCents: 13_400 }),
      RULES
    )
    expect(d.state).toBe('PENDING_APPROVAL')
    const band = d.checks.find(c => c.code === 'RATE_BAND')
    expect(band?.outcome).toBe('ROUTE')
    expect(band?.reason).toContain('above the $134/hr you already pay')
  })

  it('a requisition with no cost centre routes — nobody owns the spend', () => {
    const d = evaluateRequisition(facts({ costCenter: null }), RULES)
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.checks.find(c => c.code === 'COST_CENTER')?.outcome).toBe('ROUTE')
  })

  it('a department with no headcount plan on file routes', () => {
    const d = evaluateRequisition(
      facts({ costCenter: healthyCostCenter({ approvedHeads: null }) }),
      RULES
    )
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.checks.find(c => c.code === 'HEADCOUNT_PLAN')?.reason).toContain('No headcount plan')
  })

  it('a large requisition is seen by a human even when every fact is fine', () => {
    // $300k is over the $250k departmental threshold, but inside plan
    const d = evaluateRequisition(
      facts({
        annualValueCents: 300_000_00,
        costCenter: healthyCostCenter({ annualBudgetCents: 900_000_00 }),
      }),
      RULES
    )
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.route[0].approverName).toBe('Dana Whitfield')
    expect(d.summary).toContain('threshold')
  })

  it('approvers are routed in rank order', () => {
    const d = evaluateRequisition(
      facts({ annualValueCents: 300_000_00, headcount: 20 }),
      RULES
    )
    expect(d.route.map(r => r.rank)).toEqual([1, 2])
  })

  it('the same approver is never routed to twice', () => {
    const d = evaluateRequisition(
      facts({ annualValueCents: 300_000_00, headcount: 20 }),
      [DEPT_APPROVER, DEPT_APPROVER, EXCEPTION_APPROVER]
    )
    expect(d.route.filter(r => r.id === 'rule-dept')).toHaveLength(1)
  })

  it('the summary names the first problem and who is looking at it', () => {
    const d = evaluateRequisition(facts({ headcount: 20 }), RULES)
    expect(d.summary).toContain('approved heads')
    expect(d.summary).toContain('Joyce Mbeki')
  })
})

// ── Never silently permit ──────────────────────────────

describe('Nothing passes silently', () => {

  it('a routed check with no approver configured still clears, and says so', () => {
    // Addendum E forbids silent permission. With no rule to catch it the
    // requisition proceeds — but the summary admits nobody reviewed it.
    const d = evaluateRequisition(facts({ headcount: 20 }), [])
    expect(d.state).toBe('AUTO_APPROVED')
    expect(d.summary).toContain('no approver configured')
  })

  it('the notes survive even when the requisition clears', () => {
    const d = evaluateRequisition(facts({ headcount: 20 }), [])
    expect(d.checks.filter(c => c.outcome === 'ROUTE').length).toBeGreaterThan(0)
  })
})

// ── Annualised value ───────────────────────────────────

describe('Annualised value of a requisition', () => {

  it('one person at $130/hr for twelve months is $249,600', () => {
    // 13000c x 160h x 12mo = 24,960,000c
    expect(annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: 12 }))
      .toBe(249_600_00)
  })

  it('three people cost three times as much', () => {
    const one = annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: 12 })
    const three = annualisedValueCents({ billMaxCents: 13_000, headcount: 3, months: 12 })
    expect(three).toBe(one * 3)
  })

  it('a six-month requisition costs half a year, not a whole one', () => {
    const half = annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: 6 })
    const full = annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: 12 })
    expect(half).toBe(full / 2)
  })

  it('a three-year requisition does not consume three years of one budget', () => {
    // Capped at twelve months — a budget is annual
    const threeYears = annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: 36 })
    const oneYear = annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: 12 })
    expect(threeYears).toBe(oneYear)
  })

  it('a requisition with no stated ceiling has no computable value', () => {
    expect(annualisedValueCents({ billMaxCents: null, headcount: 1, months: 12 })).toBe(0)
  })

  it('an unstated duration is treated as a full year', () => {
    expect(annualisedValueCents({ billMaxCents: 13_000, headcount: 1, months: null }))
      .toBe(249_600_00)
  })
})

// ── Advancing the chain ────────────────────────────────

describe('Deciding one approval in a chain', () => {
  const chain = (): PendingApproval[] => [
    { id: 'a1', approverId: 'dana', rank: 1, outcome: 'PENDING' },
    { id: 'a2', approverId: 'joyce', rank: 2, outcome: 'PENDING' },
  ]

  it('the lowest undecided rank is the one in play', () => {
    const r = advanceApprovalChain(chain(), 'approve', 'dana')
    expect(r.current?.id).toBe('a1')
    expect(r.refusal).toBeNull()
  })

  it('rank two cannot approve before rank one has', () => {
    const r = advanceApprovalChain(chain(), 'approve', 'joyce')
    expect(r.refusal).toBe('NOT_YOUR_APPROVAL')
    expect(r.nextState).toBeNull()
  })

  it('somebody with no approval on the requisition cannot decide it', () => {
    const r = advanceApprovalChain(chain(), 'approve', 'a-stranger')
    expect(r.refusal).toBe('NOT_YOUR_APPROVAL')
  })

  it('approving rank one does not open the requisition on its own', () => {
    const r = advanceApprovalChain(chain(), 'approve', 'dana')
    expect(r.completesChain).toBe(false)
    expect(r.nextStatus).toBeNull()
    expect(r.remaining.map(a => a.approverId)).toEqual(['joyce'])
  })

  it('a requisition opens only when every rank has approved', () => {
    const afterDana: PendingApproval[] = [
      { id: 'a1', approverId: 'dana', rank: 1, outcome: 'APPROVED' },
      { id: 'a2', approverId: 'joyce', rank: 2, outcome: 'PENDING' },
    ]
    const r = advanceApprovalChain(afterDana, 'approve', 'joyce')
    expect(r.completesChain).toBe(true)
    expect(r.nextState).toBe('APPROVED')
    expect(r.nextStatus).toBe('OPEN')
  })

  it('a single-approver chain opens on that one approval', () => {
    const solo: PendingApproval[] = [{ id: 'a1', approverId: 'dana', rank: 1, outcome: 'PENDING' }]
    const r = advanceApprovalChain(solo, 'approve', 'dana')
    expect(r.nextStatus).toBe('OPEN')
  })

  it('a rejection at rank one never troubles rank two', () => {
    const r = advanceApprovalChain(chain(), 'reject', 'dana')
    expect(r.completesChain).toBe(true)
    expect(r.remaining).toHaveLength(0)
    expect(r.nextState).toBe('REJECTED')
    expect(r.nextStatus).toBe('CLOSED')
  })

  it('there is nothing to decide once the chain is done', () => {
    const done: PendingApproval[] = [
      { id: 'a1', approverId: 'dana', rank: 1, outcome: 'APPROVED' },
    ]
    const r = advanceApprovalChain(done, 'approve', 'dana')
    expect(r.refusal).toBe('NOTHING_PENDING')
    expect(r.current).toBeNull()
  })

  it('ranks are asked in order even when stored out of order', () => {
    const jumbled: PendingApproval[] = [
      { id: 'a2', approverId: 'joyce', rank: 2, outcome: 'PENDING' },
      { id: 'a1', approverId: 'dana', rank: 1, outcome: 'PENDING' },
    ]
    expect(advanceApprovalChain(jumbled, 'approve', 'dana').current?.rank).toBe(1)
  })
})

describe('Only an approved requisition reaches vendors', () => {
  it('an approved requisition may be distributed', () => {
    expect(mayDistribute('APPROVED')).toBe(true)
  })

  it('one that cleared itself may be distributed', () => {
    expect(mayDistribute('AUTO_APPROVED')).toBe(true)
  })

  it('a requisition still awaiting approval may not be shown to vendors', () => {
    expect(mayDistribute('PENDING_APPROVAL')).toBe(false)
  })

  it('a rejected requisition may not be shown to vendors', () => {
    expect(mayDistribute('REJECTED')).toBe(false)
  })

  it('a draft may not be shown to vendors', () => {
    expect(mayDistribute('DRAFT')).toBe(false)
  })
})
