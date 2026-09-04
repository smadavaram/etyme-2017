/**
 * What a vendor may see of an invitation, and what it may not.
 *
 * CLAUDE.md invariant:
 *   "Rate bands live on RequirementInvitation, never on Requirement where a
 *    recipient could read another vendor's rate."
 *
 * The schema keeps half of that promise. The other half is kept — or
 * broken — at read time, which is what these tests cover. The realistic
 * failure is not someone deliberately exposing a competitor's rate; it is
 * a field added to Requirement in eighteen months quietly riding out on a
 * spread, long after whoever wrote the invariant has left.
 *
 * So the projection is asserted by exclusion here: the shape must NOT
 * grow. A test that only checks the fields it expects would pass happily
 * while leaking three new ones.
 */

import { describe, it, expect } from 'vitest'
import { projectInvitationForVendor, type InvitationRow } from '@/lib/invitation-visibility'

const NOW = new Date('2026-08-16T00:00:00Z')

function row(overrides: Partial<InvitationRow> = {}): InvitationRow {
  return {
    id: 'inv-1',
    toCompanyId: 'vendor-a',
    payMin: 9_000,
    payMax: 11_000,
    message: 'Priority role',
    status: 'SENT',
    expiresAt: new Date('2026-09-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    fromCompany: { id: 'client-1', name: 'Terumo BCT', slug: 'terumo' },
    requirement: {
      id: 'req-1',
      title: 'SAP MM Consultant',
      skills: ['SAP MM'],
      location: 'Lakewood, CO',
      headcount: 2,
      months: 6,
      neededBy: new Date('2026-10-01T00:00:00Z'),
      status: 'OPEN',
      // The client's own ceiling — never the vendor's business.
      billMin: 12_000,
      billMax: 13_000,
      invitationCount: 4,
    },
    ...overrides,
  }
}

describe('A vendor sees its own rate band', () => {

  it('the band it was given comes through', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(v.band).toEqual({ payMin: 9_000, payMax: 11_000 })
  })

  it('an invitation sent without a band says so rather than inventing one', () => {
    const v = projectInvitationForVendor(row({ payMin: null, payMax: null }), 0, NOW)
    expect(v.band).toEqual({ payMin: null, payMax: null })
  })
})

describe("A vendor never sees the client's own ceiling", () => {

  it('billMax does not appear anywhere in the response', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(JSON.stringify(v)).not.toContain('billMax')
    expect(JSON.stringify(v)).not.toContain('13000')
  })

  it('billMin does not appear anywhere in the response', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(JSON.stringify(v)).not.toContain('billMin')
    expect(JSON.stringify(v)).not.toContain('12000')
  })

  it('the requirement is projected field by field, so a new field cannot leak', () => {
    // Asserted by exclusion: if someone adds a field to Requirement and
    // spreads it into this projection, this test fails.
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(Object.keys(v.requirement).sort()).toEqual([
      'headcount', 'id', 'location', 'months', 'neededBy', 'skills', 'status', 'title',
    ])
  })

  it('the top level of the response cannot grow silently either', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(Object.keys(v).sort()).toEqual([
      'band', 'createdAt', 'expired', 'expiresAt', 'from', 'id',
      'message', 'otherInviteeCount', 'requirement', 'status', 'submittedCount',
    ])
  })
})

describe('A vendor learns how many others were asked, but not who', () => {

  it('one of four invitees is told there are three others', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(v.otherInviteeCount).toBe(3)
  })

  it('a sole invitee is told there are none', () => {
    const v = projectInvitationForVendor(
      row({ requirement: { ...row().requirement, invitationCount: 1 } }), 0, NOW
    )
    expect(v.otherInviteeCount).toBe(0)
  })

  it('the count never goes negative if the requirement count is stale', () => {
    const v = projectInvitationForVendor(
      row({ requirement: { ...row().requirement, invitationCount: 0 } }), 0, NOW
    )
    expect(v.otherInviteeCount).toBe(0)
  })

  it('no competitor name appears in the response', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(JSON.stringify(v)).not.toContain('vendor-b')
  })
})

describe('An invitation that has run out of time says so', () => {

  it('a sent invitation past its date reads as expired', () => {
    const v = projectInvitationForVendor(
      row({ expiresAt: new Date('2026-08-01T00:00:00Z') }), 0, NOW
    )
    expect(v.status).toBe('EXPIRED')
    expect(v.expired).toBe(true)
  })

  it('an invitation still inside its window reads as sent', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(v.status).toBe('SENT')
    expect(v.expired).toBe(false)
  })

  it('a vendor that already declined keeps that answer after the date passes', () => {
    // The vendor's own answer is more informative than the clock.
    const v = projectInvitationForVendor(
      row({ status: 'DECLINED', expiresAt: new Date('2026-08-01T00:00:00Z') }), 0, NOW
    )
    expect(v.status).toBe('DECLINED')
  })

  it('a vendor that accepted keeps that answer after the date passes', () => {
    const v = projectInvitationForVendor(
      row({ status: 'ACCEPTED', expiresAt: new Date('2026-08-01T00:00:00Z') }), 0, NOW
    )
    expect(v.status).toBe('ACCEPTED')
  })
})

describe('A vendor can see its own progress on the requirement', () => {

  it('the number it has already submitted travels with the invitation', () => {
    const v = projectInvitationForVendor(row(), 3, NOW)
    expect(v.submittedCount).toBe(3)
  })

  it('having submitted nothing reads as zero, not absent', () => {
    const v = projectInvitationForVendor(row(), 0, NOW)
    expect(v.submittedCount).toBe(0)
  })
})
