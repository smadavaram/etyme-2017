/**
 * What happens after the ladder runs out.
 *
 * Four automated letters and then a person — and then, in most systems,
 * nothing at all. A debt that reaches the end of an automated process and
 * is owned by nobody is not being collected. It is being aged.
 */

import { describe, it, expect } from 'vitest'
import {
  collectionStage, canFactor, checkWriteOff,
  STOP_WORK_SHARE_BPS, type CollectionCase,
} from '@/lib/ar-ageing'

const NOW = new Date('2026-08-29T00:00:00Z')

function caseOf(over: Partial<CollectionCase> = {}): CollectionCase {
  return {
    customerId: 'c-nike',
    customerName: 'Nike Inc',
    currency: 'USD',
    overdueMinor: 4_000_000,
    oldestDaysOverdue: 75,
    disputedMinor: 0,
    exposureMinor: 40_000_000,
    laddersSent: ['COURTESY', 'FIRST', 'SECOND', 'FINAL', 'ESCALATED'],
    ownerName: null,
    promise: null,
    brokenPromises: 0,
    ...over,
  }
}

describe('The ladder stops, and then somebody has to own it', () => {
  it('while the ladder still has rungs, collections leaves it alone', () => {
    const v = collectionStage(caseOf({ laddersSent: ['COURTESY', 'FIRST'], oldestDaysOverdue: 20 }), NOW)
    expect(v.stage).toBe('IN_LADDER')
    expect(v.silenceTheLadder).toBe(false)
  })

  it('a debt past the last letter with nobody on it is named as unowned, not left quiet', () => {
    const v = collectionStage(caseOf(), NOW)
    expect(v.stage).toBe('UNOWNED')
    expect(v.hasOwner).toBe(false)
    expect(v.says).toContain('not being collected, it is being aged')
  })

  it('past the last automated letter a named person owns the debt, and the ladder stops', () => {
    const v = collectionStage(caseOf({ ownerName: 'Ravi Menon' }), NOW)
    expect(v.stage).toBe('OWNED')
    expect(v.hasOwner).toBe(true)
    expect(v.silenceTheLadder).toBe(true)
    expect(v.says).toContain('two voices on the same debt')
  })
})

describe('A promise is a date, or it is not a promise', () => {
  it('a promise to pay silences the chase until the day it was promised for', () => {
    const v = collectionStage(
      caseOf({
        ownerName: 'Ravi Menon',
        promise: {
          amountMinor: 4_000_000,
          promisedFor: new Date('2026-09-05T00:00:00Z'),
          by: 'Anita in AP',
          madeAt: new Date('2026-08-27T00:00:00Z'),
        },
      }),
      NOW
    )
    expect(v.stage).toBe('PROMISED')
    expect(v.silenceTheLadder).toBe(true)
    expect(v.recommendStopWork).toBe(false)
    expect(v.says).toContain('7 days')
  })

  it('a promise that passed with no money is a broken promise and escalates a rung', () => {
    const v = collectionStage(
      caseOf({
        ownerName: 'Ravi Menon',
        promise: {
          amountMinor: 4_000_000,
          promisedFor: new Date('2026-08-22T00:00:00Z'),
          by: 'Anita in AP',
          madeAt: new Date('2026-08-10T00:00:00Z'),
        },
      }),
      NOW
    )
    expect(v.stage).toBe('PROMISE_BROKEN')
    expect(v.action).toContain('7 days past')
    expect(v.says).toContain('fact about the account')
  })

  it('a second broken promise recommends stopping work rather than sending a sixth letter', () => {
    const v = collectionStage(
      caseOf({
        ownerName: 'Ravi Menon',
        brokenPromises: 2,
        promise: {
          amountMinor: 1_000_000,
          promisedFor: new Date('2026-08-22T00:00:00Z'),
          by: 'Anita in AP',
          madeAt: new Date('2026-08-10T00:00:00Z'),
        },
      }),
      NOW
    )
    expect(v.recommendStopWork).toBe(true)
    expect(v.says).toContain('a decision somebody should take deliberately')
  })
})

describe('Stopping work is arithmetic, and it is still a recommendation', () => {
  it('stopping work is recommended and never done automatically, because people are on site', () => {
    const v = collectionStage(
      caseOf({ ownerName: 'Ravi Menon', overdueMinor: 25_000_000, exposureMinor: 40_000_000 }),
      NOW
    )
    expect(v.stage).toBe('STOP_WORK_ADVISED')
    expect(v.recommendStopWork).toBe(true)
    expect(v.says).toContain('recommendation and nothing more')
    expect(v.says).toContain('people on site')
  })

  it('the threshold is half of everything at stake, and the working is shown', () => {
    expect(STOP_WORK_SHARE_BPS).toBe(5_000)
    const under = collectionStage(
      caseOf({ ownerName: 'R', overdueMinor: 19_000_000, exposureMinor: 40_000_000 }),
      NOW
    )
    expect(under.recommendStopWork).toBe(false)
    const over = collectionStage(
      caseOf({ ownerName: 'R', overdueMinor: 21_000_000, exposureMinor: 40_000_000 }),
      NOW
    )
    expect(over.recommendStopWork).toBe(true)
    expect(over.says).toContain('53%')
  })
})

describe('Selling a debt, and giving up on one', () => {
  it('factoring is offered only where the debt is undisputed, because a factor will not buy an argument', () => {
    const clean = canFactor({ overdueMinor: 4_000_000, disputedMinor: 0, oldestDaysOverdue: 75 })
    expect(clean.ok).toBe(true)

    const argued = canFactor({ overdueMinor: 4_000_000, disputedMinor: 200_000, oldestDaysOverdue: 75 })
    expect(argued.ok).toBe(false)
    expect(argued.says).toContain('turns a quiet argument into a formal one')
  })

  it('a debt too old to advance against is refused with the reason', () => {
    const old = canFactor({ overdueMinor: 4_000_000, disputedMinor: 0, oldestDaysOverdue: 200 })
    expect(old.ok).toBe(false)
    expect(old.says).toContain('collection work rather than as an advance')
  })

  it('a debt written off names the reason and the person, and never disappears quietly', () => {
    const anonymous = checkWriteOff({
      amountMinor: 4_000_000,
      reason: 'CUSTOMER_INSOLVENT',
      byPersonId: null,
    })
    expect(anonymous.ok).toBe(false)
    expect(anonymous.problems[0]).toContain('indistinguishable from a fraud')

    const proper = checkWriteOff({
      amountMinor: 4_000_000,
      reason: 'CUSTOMER_INSOLVENT',
      byPersonId: 'p-1',
    })
    expect(proper.ok).toBe(true)
    expect(proper.says).toContain('gone under')
  })

  it('writing something off as uneconomic has to say what was actually tried', () => {
    const lazy = checkWriteOff({
      amountMinor: 40_000,
      reason: 'UNECONOMIC_TO_PURSUE',
      byPersonId: 'p-1',
    })
    expect(lazy.ok).toBe(false)
    expect(lazy.problems[0]).toContain('they gave up')

    const said = checkWriteOff({
      amountMinor: 40_000,
      reason: 'UNECONOMIC_TO_PURSUE',
      byPersonId: 'p-1',
      note: 'Four calls, two letters and a solicitor quote of twice the balance.',
    })
    expect(said.ok).toBe(true)
  })
})
