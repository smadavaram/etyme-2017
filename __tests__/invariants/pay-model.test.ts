/**
 * How a consultant is actually paid.
 *
 * The 2019 sheet had two columns, rate/hr and salary/hr, and nothing said
 * that many of the pairs were exact percentages — 60/45, 62/46.50,
 * 67/50.25, 68/54.40. Those were profit shares wearing an hourly
 * disguise. Because that was not recorded, nobody could say who should
 * absorb a green card, or why somebody's pay moved when the bill rate did.
 */

import { describe, it, expect } from 'vitest'
import {
  payFor, absorbsOwnCosts, mustSeeBillRate, looksLikeShare, ownPayView,
} from '@/lib/pay-model'

describe('A consultant on a fixed wage is paid their rate, whatever the client pays', () => {

  it('pays the agreed rate for the hours worked', () => {
    const p = payFor({
      model: 'FIXED_HOURLY', fixedRateCents: 4_500, hours: 160, billRateCents: 6_000,
    })
    expect(p.payCents).toBe(720_000)
  })

  it('does not change when the bill rate changes', () => {
    const low = payFor({ model: 'FIXED_HOURLY', fixedRateCents: 4_500, hours: 160, billRateCents: 6_000 })
    const high = payFor({ model: 'FIXED_HOURLY', fixedRateCents: 4_500, hours: 160, billRateCents: 9_000 })
    expect(low.payCents).toBe(high.payCents)
  })

  it('does not carry their own costs — the firm does', () => {
    const p = payFor({
      model: 'FIXED_HOURLY', fixedRateCents: 4_500, hours: 160,
      billRateCents: 6_000, personalCostCents: 1_200_000,
    })
    expect(p.payCents).toBe(720_000)
    expect(p.deductedCents).toBe(0)
    expect(p.firmCarriedCents).toBe(1_200_000)
  })

  it('has no claim on seeing the bill rate, because their pay does not depend on it', () => {
    expect(mustSeeBillRate('FIXED_HOURLY')).toBe(false)
  })
})

describe('A consultant on a share of the bill follows the bill rate', () => {

  it('75% of a $60 bill rate is $45, which is what the sheet actually recorded', () => {
    const p = payFor({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 6_000 })
    expect(p.effectiveRateCents).toBe(4_500)
    expect(p.payCents).toBe(720_000)
  })

  it('their pay moves when the client rate moves, without anybody retyping it', () => {
    const before = payFor({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 6_000 })
    const after = payFor({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 6_800 })
    expect(after.payCents).toBeGreaterThan(before.payCents)
    expect(after.effectiveRateCents).toBe(5_100)
  })

  it('must be able to see the bill rate their share is worked out from', () => {
    // Otherwise they are taking a percentage of a number they cannot
    // check, which is the thing consultants leave over.
    expect(payFor({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 1, billRateCents: 6_000 }).mustSeeBillRate).toBe(true)
  })

  it('shows the working, the way a payslip runs gross to net', () => {
    const p = payFor({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 6_000 })
    expect(p.working).toEqual([
      'Client billed $9,600.00 for 160 hours at $60.00.',
      'Your share is 75% of that — $7,200.00.',
    ])
  })
})

describe('A consultant on a share takes the hit on their own costs', () => {

  it('a green card comes out of their share, not the firm', () => {
    const p = payFor({
      model: 'SHARE_OF_BILL_LESS_COSTS', shareBps: 7_500, hours: 160,
      billRateCents: 6_000, personalCostCents: 100_000,
    })
    expect(p.payCents).toBe(720_000 - 100_000)
    expect(p.deductedCents).toBe(100_000)
    expect(p.firmCarriedCents).toBe(0)
  })

  it('the same filing on a fixed-pay consultant is the firm’s cost', () => {
    expect(absorbsOwnCosts('FIXED_HOURLY')).toBe(false)
    expect(absorbsOwnCosts('SHARE_OF_BILL')).toBe(true)
    expect(absorbsOwnCosts('SHARE_OF_MARGIN')).toBe(true)
    expect(absorbsOwnCosts('SHARE_OF_BILL_LESS_COSTS')).toBe(true)
  })

  it('never produces a negative payslip', () => {
    // A filing fee larger than a month's share leaves nothing to pay. It
    // does not become a debt collected from a payslip.
    const p = payFor({
      model: 'SHARE_OF_BILL_LESS_COSTS', shareBps: 7_500, hours: 8,
      billRateCents: 6_000, personalCostCents: 1_200_000,
    })
    expect(p.payCents).toBe(0)
  })

  it('says what could not come out of this period rather than hiding it', () => {
    const p = payFor({
      model: 'SHARE_OF_BILL_LESS_COSTS', shareBps: 7_500, hours: 8,
      billRateCents: 6_000, personalCostCents: 1_200_000,
    })
    expect(p.working.join(' ')).toContain('carries to the next one')
  })
})

