/**
 * The bench, four ways.
 *
 * All four of these are how real staffing firms operate. Building any one
 * of them into the product would make it a product for whoever happened
 * to run it that way, so the firm configures and this works out what it
 * costs.
 *
 * The old spreadsheet had "Indian salary", "Rental" and "Guest house" at
 * the bottom of the page, unallocated — people were being carried and
 * housed between projects and none of it reached a consultant's line.
 */

import { describe, it, expect } from 'vitest'
import { benchCost, holdBack, onExit, type Policy } from '@/lib/bench-policy'

const DAY = 45_000 // $450 a day, a $56/hr consultant

describe('No bill, no pay', () => {
  const p: Policy = { policy: 'NO_PAY' }

  it('costs the firm nothing while they sit', () => {
    expect(benchCost(p, { idleDays: 60, billingDayRateCents: DAY }).costCents).toBe(0)
  })

  it('says what it does cost, which is the time to place them again', () => {
    expect(benchCost(p, { idleDays: 60, billingDayRateCents: DAY }).says).toContain(
      'the time to place them again'
    )
  })
})

describe('Full pay, carried for a fixed window', () => {
  const p: Policy = { policy: 'FULL_PAY', carryDays: 90 }

  it('pays them for the working days they sit', () => {
    // Sixty calendar days is about forty-three working ones.
    expect(benchCost(p, { idleDays: 60, billingDayRateCents: DAY }).costCents).toBe(43 * DAY)
  })

  it('stops paying at the carry limit rather than for ever', () => {
    const long = benchCost(p, { idleDays: 200, billingDayRateCents: DAY })
    const atLimit = benchCost(p, { idleDays: 90, billingDayRateCents: DAY })
    expect(long.costCents).toBe(atLimit.costCents)
  })

  it('flags somebody past the limit, because a decision is now overdue', () => {
    const r = benchCost(p, { idleDays: 120, billingDayRateCents: DAY })
    expect(r.dueForRelease).toBe(true)
    expect(r.says).toContain('due to be released or placed')
  })

  it('warns before the limit rather than at it', () => {
    const r = benchCost(p, { idleDays: 80, billingDayRateCents: DAY })
    expect(r.daysLeft).toBe(10)
    expect(r.says).toContain('10 days left')
  })

  it('counts housing, which appeared on no invoice and no consultant line', () => {
    const r = benchCost(p, { idleDays: 30, billingDayRateCents: DAY, housingPerDayCents: 5_000 })
    expect(r.costCents).toBe(21 * DAY + 30 * 5_000)
  })
})

describe('A reduced holding rate', () => {
  const p: Policy = { policy: 'REDUCED_RATE', benchRateBps: 4_000 }

  it('pays 40% of what they earn when billing', () => {
    expect(benchCost(p, { idleDays: 30, billingDayRateCents: DAY }).costCents).toBe(
      Math.round(21 * DAY * 0.4)
    )
  })
})

describe('A bench funded from the consultant’s own reserve', () => {
  const p: Policy = { policy: 'RESERVE_FUNDED', reserveBps: 1_000 }

  it('holds back a tenth of each share while they are billing', () => {
    expect(holdBack(p, 720_000)).toBe(72_000)
  })

  it('holds back nothing at all under any other policy', () => {
    // A consultant on a different policy must never see a deduction
    // nobody told them about.
    expect(holdBack({ policy: 'FULL_PAY' }, 720_000)).toBe(0)
    expect(holdBack({ policy: 'NO_PAY' }, 720_000)).toBe(0)
  })

  it('pays the bench out of their pot, not the firm’s money', () => {
    const r = benchCost(p, { idleDays: 20, billingDayRateCents: DAY, reserveCents: 900_000 })
    expect(r.fromReserveCents).toBe(r.costCents)
    expect(r.fromFirmCents).toBe(0)
  })

  it('stops when the pot runs out rather than billing the firm', () => {
    const r = benchCost(p, { idleDays: 200, billingDayRateCents: DAY, reserveCents: 300_000 })
    expect(r.costCents).toBe(300_000)
    expect(r.reserveLeftCents).toBe(0)
  })

  it('shows what is left in the pot', () => {
    const r = benchCost(p, { idleDays: 10, billingDayRateCents: DAY, reserveCents: 900_000 })
    expect(r.reserveLeftCents).toBe(900_000 - 7 * DAY)
  })
})

describe('What happens to an unspent reserve when somebody leaves', () => {

  it('paid out, where the firm treats it as their money held back', () => {
    const r = onExit({ policy: 'RESERVE_FUNDED', reserveOnExit: 'PAY_OUT' }, 800_000, 'RESIGNED')
    expect(r.payOutCents).toBe(800_000)
    expect(r.says).toContain('It was their money held back.')
  })

  it('kept, where the terms make it a contribution to a shared fund', () => {
    const r = onExit({ policy: 'RESERVE_FUNDED', reserveOnExit: 'COMPANY_KEEPS' }, 800_000, 'RESIGNED')
    expect(r.keptByFirmCents).toBe(800_000)
    expect(r.payOutCents).toBe(0)
  })

  it('paid out where the assignment ended, under a reason-based rule', () => {
    const p: Policy = { policy: 'RESERVE_FUNDED', reserveOnExit: 'DEPENDS_ON_REASON' }
    expect(onExit(p, 800_000, 'PROJECT_ENDED').payOutCents).toBe(800_000)
    expect(onExit(p, 800_000, 'RELEASED').payOutCents).toBe(800_000)
  })

  it('forfeited where they walked mid-contract, and says to expect a challenge', () => {
    const p: Policy = { policy: 'RESERVE_FUNDED', reserveOnExit: 'DEPENDS_ON_REASON' }
    const r = onExit(p, 800_000, 'RESIGNED')
    expect(r.keptByFirmCents).toBe(800_000)
    expect(r.says).toContain('show the reason')
  })

  it('an empty pot is not a decision anybody has to make', () => {
    expect(onExit({ policy: 'RESERVE_FUNDED' }, 0, 'RESIGNED').says).toBe('Nothing in their reserve.')
  })
})
