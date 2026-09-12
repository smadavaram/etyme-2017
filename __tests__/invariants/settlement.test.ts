/**
 * Closing an order.
 *
 * An order is a temporary pot. It opens when work starts, it accumulates,
 * and at the end its balance has to go somewhere — because a project that
 * has finished should not still be carrying a result nobody owns.
 */

import { describe, it, expect } from 'vitest'
import {
  settlementPlan, settlementBalances, mayPostTo, resultOf,
  type Posting, type SettlementInput,
} from '@/lib/order'

const CLOSING = new Date('2026-08-31T00:00:00Z')

function posting(over: Partial<Posting> = {}): Posting {
  return {
    id: 'p1',
    kind: 'REVENUE',
    amountCents: 1_000_000,
    postedAt: new Date('2026-08-15T00:00:00Z'),
    says: 'Hours approved',
    currency: 'USD',
    ...over,
  }
}

function input(over: Partial<SettlementInput> = {}): SettlementInput {
  return {
    status: 'OPEN',
    settlesToCode: 'MFG-FIN-4100',
    settlesToName: 'Delivery — Bangalore',
    currency: 'USD',
    postings: [
      posting({ id: 'a', kind: 'REVENUE', amountCents: 1_000_000 }),
      posting({ id: 'b', kind: 'PAY', amountCents: -700_000 }),
      posting({ id: 'c', kind: 'BURDEN', amountCents: -100_000 }),
    ],
    closingOn: CLOSING,
    ...over,
  }
}

describe('The balance leaves in a matched pair', () => {
  it('settling an order moves its whole balance to the cost centre in a matched pair of postings', () => {
    const plan = settlementPlan(input())
    expect(plan.ok).toBe(true)
    expect(plan.balanceCents).toBe(200_000)
    expect(plan.postings).toHaveLength(2)
    expect(plan.postings.map((p) => p.leg)).toEqual(['OUT_OF_ORDER', 'INTO_COST_CENTRE'])
    expect(plan.says).toContain('Delivery — Bangalore')
  })

  it('the two settlement postings are equal and opposite, so nothing is created or destroyed', () => {
    const plan = settlementPlan(input())
    expect(settlementBalances(plan.postings)).toBe(true)
    expect(plan.postings[0].amountCents).toBe(-plan.postings[1].amountCents)
  })

  it('an order running at a loss settles the shortfall the same way', () => {
    const plan = settlementPlan(
      input({
        postings: [
          posting({ id: 'a', kind: 'REVENUE', amountCents: 500_000 }),
          posting({ id: 'b', kind: 'PAY', amountCents: -900_000 }),
        ],
      })
    )
    expect(plan.balanceCents).toBe(-400_000)
    expect(settlementBalances(plan.postings)).toBe(true)
    expect(plan.says).toContain('shortfall')
  })

  it('the balance settled is exactly what the order reports as its net result', () => {
    const i = input()
    expect(settlementPlan(i).balanceCents).toBe(resultOf(i.postings).netCents)
  })

  it('the settlement is dated to the period being closed, not the day somebody ran it', () => {
    const plan = settlementPlan(input())
    expect(plan.postedAt).toEqual(CLOSING)
    expect(plan.says).toContain('not the day')
  })
})

describe('What it refuses', () => {
  it('an order with no cost centre to settle to refuses to settle', () => {
    const plan = settlementPlan(input({ settlesToCode: null, settlesToName: null }))
    expect(plan.ok).toBe(false)
    expect(plan.refusal).toBe('NO_COST_CENTRE')
    expect(plan.postings).toEqual([])
    expect(plan.says).toContain('a result nobody owns')
  })

  it('an order already settled refuses to settle twice', () => {
    const plan = settlementPlan(input({ status: 'SETTLED' }))
    expect(plan.ok).toBe(false)
    expect(plan.refusal).toBe('ALREADY_SETTLED')
    expect(plan.says).toContain('already reported')
  })

  it('an order that nets to nothing writes no postings at all', () => {
    const plan = settlementPlan(
      input({
        postings: [
          posting({ id: 'a', kind: 'REVENUE', amountCents: 500_000 }),
          posting({ id: 'b', kind: 'PAY', amountCents: -500_000 }),
        ],
      })
    )
    expect(plan.ok).toBe(false)
    expect(plan.refusal).toBe('NOTHING_TO_MOVE')
    expect(plan.says).toContain('noise in the ledger')
  })
})

describe('Locked is the state a finance team actually operates in', () => {
  it('a locked order takes corrections but no new postings', () => {
    expect(mayPostTo('LOCKED', 'CORRECTION').allowed).toBe(true)
    expect(mayPostTo('LOCKED', 'NEW_WORK').allowed).toBe(false)
    expect(mayPostTo('LOCKED', 'NEW_WORK').says).toContain('does not post to a closed month')
  })

  it('a settled order refuses everything', () => {
    expect(mayPostTo('SETTLED', 'CORRECTION').allowed).toBe(false)
    expect(mayPostTo('SETTLED', 'NEW_WORK').allowed).toBe(false)
    expect(mayPostTo('SETTLED', 'CORRECTION').says).toContain('left the building')
  })

  it('an open order takes both', () => {
    expect(mayPostTo('OPEN', 'NEW_WORK').allowed).toBe(true)
    expect(mayPostTo('OPEN', 'CORRECTION').allowed).toBe(true)
  })

  it('a locked order can still be settled — locking is not the end of the project', () => {
    const plan = settlementPlan(input({ status: 'LOCKED' }))
    expect(plan.ok).toBe(true)
  })
})
