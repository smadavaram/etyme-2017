/**
 * Awarding a candidate — the enforcement point of the demand side.
 *
 * Everything before an award is reversible paperwork. Once a person starts,
 * tenure accrues, co-employment exposure begins and spend is committed, and
 * none of that is undone by deleting a row. Addendum E's BLOCK rules exist
 * for exactly this moment.
 *
 * The previous path (submissions/[id]/convert) had no idea a requisition
 * had a headcount, so five people could be placed against one position and
 * nothing objected. These tests exist so that cannot come back.
 */

import { describe, it, expect } from 'vitest'
import { assessAward, seatsRemaining, type AwardFacts } from '@/lib/award'

function facts(over: Partial<AwardFacts> = {}): AwardFacts {
  return {
    headcount: 2,
    alreadyAwarded: 0,
    personAlreadyAwarded: false,
    personName: 'Ravi Patel',
    requisitionApprovalState: 'AUTO_APPROVED',
    requisitionStatus: 'OPEN',
    awardedRateCents: 10_500,
    vendorBand: { payMin: 9_000, payMax: 11_000 },
    ceilingCents: 13_000,
    governance: { blocks: [], warnings: [] },
    ...over,
  }
}

const check = (d: ReturnType<typeof assessAward>, code: string) =>
  d.checks.find(c => c.code === code)

// ── Seats ──────────────────────────────────────────────────

describe('A requisition is a number of positions, not a yes or no', () => {

  it('two positions with none filled leaves two', () => {
    expect(seatsRemaining(2, 0)).toBe(2)
  })

  it('seats never go negative, however the data got that way', () => {
    expect(seatsRemaining(1, 3)).toBe(0)
  })

  it('an award against an open position proceeds', () => {
    const d = assessAward(facts())
    expect(d.decision).toBe('AWARD')
    expect(d.seatsAfter).toBe(1)
  })

  it('awarding the last position fills the requisition', () => {
    const d = assessAward(facts({ headcount: 2, alreadyAwarded: 1 }))
    expect(d.fillsRequisition).toBe(true)
    expect(d.seatsAfter).toBe(0)
    expect(d.summary).toContain('fills the requisition')
  })

  it('a fifth person cannot be placed against a one-position requisition', () => {
    // The bug the old convert path allowed.
    const d = assessAward(facts({ headcount: 1, alreadyAwarded: 1 }))
    expect(d.decision).toBe('BLOCKED')
    expect(check(d, 'SEATS')?.reason).toContain('already filled')
  })

  it('the same person cannot take two seats on one requisition', () => {
    const d = assessAward(facts({ personAlreadyAwarded: true }))
    expect(d.decision).toBe('BLOCKED')
    expect(check(d, 'DUPLICATE')?.reason).toContain('already holds a position')
  })

  it('a blocked award consumes no seat', () => {
    const d = assessAward(facts({ headcount: 2, alreadyAwarded: 0, personAlreadyAwarded: true }))
    expect(d.seatsAfter).toBe(2)
  })
})

// ── Approval ───────────────────────────────────────────────

describe('Nobody is placed against an unapproved requisition', () => {

  it('a requisition still waiting on approval blocks the award', () => {
    const d = assessAward(facts({ requisitionApprovalState: 'PENDING_APPROVAL' }))
    expect(d.decision).toBe('BLOCKED')
    expect(check(d, 'APPROVAL')?.reason).toContain('pending approval')
  })

  it('a rejected requisition blocks the award', () => {
    const d = assessAward(facts({ requisitionApprovalState: 'REJECTED' }))
    expect(d.decision).toBe('BLOCKED')
  })

  it('an auto-cleared requisition is as good as an approved one', () => {
    expect(assessAward(facts({ requisitionApprovalState: 'AUTO_APPROVED' })).decision).toBe('AWARD')
    expect(assessAward(facts({ requisitionApprovalState: 'APPROVED' })).decision).toBe('AWARD')
  })
})

// ── Governance: where Addendum E bites ─────────────────────

