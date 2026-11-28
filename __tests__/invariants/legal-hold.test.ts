import { describe, it, expect } from 'vitest'
import {
  liveHoldsOn, isHeld, toldTheSubject, mayHold, mayLift, overdueForReview,
  type Hold,
} from '@/lib/legal-hold'

/**
 * A hold is a row with a reason, a name and a review date. It has to be,
 * because two companies can hold the same person at once and a boolean
 * would let the second company's lift release the first company's hold —
 * which is the exact failure a litigation hold exists to prevent, and it
 * would be invisible.
 */

const now = new Date('2026-09-19T09:00:00Z')

function hold(over: Partial<Hold> = {}): Hold {
  return {
    id: 'h1',
    placedByCompanyId: 'c_talvern',
    placedByCompanyName: 'Talvern Medical',
    subjectPersonId: 'p_anders',
    subjectCompanyId: null,
    reason: 'A wage claim is open and these records are evidence in it.',
    matter: 'LIT-2026-0041',
    placedAt: new Date('2026-08-01T09:00:00Z'),
    reviewBy: new Date('2026-12-01T09:00:00Z'),
    liftedAt: null,
    ...over,
  }
}

describe('a hold bites until whoever placed it lifts it', () => {
  it('a hold placed by one client is not lifted by another', () => {
    const talvern = hold()
    expect(mayLift(talvern, 'c_northbend').ok).toBe(false)
    expect(mayLift(talvern, 'c_northbend').says).toContain('Talvern Medical placed this hold')
    expect(mayLift(talvern, 'c_talvern').ok).toBe(true)
  })

  it('two companies holding one person are two rows, and lifting one leaves the other standing', () => {
    const both = [hold(), hold({ id: 'h2', placedByCompanyId: 'c_northbend', placedByCompanyName: 'Northbend Athletic' })]
    expect(liveHoldsOn(both, { personId: 'p_anders' })).toHaveLength(2)

    const oneLifted = [hold({ liftedAt: new Date('2026-09-10T09:00:00Z') }), both[1]]
    expect(isHeld(oneLifted, { personId: 'p_anders' })).toBe(true)
    expect(liveHoldsOn(oneLifted, { personId: 'p_anders' })).toHaveLength(1)
  })

  it('a hold that has already been lifted cannot be lifted again, and the row stays as the answer to why something was still here', () => {
    const lifted = hold({ liftedAt: new Date('2026-09-10T09:00:00Z') })
    expect(mayLift(lifted, 'c_talvern').ok).toBe(false)
    expect(mayLift(lifted, 'c_talvern').says).toContain('stays on the record')
  })

  it('a hold on one person says nothing about anybody else', () => {
    expect(isHeld([hold()], { personId: 'p_helena' })).toBe(false)
    expect(isHeld([hold()], { personId: 'p_anders' })).toBe(true)
  })

  it('a hold on a company is read off the company and not off a person', () => {
    const own = hold({ subjectPersonId: null, subjectCompanyId: 'c_talvern' })
    expect(isHeld([own], { companyId: 'c_talvern' })).toBe(true)
    expect(isHeld([own], { personId: 'c_talvern' })).toBe(false)
  })
})

describe('what the person is told', () => {
  it('the subject hears the reason and the holder, and never the matter reference', () => {
    const told = toldTheSubject([hold()], { personId: 'p_anders' })
    expect(told.held).toBe(true)
    expect(told.says).toContain('Talvern Medical')
    expect(told.says).toContain('A wage claim is open')
    expect(told.says).not.toContain('LIT-2026-0041')
  })

  it('the subject is told their request stays open and will run by itself, not that it was refused', () => {
    const told = toldTheSubject([hold()], { personId: 'p_anders' })
    expect(told.says).toContain('Nothing has been erased')
    expect(told.says).toContain('stays open')
    expect(told.says).not.toMatch(/refus|denied|reject/i)
  })

  it('two holds are counted out loud, because a person told "a company" would think lifting one ends it', () => {
    const told = toldTheSubject(
      [hold(), hold({ id: 'h2', placedByCompanyId: 'c_northbend', placedByCompanyName: 'Northbend Athletic', reason: 'An audit of 2025 contingent spend is open.' })],
      { personId: 'p_anders' }
    )
    expect(told.says).toContain('2 companies')
    expect(told.reasons).toHaveLength(2)
    expect(told.says).toContain('the last of these is lifted')
  })

  it('a person with no hold on them is told so in a sentence rather than shown an empty box', () => {
    const told = toldTheSubject([], { personId: 'p_helena' })
    expect(told.held).toBe(false)
    expect(told.says.length).toBeGreaterThan(20)
  })
})

describe('who may place one at all', () => {
  it('a company that has engaged somebody may hold them', () => {
    expect(mayHold({ contract: true }).ok).toBe(true)
    expect(mayHold({ listing: true }).ok).toBe(true)
    expect(mayHold({ seat: true }).ok).toBe(true)
    expect(mayHold({ submission: true }).ok).toBe(true)
  })

  it('a company that has never engaged somebody cannot freeze their erasure, and the refusal says why in a sentence', () => {
    const no = mayHold({})
    expect(no.ok).toBe(false)
    expect(no.says).toContain('suspends a person’s erasure everywhere')
    expect(no.says).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('a company may always hold its own records, for an audit of its own books', () => {
    expect(mayHold({ itself: true }).ok).toBe(true)
    expect(mayHold({ itself: true }).says).toContain('its own records')
  })

  it('holding another firm needs an agreement between the two, and the refusal points at the firm that actually holds the records', () => {
    const no = mayHold({}, true)
    expect(no.ok).toBe(false)
    expect(no.says).toContain('the firm that holds the records is the one to place the hold')
  })
})

describe('a hold cannot quietly become permanent', () => {
  it('a hold past its review date is listed for somebody to look at again', () => {
    const due = hold({ reviewBy: new Date('2026-09-01T09:00:00Z') })
    expect(overdueForReview([due], now)).toHaveLength(1)
    expect(overdueForReview([hold()], now)).toEqual([])
  })

  it('a hold that was lifted is never listed for review again', () => {
    const lifted = hold({ reviewBy: new Date('2026-09-01T09:00:00Z'), liftedAt: new Date('2026-09-02T09:00:00Z') })
    expect(overdueForReview([lifted], now)).toEqual([])
  })
})
