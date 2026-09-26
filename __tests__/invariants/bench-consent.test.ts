import { describe, it, expect } from 'vitest'
import { mayMarket, answer, awaitingAnswer, invitation, type Listing } from '@/lib/bench-consent'

/**
 * CLAUDE.md states this more firmly than anything else in the file: a
 * Submission requires a live BenchListing **granted by the consultant**.
 *
 * Nothing carried the grant. `grantedAt` defaulted to `now()` the moment
 * a vendor created the row, so every listing was born consented and no
 * consultant was ever asked. The invariant held in the sense that a
 * listing existed, and meant nothing in the sense anybody cared about.
 *
 * 2017 had the missing half — accept_bench and reject_bench.
 */

const NOW = new Date('2026-09-08T10:00:00Z')
const listing = (over: Partial<Listing> = {}): Listing => ({ state: 'GRANTED', revokedAt: null, ...over })

describe('nobody is put forward on an invitation that was never answered', () => {
  it('refuses to market somebody who has only been invited', () => {
    // The whole point. Before this, a vendor creating a row was the
    // vendor consenting on the consultant's behalf.
    const v = mayMarket(listing({ state: 'INVITED' }))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/have not answered your invitation/i)
  })

  it('refuses to market somebody who declined', () => {
    const v = mayMarket(listing({ state: 'DECLINED' }))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/Asking again is a conversation, not a re-listing/i)
  })

  it('refuses a listing the consultant took back', () => {
    expect(mayMarket(listing({ revokedAt: new Date('2026-08-01') })).ok).toBe(false)
  })

  it('allows it once they have agreed', () => {
    expect(mayMarket(listing()).ok).toBe(true)
  })

  it('treats a revoked listing as revoked whatever its state says', () => {
    expect(mayMarket(listing({ state: 'GRANTED', revokedAt: NOW })).ok).toBe(false)
  })
})

describe('accepting stamps the grant, which is what the timestamp should always have meant', () => {
  it('records the moment somebody agreed, not the moment a vendor typed their name', () => {
    const a = answer(listing({ state: 'INVITED' }), 'ACCEPT', NOW)
    expect(a.ok).toBe(true)
    expect(a.data).toMatchObject({ state: 'GRANTED', grantedAt: NOW, respondedAt: NOW })
  })

  it('tells them they can take it back', () => {
    expect(answer(listing({ state: 'INVITED' }), 'ACCEPT', NOW).reason)
      .toMatch(/take it back at any time/i)
  })
})

describe('declining keeps the record of having been asked', () => {
  it('marks it declined rather than deleting it', () => {
    // 2017 restored a prior state rather than deleting, and the reason
    // holds: losing it means the same vendor asks again next week with
    // no idea they already did.
    const a = answer(listing({ state: 'INVITED' }), 'DECLINE', NOW)
    expect(a.data).toMatchObject({ state: 'DECLINED', respondedAt: NOW })
  })

  it('keeps their reason where they gave one, and says the vendor is not told otherwise', () => {
    const a = answer(listing({ state: 'INVITED' }), 'DECLINE', NOW, '  Already with another agency there  ')
    expect(a.data!.declinedNote).toBe('Already with another agency there')
    expect(a.reason).toMatch(/not told why unless you said/i)
  })

  it('stores nothing where they gave no reason, rather than an empty string', () => {
    expect(answer(listing({ state: 'INVITED' }), 'DECLINE', NOW, '   ').data!.declinedNote).toBeNull()
  })
})

describe('an answer can only be given once', () => {
  it('refuses a second accept, and points at revoking instead', () => {
    const a = answer(listing({ state: 'GRANTED' }), 'ACCEPT', NOW)
    expect(a.ok).toBe(false)
    expect(a.reason).toMatch(/Revoke it if you have changed your mind/i)
  })

  it('refuses to answer one already declined', () => {
    expect(answer(listing({ state: 'DECLINED' }), 'ACCEPT', NOW).ok).toBe(false)
  })

  it('refuses to answer a listing that was taken back', () => {
    expect(answer(listing({ state: 'INVITED', revokedAt: NOW }), 'ACCEPT', NOW).ok).toBe(false)
  })
})

describe('what is still waiting on the consultant', () => {
  it('counts an unanswered invitation', () => {
    expect(awaitingAnswer(listing({ state: 'INVITED' }))).toBe(true)
  })

  it('does not count one already answered, or one taken back', () => {
    expect(awaitingAnswer(listing({ state: 'GRANTED' }))).toBe(false)
    expect(awaitingAnswer(listing({ state: 'INVITED', revokedAt: NOW }))).toBe(false)
  })
})

describe('and a listing written before any of this still means what it meant', () => {
  it('creates new invitations as INVITED rather than granted', () => {
    expect(invitation(NOW)).toMatchObject({ state: 'INVITED', invitedAt: NOW, respondedAt: null })
  })

  it('leaves an old GRANTED row marketable, because backfilling would un-list everybody', () => {
    // Honest about the past and silently removing every consultant from
    // every bench is a worse lie told louder.
    expect(mayMarket(listing({ state: 'GRANTED' })).ok).toBe(true)
  })
})
