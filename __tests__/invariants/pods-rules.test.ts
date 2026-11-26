import { describe, it, expect } from 'vitest'
import { rosterRule, pricingRule, deliverableState, fulfilled, amountsRule, roleRoom, isHeadcount } from '@/lib/pods'

describe('who may be on a project team', () => {
  it('the firm’s own employee may join, and is told rather than asked', () => {
    expect(rosterRule({ name: 'Ada', employee: true, listing: null })).toEqual({ ok: true, kind: 'EMPLOYEE' })
  })
  it('a person on the firm’s bench who granted her listing may join', () => {
    expect(rosterRule({ name: 'Bram', employee: false, listing: { state: 'GRANTED', revokedAt: null } })).toEqual({ ok: true, kind: 'BENCH' })
  })
  it('a stranger the firm neither employs nor lists is refused, and the reason is named', () => {
    const r = rosterRule({ name: 'Cleo', employee: false, listing: null })
    expect(r).toEqual({ ok: false, says: 'Cleo is not on your bench and does not work for you, so she cannot join a team.' })
  })
  it('somebody who took her listing back is refused', () => {
    const r = rosterRule({ name: 'Dev', employee: false, listing: { state: 'GRANTED', revokedAt: new Date() } })
    expect(r.ok).toBe(false)
    expect((r as any).says).toContain('took her bench listing back')
  })
  it('somebody asked onto the bench who has not answered is refused', () => {
    const r = rosterRule({ name: 'Eli', employee: false, listing: { state: 'INVITED', revokedAt: null } })
    expect((r as any).says).toContain('has not said yes')
  })
  it('somebody who declined the bench is refused', () => {
    const r = rosterRule({ name: 'Fay', employee: false, listing: { state: 'DECLINED', revokedAt: null } })
    expect((r as any).says).toContain('did not say yes')
  })
})

describe('how a team is priced', () => {
  it('a sprint price needs a price and a number of weeks', () => {
    expect(pricingRule({ pricing: 'SPRINT_PRICE', roles: [] })).toMatch(/needs the price/)
    expect(pricingRule({ pricing: 'SPRINT_PRICE', sprintPriceCents: 500000, roles: [] })).toMatch(/number of weeks/)
    expect(pricingRule({ pricing: 'SPRINT_PRICE', sprintPriceCents: 500000, sprintWeeks: 6, roles: [] })).toBeNull()
  })
  it('a sprint price in fractions of a cent, or zero, or negative, is refused', () => {
    for (const p of [0, -100, 10.5]) expect(pricingRule({ pricing: 'SPRINT_PRICE', sprintPriceCents: p, sprintWeeks: 4, roles: [] })).toMatch(/whole cents/)
  })
  it('a sprint of zero weeks is refused', () => {
    expect(pricingRule({ pricing: 'SPRINT_PRICE', sprintPriceCents: 100, sprintWeeks: 0, roles: [] })).toMatch(/weeks/)
  })
  it('a rate card needs a rate on every role, and names the role without one', () => {
    expect(pricingRule({ pricing: 'RATE_CARD', roles: [{ title: 'Lead', rateCents: 9000 }, { title: 'Analyst', rateCents: null }] })).toBe('The role Analyst needs a rate, in whole cents, above zero.')
    expect(pricingRule({ pricing: 'RATE_CARD', roles: [{ title: 'Lead', rateCents: 9000 }] })).toBeNull()
  })
  it('any other way of pricing is refused', () => {
    expect(pricingRule({ pricing: 'GUESS', roles: [] })).toBe('Choose a sprint price or a rate card.')
  })
})

describe('where a deliverable stands', () => {
  it('a pending deliverable with no start is planned', () => {
    expect(deliverableState({ status: 'PENDING' }, null)).toEqual({ state: 'planned', reason: null })
  })
  it('a pending deliverable that has started is in progress', () => {
    expect(deliverableState({ status: 'PENDING' }, new Date())?.state).toBe('in progress')
  })
  it('a delivered deliverable is submitted', () => {
    expect(deliverableState({ status: 'DELIVERED' }, new Date())?.state).toBe('submitted')
  })
  it('an accepted or invoiced deliverable is accepted', () => {
    expect(deliverableState({ status: 'ACCEPTED' }, null)?.state).toBe('accepted')
    expect(deliverableState({ status: 'INVOICED' }, null)?.state).toBe('accepted')
  })
  it('a rejected deliverable is rejected and carries its reason', () => {
    expect(deliverableState({ status: 'REJECTED', rejectionReason: 'Tests missing' }, null)).toEqual({ state: 'rejected', reason: 'Tests missing' })
  })
  it('a status the rule does not know reads as nothing, never a guess', () => {
    expect(deliverableState({ status: 'ODD' }, null)).toBeNull()
  })
})

describe('when a project is fulfilled', () => {
  it('a project with no deliverables is not fulfilled', () => {
    expect(fulfilled([])).toBe(false)
  })
  it('a project is fulfilled when every deliverable is accepted', () => {
    expect(fulfilled(['accepted', 'accepted'])).toBe(true)
  })
  it('one deliverable not yet accepted keeps the project open', () => {
    expect(fulfilled(['accepted', 'submitted'])).toBe(false)
    expect(fulfilled(['accepted', 'rejected'])).toBe(false)
    expect(fulfilled(['accepted', 'cancelled'])).toBe(false)
    expect(fulfilled(['accepted', null])).toBe(false)
  })
})

describe('what a fixed price is made of', () => {
  it('deliverable amounts that add up exactly to the price pass', () => {
    expect(amountsRule(1000000, [400000, 350000, 250000])).toBeNull()
  })
  it('amounts one cent short or over are refused, with both totals named', () => {
    expect(amountsRule(1000000, [400000, 599999])).toContain('999999 cents, and the price is 1000000 cents')
    expect(amountsRule(1000000, [400000, 600001])).toContain('1000001')
  })
  it('a sale with no deliverables, or an amount that is not whole cents, is refused', () => {
    expect(amountsRule(100, [])).toBe('Add at least one deliverable.')
    expect(amountsRule(100, [50.5, 49.5])).toMatch(/whole cents/)
    expect(amountsRule(100, [0, 100])).toMatch(/whole cents/)
  })
})

describe('how many people a role takes', () => {
  it('a role with room takes another member', () => {
    expect(roleRoom({ title: 'Lead', headcount: 2 }, 1)).toBeNull()
  })
  it('a full role refuses another member and says to raise its headcount', () => {
    expect(roleRoom({ title: 'Lead', headcount: 1 }, 1)).toBe('The role Lead is full: 1 person already. Raise its headcount first.')
  })
  it('a headcount is a whole number of people, one or more', () => {
    expect([1, 3].every(isHeadcount)).toBe(true)
    expect([0, -1, 1.5, '2', null].some(isHeadcount)).toBe(false)
  })
})
