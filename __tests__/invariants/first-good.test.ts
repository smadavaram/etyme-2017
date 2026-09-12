import { describe, it, expect } from 'vitest'
import {
  roleTime, theNumber, reading, trend, plain, middle, seatMap,
  TARGET_HOURS, ENOUGH_ROLES, type Role,
} from '@/lib/first-good'

/**
 * The supply side measures output — good submissions a day. A client
 * produces nothing. What a hiring manager experiences is waiting, and
 * then reading, and the second is usually worse than the first.
 *
 * So the number counts from a role opening to the first submission worth
 * reading. Not the first CV. A supplier can flood an inbox in an hour,
 * and a number that cannot tell flooding from a shortlist is a number
 * that rewards flooding.
 */

const NOW = new Date('2026-08-24T12:00:00Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000)

function role(over: Partial<Role> = {}): Role {
  return {
    requirementId: 'r1',
    title: 'Senior Java Developer',
    openedAt: hoursAgo(100),
    arrivals: [],
    ...over,
  }
}

describe('one role', () => {
  it('counts to the first one worth reading, not the first one that arrived', () => {
    const t = roleTime(
      role({
        arrivals: [
          { at: hoursAgo(98), cleared: false },
          { at: hoursAgo(97), cleared: false },
          { at: hoursAgo(90), cleared: true },
        ],
      }),
      NOW
    )
    expect(t.hours).toBe(10)
    expect(t.anyHours).toBe(2)
  })

  it('names the reading somebody did in between, because that is the product', () => {
    const t = roleTime(
      role({
        arrivals: [
          { at: hoursAgo(98), cleared: false },
          { at: hoursAgo(20), cleared: true },
        ],
      }),
      NOW
    )
    expect(t.says).toBe(
      'Senior Java Developer: first CV in 2 hours, first one worth reading in 3 days. 3 days of reading in between.'
    )
  })

  it('does not make a story out of a gap of a few hours', () => {
    const t = roleTime(
      role({
        arrivals: [
          { at: hoursAgo(98), cleared: false },
          { at: hoursAgo(92), cleared: true },
        ],
      }),
      NOW
    )
    expect(t.says).toBe('Senior Java Developer: first one worth reading in 8 hours.')
  })

  it('says how long they have been waiting when nothing has arrived', () => {
    expect(roleTime(role(), NOW).says).toBe(
      'Senior Java Developer: nothing has arrived in 4 days.'
    )
  })

  it('says how many arrived and were not worth reading', () => {
    const t = roleTime(
      role({ arrivals: [{ at: hoursAgo(90), cleared: false }, { at: hoursAgo(80), cleared: false }] }),
      NOW
    )
    expect(t.hours).toBeNull()
    expect(t.says).toBe(
      'Senior Java Developer: 2 arrived over 4 days, none worth reading yet.'
    )
  })

  it('does not count an unscreened submission as either good or bad', () => {
    // Not looked at is not the same as failed, and counting it as either
    // is a lie in a different direction.
    const t = roleTime(role({ arrivals: [{ at: hoursAgo(90), cleared: null }] }), NOW)
    expect(t.hours).toBeNull()
    expect(t.worthReading).toBe(0)
  })
})

describe('the number across roles', () => {
  function filled(id: string, hoursTaken: number): Role {
    return role({
      requirementId: id,
      openedAt: hoursAgo(200),
      arrivals: [{ at: hoursAgo(200 - hoursTaken), cleared: true }],
    })
  }

  it('takes the middle, not the average', () => {
    // One role that sat open for three months because nobody funded it
    // would drag a mean past the point of meaning anything.
    const n = theNumber([filled('a', 10), filled('b', 20), filled('c', 1000)], NOW)
    expect(n.hours).toBe(20)
  })

  it('hits the bar at two days', () => {
    const n = theNumber([filled('a', 10), filled('b', 20), filled('c', 30)], NOW)
    expect(n.hit).toBe(true)
    expect(n.says).toBe('20 hours to the first one worth reading, across 3 roles.')
  })

  it('names the bar when it misses', () => {
    const n = theNumber([filled('a', 100), filled('b', 120), filled('c', 140)], NOW)
    expect(n.hit).toBe(false)
    expect(n.says).toBe(
      '5 days to the first one worth reading, across 3 roles. The bar is 2 days.'
    )
  })

  it('will not call two roles a pattern', () => {
    const n = theNumber([filled('a', 10), filled('b', 20)], NOW)
    expect(n.hit).toBe(false)
    expect(n.says).toMatch(/Too few to call it a pattern/)
  })

  it('counts the roles still waiting and does not hide them in the median', () => {
    const n = theNumber(
      [filled('a', 10), filled('b', 20), filled('c', 30), role({ requirementId: 'd' })],
      NOW
    )
    expect(n.of).toBe(3)
    expect(n.waiting).toBe(1)
    expect(n.says).toMatch(/1 role still waiting for a first good one\.$/)
  })

  it('puts the role with the most unread CVs at the top of the stuck list', () => {
    // Where the work is. A role with forty CVs and nothing worth reading
    // is somebody's whole afternoon.
    const n = theNumber(
      [
        role({ requirementId: 'quiet', arrivals: [{ at: hoursAgo(5), cleared: false }] }),
        role({
          requirementId: 'noisy',
          arrivals: Array.from({ length: 9 }, () => ({ at: hoursAgo(5), cleared: false })),
        }),
      ],
      NOW
    )
    expect(n.stuck[0].requirementId).toBe('noisy')
  })

  it('says the number has not started rather than showing a zero', () => {
    expect(theNumber([], NOW).says).toBe('No roles open yet. The number starts with the first one.')
  })

  it('says plainly when roles are open and nothing good has landed', () => {
    expect(theNumber([role(), role({ requirementId: 'r2' })], NOW).says).toBe(
      'Nothing worth reading has arrived on any of the 2 open roles yet.'
    )
  })
})

describe('what they did not have to read', () => {
  it('counts what was held back, out of what was screened', () => {
    const r = reading([
      role({
        arrivals: [
          { at: hoursAgo(9), cleared: true },
          { at: hoursAgo(8), cleared: false },
          { at: hoursAgo(7), cleared: false },
        ],
      }),
    ])
    expect(r.says).toBe('2 of 3 did not reach a hiring manager.')
  })

  it('does not claim to have filtered when nothing needed filtering', () => {
    const r = reading([role({ arrivals: [{ at: hoursAgo(9), cleared: true }] })])
    expect(r.says).toBe('1 arrived and all of them were worth reading.')
  })

  it('does not count unscreened arrivals as filtered', () => {
    const r = reading([role({ arrivals: [{ at: hoursAgo(9), cleared: null }] })])
    expect(r.says).toBe('1 arrived. None screened yet.')
  })
})

describe('this window against the last', () => {
  const at = (h: number | null) => ({
    hours: h, of: 5, waiting: 0, hit: false, says: '', stuck: [],
  })

  it('says the direction in words somebody would repeat', () => {
    // "Down from four days" is something a client tells their boss. "A
    // 34% improvement in mean time to qualified submission" is not.
    expect(trend(at(20), at(96)).says).toBe('Down from 4 days.')
    expect(trend(at(96), at(20)).says).toBe('Up from 20 hours.')
  })

  it('calls an hour either way noise, not an improvement', () => {
    // Calling noise an improvement is how a dashboard stops being
    // believed.
    expect(trend(at(20), at(20.5)).better).toBeNull()
    expect(trend(at(20), at(20.5)).says).toBe('About the same as before — 20 hours.')
  })

  it('admits there is nothing to compare rather than guessing', () => {
    expect(trend(at(20), at(null)).says).toBe('Not enough history to compare yet.')
  })
})

describe('saying hours the way people do', () => {
  it('rounds to days past two of them', () => {
    expect(plain(1)).toBe('1 hour')
    expect(plain(20)).toBe('20 hours')
    expect(plain(47)).toBe('47 hours')
    expect(plain(72)).toBe('3 days')
  })

  it('does not print a zero for something that happened fast', () => {
    expect(plain(0.4)).toBe('under an hour')
  })
})

describe('the middle value', () => {
  it('takes the middle of an odd list', () => {
    expect(middle([5, 1, 3])).toBe(3)
  })

  it('takes the lower of the two in an even one', () => {
    expect(middle([4, 1, 3, 2])).toBe(2)
  })
})

describe('the bar itself', () => {
  it('is two days, because past that a hiring manager has moved on', () => {
    expect(TARGET_HOURS).toBe(48)
  })

  it('needs three roles before it will call anything a pattern', () => {
    expect(ENOUGH_ROLES).toBe(3)
  })
})

describe('one seat, one role', () => {
  it('folds a prime’s mirror into the role the client opened', () => {
    // Counted separately, a mirror invents an extra opening carrying
    // whatever landed on it — which on a live sandbox read as a role
    // stuck for eight days while the real one had four worth reading.
    const map = seatMap(
      [{ id: 'client-req', openingId: 'seat-1', mirrors: [{ id: 'prime-mirror' }] }],
      []
    )
    expect(map.get('prime-mirror')).toBe('client-req')
    expect(map.get('client-req')).toBe('client-req')
  })

  it('folds another record on the same opening even without a mirror link', () => {
    const map = seatMap(
      [{ id: 'client-req', openingId: 'seat-1', mirrors: [] }],
      [{ id: 'someone-elses', openingId: 'seat-1' }]
    )
    expect(map.get('someone-elses')).toBe('client-req')
  })

  it('never folds a role the client opened into another of their own', () => {
    // Two requisitions on one seat is two headcount, and quietly folding
    // one into the other loses a hire.
    const map = seatMap(
      [
        { id: 'req-a', openingId: 'seat-1', mirrors: [] },
        { id: 'req-b', openingId: 'seat-1', mirrors: [] },
      ],
      [{ id: 'req-b', openingId: 'seat-1' }]
    )
    expect(map.get('req-b')).toBe('req-b')
  })

  it('leaves a role with no opening alone', () => {
    const map = seatMap([{ id: 'lonely', openingId: null, mirrors: [] }], [])
    expect(map.get('lonely')).toBe('lonely')
    expect(map.size).toBe(1)
  })
})
