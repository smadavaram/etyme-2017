import { describe, it, expect } from 'vitest'
import { editionCharge, usageAfterPrepay, runsOwnBusiness, trialOf, isReadOnly, PRICES, USAGE_SAYS } from '@/lib/money/pricing'
import { statementOf } from '@/lib/money/tenant-statement'
import { amount } from '@/lib/money-display'

const D = (s: string) => new Date(s)

describe('what an edition costs', () => {
  it('Starter with 15 contractors is $299.85 a month, never rounded', () => {
    const c = editionCharge('STARTER', 15)!
    expect(c.monthlyCents).toBe(29985)
    expect(amount(c.monthlyCents)).toBe('$299.85')
  })
  it('Starter with 15 contractors is $3,598.20 a year for contractors and $4,598.20 all in', () => {
    const c = editionCharge('STARTER', 15)!
    expect(c.yearlyContractorCents).toBe(359820)
    expect(c.yearAllInCents).toBe(459820)
    expect(amount(c.yearAllInCents)).toBe('$4,598.20')
  })
  it('Starter with 3 contractors comes to $59.97, so the $199 floor sets the month, and $1,000 a year is added', () => {
    const c = editionCharge('STARTER', 3)!
    expect(3 * PRICES.starterUnitCents).toBe(5997)
    expect(c.monthlyCents).toBe(19900)
    expect(c.floorApplied).toBe(true)
    expect(c.platformFeeCents).toBe(100000)
    expect(c.yearAllInCents).toBe(19900 * 12 + 100000)
  })
  it('the Starter platform fee never counts toward the floor', () => {
    const c = editionCharge('STARTER', 0)!
    expect(c.monthlyCents).toBe(19900)
    expect(c.platformFeeCents).toBe(100000)
  })
  it('Starter at 10 contractors is $199.90, just over the floor, so the floor is not applied', () => {
    const c = editionCharge('STARTER', 10)!
    expect(c.monthlyCents).toBe(19990)
    expect(c.floorApplied).toBe(false)
  })
  it('Enterprise with 500 contractors is $120,000 a year before the fee and usage', () => {
    const c = editionCharge('ENTERPRISE', 500)!
    expect(c.monthlyCents).toBe(1000000)
    expect(c.yearlyContractorCents).toBe(12000000)
    expect(amount(c.yearlyContractorCents)).toBe('$120,000.00')
  })
  it('Enterprise adds the $12,000 annual platform fee and has no floor', () => {
    const c = editionCharge('ENTERPRISE', 500)!
    expect(c.platformFeeCents).toBe(1200000)
    expect(c.yearAllInCents).toBe(24000000 / 2 + 1200000)
    expect(editionCharge('ENTERPRISE', 1)!.monthlyCents).toBe(2000)
  })
  it('a free user is charged nothing', () => {
    const c = editionCharge('USER', 40)!
    expect([c.monthlyCents, c.platformFeeCents, c.yearAllInCents]).toEqual([0, 0, 0])
  })
  it('a headcount that is not a whole number of people has no figure', () => {
    expect(editionCharge('STARTER', 2.5)).toBeNull()
    expect(editionCharge('ENTERPRISE', -1)).toBeNull()
    expect(editionCharge('STARTER', Number.NaN)).toBeNull()
  })
})

describe('the discount for paying a year ahead', () => {
  it('takes about 15% off usage only', () => {
    expect(usageAfterPrepay(100000, true)).toBe(85000)
    expect(usageAfterPrepay(100000, false)).toBe(100000)
  })
  it('does not touch the contractor charge or the platform fee', () => {
    const c = editionCharge('STARTER', 15)!
    expect(c.yearAllInCents).toBe(459820)
  })
  it('has no figure while usage is not priced', () => {
    expect(usageAfterPrepay(null, true)).toBeNull()
  })
})

describe('the own-business test', () => {
  it('a tenant with a placement as supplier of record pays', () => expect(runsOwnBusiness(1, 0)).toBe(true))
  it('a tenant with an invoice it issued pays', () => expect(runsOwnBusiness(0, 1)).toBe(true))
  it('a tenant with neither is a free user', () => expect(runsOwnBusiness(0, 0)).toBe(false))
})

