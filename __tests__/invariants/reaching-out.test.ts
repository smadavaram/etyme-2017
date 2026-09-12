import { describe, it, expect } from 'vitest'
import {
  inviteLetter, nudgeLetter, shouldNudge, NUDGE_AFTER_DAYS, type Invite,
} from '@/lib/reaching-out'

/**
 * The whole "bring your network" motion rests on one email landing well.
 * A supplier who opens it and sees a platform invitation deletes it; one
 * who sees that a client sent them a role opens the link.
 */

const NOW = new Date('2026-08-29T10:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function invite(over: Partial<Invite> = {}): Invite {
  return {
    supplierName: 'Apex Softech',
    contactName: 'Meena Rao',
    clientName: 'Calder Manufacturing',
    rolesWaiting: 1,
    firstRole: 'Senior Java Developer',
    claimUrl: 'https://etyme2040.vercel.app/claim/abc123',
    ...over,
  }
}

describe('the subject line', () => {
  it('names the client and the role, never the product', () => {
    // "You have been invited to Etyme" does not get opened. The
    // difference is the whole business.
    expect(inviteLetter(invite()).subject).toBe('Calder Manufacturing: Senior Java Developer')
  })

  it('says what happened when there is no role yet', () => {
    expect(inviteLetter(invite({ rolesWaiting: 0, firstRole: null })).subject).toBe(
      'Calder Manufacturing added Apex Softech to their supplier list'
    )
  })
})

describe('the opening line', () => {
  it('leads with the role when there is one', () => {
    expect(inviteLetter(invite()).body).toContain(
      'Calder Manufacturing has sent Apex Softech a role: Senior Java Developer.'
    )
  })

  it('counts them when there are several', () => {
    expect(inviteLetter(invite({ rolesWaiting: 3 })).body).toContain(
      'has sent Apex Softech 3 roles, starting with Senior Java Developer'
    )
  })

  it('promises roles rather than pretending there are some', () => {
    expect(inviteLetter(invite({ rolesWaiting: 0, firstRole: null })).body).toContain(
      'Their roles will come straight to you as they open.'
    )
  })

  it('uses their first name when it has one', () => {
    expect(inviteLetter(invite()).body.startsWith('Meena,')).toBe(true)
  })

  it('does not guess a name it was never given', () => {
    expect(inviteLetter(invite({ contactName: null })).body.startsWith('Hello,')).toBe(true)
  })
})

describe('what the letter promises', () => {
  it('says there is nothing to set up, because that is the objection', () => {
    expect(inviteLetter(invite()).body).toContain(
      'No account to set up, no bench to build first'
    )
  })

  it('says their data stays theirs, unprompted', () => {
    expect(inviteLetter(invite()).body).toContain('are not shared with other suppliers')
  })

  it('tells them the link is safe to forward inside their own firm', () => {
    expect(inviteLetter(invite()).body).toContain(
      'only works for an address at your own company'
    )
  })
})

describe('the nudge', () => {
  it('offers declining as a real option, and says it counts in their favour', () => {
    // A decline is genuinely more useful to a client than silence, and a
    // supplier who believes that will send one.
    const l = nudgeLetter(invite())
    expect(l.body).toContain('a decline is genuinely useful to them')
    expect(l.body).toContain('counts in your favour rather than against it')
  })

  it('waits three days before it is worth sending', () => {
    expect(NUDGE_AFTER_DAYS).toBe(3)
    const early = shouldNudge({ sentAt: daysAgo(1), remindedAt: null, state: 'PENDING' }, 1, 0, NOW)
    expect(early.yes).toBe(false)
    expect(early.why).toBe('Sent 1 days ago. Give it 3.')
  })

  it('sends once nothing has come back', () => {
    const v = shouldNudge({ sentAt: daysAgo(4), remindedAt: null, state: 'PENDING' }, 1, 0, NOW)
    expect(v.yes).toBe(true)
    expect(v.why).toBe('4 days, a role waiting, and nothing back.')
  })

  it('never nudges twice, because twice is a mailing list', () => {
    const v = shouldNudge({ sentAt: daysAgo(9), remindedAt: daysAgo(4), state: 'PENDING' }, 1, 0, NOW)
    expect(v.why).toBe('Already nudged once. Twice is a mailing list.')
  })

  it('does not nudge somebody who has already sent a CV', () => {
    expect(shouldNudge({ sentAt: daysAgo(9), remindedAt: null, state: 'PENDING' }, 1, 2, NOW).yes)
      .toBe(false)
  })

  it('does not nudge somebody who took the account', () => {
    expect(shouldNudge({ sentAt: daysAgo(9), remindedAt: null, state: 'ACCEPTED' }, 1, 0, NOW).why)
      .toBe('They already took the account.')
  })

  it('does not chase a supplier nobody has actually sent anything to', () => {
    // Chasing somebody for a role that does not exist is how a network
    // invitation becomes spam.
    expect(shouldNudge({ sentAt: daysAgo(9), remindedAt: null, state: 'PENDING' }, 0, 0, NOW).why)
      .toBe('Nothing is waiting for them to answer.')
  })
})
