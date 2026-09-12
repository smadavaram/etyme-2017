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
  annualValue,
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

const LEAD = { personId: 'p-whitfield', name: 'Dana Whitfield' }
const DIRECTOR = { personId: 'p-okoro', name: 'Ngozi Okoro' }

/** HR for Technology, named once under Programme team. */
const HR_DESK: ApprovalRuleFacts = {
  id: 'rule-hr', name: 'HR — Technology', kind: 'HR',
  approverId: 'p-shah', approverName: 'Anita Shah', thresholdCents: null, rank: 1, specificity: 1,
}
/** Indirect Procurement for Technology. */
const PROC_DESK: ApprovalRuleFacts = {
  id: 'rule-proc', name: 'Procurement — Technology', kind: 'PROCUREMENT',
  approverId: 'p-halvorsen', approverName: 'Derek Halvorsen', thresholdCents: null, rank: 1, specificity: 1,
}
/** The old shape: over a dollar line, a VP. Still honoured, at the final rank. */
const VP_RULE: ApprovalRuleFacts = {
  id: 'rule-vp', name: 'Over $250k', kind: 'VALUE',
  approverId: 'p-chen', approverName: 'Marcus Chen', thresholdCents: 250_000_00, rank: 1,
}
/** The old "programme lead": a catch-all with no threshold. */
const CATCH_ALL: ApprovalRuleFacts = {
  id: 'rule-lead', name: 'Programme lead', kind: 'VALUE',
  approverId: 'p-mbeki', approverName: 'Joyce Mbeki', thresholdCents: null, rank: 2,
}

const DESKS = [HR_DESK, PROC_DESK]
const withLead = (overrides: Partial<RequisitionFacts> = {}) =>
  facts({ raisedById: 'p-manager', ownerId: 'p-manager', lead: LEAD, escalation: DIRECTOR, unitName: 'Technology', ...overrides })

const step = (d: ReturnType<typeof evaluateRequisition>, stage: 'ROLE' | 'SOURCING' | 'FINAL') =>
  d.steps.find((x) => x.stage === stage)!

// ── Three desks, and the default is to clear ──────────────

describe('An ordinary requisition clears every desk by rule and opens itself', () => {
  const d = evaluateRequisition(withLead(), DESKS)

  it('inside plan, inside budget and at the going rate, nobody is asked', () => {
    expect(d.state).toBe('AUTO_APPROVED')
    expect(d.route).toEqual([])
  })

  it('HR is cleared by rule, with the reason, and says the desk was not needed', () => {
    const role = step(d, 'ROLE')
    expect(role.outcome).toBe('AUTO_CLEARED')
    expect(role.reason).toContain('5 of 10 approved heads')
    expect(role.reason).toContain('HR (Anita Shah) not needed')
  })

  it('Procurement is cleared by rule the same way', () => {
    const sourcing = step(d, 'SOURCING')
    expect(sourcing.outcome).toBe('AUTO_CLEARED')
    expect(sourcing.reason).toContain('in line with')
    expect(sourcing.reason).toContain('Procurement (Derek Halvorsen) not needed')
  })

  it("the lead's yes is recorded as not needed, by name — the lead approves what needs approving, not everything", () => {
    const final = step(d, 'FINAL')
    expect(final.outcome).toBe('AUTO_CLEARED')
    expect(final.reason).toContain("Dana Whitfield's yes not needed")
    expect(final.reason).toContain('left in TBC-4100')
  })

  it('the summary says so, so it can be audited later', () => {
    expect(d.summary).toBe('Cleared automatically — within plan, budget and rate')
  })

  it('every check reports a reason whether it passes or routes, and names its desk', () => {
    for (const c of d.checks) {
      expect(c.reason.length).toBeGreaterThan(0)
      expect(['ROLE', 'SOURCING', 'FINAL']).toContain(c.stage)
    }
  })

  it('asking slightly under the going rate is not a reason to stop anyone', () => {
    const e = evaluateRequisition(withLead({ billMaxCents: 13_000, skillMedianCents: 13_400 }), DESKS)
    expect(e.state).toBe('AUTO_APPROVED')
  })

  it('a modest premium within tolerance still clears Procurement', () => {
    const e = evaluateRequisition(withLead({ billMaxCents: 14_500, skillMedianCents: 13_400 }), DESKS) // ~8% over
    expect(step(e, 'SOURCING').outcome).toBe('AUTO_CLEARED')
  })
})

