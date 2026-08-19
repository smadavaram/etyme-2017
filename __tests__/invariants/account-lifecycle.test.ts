import { describe, it, expect } from 'vitest'
import {
  stateOf,
  canSuspend,
  canReinstate,
  canRevoke,
  canDeleteOutright,
  checkInvite,
  type AccessRow,
  type Footprint,
} from '@/lib/account-lifecycle'

/**
 * Access could be granted and never taken away. An API key could be
 * revoked, a document share could be revoked, a bench listing could be
 * revoked — a person could not. Somebody leaves and their seat stays live
 * until a database edit.
 *
 * It also made the rest of the system quietly dishonest: the access screen
 * reported dormant grants and the watcher chased them, and neither offered
 * any way to act on what it had found.
 */

function row(over: Partial<AccessRow> = {}): AccessRow {
  return {
    contextId: 'c1',
    personId: 'p1',
    hasSignedIn: true,
    roleId: 'r1',
    rolePermissions: ['consultants.read'],
    suspendedAt: null,
    revokedAt: null,
    ...over,
  }
}

const ANOTHER_ADMIN = row({
  contextId: 'c-admin',
  personId: 'p-admin',
  rolePermissions: ['team.manage'],
})

describe('what state somebody is in', () => {
  it('calls somebody who has never signed in invited, not active', () => {
    // A seat nobody has used looks identical to a working one otherwise,
    // and "5 people" that is really 2 is a number somebody reports upward.
    expect(stateOf(row({ hasSignedIn: false }))).toBe('INVITED')
  })

  it('calls a working seat active', () => {
    expect(stateOf(row())).toBe('ACTIVE')
  })

  it('prefers revoked over suspended when both are set', () => {
    // Somebody suspended and then ended is ended.
    expect(stateOf(row({ suspendedAt: new Date(), revokedAt: new Date() }))).toBe('REVOKED')
  })
})

describe('suspending somebody', () => {
  it('pauses an ordinary person', () => {
    const v = canSuspend(row(), [row(), ANOTHER_ADMIN])
    expect(v.allowed).toBe(true)
  })

  it('promises their history stays attached to them', () => {
    // Using revocation for a leave of absence loses the thread; this is
    // why the two are different things.
    const v = canSuspend(row(), [row(), ANOTHER_ADMIN])
    expect(v.consequences.join(' ')).toMatch(/stays attached to them/i)
    expect(v.consequences.join(' ')).toMatch(/same role/i)
  })

  it('refuses to suspend the only person who can manage access', () => {
    // Otherwise the company cannot grant anything ever again, and the only
    // remedy is somebody editing their database.
    const only = row({ rolePermissions: ['team.manage'] })
    const v = canSuspend(only, [only, row({ contextId: 'c2', personId: 'p2' })])
    expect(v.allowed).toBe(false)
    expect(v.reason).toMatch(/lock everybody out/i)
    expect(v.reason).toMatch(/give another person team.manage first/i)
  })

  it('allows it once somebody else can manage access', () => {
    const one = row({ rolePermissions: ['team.manage'] })
    expect(canSuspend(one, [one, ANOTHER_ADMIN]).allowed).toBe(true)
  })

  it('does not count a suspended admin as cover', () => {
    const one = row({ rolePermissions: ['*'] })
    const suspended = row({ contextId: 'c2', personId: 'p2', rolePermissions: ['team.manage'], suspendedAt: new Date() })
    expect(canSuspend(one, [one, suspended]).allowed).toBe(false)
  })

  it('does not count an invited admin who has never signed in as cover', () => {
    // They cannot rescue anybody, because they have never arrived.
    const one = row({ rolePermissions: ['*'] })
    const invited = row({ contextId: 'c2', personId: 'p2', rolePermissions: ['team.manage'], hasSignedIn: false })
    expect(canSuspend(one, [one, invited]).allowed).toBe(false)
  })

  it('refuses to suspend somebody twice', () => {
    expect(canSuspend(row({ suspendedAt: new Date() }), []).allowed).toBe(false)
  })
})

