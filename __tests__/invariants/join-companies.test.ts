import { describe, it, expect } from 'vitest'
import { canJoin, survives, whatMoves, buttonSays, type Side } from '@/lib/join-companies'

/**
 * Two clients each list Cloudepa Systems. Neither knows the other did,
 * so there are two supplier records with the same domain — and the
 * second person to sign in gets the one their own client created.
 *
 * That is the right default. A merge that happens silently at sign-in is
 * how a firm loses a year of history.
 */

function side(over: Partial<Side> = {}): Side {
  return {
    id: 'a',
    name: 'Cloudepa Systems',
    domain: 'cloudepa.com',
    claimedAt: null,
    yours: false,
    counts: { submissions: 4, contracts: 1, invites: 2, people: 0 },
    listedBy: ['Calder Manufacturing'],
    ...over,
  }
}

describe('what may be joined', () => {
  it('joins two records on the same domain when one is unclaimed', () => {
    const v = canJoin(
      side({ id: 'a', claimedAt: new Date('2026-01-01') }),
      side({ id: 'b' })
    )
    expect(v.ok).toBe(true)
    expect(v.keep!.id).toBe('a')
    expect(v.fold!.id).toBe('b')
  })

  it('refuses two claimed records on different domains, however alike the names', () => {
    // Two firms genuinely called Apex Staffing is an ordinary Tuesday,
    // and joining them would be the worst bug in this product.
    const v = canJoin(
      side({ id: 'a', name: 'Apex Staffing', domain: 'apex.com', claimedAt: new Date() }),
      side({ id: 'b', name: 'Apex Staffing', domain: 'apexstaffing.io', claimedAt: new Date() })
    )
    expect(v.ok).toBe(false)
    expect(v.refusal).toBe('DIFFERENT_DOMAIN')
    expect(v.says).toMatch(/Nothing here says they are the same firm/)
  })

  it('refuses when both are signed in to and you are not on both', () => {
    const v = canJoin(
      side({ id: 'a', claimedAt: new Date(), yours: true }),
      side({ id: 'b', claimedAt: new Date(), yours: false })
    )
    expect(v.refusal).toBe('BOTH_CLAIMED_NOT_YOURS')
    expect(v.says).toMatch(/Somebody with a seat at each has to do this/)
  })

  it('allows it when the person asking sits at both', () => {
    const v = canJoin(
      side({ id: 'a', claimedAt: new Date('2026-01-01'), yours: true }),
      side({ id: 'b', claimedAt: new Date('2026-02-01'), yours: true })
    )
    expect(v.ok).toBe(true)
  })

  it('refuses the same record twice', () => {
    expect(canJoin(side(), side()).refusal).toBe('SAME_RECORD')
  })

  it('says so when there is nothing on the other one to move', () => {
    const v = canJoin(
      side({ id: 'a', claimedAt: new Date() }),
      side({ id: 'b', counts: { submissions: 0, contracts: 0, invites: 0, people: 0 } })
    )
    expect(v.refusal).toBe('NOTHING_TO_MOVE')
    expect(v.says).toBe('There is nothing on Cloudepa Systems to move.')
  })
})

describe('which record survives', () => {
  it('keeps the one somebody has signed in to', () => {
    // Folding a claimed company into a shell created by a paste is
    // backwards: colleagues have seats on the claimed one.
    const claimed = side({ id: 'claimed', claimedAt: new Date() })
    expect(survives(claimed, side({ id: 'shell' })).id).toBe('claimed')
    expect(survives(side({ id: 'shell' }), claimed).id).toBe('claimed')
  })

  it('keeps the older of two claimed records, because history is harder to recreate', () => {
    const old = side({ id: 'old', claimedAt: new Date('2025-01-01') })
    const recent = side({ id: 'recent', claimedAt: new Date('2026-01-01') })
    expect(survives(recent, old).id).toBe('old')
  })

  it('keeps whichever shell carries more, because that is less to move', () => {
    const big = side({ id: 'big', counts: { submissions: 40, contracts: 3, invites: 9, people: 0 } })
    const small = side({ id: 'small', counts: { submissions: 1, contracts: 0, invites: 0, people: 0 } })
    expect(survives(small, big).id).toBe('big')
  })
})

describe('saying what will move before it moves', () => {
  it('names what is in the box', () => {
    // A dialog that says "this cannot be undone" and nothing else is a
    // dialog people click through.
    expect(whatMoves(side())).toEqual(['4 submissions', '1 contract', '2 role invitations'])
  })

  it('does not list things there are none of', () => {
    expect(
      whatMoves(side({ counts: { submissions: 1, contracts: 0, invites: 0, people: 2 } }))
    ).toEqual(['1 submission', '2 seats'])
  })

  it('tells whoever listed it that their history survives', () => {
    const v = canJoin(
      side({ id: 'a', claimedAt: new Date() }),
      side({ id: 'b', listedBy: ['Ravensmere Energy'] })
    )
    expect(v.says).toMatch(/Ravensmere Energy listed it; they keep their history/)
  })
})

describe('the button', () => {
  it('names both firms and the direction, because "merge" alone loses data', () => {
    const v = canJoin(
      side({ id: 'a', name: 'Cloudepa Systems', claimedAt: new Date() }),
      side({ id: 'b', name: 'Cloudepa Systems (listed)' })
    )
    expect(buttonSays(v)).toBe('Fold Cloudepa Systems (listed) into Cloudepa Systems')
  })

  it('says plainly when it cannot be done', () => {
    expect(buttonSays(canJoin(side(), side()))).toBe('Cannot join these')
  })
})

describe('the domain is required, not preferred', () => {
  it('refuses a pair where one has no domain on file', () => {
    // An earlier version let any pair through as long as one was
    // unclaimed, which would have allowed folding an unrelated shell
    // into a real company on somebody's say-so.
    const v = canJoin(side({ id: 'a', claimedAt: new Date() }), side({ id: 'b', domain: null }))
    expect(v.refusal).toBe('DIFFERENT_DOMAIN')
    expect(v.says).toMatch(/no domain on file/)
  })

  it('refuses two unclaimed shells on different domains', () => {
    const v = canJoin(side({ id: 'a', domain: 'x.com' }), side({ id: 'b', domain: 'y.com' }))
    expect(v.refusal).toBe('DIFFERENT_DOMAIN')
  })
})