describe('When anything misses, the lead who owns the cost centre gives the final word', () => {
  const d = evaluateRequisition(withLead({ headcount: 8 }), DESKS) // over the plan

  it('the lead is asked, after the desks, and the reason says whose spend it is', () => {
    const final = step(d, 'FINAL')
    expect(final.outcome).toBe('PENDING')
    expect(final.approverName).toBe('Dana Whitfield')
    expect(final.rank).toBeGreaterThan(step(d, 'ROLE').rank)
    expect(final.reason).toContain("The final word on Technology's spend")
  })

  it('the summary says who it is waiting on, in the order they are asked', () => {
    expect(d.summary).toBe("Takes TBC-4100 to 12 of 10 approved heads — waiting on HR (Anita Shah), then Dana Whitfield's yes")
  })
})

// ── A miss goes to the desk that owns it ──────────────────

describe('A miss goes to the desk that owns it', () => {
  it('over the headcount plan goes to HR — the role is the question', () => {
    const d = evaluateRequisition(
      withLead({ headcount: 8, costCenter: healthyCostCenter({ approvedHeads: 10, committedHeads: 4 }) }),
      DESKS
    )
    const role = step(d, 'ROLE')
    expect(role.outcome).toBe('PENDING')
    expect(role.approverName).toBe('Anita Shah')
    expect(role.reason).toContain('12 of 10 approved heads')
    expect(step(d, 'SOURCING').outcome).toBe('AUTO_CLEARED')
  })

  it('a department with no headcount plan on file goes to HR', () => {
    const d = evaluateRequisition(withLead({ costCenter: healthyCostCenter({ approvedHeads: null }) }), DESKS)
    expect(step(d, 'ROLE')).toMatchObject({ outcome: 'PENDING', approverName: 'Anita Shah' })
  })

  it('a rate well above what the client already pays goes to Procurement, with the comparison', () => {
    const d = evaluateRequisition(withLead({ billMaxCents: 17_000, skillMedianCents: 13_400 }), DESKS) // ~27% over
    const sourcing = step(d, 'SOURCING')
    expect(sourcing.outcome).toBe('PENDING')
    expect(sourcing.approverName).toBe('Derek Halvorsen')
    expect(sourcing.reason).toMatch(/27% above the \$134\/hr you already pay/)
    expect(step(d, 'ROLE').outcome).toBe('AUTO_CLEARED')
  })

  it('exceeding the budget is the lead\'s question, and says by how much', () => {
    const d = evaluateRequisition(
      withLead({ annualValueCents: 450_000_00, costCenter: healthyCostCenter({ annualBudgetCents: 500_000_00, committedSpendCents: 100_000_00 }) }),
      DESKS
    )
    expect(step(d, 'ROLE').outcome).toBe('AUTO_CLEARED')
    expect(step(d, 'SOURCING').outcome).toBe('AUTO_CLEARED')
    expect(step(d, 'FINAL').reason).toContain('Exceeds TBC-4100 budget by $50,000')
  })

  it('a requisition with no cost centre has no lead — Procurement gives the final word instead', () => {
    const d = evaluateRequisition(withLead({ costCenter: null, lead: null, escalation: null }), DESKS)
    const final = step(d, 'FINAL')
    expect(final.outcome).toBe('PENDING')
    expect(final.approverName).toBe('Derek Halvorsen')
    expect(final.reason).toContain('No cost centre named — nobody owns this spend')
    expect(final.reason).toContain('no lead owns the money here, so Derek Halvorsen gives the final word')
  })

  it('a miss with nobody named anywhere clears with the note in plain sight and who to name', () => {
    const d = evaluateRequisition(withLead({ headcount: 8, lead: null, escalation: null }), [])
    expect(d.state).toBe('AUTO_APPROVED')
    const final = step(d, 'FINAL')
    expect(final.outcome).toBe('AUTO_CLEARED')
    expect(final.reason).toContain('Nobody is named to give the final word — cleared with this note')
    expect(final.reason).toContain('Name who owns cost centre TBC-4100')
    expect(d.summary).toContain('Cleared automatically — Nobody is named')
  })

  it('HR and Procurement are asked alongside each other, at one rank, before the lead', () => {
    const d = evaluateRequisition(
      withLead({ headcount: 8, billMaxCents: 17_000, skillMedianCents: 13_400 }),
      DESKS
    )
    expect(step(d, 'ROLE').rank).toBe(step(d, 'SOURCING').rank)
    expect(step(d, 'FINAL').rank).toBeGreaterThan(step(d, 'ROLE').rank)
    expect(d.route.map((r) => r.approverName)).toEqual(['Anita Shah', 'Derek Halvorsen', 'Dana Whitfield'])
    expect(d.summary).toMatch(/waiting on HR \(Anita Shah\) and Procurement \(Derek Halvorsen\), then Dana Whitfield's yes/)
  })

  it('the nearest desk wins: a business unit\'s own HR partner outranks the company default', () => {
    const companyHr: ApprovalRuleFacts = { ...HR_DESK, id: 'rule-hr-co', approverId: 'p-central', approverName: 'Central HR', specificity: 0 }
    const d = evaluateRequisition(withLead({ headcount: 8 }), [companyHr, HR_DESK, PROC_DESK])
    expect(step(d, 'ROLE').approverName).toBe('Anita Shah')
  })
})

// ── Nobody signs their own ────────────────────────────────

describe('Nobody approves their own requisition', () => {
  it('when the lead raised it, the final word goes one level up', () => {
    const d = evaluateRequisition(withLead({ headcount: 8, raisedById: LEAD.personId, ownerId: LEAD.personId }), DESKS)
    const final = step(d, 'FINAL')
    expect(final.approverName).toBe('Ngozi Okoro')
    expect(final.reason).toContain('Dana Whitfield owns the budget and raised it — the final word goes one level up')
  })

  it('when the lead is the owner it is for, the same', () => {
    const d = evaluateRequisition(withLead({ headcount: 8, raisedById: 'p-coordinator', ownerId: LEAD.personId }), DESKS)
    expect(step(d, 'FINAL').approverName).toBe('Ngozi Okoro')
  })

  it('with nobody above the lead, a standing desk gives the final word rather than the lead signing their own', () => {
    const d = evaluateRequisition(withLead({ headcount: 8, raisedById: LEAD.personId, ownerId: LEAD.personId, escalation: null }), DESKS)
    const final = step(d, 'FINAL')
    expect(final.approverName).toBe('Derek Halvorsen')
    expect(final.reason).toContain('Dana Whitfield owns the budget and raised it')
    expect(d.route.map((r) => r.approverId)).not.toContain(LEAD.personId)
  })

  it('a rule on the money whose approver raised it is not asked either', () => {
    const d = evaluateRequisition(
      withLead({ annualValueCents: 300_000_00, raisedById: VP_RULE.approverId, ownerId: VP_RULE.approverId }),
      [...DESKS, VP_RULE]
    )
    expect(d.route.map((r) => r.approverName)).toEqual(['Dana Whitfield'])
    expect(step(d, 'FINAL').reason).toContain('Marcus Chen raised it, so is not asked to approve it')
  })
})

// ── The old rules still work ──────────────────────────────

describe('A rule on the money is still honoured, at the final rank', () => {
  it('a large requisition is seen by the VP even when every fact is fine, alongside the lead', () => {
    const d = evaluateRequisition(withLead({ annualValueCents: 300_000_00, valueSays: '$300,000, the budget stated', valueBasis: 'BUDGET' }), [...DESKS, VP_RULE])
    const finals = d.steps.filter((s) => s.stage === 'FINAL')
    expect(finals.map((s) => s.approverName)).toEqual(['Dana Whitfield', 'Marcus Chen'])
    expect(finals.every((s) => s.rank === 2)).toBe(true)
    expect(d.checks.find((c) => c.code === 'VALUE')?.reason).toBe('Routed on $300,000, the budget stated')
  })

  it('a threshold rule under the line is not asked', () => {
    const d = evaluateRequisition(withLead({ annualValueCents: 200_000_00, headcount: 8 }), [...DESKS, VP_RULE])
    expect(d.route.map((r) => r.approverName)).toEqual(['Anita Shah', 'Dana Whitfield'])
  })

  it('the same approver is never asked twice', () => {
    const asLead: ApprovalRuleFacts = { ...VP_RULE, approverId: LEAD.personId, approverName: LEAD.name }
    const d = evaluateRequisition(withLead({ annualValueCents: 300_000_00 }), [...DESKS, asLead])
    expect(d.route.filter((r) => r.approverId === LEAD.personId)).toHaveLength(1)
  })

  it('the old catch-all "programme lead" gives the final word where no cost-centre owner does', () => {
    const d = evaluateRequisition(withLead({ headcount: 8, lead: null, escalation: null }), [...DESKS, CATCH_ALL])
    expect(step(d, 'FINAL')).toMatchObject({ outcome: 'PENDING', approverName: 'Joyce Mbeki' })
  })

  it('with no desks configured at all, a miss still clears — with the note in plain sight and who to name', () => {
    const d = evaluateRequisition(withLead({ headcount: 8 }), [])
    const role = step(d, 'ROLE')
    expect(role.outcome).toBe('AUTO_CLEARED')
    expect(role.reason).toContain('no HR desk named for Technology, so cleared with this note. Name one under Programme team.')
  })
})

describe('Nothing passes silently', () => {
  it('a routed check with no desk configured still clears, and says so in the row', () => {
    const d = evaluateRequisition(withLead({ billMaxCents: 17_000, skillMedianCents: 13_400 }), [])
    expect(step(d, 'SOURCING').outcome).toBe('AUTO_CLEARED')
    expect(step(d, 'SOURCING').reason).toMatch(/above the .* you already pay .* no Procurement desk named/)
  })

  it('the notes survive even when a desk clears — every check is kept', () => {
    const d = evaluateRequisition(withLead(), DESKS)
    expect(d.checks.map((c) => c.code)).toEqual(['COST_CENTER', 'HEADCOUNT_PLAN', 'BUDGET', 'RATE_BAND'])
  })
})

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

describe('Two desks at one rank decide alongside each other', () => {
  const chain = (): PendingApproval[] => [
    { id: 'hr', approverId: 'anita', rank: 1, outcome: 'PENDING' },
    { id: 'proc', approverId: 'derek', rank: 1, outcome: 'PENDING' },
    { id: 'lead', approverId: 'dana', rank: 2, outcome: 'PENDING' },
  ]

  it('HR and Procurement may decide in either order', () => {
    expect(advanceApprovalChain(chain(), 'approve', 'derek').refusal).toBeNull()
    expect(advanceApprovalChain(chain(), 'approve', 'anita').refusal).toBeNull()
  })

  it('the lead is not asked until both desks have said yes', () => {
    expect(advanceApprovalChain(chain(), 'approve', 'dana').refusal).toBe('NOT_YOUR_APPROVAL')
    const afterHr = chain().map((a) => (a.id === 'hr' ? { ...a, outcome: 'APPROVED' } : a))
    expect(advanceApprovalChain(afterHr, 'approve', 'dana').refusal).toBe('NOT_YOUR_APPROVAL')
    const afterBoth = afterHr.map((a) => (a.id === 'proc' ? { ...a, outcome: 'APPROVED' } : a))
    const r = advanceApprovalChain(afterBoth, 'approve', 'dana')
    expect(r.refusal).toBeNull()
    expect(r.completesChain).toBe(true)
    expect(r.nextStatus).toBe('OPEN')
  })

  it('one desk\'s yes does not open the requisition while the other is still asked', () => {
    const r = advanceApprovalChain(chain(), 'approve', 'anita')
    expect(r.completesChain).toBe(false)
    expect(r.nextState).toBe('PENDING_APPROVAL')
    expect(r.remaining.map((a) => a.id)).toEqual(['proc', 'lead'])
  })

  it('a no from either desk ends it for everybody', () => {
    const r = advanceApprovalChain(chain(), 'reject', 'derek')
    expect(r.nextState).toBe('REJECTED')
    expect(r.remaining).toEqual([])
  })
})

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

// ── The number that routes it, and who typed it ──────────────────────
//
// Founder question: "should we have separate rate range field and budget
// field like $200000". Yes, and the absence was worse than a missing
// field: the figure deciding who had to approve was derived from the
// rate and a hardcoded 160 hours a month, so a manager with $200,000
// signed off and a system computing $288,000 disagreed silently.

describe('what a requisition is worth, and where that figure came from', () => {
  it('uses the budget somebody stated rather than a number nobody typed', () => {
    const v = annualValue({
      budgetCents: 20_000_000, billMaxCents: 15_000, headcount: 1, months: 12,
    })
    expect(v.cents).toBe(20_000_000)
    expect(v.basis).toBe('BUDGET')
  })

  it('spreads a budget that runs past a year over the years it covers', () => {
    // $200k across 24 months is $100k a year, not a $200k annual
    // commitment — otherwise a long engagement routes for approval twice
    // as often as the spend deserves.
    const v = annualValue({ budgetCents: 20_000_000, billMaxCents: null, headcount: 1, months: 24 })
    expect(v.cents).toBe(10_000_000)
  })

  it('still answers when nobody stated a budget, and says that it is an estimate', () => {
    const v = annualValue({ billMaxCents: 15_000, headcount: 1, months: 12 })
    expect(v.basis).toBe('ESTIMATE')
    expect(v.says).toContain('estimated from')
  })

  it('values a full-time seat exactly as it always did', () => {
    // 160 hours a month, unchanged, so nothing that cleared yesterday
    // routes today.
    const v = annualValue({ billMaxCents: 15_000, headcount: 1, months: 12 })
    expect(v.cents).toBe(15_000 * 160 * 12)
  })

  it('stops valuing a twenty-hour seat as if it were full time', () => {
    // The reason part-time work routed for approvals it did not need.
    const half = annualValue({ billMaxCents: 15_000, headcount: 1, months: 12, hoursPerWeek: 20 })
    const full = annualValue({ billMaxCents: 15_000, headcount: 1, months: 12, hoursPerWeek: 40 })
    expect(half.cents).toBe(full.cents / 2)
  })

  it('measures nothing when there is neither a budget nor a rate', () => {
    const v = annualValue({ billMaxCents: null, headcount: 1, months: 12 })
    expect(v.basis).toBe('UNKNOWN')
    expect(v.cents).toBe(0)
  })

  it('tells somebody routed on an estimate that stating a budget would change it', () => {
    const decision = evaluateRequisition(
      {
        annualValueCents: 28_800_000,
        valueBasis: 'ESTIMATE',
        valueSays: 'about $288,000, estimated from $150/hr at 40 hours a week for 12 months',
        headcount: 1, billMaxCents: 15_000, skillMedianCents: null, months: 12, costCenter: null,
      },
      [{ id: 'r1', name: 'Over $250k', approverId: 'vp', approverName: 'Dana', thresholdCents: 25_000_000, rank: 1 }]
    )
    expect(decision.state).toBe('PENDING_APPROVAL')
    const value = decision.checks.find(c => c.code === 'VALUE')
    expect(value?.reason).toContain('state a budget')
  })
})

// ── Handing it back ──────────────────────────────────────────────────
//
// Founder: "how do you record the approvals, notes and changes requested
// by fellow team mates". There were two moves and rejection was terminal,
// so a reviewer wanting "bring it to $120 and I'll sign" had to refuse it
// or approve something they disagreed with. People do the second.

describe('a reviewer can ask for a change without refusing it', () => {
  const chain: PendingApproval[] = [
    { id: 'a1', approverId: 'manager', rank: 1, outcome: 'APPROVED' },
    { id: 'a2', approverId: 'finance', rank: 2, outcome: 'PENDING' },
    { id: 'a3', approverId: 'vp', rank: 3, outcome: 'PENDING' },
  ]

  it('sends it back to whoever raised it rather than closing it', () => {
    const a = advanceApprovalChain(chain, 'changes', 'finance')
    expect(a.nextState).toBe('CHANGES_REQUESTED')
    expect(a.completesChain).toBe(false)
  })

  it('does not open it to suppliers on the way past', () => {
    const a = advanceApprovalChain(chain, 'changes', 'finance')
    expect(a.nextStatus).toBeNull()
  })

  it('leaves the ranks above unasked while it is away', () => {
    // The VP is not troubled with a version finance has already said is
    // wrong.
    const a = advanceApprovalChain(chain, 'changes', 'finance')
    expect(a.remaining.map(r => r.approverId)).toEqual(['vp'])
  })

  it('resumes at the rank that asked, not back at the beginning', () => {
    // Finance asked, so finance decides when it returns — rank 1 already
    // approved a version that was smaller or cheaper than this one, and
    // re-asking them for a change they did not request is how people
    // learn to stop reading these.
    const returned: PendingApproval[] = [
      { id: 'a1', approverId: 'manager', rank: 1, outcome: 'APPROVED' },
      { id: 'a2', approverId: 'finance', rank: 2, outcome: 'PENDING' },
      { id: 'a3', approverId: 'vp', rank: 3, outcome: 'PENDING' },
    ]
    const next = advanceApprovalChain(returned, 'approve', 'finance')
    expect(next.current?.approverId).toBe('finance')
    expect(next.refusal).toBeNull()
  })

  it('still refuses somebody else’s rank', () => {
    const a = advanceApprovalChain(chain, 'changes', 'vp')
    expect(a.refusal).toBe('NOT_YOUR_APPROVAL')
  })

  it('is not a rejection — the ranks below keep their approvals', () => {
    const a = advanceApprovalChain(chain, 'changes', 'finance')
    expect(a.nextState).not.toBe('REJECTED')
    expect(chain[0].outcome).toBe('APPROVED')
  })
})