describe('the 60-day clock', () => {
  const base = { edition: 'STARTER' as const, paidThrough: null, billingExempt: false }
  const on = D('2026-12-01T15:00:00Z')
  it('the day of activation is day 1', () => {
    expect(trialOf({ ...base, activatedAt: on, now: D('2026-12-01T23:00:00Z') })).toEqual({ state: 'TRIAL', day: 1, daysLeft: 59 })
  })
  it('day 60 is still free', () => {
    const t = trialOf({ ...base, activatedAt: on, now: D('2027-01-29T01:00:00Z') })
    expect(t).toEqual({ state: 'TRIAL', day: 60, daysLeft: 0 })
  })
  it('day 61 unpaid is read-only', () => {
    const t = trialOf({ ...base, activatedAt: on, now: D('2027-01-30T01:00:00Z') })
    expect(t).toEqual({ state: 'UNPAID', day: 61 })
    expect(isReadOnly(t)).toBe(true)
  })
  it('day 61 paid through a later date is not read-only', () => {
    const t = trialOf({ ...base, paidThrough: D('2027-03-01T00:00:00Z'), activatedAt: on, now: D('2027-02-15T00:00:00Z') })
    expect(t.state).toBe('PAID')
    expect(isReadOnly(t)).toBe(false)
  })
  it('a payment that has run out puts the tenant back to read-only', () => {
    const t = trialOf({ ...base, paidThrough: D('2027-02-01T00:00:00Z'), activatedAt: on, now: D('2027-02-15T00:00:00Z') })
    expect(t.state).toBe('UNPAID')
  })
  it('a tenant never activated has no clock and is never read-only', () => {
    const t = trialOf({ ...base, activatedAt: null, now: D('2030-01-01T00:00:00Z') })
    expect(t.state).toBe('NO_CLOCK')
    expect(isReadOnly(t)).toBe(false)
  })
  it('a free user is never on a clock', () => {
    expect(trialOf({ ...base, edition: 'USER', activatedAt: on, now: D('2030-01-01T00:00:00Z') }).state).toBe('FREE_USER')
  })
  it('an internal proving tenant is never locked', () => {
    const t = trialOf({ ...base, billingExempt: true, activatedAt: on, now: D('2030-01-01T00:00:00Z') })
    expect(isReadOnly(t)).toBe(false)
  })
})

describe('a tenant’s own statement', () => {
  const i = { edition: 'STARTER' as const, activatedAt: D('2026-12-01T00:00:00Z'), paidThrough: null, billingExempt: false, annualPrepaid: false, activeContractors: 15, placements: 15, invoices: 2 }
  it('says nothing is due during the trial and what it comes to after', () => {
    const s = statementOf({ ...i, now: D('2026-12-10T00:00:00Z') })
    expect(s.dueMonthlyCents).toBe(0)
    expect(s.says).toContain('Day 10 of 60, free')
    expect(s.says).toContain('$299.85 a month')
  })
  it('owes the month’s charge and says the tenant is read-only on day 61 unpaid', () => {
    const s = statementOf({ ...i, now: D('2027-02-05T00:00:00Z') })
    expect(s.dueMonthlyCents).toBe(29985)
    expect(s.says).toContain('read-only')
  })
  it('a tenant not activated yet owes nothing', () => {
    const s = statementOf({ ...i, activatedAt: null, now: D('2027-06-01T00:00:00Z') })
    expect(s.trial.state).toBe('NO_CLOCK')
    expect(s.dueMonthlyCents).toBe(0)
    expect(s.says).toContain('the 60 days have not started')
  })
  it('prints usage as not priced, never as zero', () => {
    const s = statementOf({ ...i, now: D('2026-12-10T00:00:00Z') })
    expect(s.usage).toEqual({ cents: null, says: USAGE_SAYS })
  })
  it('owes nothing for a free user or an exempt tenant', () => {
    expect(statementOf({ ...i, edition: 'USER', now: D('2027-06-01T00:00:00Z') }).dueMonthlyCents).toBe(0)
    expect(statementOf({ ...i, billingExempt: true, now: D('2027-06-01T00:00:00Z') }).dueMonthlyCents).toBe(0)
  })
  it('carries the own-business count so the tenant sees why it pays', () => {
    expect(statementOf({ ...i, now: D('2026-12-10T00:00:00Z') }).ownBusiness).toEqual({ placements: 15, invoices: 2, pays: true })
  })
})