describe('A consultant on a share of the margin is paid on what is left', () => {

  it('takes burden and costs off before working out the share', () => {
    const p = payFor({
      model: 'SHARE_OF_MARGIN', shareBps: 7_500, hours: 160, billRateCents: 6_000,
      burdenCents: 100_000, personalCostCents: 50_000,
    })
    expect(p.payCents).toBe(Math.round((960_000 - 100_000 - 50_000) * 0.75))
  })

  it('shows every deduction as its own line', () => {
    const p = payFor({
      model: 'SHARE_OF_MARGIN', shareBps: 7_500, hours: 160, billRateCents: 6_000,
      burdenCents: 100_000, personalCostCents: 50_000, otherCostCents: 20_000,
    })
    expect(p.working).toHaveLength(5)
    expect(p.working[1]).toBe('Less $1,000.00 of employer costs.')
  })

  it('pays nothing rather than a negative where the deal lost money', () => {
    const p = payFor({
      model: 'SHARE_OF_MARGIN', shareBps: 7_500, hours: 160, billRateCents: 6_000,
      burdenCents: 2_000_000,
    })
    expect(p.payCents).toBe(0)
  })
})

describe('A rate pair that is really a percentage is offered as one', () => {

  it('spots the sheet’s own 75% pairs', () => {
    expect(looksLikeShare(6_000, 4_500)?.bps).toBe(7_500)
    expect(looksLikeShare(6_200, 4_650)?.bps).toBe(7_500)
    expect(looksLikeShare(6_700, 5_025)?.bps).toBe(7_500)
  })

  it('spots the 80% ones too', () => {
    expect(looksLikeShare(6_800, 5_440)?.bps).toBe(8_000)
    expect(looksLikeShare(6_000, 4_800)?.bps).toBe(8_000)
  })

  it('spots the 70% ones as well', () => {
    // 40.39 against 57.70 is exactly 70%. Reading down the sheet it looks
    // like a negotiated rate, which is the whole problem.
    expect(looksLikeShare(5_770, 4_039)?.bps).toBe(7_000)
    expect(looksLikeShare(5_000, 3_500)?.bps).toBe(7_000)
  })

  it('leaves a genuinely negotiated rate alone', () => {
    // 62 against 38 is 61.29%. Nobody agrees a share at 61.29%.
    expect(looksLikeShare(6_200, 3_800)).toBeNull()
    expect(looksLikeShare(6_000, 4_233)).toBeNull()
  })

  it('ignores a ratio too low to be anybody’s share of a deal', () => {
    // 80 against 35 is 43.75%. That is a rate, or a very unusual deal.
    expect(looksLikeShare(8_000, 3_500)).toBeNull()
  })

  it('explains why it is worth recording as a share', () => {
    expect(looksLikeShare(6_000, 4_500)?.says).toContain(
      'instead of being retyped every time it moves'
    )
  })
})

// ── What a consultant may see of their own deal ─────────────────────

describe('A consultant paid a percentage can see the number it is a percentage of', () => {

  it('shows a share consultant their own bill rate and the arithmetic', () => {
    const v = ownPayView({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 6_000 })
    expect(v.billRateCents).toBe(6_000)
    expect(v.working).toHaveLength(2)
  })

  it('does not show it to a consultant on an agreed hourly rate', () => {
    const v = ownPayView({ model: 'FIXED_HOURLY', fixedRateCents: 4_500, hours: 160, billRateCents: 6_000 })
    expect(v.billRateCents).toBeNull()
  })

  it('says why either way, rather than leaving a blank to be read into', () => {
    const share = ownPayView({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 6_000 })
    const fixed = ownPayView({ model: 'FIXED_HOURLY', fixedRateCents: 4_500, hours: 160, billRateCents: 6_000 })
    expect(share.whyVisible).toContain('share of what the client is billed')
    expect(fixed.whyVisible).toContain('does not depend on')
  })

  it('is their own assignment only, and says so', () => {
    // The rule opens one rate to one person. It is not a window onto the
    // firm's book.
    const v = ownPayView({ model: 'SHARE_OF_MARGIN', shareBps: 7_500, hours: 160, billRateCents: 6_000 })
    expect(v.whyVisible).toContain('never see anybody else')
  })
})
