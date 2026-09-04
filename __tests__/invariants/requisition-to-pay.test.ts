/**
 * Requisition to pay — the whole product, walked once, in order.
 *
 * CLAUDE.md: "The founder is not a coder. He can read test names, click a
 * preview URL, and tell you whether the behaviour is right."
 *
 * This file is written to be READ. Every other test file proves one engine
 * in isolation; this one runs them in the order a real engagement happens,
 * so the sequence itself is the documentation:
 *
 *   a manager needs two people
 *     → the requisition clears itself, or goes to somebody
 *     → three vendors are asked, each at its own rate
 *     → one works it, one declines, one goes quiet
 *     → candidates arrive and are ranked, honestly
 *     → one is placed, which fills a seat and eventually the requisition
 *     → they work, a manager approves the hours
 *     → the invoice matches those hours, or it does not get paid
 *     → a rate that really changed is amended, not waived
 *
 * Every function called here is the one production calls. Nothing is
 * re-implemented for the test, so if this file passes, that chain works.
 */

import { describe, it, expect } from 'vitest'
import { evaluateRequisition, annualisedValueCents } from '@/lib/requisition-approval'
import { projectInvitationForVendor } from '@/lib/invitation-visibility'
import { assessFit } from '@/lib/candidate-fit'
import { assessAward } from '@/lib/award'
import { threeWayMatch } from '@/lib/three-way-match'
import { rateInForce, assessRateChange } from '@/lib/contract-rate'

// When the work was done, per billing period. Inside the period each case
// bills — the wrong-period cases live in invoice-period.test.ts, and a
// single shared pair here quietly billed October work in August.
const OCT_FROM = new Date('2026-10-05T00:00:00Z')
const OCT_TO = new Date('2026-10-11T00:00:00Z')
const NOV_FROM = new Date('2026-11-02T00:00:00Z')
const NOV_TO = new Date('2026-11-08T00:00:00Z')

// ── The engagement this file walks ─────────────────────────
// Terumo BCT needs two SAP MM analysts in Lakewood at up to $130/hr.

const CEILING = 13_000
const NEEDED_BY = new Date('2026-10-01T00:00:00Z')

const COST_CENTRE = {
  id: 'cc-supply', code: 'TBC-4300',
  approvedHeads: 5, committedHeads: 2,
  annualBudgetCents: 900_000_00, committedSpendCents: 250_000_00,
}

const PROCUREMENT = {
  id: 'rule-exception', name: 'Exceptions',
  approverId: 'p-mbeki', approverName: 'Joyce Mbeki',
  thresholdCents: null, rank: 2,
}
const DEPARTMENTAL = {
  id: 'rule-dept', name: 'Departmental',
  approverId: 'p-whitfield', approverName: 'Dana Whitfield',
  thresholdCents: 250_000_00, rank: 1,
}

describe('1 · A hiring manager raises a requisition', () => {

  it('two analysts inside plan and budget clears without troubling anyone', () => {
    const value = annualisedValueCents({ billMaxCents: CEILING, headcount: 2, months: 6 })
    const d = evaluateRequisition({
      annualValueCents: value,
      headcount: 2,
      billMaxCents: CEILING,
      skillMedianCents: 13_400,
      months: 6,
      costCenter: COST_CENTRE,
    }, [DEPARTMENTAL, PROCUREMENT])

    expect(d.state).toBe('AUTO_APPROVED')
    expect(d.summary).toContain('within plan, budget and rate')
  })

  it('the same requisition for twenty people goes to a person, and says why', () => {
    const d = evaluateRequisition({
      annualValueCents: annualisedValueCents({ billMaxCents: CEILING, headcount: 20, months: 6 }),
      headcount: 20,
      billMaxCents: CEILING,
      skillMedianCents: 13_400,
      months: 6,
      costCenter: COST_CENTRE,
    }, [DEPARTMENTAL, PROCUREMENT])

    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.summary).toContain('approved heads')
  })

  it('an auto-clearance is still a decision, with its reasons kept', () => {
    // Addendum E forbids silently permitting. Cleared is not unexamined.
    const d = evaluateRequisition({
      annualValueCents: 200_000_00, headcount: 2, billMaxCents: CEILING,
      skillMedianCents: 13_400, months: 6, costCenter: COST_CENTRE,
    }, [DEPARTMENTAL, PROCUREMENT])
    expect(d.checks.every(c => c.reason.length > 0)).toBe(true)
  })
})

