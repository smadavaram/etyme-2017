import { describe, it, expect } from 'vitest'
import { negotiation, mayMove, messageFor, type Event } from '@/lib/rate-negotiation'

/**
 * `Submission.rate` is set by the vendor and the person it concerns has
 * no move. They consent to being submitted and then the number attached
 * to them is somebody else's decision.
 *
 * 2017 let them counter. It kept three flags on the application —
 * accept_rate, accept_rate_by_company, rate_initiator — and also posted
 * every offer into the conversation, then demoted each superseded
 * message so only the live one stood.
 *
 * That demotion is the tell: the flags and the thread were two records
 * of one thing, kept agreeing by rewriting history. Here the thread is
 * the negotiation and the state is read off the end of it. Nothing to
 * keep in step, and the whole exchange stays readable afterwards —
 * which matters the first time anybody disputes what was agreed.
 */

const t = (n: number) => new Date(2026, 8, n)
const offer = (by: 'CANDIDATE' | 'VENDOR', cents: number, day: number): Event =>
  ({ at: t(day), by, move: 'OFFER', cents })
const accept = (by: 'CANDIDATE' | 'VENDOR', day: number): Event => ({ at: t(day), by, move: 'ACCEPT' })
const decline = (by: 'CANDIDATE' | 'VENDOR', day: number): Event => ({ at: t(day), by, move: 'DECLINE' })

describe('the rate on the table is the last one offered', () => {
  it('has nothing on the table before anybody proposes', () => {
    const s = negotiation([])
    expect(s.stage).toBe('NOT_STARTED')
    expect(s.says).toMatch(/No rate has been proposed/i)
  })

  it('puts the vendor’s offer with the candidate', () => {
    const s = negotiation([offer('VENDOR', 9000, 1)])
    expect(s.liveCents).toBe(9000)
    expect(s.awaiting).toBe('CANDIDATE')
    expect(s.says).toMatch(/They have offered \$90\/hr. It is with you./)
  })

  it('lets the candidate counter, which puts it back with the vendor', () => {
    const s = negotiation([offer('VENDOR', 9000, 1), offer('CANDIDATE', 10500, 2)])
    expect(s.liveCents).toBe(10500)
    expect(s.awaiting).toBe('VENDOR')
    expect(s.says).toMatch(/You asked for \$105\/hr. Waiting on them./)
  })

  it('never leaves an old figure standing, without rewriting the history that holds it', () => {
    // 2017 mutated superseded messages to keep only the live one
    // visible. Reading the latest instead means the thread stays whole.
    const s = negotiation([
      offer('VENDOR', 9000, 1), offer('CANDIDATE', 10500, 2), offer('VENDOR', 9800, 3),
    ])
    expect(s.liveCents).toBe(9800)
    expect(s.offeredBy).toBe('VENDOR')
  })
})

describe('a counter reopens the question on both sides', () => {
  it('clears an acceptance when somebody counters after it', () => {
    // Agreeing to a number nobody is offering any more is agreeing to
    // nothing. 2017 cleared both flags for the same reason.
    const s = negotiation([
      offer('VENDOR', 9000, 1), accept('CANDIDATE', 2), offer('VENDOR', 8500, 3),
    ])
    expect(s.stage).toBe('AWAITING')
    expect(s.liveCents).toBe(8500)
  })

  it('clears a decline too, so a fresh offer genuinely restarts it', () => {
    const s = negotiation([offer('VENDOR', 9000, 1), decline('CANDIDATE', 2), offer('VENDOR', 11000, 3)])
    expect(s.stage).toBe('AWAITING')
  })
})

describe('agreement is final, and it binds both of them', () => {
  it('closes once the other side accepts', () => {
    const s = negotiation([offer('VENDOR', 9000, 1), accept('CANDIDATE', 2)])
    expect(s.stage).toBe('AGREED')
    expect(s.says).toMatch(/Agreed at \$90\/hr. Neither side can change it now./)
  })

  it('refuses to let the candidate reopen what they accepted', () => {
    // 2017: "You cannot change the rate once accepted by you."
    const s = negotiation([offer('VENDOR', 9000, 1), accept('CANDIDATE', 2)])
    expect(mayMove(s, 'CANDIDATE', 'OFFER').ok).toBe(false)
  })

  it('refuses the vendor equally, which 2017 did not', () => {
    // An agreement that only one side is held to is not an agreement.
    const s = negotiation([offer('CANDIDATE', 10500, 1), accept('VENDOR', 2)])
    const v = mayMove(s, 'VENDOR', 'OFFER')
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/Neither side can reopen it/i)
  })

  it('does not treat somebody accepting their own offer as agreement', () => {
    const s = negotiation([offer('VENDOR', 9000, 1), accept('VENDOR', 2)])
    expect(s.stage).toBe('AWAITING')
    expect(mayMove(s, 'VENDOR', 'ACCEPT').reason).toMatch(/That is your own offer/i)
  })
})

describe('what can be done, and why not where it cannot', () => {
  it('refuses an acceptance when nothing is on the table', () => {
    expect(mayMove(negotiation([]), 'CANDIDATE', 'ACCEPT').reason).toMatch(/nothing on the table to accept/i)
  })

  it('lets somebody revise their own live offer without waiting to be refused', () => {
    // Realising you asked for the wrong number should not require the
    // other side to say no first.
    const s = negotiation([offer('CANDIDATE', 10500, 1)])
    expect(mayMove(s, 'CANDIDATE', 'OFFER').ok).toBe(true)
  })

  it('says a declined rate needs a fresh offer rather than an acceptance', () => {
    const s = negotiation([offer('VENDOR', 9000, 1), decline('CANDIDATE', 2)])
    expect(mayMove(s, 'VENDOR', 'ACCEPT').reason).toMatch(/somebody has to make a fresh offer/i)
  })

  it('ignores an offer with no figure on it rather than blanking the live one', () => {
    const s = negotiation([offer('VENDOR', 9000, 1), { at: t(2), by: 'CANDIDATE', move: 'OFFER', cents: null }])
    expect(s.liveCents).toBe(9000)
  })
})

describe('the message everybody in the thread reads', () => {
  it('is in the third person, because "you countered" is wrong for every reader but one', () => {
    expect(messageFor(offer('CANDIDATE', 10500, 1), 'Ravi Patel')).toBe('Ravi Patel proposed $105/hr.')
    expect(messageFor(accept('VENDOR', 2), 'Cloudepa')).toBe('Cloudepa accepted.')
    expect(messageFor(decline('CANDIDATE', 2), 'Ravi Patel')).toBe('Ravi Patel declined this rate.')
  })

  it('drops trailing zeroes but keeps real cents', () => {
    expect(messageFor(offer('VENDOR', 9000, 1), 'X')).toContain('$90/hr')
    expect(messageFor(offer('VENDOR', 9250, 1), 'X')).toContain('$92.50/hr')
  })
})
