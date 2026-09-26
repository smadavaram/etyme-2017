/**
 * The links nobody meant to leave broken.
 *
 * A recruiter's job is closing. The sell side gets raised because it is
 * how the client gets billed; the buy side, which only finance ever looks
 * at, does not. Nothing breaks that day. It breaks at month end, and by
 * then the person who knew what rate was agreed has moved on.
 */

import { describe, it, expect } from 'vitest'
import {
  looseEnd, rank, standing, mayTrustReporting, ageIn, COLD_AFTER_DAYS,
} from '@/lib/loose-ends'

const NOW = new Date('2019-06-15T00:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

const subject = (over: Partial<Parameters<typeof looseEnd>[1]> = {}) => ({
  id: 'c1',
  label: 'Vinay Rao',
  client: 'Wipro',
  amountCents: 960_000,
  since: ago(10),
  ...over,
})

describe('A placement billed with no cost behind it is named, not counted', () => {

  it('says which person, which client, and what to do', () => {
    const e = looseEnd('NO_BUY_CONTRACT', subject(), NOW)
    expect(e.says).toBe('Vinay Rao is billed to Wipro and nothing on record says what they cost.')
    expect(e.fix).toContain('Raise the buy contract')
  })

  it('a zero pay rate is its own finding, because it is not the same mistake', () => {
    const e = looseEnd('NO_PAY_RATE', subject(), NOW)
    expect(e.says).toContain('buy contract with no pay rate on it')
    expect(e.fix).toContain('A zero reads as free labour')
  })

  it('an order earning with nothing costed against it says a hundred per cent is a missing link', () => {
    const e = looseEnd('ORDER_WITHOUT_COST', subject({ label: 'PRJ-0042 — Wipro data platform' }), NOW)
    expect(e.fix).toContain('never good news')
  })

  it('hours approved and never accepted are billed and not costed', () => {
    const e = looseEnd('APPROVED_NEVER_ACCEPTED', subject(), NOW)
    expect(e.says).toContain('billed and not costed')
  })
})

describe('Age is the finding', () => {

  it('counts the days it has been loose', () => {
    expect(ageIn(ago(45), NOW)).toBe(45)
  })

  it('marks a trail cold once nobody is likely to remember the answer', () => {
    expect(COLD_AFTER_DAYS).toBe(90)
    expect(looseEnd('NO_BUY_CONTRACT', subject({ since: ago(89) }), NOW).coldTrail).toBe(false)
    expect(looseEnd('NO_BUY_CONTRACT', subject({ since: ago(90) }), NOW).coldTrail).toBe(true)
  })

  it('sorts worst first, then oldest — not newest first', () => {
    // A new gap is a two-minute fix that will still be a two-minute fix
    // tomorrow. An old one is the one that becomes unanswerable.
    const ends = [
      looseEnd('NO_BUY_CONTRACT', subject({ id: 'new', since: ago(2) }), NOW),
      looseEnd('NO_BUY_CONTRACT', subject({ id: 'old', since: ago(200) }), NOW),
      looseEnd('NO_PROJECT_ORDER', subject({ id: 'breaks', since: ago(1) }), NOW),
    ]
    expect(rank(ends).map((e) => e.subject.id)).toEqual(['breaks', 'old', 'new'])
  })
})

describe('The standing tells somebody whether their numbers can be quoted', () => {

  it('adds up the billing sitting behind a gap', () => {
    const s = standing([
      looseEnd('NO_BUY_CONTRACT', subject({ amountCents: 960_000 }), NOW),
      looseEnd('NO_PAY_RATE', subject({ id: 'b', amountCents: 400_000 }), NOW),
    ])
    expect(s.atRiskCents).toBe(1_360_000)
    expect(s.says).toContain('$13,600.00 of billing with no cost behind it')
  })

  it('names the cold trails separately, because those are the unfixable ones', () => {
    const s = standing([looseEnd('NO_BUY_CONTRACT', subject({ since: ago(200) }), NOW)])
    expect(s.coldTrails).toBe(1)
    expect(s.says).toContain('where nobody may remember the answer')
  })

  it('says so plainly when there is nothing to chase', () => {
    expect(standing([]).says).toBe(
      'Every placement has both sides and an order behind it. Nothing to chase.'
    )
  })
})

describe('A margin figure is refused while the links are broken', () => {

  it('will not vouch for totals with a missing cost behind them', () => {
    const r = mayTrustReporting([looseEnd('NO_BUY_CONTRACT', subject(), NOW)])
    expect(r.ok).toBe(false)
    expect(r.says).toContain('understated on cost')
    expect(r.says).toContain('before quoting a margin')
  })

  it('vouches for them once the list is empty', () => {
    expect(mayTrustReporting([]).ok).toBe(true)
  })
})
