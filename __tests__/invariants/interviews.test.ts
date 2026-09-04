import { describe, it, expect } from 'vitest'
import {
  waitingOn, isBooked, stateAfterConfirming, slotsBothCanDo, earliest,
  stillValid, reasonFor, settle, noShow, headline, said,
  CHASE_AFTER_HOURS, TOO_MANY_ROUNDS,
  type Interview, type Slot,
} from '@/lib/interviews'

/**
 * Every ATS treats an interview as a thing a client books. In contract
 * staffing it is not: the client proposes, the vendor has to know their
 * consultant is free and still interested, and the consultant has to
 * turn up. Three diaries, and the one that breaks is almost never the
 * client's.
 */

const NOW = new Date('2026-08-24T12:00:00Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000)
const hoursAhead = (n: number) => new Date(NOW.getTime() + n * 3_600_000)

const NAMES = { vendor: 'Cloudepa', client: 'Calder Manufacturing', consultant: 'Rohan Menon' }

function slot(startIn: number, mins = 60): Slot {
  return { start: hoursAhead(startIn), end: hoursAhead(startIn + mins / 60) }
}

function interview(over: Partial<Interview> = {}): Interview {
  return {
    round: 1,
    stage: 'TECHNICAL',
    mode: 'VIDEO',
    state: 'PROPOSED',
    proposedSlots: [slot(48), slot(72)],
    proposedAt: hoursAgo(2),
    scheduledAt: null,
    durationMins: 60,
    client: { at: hoursAgo(2), via: 'SELF' },
    vendor: null,
    consultant: null,
    noShowBy: null,
    outcome: null,
    ...over,
  }
}

describe('who we are waiting on', () => {
  it('names them, because "pending" tells a coordinator nothing', () => {
    const w = waitingOn(interview(), NOW, NAMES)
    expect(w.says).toBe('Waiting on Cloudepa and Rohan Menon.')
  })

  it('says worth a call once it has been sitting a day', () => {
    const w = waitingOn(interview({ proposedAt: hoursAgo(30) }), NOW, NAMES)
    expect(w.overdue).toBe(true)
    expect(w.says).toBe('Waiting on Cloudepa and Rohan Menon for 30 hours. Worth a call.')
  })

  it('names one party without a stray "and"', () => {
    const w = waitingOn(interview({ vendor: { at: NOW, via: 'SELF' } }), NOW, NAMES)
    expect(w.says).toBe('Waiting on Rohan Menon.')
  })

  it('says everybody has confirmed when they have', () => {
    const done = interview({
      vendor: { at: NOW, via: 'SELF' },
      consultant: { at: NOW, via: 'SELF' },
    })
    expect(waitingOn(done, NOW, NAMES).says).toBe('Everybody has confirmed.')
  })

  it('chases after a day', () => {
    expect(CHASE_AFTER_HOURS).toBe(24)
  })
})

describe('when an interview is actually happening', () => {
  it('needs all three and a time, not two out of three', () => {
    // An interview one party has not agreed to is a meeting somebody
    // will not attend, and a calendar entry does not change that.
    const nearly = interview({
      vendor: { at: NOW, via: 'SELF' },
      scheduledAt: hoursAhead(48),
    })
    expect(isBooked(nearly)).toBe(false)
    expect(stateAfterConfirming(nearly)).toBe('PROPOSED')
  })

  it('is booked once the third says yes and a slot is settled', () => {
    const all = interview({
      vendor: { at: NOW, via: 'SELF' },
      consultant: { at: NOW, via: 'SELF' },
      scheduledAt: hoursAhead(48),
    })
    expect(isBooked(all)).toBe(true)
    expect(stateAfterConfirming(all)).toBe('CONFIRMED')
  })

  it('does not un-cancel something by confirming it', () => {
    const dead = interview({ state: 'CANCELLED', vendor: { at: NOW, via: 'SELF' } })
    expect(stateAfterConfirming(dead)).toBe('CANCELLED')
  })
})

describe('a consultant who has no seat here', () => {
  it('is confirmed by their vendor, and it is recorded as that', () => {
    // Writing it as though they had replied would make the no-show
    // record a liar, and the no-show record is the point.
    const i = interview({
      vendor: { at: NOW, via: 'SELF' },
      consultant: { at: NOW, via: 'VENDOR_ASSERTED' },
      scheduledAt: hoursAhead(48),
    })
    expect(isBooked(i)).toBe(true)
    expect(i.consultant!.via).toBe('VENDOR_ASSERTED')
  })
})

describe('finding a slot', () => {
  it('keeps only the ones both sides can do', () => {
    const offered = [slot(48), slot(72), slot(96)]
    const free = [{ start: hoursAhead(70), end: hoursAhead(100) }]
    expect(slotsBothCanDo(offered, free)).toHaveLength(2)
  })

  it('says nothing works rather than picking one anyway', () => {
    // A coordinator refreshing a screen waiting for a slot that will
    // never appear is worse than being told on Monday.
    expect(slotsBothCanDo([slot(48)], [{ start: hoursAhead(100), end: hoursAhead(200) }])).toEqual([])
  })

  it('takes the earliest, because interviews slip later and never earlier', () => {
    expect(earliest([slot(96), slot(48), slot(72)])!.start).toEqual(hoursAhead(48))
  })

  it('refuses a slot that has already gone past', () => {
    // Confirming one produces a meeting nobody attends and a no-show
    // nobody deserves.
    expect(stillValid({ start: hoursAgo(2), end: hoursAgo(1) }, NOW)).toBe(false)
    expect(stillValid(slot(2), NOW)).toBe(true)
  })
})

describe('what happens after it', () => {
  it('sends an offer through and says what to do next', () => {
    expect(settle(2, 'OFFER', 'Rohan Menon').says).toBe('Rohan Menon is through. Raise the contract.')
  })

  it('asks for a reason on a rejection, because that is how the next one is better', () => {
    expect(settle(1, 'REJECT', 'Rohan Menon').says).toBe(
      'Rohan Menon is out after round 1. Tell the vendor why — it is the only way the next one is better.'
    )
  })

  it('closes the submission either way', () => {
    expect(settle(1, 'REJECT', 'x').closed).toBe(true)
    expect(settle(1, 'OFFER', 'x').closed).toBe(true)
    expect(settle(1, 'ADVANCE', 'x').closed).toBe(false)
  })

  it('says plainly when a fifth round is somebody avoiding a decision', () => {
    expect(settle(TOO_MANY_ROUNDS, 'ADVANCE', 'Rohan Menon').says).toMatch(
      /this is not information gathering any more — somebody has to decide/
    )
  })

  it('does not lecture on an ordinary second round', () => {
    expect(settle(1, 'ADVANCE', 'Rohan Menon').says).toBe('Rohan Menon goes through to round 2.')
  })
})

describe('a rejection at interview', () => {
  it('is not counted as a bad submission', () => {
    // A good candidate losing to a better one is not a fault in the
    // submission, and counting it as one would teach vendors to stop
    // sending their best people to competitive roles.
    expect(reasonFor('REJECT', null)).toBe('INTERVIEW')
  })

  it('has no reason at all when they went through', () => {
    expect(reasonFor('ADVANCE', null)).toBeNull()
    expect(reasonFor('OFFER', null)).toBeNull()
  })
})

describe('somebody not turning up', () => {
  it('counts a consultant no-show against their vendor', () => {
    const v = noShow('CONSULTANT', NAMES)
    expect(v.state).toBe('NO_SHOW')
    expect(v.closed).toBe(true)
    expect(v.says).toBe('Rohan Menon did not turn up. Recorded, and it counts against Cloudepa.')
  })

  it('does not put a client no-show on the supplier’s scorecard', () => {
    // Today the vendor says the client cancelled and the client says
    // nobody came, and neither can prove it. Both are in this room.
    const v = noShow('CLIENT', NAMES)
    expect(v.closed).toBe(false)
    expect(v.says).toMatch(/it is not the supplier's fault and their scorecard should not carry it/)
  })

  it('reads a consultant no-show as a withdrawal, not a bad submission', () => {
    expect(reasonFor('REJECT', 'CONSULTANT')).toBe('CANDIDATE_WITHDREW')
  })

  it('reads a client no-show as timing, which is nobody’s fault', () => {
    expect(reasonFor('REJECT', 'CLIENT')).toBe('TIMING')
  })
})

describe('the line at the top', () => {
  it('answers when and whether it is real, in one sentence', () => {
    const i = interview({
      vendor: { at: NOW, via: 'SELF' },
      consultant: { at: NOW, via: 'SELF' },
      state: 'CONFIRMED',
      scheduledAt: new Date('2026-08-26T14:00:00Z'),
    })
    expect(headline(i, NOW, NAMES)).toBe('Round 1, 2026-08-26 14:00 UTC. In all three diaries.')
  })

  it('names who it is waiting on when it is not real yet', () => {
    expect(headline(interview(), NOW, NAMES)).toBe(
      'Round 1. Waiting on Cloudepa and Rohan Menon.'
    )
  })

  it('says the decision once there is one', () => {
    expect(headline(interview({ state: 'DONE', outcome: 'OFFER' }), NOW, NAMES)).toBe(
      'Round 1 done — offer.'
    )
  })

  it('admits when an interview happened and nobody wrote down what came of it', () => {
    expect(headline(interview({ state: 'DONE' }), NOW, NAMES)).toBe(
      'Round 1 done, no decision recorded yet.'
    )
  })

  it('says who did not turn up', () => {
    expect(headline(interview({ state: 'NO_SHOW', noShowBy: 'CONSULTANT' }), NOW, NAMES)).toMatch(
      /Rohan Menon did not turn up/
    )
  })
})

describe('saying hours out loud', () => {
  it('reads the way somebody would say it', () => {
    expect(said(0.5)).toBe('under an hour')
    expect(said(1)).toBe('an hour')
    expect(said(30)).toBe('30 hours')
    expect(said(72)).toBe('3 days')
  })
})
