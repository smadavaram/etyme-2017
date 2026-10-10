import { describe, it, expect } from 'vitest'
import { evaluateRequisition, possessive, type RequisitionFacts, type ApprovalRuleFacts } from '@/lib/requisition-approval'

/**
 * A tester read "The final word on Apps's spend" on a job request's
 * approval reason (2026-10-03). A name ending in s takes the apostrophe
 * alone, as supply's bench sentences already write "Teleworld Solutions'".
 */

const DESKS: ApprovalRuleFacts[] = [
  { id: 'hr', name: 'HR', kind: 'HR', approverId: 'p-hr', approverName: 'Anita Shah', thresholdCents: null, rank: 1, specificity: 1 },
  { id: 'proc', name: 'Procurement', kind: 'PROCUREMENT', approverId: 'p-proc', approverName: 'Derek Halvorsen', thresholdCents: null, rank: 1, specificity: 1 },
]

function overPlan(unitName: string, leadName = 'Dana Whitfield'): RequisitionFacts {
  return {
    annualValueCents: 200_000_00, headcount: 8, billMaxCents: 13_000, skillMedianCents: 13_400, months: 12,
    costCenter: { id: 'cc', code: 'CC-1', approvedHeads: 10, committedHeads: 4, annualBudgetCents: 500_000_00, committedSpendCents: 100_000_00 },
    raisedById: 'p-manager', ownerId: 'p-manager',
    lead: { personId: 'p-lead', name: leadName }, escalation: { personId: 'p-up', name: 'Ngozi Okoro' },
    unitName,
  } as RequisitionFacts
}

describe('whose spend an approval reason names', () => {
  it('writes "Apps\' spend", never "Apps\'s spend", for a unit whose name ends in s', () => {
    const final = evaluateRequisition(overPlan('Apps'), DESKS).steps.find((s) => s.stage === 'FINAL')!
    expect(final.reason).toContain("The final word on Apps' spend")
    expect(final.reason).not.toContain("Apps's")
  })

  it('still writes "Technology\'s spend" for a name that does not end in s', () => {
    const final = evaluateRequisition(overPlan('Technology'), DESKS).steps.find((s) => s.stage === 'FINAL')!
    expect(final.reason).toContain("The final word on Technology's spend")
  })

  it('writes the waiting line as "James Harris\' yes" for an approver whose name ends in s', () => {
    const d = evaluateRequisition(overPlan('Technology', 'James Harris'), DESKS)
    expect(d.summary).toContain("James Harris' yes")
    expect(d.summary).not.toContain("Harris's")
  })

  it('gives a name ending in s the apostrophe alone, as "Teleworld Solutions\'"', () => {
    expect(possessive('Teleworld Solutions')).toBe("Teleworld Solutions'")
    expect(possessive('Northbend Athletic')).toBe("Northbend Athletic's")
  })
})
