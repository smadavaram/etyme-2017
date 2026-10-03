import { describe, it, expect } from 'vitest'
import { mayActAt, type Decision, type Desks, type Stage } from '@/lib/supplier-onboarding'
import { evaluateRequisition, type RequisitionFacts, type ApprovalRuleFacts } from '@/lib/requisition-approval'
import { mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import { assessGrant } from '@/lib/access-grant'
import { assessRule } from '@/lib/governance-authorship'

/**
 * Every segregation rule, re-run where one person holds two desks.
 *
 * ── Why this axis exists ─────────────────────────────────────────────
 *
 * "Nobody signs their own" is written five times in this codebase — on
 * a requisition, on a supplier recommendation, on a week of hours, on
 * an access grant, on an approval rule. Each was written against a firm
 * with enough people to have somebody else, and each was tested that
 * way.
 *
 * Most firms on this platform will not be that firm. A one-person
 * corporation, a client in its first week with one seat, a VP who
 * recommended the supplier herself and also runs HR: in every one of
 * them the second desk and the first desk are the same person, and a
 * rule written for a large firm turns from a control into a dead end.
 *
 * CLAUDE.md settles what must happen instead, twice over: a desk
 * nobody has named falls back and never refuses, and governance slower
 * than the workaround produces the workaround. So each rule below is
 * asked the same three questions:
 *
 *   1. does the control still hold where somebody else exists;
 *   2. does it fall back to a named stand-in where the desk's own
 *      holder cannot act;
 *   3. where nobody at all can stand in, does it say what is needed —
 *      in a sentence, never a code, and never nothing.
 *
 * A rule that deadlocks silently fails question 3, which is what the
 * supplier chain did before this file existed.
 */

/** A refusal is only a refusal if it says something a person can act on. */
const isSentence = (s: string) => /[a-z]{3,}\s+[a-z]{2,}/i.test(s) && s.trim().length > 20

const VP = 'p-vp'
const PMO = 'p-pmo'
const HR = 'p-hr'
const desks = (over: Partial<Desks> = {}): Desks => ({ leadId: null, hrId: null, procurementId: null, ...over })
const decided = (stage: Stage, byId: string): Decision =>
  ({ stage, outcome: 'APPROVED', byId, byName: byId, at: '2026-09-01T00:00:00.000Z', note: null })

describe('a supplier recommendation, where the desk’s own holder cannot decide it', () => {
  const base = {
    permissions: ['governance.write'] as readonly string[],
    firmName: 'Harbor Staffing',
    companyName: 'Marsh Analytics',
  }

  it('the VP who recommended the firm cannot then clear it at her own HR desk', () => {
    const v = mayActAt({
      ...base, stage: 'HR', callerId: VP, recommendedById: VP,
      decisions: [decided('LEAD', PMO)], desks: desks({ hrId: VP }),
    })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('OWN_RECOMMENDATION')
  })

  it('the program office stands in for an HR desk whose only holder recommended the firm, so the request does not sit there forever', () => {
    const v = mayActAt({
      ...base, stage: 'HR', callerId: PMO, recommendedById: VP,
      decisions: [], desks: desks({ hrId: VP }),
    })
    expect(v.ok, v.ok === false ? v.message : '').toBe(true)
  })

  it('the program office stands in for a lead who already decided an earlier desk', () => {
    const v = mayActAt({
      ...base, stage: 'HR', callerId: PMO, recommendedById: 'p-manager',
      decisions: [decided('LEAD', HR)], desks: desks({ hrId: HR }),
    })
    expect(v.ok, v.ok === false ? v.message : '').toBe(true)
  })

  it('the control still holds where somebody else exists: a stranger to the desk is turned away and told whose it is', () => {
    const v = mayActAt({
      ...base, permissions: ['vendors.manage'], stage: 'HR', callerId: 'p-buyer',
      recommendedById: 'p-manager', decisions: [], desks: desks({ hrId: HR }),
      deskHolders: [HR],
    })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('NOT_THIS_DESK')
    expect(v.ok === false && isSentence(v.message)).toBe(true)
  })

  it('at a firm of one, the refusal says a second person is needed — it does not name a desk nobody is on', () => {
    const v = mayActAt({
      ...base, stage: 'PROCUREMENT', callerId: 'p-solo', recommendedById: 'p-solo',
      decisions: [], desks: desks(), deskHolders: ['p-solo'],
    })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('NOBODY_ELSE')
    expect(v.ok === false && v.message).toContain('Marsh Analytics')
    expect(v.ok === false && v.message).toMatch(/Invite a second person/)
    expect(v.ok === false && isSentence(v.message)).toBe(true)
  })

  it('a firm of two where the second has already decided an earlier desk is told the same thing, not left waiting', () => {
    const v = mayActAt({
      ...base, stage: 'FINANCE', callerId: 'p-owner', recommendedById: 'p-owner',
      decisions: [decided('HR', 'p-partner')], desks: desks(), deskHolders: ['p-owner', 'p-partner'],
    })
    expect(v.ok === false && v.code).toBe('NOBODY_ELSE')
  })
})

describe('a requisition, where the lead who owns the money is the one who raised it', () => {
  const facts = (over: Partial<RequisitionFacts> = {}): RequisitionFacts => ({
    // Over the plan and over the rate the client already pays, so the
    // money genuinely needs a human yes — an in-plan role clears itself
    // and would prove nothing about who is asked.
    annualValueCents: 20_000_000, headcount: 2, billMaxCents: 14_000, skillMedianCents: 8_000,
    months: 12, raisedById: VP, ownerId: VP,
    costCenter: {
      id: 'cc-1', code: 'APPS-1', approvedHeads: 1, committedHeads: 1,
      annualBudgetCents: 15_000_000, committedSpendCents: 10_000_000,
    },
    ...over,
  })

  it('the lead who raised it is not asked to approve it — the final word goes one level up', () => {
    const d = evaluateRequisition(
      facts({ lead: { personId: VP, name: 'Dana Roy' }, escalation: { personId: PMO, name: 'Ada Lin' } }),
      []
    )
    const asked = d.steps.filter((s) => s.stage === 'FINAL').map((s) => s.approverId)
    expect(asked).not.toContain(VP)
    expect(asked).toContain(PMO)
  })

  it('with nobody above her it clears with the note in plain sight and says who to name, rather than waiting on a desk no person is on', () => {
    const d = evaluateRequisition(
      facts({ lead: { personId: VP, name: 'Dana Roy' }, escalation: null }),
      []
    )
    const final = d.steps.filter((s) => s.stage === 'FINAL')
    expect(final.every((s) => s.outcome !== 'PENDING'), 'a requisition stuck on nobody').toBe(true)
    expect(final.some((s) => isSentence(s.reason))).toBe(true)
  })
})

describe('a week of hours, where the worker and the firm are the same person', () => {
  const parties = {
    personId: 'p-solo', vendorCompanyId: 'c-marsh',
    clientCompanyId: 'c-nike', endClientCompanyId: null,
  }

  it('the owner of a one-person corporation cannot sign their own week, whatever else they hold', () => {
    expect(approvingOwnHours({ personId: 'p-solo', companyId: 'c-marsh', permissions: ['*'] }, parties)).toBe(true)
  })

  it('the firm may still accept what it pays where the buyer is not on Etyme, and the record says that is why', () => {
    const v = mayApprove({ personId: 'p-partner', companyId: 'c-marsh', permissions: ['timesheets.approve'] }, parties)
    expect(v.ok).toBe(true)
    expect(isSentence(v.reason)).toBe(true)
  })

  it('a firm that is neither the buyer nor the employer is refused, and told which company’s call it is', () => {
    const v = mayApprove({ personId: 'p-x', companyId: 'c-other', permissions: ['timesheets.approve'] }, parties)
    expect(v.ok).toBe(false)
    expect(isSentence(v.reason)).toBe(true)
  })
})

describe('an access grant, where the only admin is the person asking', () => {
  const grant = (over: Partial<Parameters<typeof assessGrant>[0]> = {}) =>
    assessGrant({
      roleName: 'Owner', permissions: ['payments.record'], requestedDays: 90,
      reason: 'Covering the finance desk while Ana is on leave.',
      selfGranted: true, otherHoldersOfCritical: 0, ...over,
    })

  it('giving yourself the keys to the money is refused, and the refusal says to ask somebody else', () => {
    const d = grant({ permissions: ['*'] })
    const self = d.checks.find((c) => c.code === 'SELF_GRANT')!
    expect(self.outcome).toBe('BLOCK')
    expect(isSentence(self.reason)).toBe(true)
  })

  it('giving yourself anything smaller proceeds and is conspicuous, because a firm where one person does everything is a real firm', () => {
    const d = grant()
    const self = d.checks.find((c) => c.code === 'SELF_GRANT')!
    expect(self.outcome).toBe('WARN')
    expect(isSentence(self.reason)).toBe(true)
  })
})

describe('an approval rule, where the author is the whole chain', () => {
  const draft = (approvers: string[]) => ({
    name: 'Spend over $100k', authorPersonId: VP, approverPersonIds: approvers,
    thresholdCents: 10_000_000, kind: 'VALUE' as const,
  })
  const existing = { rules: [], peopleById: {} as Record<string, string> }

  it('writing a rule whose only approver is yourself is refused, and the refusal says to add another', () => {
    const a = assessRule(draft([VP]), existing as never)
    const check = a.checks.find((c) => c.code === 'SELF_APPROVAL')!
    expect(check.outcome).toBe('BLOCK')
    expect(isSentence(check.reason)).toBe(true)
  })

  it('being one approver among several is ordinary, warned once and recorded', () => {
    const a = assessRule(draft([VP, PMO]), existing as never)
    const check = a.checks.find((c) => c.code === 'SELF_IN_CHAIN')!
    expect(check.outcome).toBe('WARN')
    expect(isSentence(check.reason)).toBe(true)
  })
})