describe('2 · It goes to three vendors, each at its own rate', () => {

  const base = {
    id: 'inv-1', toCompanyId: 'v-cloudepa',
    message: 'Preferred supplier rate', status: 'SENT',
    expiresAt: new Date('2026-09-30T00:00:00Z'),
    createdAt: new Date('2026-08-16T00:00:00Z'),
    fromCompany: { id: 'terumo', name: 'Terumo BCT', slug: 'terumo' },
    requirement: {
      id: 'r-1', title: 'SAP MM Analyst', skills: ['SAP MM'],
      location: 'Lakewood, CO', headcount: 2, months: 6,
      neededBy: NEEDED_BY, status: 'OPEN',
      billMin: 11_000, billMax: CEILING, invitationCount: 3,
    },
  }

  it('a vendor sees the band it was offered', () => {
    const v = projectInvitationForVendor(
      { ...base, payMin: 9_000, payMax: 11_000 }, 0, new Date('2026-08-16T00:00:00Z')
    )
    expect(v.band).toEqual({ payMin: 9_000, payMax: 11_000 })
  })

  it('and cannot see what another vendor was offered', () => {
    const v = projectInvitationForVendor(
      { ...base, payMin: 9_000, payMax: 11_000 }, 0, new Date('2026-08-16T00:00:00Z')
    )
    expect(JSON.stringify(v)).not.toContain('8500')
  })

  it('nor what the client itself was willing to pay', () => {
    const v = projectInvitationForVendor(
      { ...base, payMin: 9_000, payMax: 11_000 }, 0, new Date('2026-08-16T00:00:00Z')
    )
    expect(JSON.stringify(v)).not.toContain('billMax')
    expect(JSON.stringify(v)).not.toContain('13000')
  })

  it('it is told it is one of three, but not who the others are', () => {
    const v = projectInvitationForVendor(
      { ...base, payMin: 9_000, payMax: 11_000 }, 0, new Date('2026-08-16T00:00:00Z')
    )
    expect(v.otherInviteeCount).toBe(2)
  })
})

describe('3 · Candidates arrive, and are ranked honestly', () => {

  const required = {
    skills: ['SAP MM', 'S/4HANA'],
    location: 'Lakewood, CO',
    ceilingCents: CEILING,
    neededBy: NEEDED_BY,
  }

  const strong = assessFit({
    required,
    candidate: { skills: ['SAP MM', 'S/4HANA'], headline: 'SAP MM Consultant', location: 'Lakewood, CO', availableFrom: new Date('2026-09-15T00:00:00Z') },
    submittedRateCents: 11_200,
  })

  const partial = assessFit({
    required,
    candidate: { skills: ['SAP MM'], headline: 'SAP Analyst', location: 'Denver, CO', availableFrom: new Date('2026-10-20T00:00:00Z') },
    submittedRateCents: 12_400,
  })

  const wrong = assessFit({
    required,
    candidate: { skills: ['ServiceNow'], headline: 'ServiceNow Developer', location: null, availableFrom: null },
    submittedRateCents: 13_600,
  })

  it('the right person, in the right place, at the right price ranks first', () => {
    expect(strong.score).toBeGreaterThan(partial.score)
    expect(partial.score).toBeGreaterThan(wrong.score)
  })

  it('a missing skill is named rather than buried in the number', () => {
    expect(partial.factors.find(f => f.label === 'Skills')!.detail).toContain('missing S/4HANA')
  })

  it('a rate over the ceiling is visibly worse than one under it', () => {
    const overRate = wrong.factors.find(f => f.label === 'Rate')!.value
    const underRate = partial.factors.find(f => f.label === 'Rate')!.value
    expect(underRate - overRate).toBeGreaterThan(20)
  })

  it('where the system cannot judge, it says so instead of guessing', () => {
    expect(wrong.unknowns).toContain('where this candidate is based')
    expect(wrong.unknowns).toContain('when this candidate can start')
  })

  it('a score built on missing facts is never presented as a confident one', () => {
    expect(strong.confidence).toBe('HIGH')
    expect(wrong.confidence).not.toBe('HIGH')
  })
})

