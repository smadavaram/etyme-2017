import { describe, it, expect } from 'vitest'
import {
  decideSubmission,
  endBecauseOf,
  holdExpiry,
  daysLeft,
  live,
  tellThem,
  HOLD_DAYS,
  type Hold,
  type Situation,
} from '@/lib/representation'

/**
 * A consultant is on ten benches. That is how the market works, and 2017
 * made it impossible — accepting one bench invitation auto-rejected every
 * other one, so a person belonged to whichever recruiter asked first.
 *
 * Benches are not exclusive here. One thing is: a vendor holds a person at
 * a client while they are actually representing them there, so two vendors
 * cannot put the same name in front of the same client and lose them the
 * job between them.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const ahead = (days: number) => new Date(NOW.getTime() + days * 86_400_000)
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

function hold(over: Partial<Hold> = {}): Hold {
  return {
    companyId: 'other-vendor',
    clientCompanyId: 'terumo',
    state: 'HELD',
    takenAt: ago(3),
    expiresAt: ahead(27),
    ...over,
  }
}

function situation(over: Partial<Situation> = {}): Situation {
  return {
    now: NOW,
    companyId: 'cloudepa',
    listing: { revokedAt: null, askFirst: false },
    blocked: false,
    holds: [],
    ...over,
  }
}

describe('being on more than one bench', () => {
  it('lets a vendor submit somebody who is on other benches', () => {
    // The 2017 rule was that accepting one bench rejected all the others.
    // Nothing here asks how many benches this person is on.
    expect(decideSubmission(situation()).ok).toBe(true)
  })

  it('needs a listing from this vendor, because being on a bench is the permission', () => {
    const v = decideSubmission(situation({ listing: null }))
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('NO_LISTING')
  })

  it('stops a vendor whose listing the person has since revoked', () => {
    const v = decideSubmission(situation({ listing: { revokedAt: ago(1), askFirst: false } }))
    expect(v.ok === false && v.code).toBe('NO_LISTING')
  })
})

describe('two vendors, one client', () => {
  it('refuses the second vendor, because the client would see the name twice', () => {
    // The most common way a good consultant is burned, and it only
    // happens because neither vendor can see the other.
    const v = decideSubmission(situation({ holds: [hold()] }))
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('HELD_ELSEWHERE')
  })

  it('never tells the second vendor who holds them', () => {
    // A refusal that leaks the other agency undoes the whole point of
    // being able to be on several benches quietly.
    const v = decideSubmission(situation({ holds: [hold({ companyId: 'rival-staffing' })] }))
    expect(v.ok === false && v.message).not.toMatch(/rival-staffing/i)
    expect(v.ok === false && v.message).toMatch(/somebody is already representing/i)
  })

  it('says how long the wait is, so the second vendor can decide to wait', () => {
    const v = decideSubmission(situation({ holds: [hold({ expiresAt: ahead(12) })] }))
    expect(v.ok === false && v.message).toMatch(/12 days/)
  })

  it('says why it matters rather than just refusing', () => {
    const v = decideSubmission(situation({ holds: [hold()] }))
    expect(v.ok === false && v.message).toMatch(/twice/i)
  })

  it('lets the vendor who holds them submit again for another role', () => {
    const v = decideSubmission(situation({ holds: [hold({ companyId: 'cloudepa' })] }))
    expect(v.ok).toBe(true)
    expect(v.ok === true && v.alreadyHeld).toBe(true)
  })

  it('frees the client once a hold has run out', () => {
    // An expired hold is not a hold. Somebody who sat on a submission for
    // a month does not get to keep the person out of the market.
    const v = decideSubmission(situation({ holds: [hold({ expiresAt: ago(1) })] }))
    expect(v.ok).toBe(true)
  })

  it('ignores a hold that was given back', () => {
    for (const state of ['RELEASED', 'EXPIRED', 'DECLINED'] as const) {
      expect(decideSubmission(situation({ holds: [hold({ state })] })).ok, state).toBe(true)
    }
  })

  it('holds one client at a time, not the person', () => {
    // Being represented at one client says nothing about any other. The
    // hold is keyed to the pair, which is why a caller passes only the
    // holds at the client in question.
    const v = decideSubmission(situation({ holds: [] }))
    expect(v.ok).toBe(true)
  })
})

describe('the client a person will not go to', () => {
  it('blocks the submission outright', () => {
    // Usually their current client. Sometimes a firm they left badly.
    const v = decideSubmission(situation({ blocked: true }))
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('BLOCKED')
  })

  it('gives the vendor no reason, because the reason is the person’s own', () => {
    const v = decideSubmission(situation({ blocked: true }))
    expect(v.ok === false && v.message).toBe('This person cannot be submitted to this client.')
  })

  it('is checked before anything that would act on it', () => {
    // A blocked person must not have a hold taken, a notification sent, or
    // a name put in front of anybody, even if everything else is in order.
    const v = decideSubmission(situation({ blocked: true, holds: [hold({ companyId: 'cloudepa' })] }))
    expect(v.ok).toBe(false)
  })
})

describe('somebody who wants to be asked first', () => {
  it('is asked rather than submitted', () => {
    const v = decideSubmission(situation({ listing: { revokedAt: null, askFirst: true } }))
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('ASK_FIRST')
  })

  it('tells the vendor an answer is coming rather than that they were refused', () => {
    const v = decideSubmission(situation({ listing: { revokedAt: null, askFirst: true } }))
    expect(v.ok === false && v.message).toMatch(/you will hear back/i)
  })

  it('does not ask twice while the first ask is unanswered', () => {
    const v = decideSubmission(
      situation({
        listing: { revokedAt: null, askFirst: true },
        holds: [hold({ companyId: 'cloudepa', state: 'REQUESTED' })],
      })
    )
    expect(v.ok === false && v.message).toMatch(/have not answered yet/i)
  })

  it('lets them through once the person has said yes', () => {
    // Saying yes is what turns the request into a hold.
    const v = decideSubmission(
      situation({
        listing: { revokedAt: null, askFirst: true },
        holds: [hold({ companyId: 'cloudepa', state: 'HELD' })],
      })
    )
    expect(v.ok).toBe(true)
  })
})

describe('how long a hold lasts', () => {
  it('runs thirty days, the short end of what the industry signs', () => {
    expect(HOLD_DAYS).toBe(30)
    expect(holdExpiry(NOW)).toEqual(ahead(30))
  })

  it('goes back the moment the client says no', () => {
    // A hold is permission to be trying. Somebody who has been rejected is
    // not trying, and the person should be free that same day.
    expect(endBecauseOf('REJECTED').end).toBe(true)
  })

  it('goes back when the vendor withdraws them', () => {
    expect(endBecauseOf('WITHDRAWN').end).toBe(true)
  })

  it('goes back when they are placed, so a second role is not blocked', () => {
    expect(endBecauseOf('AWARDED').end).toBe(true)
  })

  it('stays while the vendor is still actually working it', () => {
    for (const s of ['SUBMITTED', 'INTERVIEWING', 'OFFERED']) {
      expect(endBecauseOf(s).end, s).toBe(false)
    }
  })

  it('explains itself in plain words when it ends', () => {
    const e = endBecauseOf('REJECTED')
    expect(e.end === true && e.reason).toMatch(/said no/i)
  })

  it('counts the days left rather than printing a timestamp', () => {
    expect(daysLeft(hold({ expiresAt: ahead(9) }), NOW)).toBe(9)
    expect(daysLeft(hold({ expiresAt: ago(4) }), NOW)).toBe(0)
  })

  it('treats an expired hold as no hold at all', () => {
    expect(live(hold({ expiresAt: ago(1) }), NOW)).toBe(false)
    expect(live(hold({ state: 'RELEASED' }), NOW)).toBe(false)
    expect(live(hold(), NOW)).toBe(true)
  })
})

describe('what the person themselves is told', () => {
  it('names the vendor and the client, because it is their career', () => {
    // The competitors are kept in the dark. The person never is — being
    // marketed somewhere you did not know about is the complaint all of
    // this exists to answer.
    const said = tellThem({
      vendorName: 'Cloudepa Inc.',
      clientName: 'Terumo BCT',
      roleTitle: 'SAP FICO Consultant',
      hold: hold({ expiresAt: ahead(30) }),
      now: NOW,
    })
    expect(said).toContain('Cloudepa Inc.')
    expect(said).toContain('Terumo BCT')
    expect(said).toContain('SAP FICO Consultant')
    expect(said).toMatch(/30 days/)
  })

  it('reads as a sentence even when the role has no title', () => {
    const said = tellThem({
      vendorName: 'Cloudepa Inc.',
      clientName: 'Terumo BCT',
      roleTitle: null,
      hold: hold(),
      now: NOW,
    })
    expect(said).not.toMatch(/\bfor\s+\./)
    expect(said).toContain('put you forward to Terumo BCT')
  })

  it('tells them what the hold stops other agencies doing', () => {
    const said = tellThem({
      vendorName: 'Cloudepa Inc.',
      clientName: 'Terumo BCT',
      roleTitle: null,
      hold: hold(),
      now: NOW,
    })
    expect(said).toMatch(/no other agency can submit you/i)
  })
})
