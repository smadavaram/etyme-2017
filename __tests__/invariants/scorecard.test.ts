import { describe, it, expect } from 'vitest'
import {
  scorecard, order, whatToFix, middle, ENOUGH,
  type Sent, type Put, type Scorecard,
} from '@/lib/scorecard'

/**
 * A vendor cannot compute this about themselves — they do not know what
 * the other eleven suppliers did with the same role. A client cannot get
 * it from their vendors either, because every vendor reports their own
 * numbers and every vendor's numbers are excellent.
 *
 * It only exists in the middle. That is the whole reason to build it.
 */

const NOW = new Date('2026-08-24T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000)

function sent(over: Partial<Sent> = {}): Sent {
  return {
    requirementId: 'r1',
    invitedAt: daysAgo(30),
    bandMinCents: 7000,
    bandMaxCents: 9000,
    declined: false,
    ...over,
  }
}

function put(over: Partial<Put> = {}): Put {
  return {
    submittedAt: daysAgo(29),
    requirementId: 'r1',
    rateCents: 8000,
    bandMinCents: 7000,
    bandMaxCents: 9000,
    cleared: true,
    heldBackFor: [],
    hired: false,
    reason: null,
    ...over,
  }
}

/** Six submissions across six roles, so the thresholds are cleared. */
function six(each: Partial<Put> = {}): { roles: Sent[]; subs: Put[] } {
  const roles = Array.from({ length: 6 }, (_, i) =>
    sent({ requirementId: `r${i}`, invitedAt: daysAgo(30 - i) })
  )
  const subs = Array.from({ length: 6 }, (_, i) =>
    put({ requirementId: `r${i}`, submittedAt: daysAgo(29 - i), ...each })
  )
  return { roles, subs }
}

describe('a supplier nobody has sent anything to', () => {
  it('says so rather than scoring them zero', () => {
    const c = scorecard('Cloudepa', [], [], NOW)
    expect(c.summary).toBe('You have not sent Cloudepa anything yet.')
    expect(c.answered.value).toBeNull()
  })
})

describe('a supplier who never answers', () => {
  it('is the one finding worth surfacing on its own', () => {
    const c = scorecard('Kestrel', [sent(), sent({ requirementId: 'r2' })], [], NOW)
    expect(c.summary).toBe('2 roles sent, nothing back. Worth asking why.')
  })

  it('tells them so on their own card', () => {
    const c = scorecard('Kestrel', [sent()], [], NOW)
    expect(whatToFix(c)[0]).toMatch(/Even a decline is worth sending/)
  })
})

describe('declining counts as answering', () => {
  it('scores a fast no the same as a submission', () => {
    // A supplier who says "nobody at that rate" within the hour is more
    // use than one who says nothing for a fortnight. Scoring them the
    // same teaches silence.
    const c = scorecard(
      'Brightmoor',
      [sent({ requirementId: 'r1', declined: true }), sent({ requirementId: 'r2' })],
      [put({ requirementId: 'r2' })],
      NOW
    )
    expect(c.answered.value).toBe(100)
    expect(c.answered.says).toBe('Answered all 2.')
  })

  it('counts the ones they ignored', () => {
    const c = scorecard(
      'Brightmoor',
      [sent({ requirementId: 'r1' }), sent({ requirementId: 'r2' }), sent({ requirementId: 'r3' })],
      [put({ requirementId: 'r1' })],
      NOW
    )
    expect(c.answered.says).toBe('Answered 1 of the 3 you sent.')
  })
})

describe('too little to say', () => {
  it('gives counts and no percentages under the threshold', () => {
    const c = scorecard('Apex', [sent()], [put()], NOW)
    expect(c.enough).toBe(false)
    expect(c.hired.value).toBeNull()
    expect(c.worthReading.value).toBeNull()
    expect(c.summary).toBe('1 submission so far. Too early to score them.')
  })

  it('says out loud why there is no number', () => {
    const c = scorecard('Apex', [sent()], [put()], NOW)
    expect(c.unknowns).toContain(`Only 1 submission so far. Percentages start at ${ENOUGH}.`)
  })

  it('starts scoring at the threshold and not before', () => {
    const { roles, subs } = six()
    expect(scorecard('Apex', roles, subs, NOW).enough).toBe(true)
    expect(scorecard('Apex', roles.slice(0, 4), subs.slice(0, 4), NOW).enough).toBe(false)
  })
})

describe('how many were worth reading', () => {
  it('counts only the ones that were actually screened', () => {
    const { roles, subs } = six()
    subs[0].cleared = false
    subs[1].cleared = false
    const c = scorecard('Cloudepa', roles, subs, NOW)
    expect(c.worthReading.of).toBe(6)
    expect(c.worthReading.value).toBe(67)
  })

  it('says how many were never screened rather than counting them as failures', () => {
    const { roles, subs } = six()
    subs[0].cleared = null
    subs[1].cleared = null
    const c = scorecard('Cloudepa', roles, subs, NOW)
    expect(c.unknowns).toContain('2 of their submissions have never been screened.')
  })

  it('refuses a percentage when only a couple have been screened', () => {
    const { roles, subs } = six()
    for (const s of subs.slice(2)) s.cleared = null
    const c = scorecard('Cloudepa', roles, subs, NOW)
    expect(c.worthReading.value).toBeNull()
    expect(c.worthReading.says).toBe('2 of 2 got through. Too few to put a number on.')
  })
})

describe('how fast the first CV arrives', () => {
  it('reads in hours when they are quick', () => {
    const roles = Array.from({ length: 6 }, (_, i) =>
      sent({ requirementId: `r${i}`, invitedAt: hoursAgo(100) })
    )
    const subs = Array.from({ length: 6 }, (_, i) =>
      put({ requirementId: `r${i}`, submittedAt: hoursAgo(94) })
    )
    const c = scorecard('Cloudepa', roles, subs, NOW)
    expect(c.firstReplyHours.says).toBe('First CV usually inside a day — about 6 hours.')
  })

  it('reads in days when they are slow, because that is how it is felt', () => {
    const roles = Array.from({ length: 6 }, (_, i) =>
      sent({ requirementId: `r${i}`, invitedAt: daysAgo(30) })
    )
    const subs = Array.from({ length: 6 }, (_, i) =>
      put({ requirementId: `r${i}`, submittedAt: daysAgo(26) })
    )
    expect(scorecard('Vertex', roles, subs, NOW).firstReplyHours.says).toBe(
      'First CV usually takes about 4 days.'
    )
  })

  it('measures the first one on each role, not every one', () => {
    const roles = [sent({ requirementId: 'r1', invitedAt: hoursAgo(50) })]
    const subs = [
      put({ requirementId: 'r1', submittedAt: hoursAgo(40) }),
      put({ requirementId: 'r1', submittedAt: hoursAgo(10) }),
    ]
    expect(scorecard('Vertex', roles, subs, NOW).firstReplyHours.of).toBe(1)
    expect(scorecard('Vertex', roles, subs, NOW).firstReplyHours.value).toBe(10)
  })
})

describe('what holds their submissions up', () => {
  it('names the commonest reason and what to do about it', () => {
    // "Sixty per cent" tells a supplier nothing. "Your rate is over the
    // band on half of them" tells them what to do on Monday.
    const { roles, subs } = six()
    for (const s of subs.slice(0, 3)) s.heldBackFor = ['IN_BUDGET']
    const c = scorecard('Vertex', roles, subs, NOW)
    expect(c.holdsThemUp!.code).toBe('IN_BUDGET')
    expect(c.holdsThemUp!.says).toBe(
      '3 of their 6 came in over the band. That is the thing to fix first.'
    )
  })

  it('does not blame them for a limit they cannot do anything about', () => {
    const { roles, subs } = six()
    for (const s of subs.slice(0, 2)) s.heldBackFor = ['GOVERNANCE']
    const c = scorecard('Vertex', roles, subs, NOW)
    expect(c.holdsThemUp!.says).toMatch(/Nothing they can do about those/)
  })

  it('says being second is slowness, not a fault', () => {
    const { roles, subs } = six()
    for (const s of subs.slice(0, 2)) s.heldBackFor = ['ALREADY_SUBMITTED']
    expect(scorecard('Vertex', roles, subs, NOW).holdsThemUp!.says).toMatch(
      /They are slow, not wrong/
    )
  })

  it('says nothing where nothing is being held back', () => {
    const { roles, subs } = six()
    expect(scorecard('Cloudepa', roles, subs, NOW).holdsThemUp).toBeNull()
  })
})

describe('where they price inside the band', () => {
  it('spots a supplier who always asks the top', () => {
    const { roles, subs } = six({ rateCents: 8900 })
    expect(scorecard('Vertex', roles, subs, NOW).asks.says).toBe(
      'They price near the top of your band.'
    )
  })

  it('spots one who always asks the bottom', () => {
    const { roles, subs } = six({ rateCents: 7100 })
    expect(scorecard('Brightmoor', roles, subs, NOW).asks.says).toBe(
      'They price near the bottom of your band.'
    )
  })

  it('says plainly when there was no band to compare against', () => {
    const { roles, subs } = six({ bandMinCents: null, bandMaxCents: null })
    expect(scorecard('Apex', roles, subs, NOW).asks.says).toBe(
      'No band on the roles you sent them, so there is nothing to compare.'
    )
  })
})

describe('the window', () => {
  it('ignores work from two years ago, because that is a different firm', () => {
    const old = put({ submittedAt: daysAgo(500) })
    const c = scorecard('Cloudepa', [sent({ invitedAt: daysAgo(500) })], [old], NOW)
    expect(c.received).toBe(0)
  })
})

describe('ordering twelve suppliers', () => {
  function card(over: Partial<Scorecard>): Scorecard {
    return {
      vendorName: 'x', sent: 10, received: 10,
      answered: { value: 100, of: 10, says: '' },
      firstReplyHours: { value: 24, of: 10, says: '' },
      worthReading: { value: 50, of: 10, says: '' },
      hired: { value: 10, of: 10, says: '' },
      holdsThemUp: null,
      asks: { value: 50, of: 10, says: '' },
      enough: true, summary: '', unknowns: [],
      ...over,
    }
  }

  it('puts the ones who actually deliver first', () => {
    const out = order([
      card({ vendorName: 'few', hired: { value: 5, of: 10, says: '' } }),
      card({ vendorName: 'many', hired: { value: 30, of: 10, says: '' } }),
    ])
    expect(out[0].vendorName).toBe('many')
  })

  it('breaks a tie on how many were worth reading', () => {
    const out = order([
      card({ vendorName: 'noisy', worthReading: { value: 20, of: 10, says: '' } }),
      card({ vendorName: 'clean', worthReading: { value: 80, of: 10, says: '' } }),
    ])
    expect(out[0].vendorName).toBe('clean')
  })

  it('then on who answers fastest', () => {
    const out = order([
      card({ vendorName: 'slow', firstReplyHours: { value: 96, of: 10, says: '' } }),
      card({ vendorName: 'quick', firstReplyHours: { value: 6, of: 10, says: '' } }),
    ])
    expect(out[0].vendorName).toBe('quick')
  })

  it('puts a supplier with no record last rather than first', () => {
    const out = order([
      card({ vendorName: 'unknown', hired: { value: null, of: 0, says: '' } }),
      card({ vendorName: 'known', hired: { value: 0, of: 10, says: '' } }),
    ])
    expect(out[0].vendorName).toBe('known')
  })
})

describe('what a supplier is told to fix', () => {
  it('tells a slow one that roles are decided in the first week', () => {
    const roles = Array.from({ length: 6 }, (_, i) =>
      sent({ requirementId: `r${i}`, invitedAt: daysAgo(30) })
    )
    const subs = Array.from({ length: 6 }, (_, i) =>
      put({ requirementId: `r${i}`, submittedAt: daysAgo(25) })
    )
    expect(whatToFix(scorecard('Vertex', roles, subs, NOW))).toContain(
      'Your first CV takes about 5 days. Most roles are decided in the first week.'
    )
  })

  it('tells an expensive one what it is costing them', () => {
    const { roles, subs } = six({ rateCents: 9000 })
    expect(whatToFix(scorecard('Vertex', roles, subs, NOW))).toContain(
      'You price at the very top of their band. It is costing you the ones you nearly won.'
    )
  })

  it('does not invent advice for a supplier doing fine', () => {
    const { roles, subs } = six()
    expect(whatToFix(scorecard('Cloudepa', roles, subs, NOW))).toEqual([
      'Nothing obvious to fix. Keep sending.',
    ])
  })

  it('admits there is nothing to say yet rather than filling the space', () => {
    expect(whatToFix(scorecard('Apex', [sent()], [put()], NOW))).toEqual([
      'Not enough here yet to tell you anything useful.',
    ])
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

describe('a supplier who was never invited but sent something anyway', () => {
  it('does not say two true things that read as a contradiction', () => {
    // "You have not sent them anything yet" alongside four of their CVs
    // is the kind of sentence that makes somebody stop trusting a page.
    const c = scorecard('Kestrel', [], [put(), put({ requirementId: 'r2' })], NOW)
    expect(c.summary).toBe(
      'You have not sent Kestrel a role, and 2 submissions came in anyway.'
    )
  })

  it('still says nothing sent when nothing came either', () => {
    expect(scorecard('Kestrel', [], [], NOW).summary).toBe(
      'You have not sent Kestrel anything yet.'
    )
  })
})