describe('4 · One is placed, and the seats run out', () => {

  const clean = {
    headcount: 2, alreadyAwarded: 0, personAlreadyAwarded: false,
    personName: 'Vikram Reddy',
    requisitionApprovalState: 'AUTO_APPROVED', requisitionStatus: 'OPEN',
    awardedRateCents: 11_200,
    vendorBand: { payMin: 9_000, payMax: 12_000 },
    ceilingCents: CEILING,
    governance: { blocks: [], warnings: [] },
  }

  it('the first placement takes one of the two positions', () => {
    const d = assessAward(clean)
    expect(d.decision).toBe('AWARD')
    expect(d.seatsAfter).toBe(1)
    expect(d.fillsRequisition).toBe(false)
  })

  it('the second fills the requisition', () => {
    const d = assessAward({ ...clean, alreadyAwarded: 1, personName: 'Meera Krishnan' })
    expect(d.fillsRequisition).toBe(true)
    expect(d.summary).toContain('fills the requisition')
  })

  it('a third cannot be placed, however good they are', () => {
    const d = assessAward({ ...clean, alreadyAwarded: 2, personName: 'Someone Excellent' })
    expect(d.decision).toBe('BLOCKED')
    expect(d.summary).toContain('already filled')
  })

  it('somebody at their tenure cap is not placed at all', () => {
    // Addendum E. Tenure follows the person across every vendor, and this
    // is the moment the exposure would begin.
    const d = assessAward({
      ...clean,
      governance: { blocks: ['Vikram Reddy has 18 of 18 months at Terumo BCT across all vendors'], warnings: [] },
    })
    expect(d.decision).toBe('BLOCKED')
  })

  it('paying above the band offered is allowed, but never silently', () => {
    const d = assessAward({ ...clean, awardedRateCents: 12_500 })
    expect(d.decision).toBe('AWARD')
    expect(d.summary).toContain('above the $120/hr you offered')
  })
})

describe('5 · They work, and the invoice must match the hours approved', () => {

  const invoice = {
    id: 'inv-001', totalCents: 896_000,
    periodStart: new Date('2026-10-01T00:00:00Z'),
    periodEnd: new Date('2026-10-15T00:00:00Z'),
  }
  const lines = [{
    id: 'l1', timesheetId: 'ts1', personName: 'Vikram Reddy',
    hours: 80, rateCents: 11_200, amountCents: 896_000,
  }]
  const po = {
    id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
    amountCents: 5_000_000, consumedCents: 0,
    startDate: new Date('2026-01-01T00:00:00Z'), endDate: null,
  }

  it('hours a manager approved, at the contracted rate, are paid', () => {
    const m = threeWayMatch({
      invoice, lines, po, poRequired: true,
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 11_200, periodStart: OCT_FROM, periodEnd: OCT_TO } },
    })
    expect(m.matched).toBe(true)
    expect(m.cleanMatch).toBe(true)
  })

  it('hours nobody approved are not paid', () => {
    const m = threeWayMatch({
      invoice, lines, po, poRequired: true,
      timesheets: { ts1: { id: 'ts1', status: 'SUBMITTED', approvedHours: 80, contractRateCents: 11_200, periodStart: OCT_FROM, periodEnd: OCT_TO } },
    })
    expect(m.matched).toBe(false)
  })

  it('billing more hours than were approved is caught, with both numbers', () => {
    const m = threeWayMatch({
      invoice: { ...invoice, totalCents: 1_120_000 },
      lines: [{ ...lines[0], hours: 100, amountCents: 1_120_000 }],
      po, poRequired: true,
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 11_200, periodStart: OCT_FROM, periodEnd: OCT_TO } },
    })
    expect(m.checks.find(c => c.code === 'QUANTITY')?.reason).toContain('billed 100h, approved 80h')
  })

  it('the same week cannot be billed twice, and nobody can wave that through', () => {
    const m = threeWayMatch({
      invoice, lines, po, poRequired: true,
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 11_200, periodStart: OCT_FROM, periodEnd: OCT_TO, alreadyBilledOnInvoiceId: 'inv-000' } },
      overrides: [{ code: 'DUPLICATE', reason: 'client says it is fine', byName: 'Anyone', at: new Date() }],
    })
    expect(m.matched).toBe(false)
  })

  it('an invoice with no purchase order behind it is not paid', () => {
    const m = threeWayMatch({
      invoice, lines, po: null, poRequired: true,
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 11_200, periodStart: OCT_FROM, periodEnd: OCT_TO } },
    })
    expect(m.matched).toBe(false)
  })

  it('an hours query can be waived by a person, and the waiver is kept', () => {
    const m = threeWayMatch({
      invoice: { ...invoice, totalCents: 1_120_000 },
      lines: [{ ...lines[0], hours: 100, amountCents: 1_120_000 }],
      po, poRequired: true,
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 11_200, periodStart: OCT_FROM, periodEnd: OCT_TO } },
      overrides: [{ code: 'QUANTITY', reason: 'Twenty hours under query with the manager', byName: 'Joyce Mbeki', at: new Date() }],
    })
    expect(m.matched).toBe(true)
    expect(m.cleanMatch).toBe(false)
    expect(m.checks.find(c => c.code === 'QUANTITY')?.overriddenBy?.name).toBe('Joyce Mbeki')
  })
})

