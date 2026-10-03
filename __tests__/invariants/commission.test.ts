import { describe, it, expect } from 'vitest'
import { commissionFor } from '@/lib/commission'

/**
 * What a commission agent is owed. Four models on the schema since the
 * buy contract was designed; nothing ever computed a figure.
 */

const base = { capCents: null, alreadyCents: 0, hours: 0, marginCents: 0, placementsStarted: 0 }

describe('the four commission models', () => {
  it('per hour: cents times the hours approved on the linked contracts', () => {
    expect(commissionFor({ ...base, type: 'PER_HOUR', rate: 300, hours: 160 })).toMatchObject({ amountCents: 48_000, says: '$480.00: 160 hours at $3.00 an hour.' })
  })
  it('fixed per period: the amount, once', () => {
    expect(commissionFor({ ...base, type: 'FIXED_PER_PERIOD', rate: 150_000 }).amountCents).toBe(150_000)
  })
  it('on placement: the fee once per contract that started in the period', () => {
    expect(commissionFor({ ...base, type: 'ON_PLACEMENT', rate: 500_000, placementsStarted: 2 })).toMatchObject({ amountCents: 1_000_000, says: '$10,000.00: 2 placements at $5,000.00.' })
    expect(commissionFor({ ...base, type: 'ON_PLACEMENT', rate: 500_000, placementsStarted: 0 }).says).toBe('Nothing earned: 0 placements at $5,000.00.')
  })
  it('margin share: basis points of bill minus pay times hours', () => {
    expect(commissionFor({ ...base, type: 'MARGIN_SHARE', rate: 2500, marginCents: 400_000 })).toMatchObject({ amountCents: 100_000, says: '$1,000.00: 25.00% of $4,000.00 margin.' })
  })
})

describe('the cap', () => {
  it('pays what is left under the cap, says so, and pays nothing once it is reached', () => {
    const r = commissionFor({ ...base, type: 'PER_HOUR', rate: 300, hours: 160, capCents: 40_000, alreadyCents: 10_000 })
    expect(r).toMatchObject({ earnedCents: 48_000, amountCents: 30_000, capped: true })
    expect(r.says).toBe('$300.00 of $480.00 earned (160 hours at $3.00 an hour); the $400.00 cap is reached.')
    expect(commissionFor({ ...base, type: 'PER_HOUR', rate: 300, hours: 160, capCents: 40_000, alreadyCents: 40_000 }).amountCents).toBe(0)
  })
  it('a contract with no model earns nothing and says so', () => {
    expect(commissionFor({ ...base, type: 'NONE', rate: 0 }).says).toBe('No commission model on this contract.')
  })
})
