/**
 * Whether a seat has signed in is read from this firm's own record only
 * (2026-11-16).
 *
 * Users & permissions read "signed in" as a sign-in anywhere on Etyme. So
 * a seat invited at an address that already signs in at another firm read
 * as a member with access, never "Invited", and the firm learned that the
 * address has an account elsewhere. CLAUDE.md, "Sign-in, identity, Owners
 * and access": the page never says whether an address has an account; a
 * person invited and never signed in is "Invited".
 *
 * Now every place that decides Invited or with access reads one fact the
 * firm already holds: a row on its own access log with her, in person, as
 * the actor at this firm (her first sign-in on the invitation writes one).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seatHasSignedIn, seatPlace, waitingLine } from '@/lib/access-grant'
import { NOT_A_SIGN_IN, signedInHereWhere } from '@/lib/access-log'
import { seatStateOf } from '@/lib/company-seats'
import { offersFor } from '@/app/api/access/row-acts'
import type { AccessRow } from '@/lib/account-lifecycle'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const invited = new Date('2026-11-10T09:00:00Z')

/** A waiting seat as the register reads it, signed in here or not. */
const row = (id: string, signedIn: boolean, over: Partial<AccessRow> = {}): AccessRow & { invited: boolean } => ({
  contextId: id, personId: `p-${id}`, hasSignedIn: signedIn, roleId: 'r-ap', rolePermissions: ['invoices.read'],
  suspendedAt: null, revokedAt: null, isOwner: false, invited: true, ...over,
})
const owner = (): AccessRow & { invited: boolean } =>
  ({ ...row('owner', true, { roleId: 'r-owner', rolePermissions: ['team.manage', 'settings.manage'], isOwner: true }), invited: false })

describe('a seat reads Invited until she signs in here', () => {
  it('a seat invited at an address that signs in elsewhere reads Invited until she signs in here', () => {
    // Her account elsewhere is not an input at all: only this firm's own fact.
    const before = seatHasSignedIn({ invitedAt: invited, lastUsedAt: null, signedInHere: false })
    expect(before).toBe(false)
    expect(seatPlace({ roleName: 'AP Clerk', signedIn: before })).toBe('WAITING')
    expect(seatStateOf({ revokedAt: null, suspendedAt: null, signedIn: before, hasRole: true })).toBe('INVITED')
    expect(waitingLine({ invited: true, signedIn: before, days: 0, desk: 'AP Clerk' }))
      .toBe('Invited today, not yet signed in · will have the AP Clerk role')

    // Her first sign-in on the invitation here writes a row on this firm's log.
    const after = seatHasSignedIn({ invitedAt: invited, lastUsedAt: null, signedInHere: true })
    expect(after).toBe(true)
    expect(seatPlace({ roleName: 'AP Clerk', signedIn: after })).toBe('WITH_ACCESS')
    expect(seatStateOf({ revokedAt: null, suspendedAt: null, signedIn: after, hasRole: true })).toBe('WITH_ACCESS')
  })

  it('a seat nobody invited was made by a sign-in here, so it has signed in whatever the log holds', () => {
    expect(seatHasSignedIn({ invitedAt: null, lastUsedAt: null, signedInHere: false })).toBe(true)
  })

  it('an invited seat not signed in here is offered Withdraw and Send again, never End', () => {
    const offers = offersFor([owner(), row('sam', false)], { isOwner: true, personId: 'p-owner' }, true)
    const sam = offers.get('sam')!
    expect(sam.withdraw).toBe(true)
    expect(sam.resend).toBe(true)
    expect(sam.copy).toBe(true)
    expect(sam.end).toBe(false)
    expect(sam.pause).toBe(false)
  })

  it('once she signs in here the same seat is offered Pause and End, and no invitation to withdraw or send', () => {
    const offers = offersFor([owner(), row('sam', true)], { isOwner: true, personId: 'p-owner' }, true)
    const sam = offers.get('sam')!
    expect(sam.withdraw).toBe(false)
    expect(sam.resend).toBe(false)
    expect(sam.end).toBe(true)
    expect(sam.pause).toBe(true)
  })
})

describe('the one place it is read from', () => {
  it('whether she signed in here is a row on this firm’s own access log with her, in person, as the actor at this firm', () => {
    expect(signedInHereWhere('firm-1', 'p-sam')).toEqual({
      actorPersonId: 'p-sam',
      actorCompanyId: 'firm-1',
      actorKind: 'PERSON',
      action: { notIn: ['LOGIN_REFUSED_SSO_ONLY', 'JOIN_REFUSED_BY_POLICY'] },
    })
  })

  it('a sign-in or a join this firm refused is never read as her signing in here', () => {
    expect(NOT_A_SIGN_IN).toEqual(['LOGIN_REFUSED_SSO_ONLY', 'JOIN_REFUSED_BY_POLICY'])
  })

  it('nothing on Users & permissions, Withdraw, End, Send again or the invite answer reads her sign-ins anywhere on Etyme', () => {
    const files = [
      'src/app/api/access/route.ts',
      'src/app/api/access/[contextId]/route.ts',
      'src/app/api/access/[contextId]/waiting-seat.ts',
      'src/app/api/access/invite/one.ts',
    ]
    for (const f of files) {
      const src = read(f)
      expect(src, f).toContain('signedInHere(')
      expect(src, f).toContain('seatHasSignedIn(')
      expect(src, f).not.toContain('everSignedIn')
      expect(src, f).not.toMatch(/\bhasSignedIn\(/)
      expect(src, f).not.toMatch(/credentials: \{ where: \{ lastUsedAt/)
    }
  })

  it('the figures on Users & permissions are counted from the same reading of each seat as its row', () => {
    const route = read('src/app/api/access/route.ts')
    expect(route).toContain('seatStateOf({ revokedAt: c.revokedAt, suspendedAt: c.suspendedAt, signedIn: signedInOf(c), hasRole: Boolean(c.role?.name) })')
    expect(route).toContain('countSeats(peopleOf(seats))')
  })

  it('an invitation to an address that already has a way in never carries a link that sets a password on it', () => {
    const one = read('src/app/api/access/invite/one.ts')
    expect(one).toContain('const wayIn = Boolean(a.person.passwordHash) || (await prisma.credential.count({ where: { personId: a.person.id } })) > 0')
    expect(one).toContain('doorFor({ mode: a.mode, hasPassword: wayIn, login })')
  })
})