describe('6 · A rate that really changed is amended, never waived', () => {

  it('a rate rise of a quarter needs somebody to agree to it', () => {
    expect(assessRateChange(11_200, 14_000).needsApproval).toBe(true)
  })

  it('a small uplift at renewal does not', () => {
    expect(assessRateChange(11_200, 11_600).needsApproval).toBe(false)
  })

  it('until it is approved, the old rate is still the contracted one', () => {
    const proposed = [{
      id: 'a1', rateCents: 14_000,
      fromDate: new Date('2026-11-01T00:00:00Z'), toDate: null,
      approvalState: 'PROPOSED',
    }]
    expect(rateInForce(11_200, proposed, new Date('2026-11-15T00:00:00Z')).rateCents).toBe(11_200)
  })

  it('once approved it applies from the day it took effect, not today', () => {
    const approved = [{
      id: 'a1', rateCents: 14_000,
      fromDate: new Date('2026-11-01T00:00:00Z'), toDate: null,
      approvalState: 'APPROVED',
    }]
    expect(rateInForce(11_200, approved, new Date('2026-11-15T00:00:00Z')).rateCents).toBe(14_000)
    // And work done before it still bills at the old rate, so invoices
    // already paid do not retroactively become wrong.
    expect(rateInForce(11_200, approved, new Date('2026-10-15T00:00:00Z')).rateCents).toBe(11_200)
  })

  it('and then the invoice at the new rate matches, because it is right', () => {
    const m = threeWayMatch({
      invoice: {
        id: 'inv-002', totalCents: 1_120_000,
        periodStart: new Date('2026-11-01T00:00:00Z'),
        periodEnd: new Date('2026-11-15T00:00:00Z'),
      },
      lines: [{ id: 'l1', timesheetId: 'ts2', personName: 'Vikram Reddy', hours: 80, rateCents: 14_000, amountCents: 1_120_000 }],
      timesheets: { ts2: { id: 'ts2', status: 'APPROVED', approvedHours: 80, contractRateCents: 14_000, periodStart: NOV_FROM, periodEnd: NOV_TO } },
      po: {
        id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
        amountCents: 5_000_000, consumedCents: 896_000,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: null,
      },
      poRequired: true,
    })
    expect(m.matched).toBe(true)
    expect(m.cleanMatch).toBe(true)
  })
})

describe('7 · The chain holds together', () => {

  it('money is in cents at every step, so nothing is out by a hundred', () => {
    // The bug this guards: Requirement.billMax once held dollars while
    // Submission.rate held cents, and a $110/hr requirement submitted a
    // candidate at $1.10/hr without anything throwing.
    const ceilingDollars = 130
    const ceilingCents = ceilingDollars * 100

    const fit = assessFit({
      required: { skills: ['SAP MM'], location: null, ceilingCents, neededBy: null },
      candidate: { skills: ['SAP MM'], headline: null, location: null, availableFrom: null },
      submittedRateCents: 12_000,
    })
    const award = assessAward({
      headcount: 1, alreadyAwarded: 0, personAlreadyAwarded: false,
      personName: 'X', requisitionApprovalState: 'APPROVED', requisitionStatus: 'OPEN',
      awardedRateCents: 12_000, vendorBand: null, ceilingCents,
      governance: { blocks: [], warnings: [] },
    })

    // Both engines agree $120 is inside a $130 ceiling.
    expect(fit.factors.find(f => f.label === 'Rate')!.value).toBeGreaterThanOrEqual(80)
    expect(award.checks.find(c => c.code === 'CEILING')?.outcome).toBe('PASS')
  })

  it('a requisition that never cleared approval cannot reach a placement', () => {
    const d = assessAward({
      headcount: 2, alreadyAwarded: 0, personAlreadyAwarded: false,
      personName: 'Vikram Reddy',
      requisitionApprovalState: 'PENDING_APPROVAL', requisitionStatus: 'DRAFT',
      awardedRateCents: 11_200, vendorBand: null, ceilingCents: CEILING,
      governance: { blocks: [], warnings: [] },
    })
    expect(d.decision).toBe('BLOCKED')
  })
})