describe('The legally grounded gates stop an award, and nobody can wave them through', () => {

  it('a tenure cap breach blocks the placement', () => {
    const d = assessAward(facts({
      governance: { blocks: ['Ravi Patel has 18 of 18 months at Terumo BCT across all vendors'], warnings: [] },
    }))
    expect(d.decision).toBe('BLOCKED')
    expect(check(d, 'GOVERNANCE')?.outcome).toBe('BLOCK')
  })

  it('a break in service still running blocks the placement', () => {
    const d = assessAward(facts({
      governance: { blocks: ['Break in service ends 2026-09-29'], warnings: [] },
    }))
    expect(d.decision).toBe('BLOCKED')
    expect(d.summary).toContain('Break in service')
  })

  it('lapsed supplier insurance blocks the placement', () => {
    const d = assessAward(facts({
      governance: { blocks: ['Cloudepa Inc. general liability cover lapsed on 2026-08-01'], warnings: [] },
    }))
    expect(d.decision).toBe('BLOCKED')
  })

  it('several blocks are counted, with the first one named', () => {
    const d = assessAward(facts({
      governance: { blocks: ['Tenure cap reached'], warnings: [] },
      personAlreadyAwarded: true,
    }))
    expect(d.summary).toMatch(/^2 reasons this cannot proceed/)
  })

  it('a governance warning does not stop the award, but is carried', () => {
    const d = assessAward(facts({
      governance: { blocks: [], warnings: ['Vendor is not on the preferred tier'] },
    }))
    expect(d.decision).toBe('AWARD')
    expect(check(d, 'GOVERNANCE')?.outcome).toBe('WARN')
    expect(d.summary).toContain('preferred tier')
  })
})

// ── Rate ───────────────────────────────────────────────────

describe('The awarded rate is checked against what was offered, but never blocked', () => {

  it('a rate inside the band passes quietly', () => {
    const d = assessAward(facts({ awardedRateCents: 10_500 }))
    expect(check(d, 'BAND')?.outcome).toBe('PASS')
  })

  it('paying above the band you offered warns, and says both numbers', () => {
    const d = assessAward(facts({ awardedRateCents: 12_000 }))
    expect(d.decision).toBe('AWARD')
    expect(check(d, 'BAND')?.reason).toContain('$120/hr is above the $110/hr you offered')
  })

  it('paying below the floor you offered also warns', () => {
    const d = assessAward(facts({ awardedRateCents: 8_000 }))
    expect(check(d, 'BAND')?.outcome).toBe('WARN')
    expect(check(d, 'BAND')?.reason).toContain('below the $90/hr floor')
  })

  it('a vendor given no band is not measured against one', () => {
    const d = assessAward(facts({ vendorBand: null, awardedRateCents: 12_500 }))
    expect(check(d, 'BAND')?.outcome).toBe('PASS')
  })

  it('going over the requisition ceiling warns separately from the band', () => {
    const d = assessAward(facts({
      awardedRateCents: 14_000, vendorBand: null, ceilingCents: 13_000,
    }))
    expect(check(d, 'CEILING')?.outcome).toBe('WARN')
    expect(check(d, 'CEILING')?.reason).toContain('above the $130/hr ceiling')
  })

  it('a rate the client is happy to pay is never a block — only a note', () => {
    // It is their money. A band that quietly stops meaning anything is
    // worse than no band, so it is said out loud and then honoured.
    const d = assessAward(facts({ awardedRateCents: 20_000 }))
    expect(d.decision).toBe('AWARD')
  })
})

// ── Reporting ──────────────────────────────────────────────

describe('An award explains itself either way', () => {

  it('every check carries a reason, pass or fail', () => {
    const d = assessAward(facts())
    expect(d.checks.every(c => c.reason.length > 0)).toBe(true)
  })

  it('a clean award says how many positions are left', () => {
    const d = assessAward(facts({ headcount: 3, alreadyAwarded: 0 }))
    expect(d.summary).toContain('2 position(s) still open')
  })

  it('all six checks are always reported, so nothing is silently skipped', () => {
    const d = assessAward(facts())
    expect(d.checks.map(c => c.code).sort()).toEqual(
      ['APPROVAL', 'BAND', 'CEILING', 'DUPLICATE', 'GOVERNANCE', 'SEATS']
    )
  })
})