describe('lifting a suspension', () => {
  it('puts a suspended person back with the role they had', () => {
    const v = canReinstate(row({ suspendedAt: new Date() }))
    expect(v.allowed).toBe(true)
    expect(v.consequences.join(' ')).toMatch(/same role/i)
  })

  it('refuses to reinstate somebody whose access was ended rather than paused', () => {
    // Undoing a revocation silently would make revocation feel unreliable
    // and suspension pointless.
    const v = canReinstate(row({ revokedAt: new Date() }))
    expect(v.allowed).toBe(false)
    expect(v.reason).toMatch(/give them a fresh seat/i)
  })

  it('says nothing to do for somebody who is not suspended', () => {
    expect(canReinstate(row()).allowed).toBe(false)
  })
})

describe('ending access', () => {
  it('ends an ordinary person’s access', () => {
    expect(canRevoke(row(), [row(), ANOTHER_ADMIN]).allowed).toBe(true)
  })

  it('promises nothing they did is deleted', () => {
    const v = canRevoke(row(), [row(), ANOTHER_ADMIN])
    expect(v.consequences.join(' ')).toMatch(/nothing is deleted/i)
    expect(v.consequences.join(' ')).toMatch(/their name on it/i)
  })

  it('refuses to end the last person who can manage access', () => {
    const only = row({ rolePermissions: ['team.manage'] })
    expect(canRevoke(only, [only]).allowed).toBe(false)
  })

  it('refuses to end access twice', () => {
    expect(canRevoke(row({ revokedAt: new Date() }), []).allowed).toBe(false)
  })
})

describe('removing a person outright', () => {
  const clean: Footprint = {
    hasSignedIn: false, approvals: 0, submissions: 0, contracts: 0, timesheets: 0, otherCompanies: 0,
  }

  it('allows removing somebody invited who never arrived', () => {
    // There is nothing to explain.
    expect(canDeleteOutright(clean).allowed).toBe(true)
  })

  it('refuses once they have signed in, because they are part of the record', () => {
    expect(canDeleteOutright({ ...clean, hasSignedIn: true }).allowed).toBe(false)
  })

  it('names what they are attached to rather than refusing vaguely', () => {
    // "Cannot delete" sends somebody to guess. Naming the four approvals
    // tells them why and what to do instead.
    const v = canDeleteOutright({ ...clean, approvals: 4, timesheets: 11 })
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('4 approval(s)')
    expect(v.reason).toContain('11 timesheet(s)')
    expect(v.reason).toMatch(/end their access instead/i)
  })

  it('refuses to delete a person who works at another company too', () => {
    // The person is not this company's to delete.
    const v = canDeleteOutright({ ...clean, otherCompanies: 1 })
    expect(v.allowed).toBe(false)
    expect(v.reason).toMatch(/not yours to delete/i)
  })
})

describe('inviting somebody', () => {
  it('refuses an invitation to your own domain, and says why', () => {
    // Anybody on the verified domain joins by signing in. Offering an
    // invitation duplicates the seat.
    const v = checkInvite('newperson@cloudepa.com', 'cloudepa.com', false)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/joins by signing in/i)
  })

  it('allows an invitation to somebody outside the domain', () => {
    // The case the domain rule cannot cover: a contractor on their own
    // address, somebody at a subsidiary.
    const v = checkInvite('advisor@lawfirm.com', 'cloudepa.com', false)
    expect(v.ok).toBe(true)
    expect(v.outsider).toBe(true)
  })

  it('says out loud that an invitation is a hole in the domain rule', () => {
    const v = checkInvite('advisor@lawfirm.com', 'cloudepa.com', false)
    expect(v.reason).toMatch(/only get in because you asked them/i)
  })

  it('refuses somebody who already has a seat', () => {
    expect(checkInvite('ravi@cloudepa.com', 'other.com', true).ok).toBe(false)
  })

  it('refuses something that is not an address', () => {
    expect(checkInvite('not-an-email', 'cloudepa.com', false).ok).toBe(false)
  })

  it('is case-insensitive about the domain, because people type capitals', () => {
    expect(checkInvite('New.Person@Cloudepa.com', 'cloudepa.com', false).ok).toBe(false)
  })
})
