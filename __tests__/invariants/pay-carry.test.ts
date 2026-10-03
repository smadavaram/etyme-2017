/**
 * The carry, and the payment outside the run.
 *
 * `payFor` already said "it carries to the next one rather than being
 * taken from a payslip". It was a sentence and nothing else — no period
 * ever read it, and the firm quietly absorbed a cost the contract says the
 * consultant carries.
 */

import { describe, it, expect } from 'vitest'
import { carryLedger, checkOffCycle, payFor, type CarryPeriod } from '@/lib/pay-model'

function period(over: Partial<CarryPeriod> = {}): CarryPeriod {
  return {
    label: '2026-07',
    periodStart: new Date('2026-07-01T00:00:00Z'),
    hours: 160,
    billRateCents: 10_000, // $100/hr
    shareBps: 7_500,
    personalCostCents: 0,
    ...over,
  }
}

describe('A cost bigger than the share does not make a negative payslip', () => {
  it('a cost larger than this period’s share carries to the next period rather than making a negative payslip', () => {
    const l = carryLedger([
      period({ label: '2026-07', hours: 10, personalCostCents: 500_000 }),
    ])
    const p = l.periods[0]
    // 10h × $100 × 75% = $750. A $5,000 filing does not fit.
    expect(p.shareCents).toBe(75_000)
    expect(p.recoveredCents).toBe(75_000)
    expect(p.payCents).toBe(0)
    expect(p.carriedOutCents).toBe(425_000)
    expect(l.outstandingCents).toBe(425_000)
  })

  it('the sentence payFor already printed is now a number somebody can act on', () => {
    // Same facts, through the single-period calculator.
    const one = payFor({
      model: 'SHARE_OF_BILL_LESS_COSTS',
      shareBps: 7_500,
      hours: 10,
      billRateCents: 10_000,
      personalCostCents: 500_000,
    })
    expect(one.payCents).toBe(0)
    expect(one.working.join(' ')).toContain('carries to the next one')

    const ledger = carryLedger([period({ hours: 10, personalCostCents: 500_000 })])
    expect(ledger.outstandingCents).toBe(500_000 - one.deductedCents)
  })

  it('the carried cost is recovered from the next period’s share before anything is paid', () => {
    const l = carryLedger([
      period({ label: '2026-07', hours: 10, personalCostCents: 500_000 }),
      period({ label: '2026-08', periodStart: new Date('2026-08-01T00:00:00Z'), hours: 160 }),
    ])
    const aug = l.periods[1]
    // 160h × $100 × 75% = $12,000 share, less the $4,250 carried in.
    expect(aug.carriedInCents).toBe(425_000)
    expect(aug.shareCents).toBe(1_200_000)
    expect(aug.recoveredCents).toBe(425_000)
    expect(aug.payCents).toBe(775_000)
    expect(aug.carriedOutCents).toBe(0)
    expect(l.outstandingCents).toBe(0)
    expect(l.says).toContain('Nothing carried')
  })

  it('a carry that is never recovered is still owed and still shown', () => {
    const l = carryLedger([
      period({ label: '2026-07', hours: 4, personalCostCents: 600_000 }),
      period({ label: '2026-08', periodStart: new Date('2026-08-01T00:00:00Z'), hours: 4 }),
    ])
    expect(l.outstandingCents).toBeGreaterThan(0)
    expect(l.periods[1].payCents).toBe(0)
    expect(l.says).toContain('still carried')
  })
})

describe('Replay, so there is no second copy of the truth to drift', () => {
  it('a carry is replayed from the periods themselves, so it cannot drift from the postings', () => {
    const months: CarryPeriod[] = [
      period({ label: '2026-07', periodStart: new Date('2026-07-01T00:00:00Z'), hours: 10, personalCostCents: 500_000 }),
      period({ label: '2026-08', periodStart: new Date('2026-08-01T00:00:00Z'), hours: 40 }),
      period({ label: '2026-09', periodStart: new Date('2026-09-01T00:00:00Z'), hours: 160 }),
    ]
    const once = carryLedger(months)
    const twice = carryLedger(months)
    expect(twice).toEqual(once)

    // And running it on a prefix then extending gives the same answer for
    // the periods they share — which is what makes a retried payroll run
    // safe.
    const prefix = carryLedger(months.slice(0, 2))
    expect(prefix.periods[1]).toEqual(once.periods[1])
  })

  it('periods are replayed in the order the money belongs to, not the order they arrived', () => {
    const shuffled: CarryPeriod[] = [
      period({ label: '2026-09', periodStart: new Date('2026-09-01T00:00:00Z'), hours: 160 }),
      period({ label: '2026-07', periodStart: new Date('2026-07-01T00:00:00Z'), hours: 10, personalCostCents: 500_000 }),
      period({ label: '2026-08', periodStart: new Date('2026-08-01T00:00:00Z'), hours: 40 }),
    ]
    const l = carryLedger(shuffled)
    expect(l.periods.map((p) => p.label)).toEqual(['2026-07', '2026-08', '2026-09'])
    // July's cost recovers out of August before it reaches September.
    expect(l.periods[1].recoveredCents).toBeGreaterThan(0)
  })

  it('a period inserted late changes every period after it and none before it', () => {
    const base: CarryPeriod[] = [
      period({ label: '2026-07', periodStart: new Date('2026-07-01T00:00:00Z'), hours: 160 }),
      period({ label: '2026-09', periodStart: new Date('2026-09-01T00:00:00Z'), hours: 160 }),
    ]
    const before = carryLedger(base)
    const after = carryLedger([
      ...base,
      period({ label: '2026-08', periodStart: new Date('2026-08-01T00:00:00Z'), hours: 4, personalCostCents: 900_000 }),
    ])
    expect(after.periods[0]).toEqual(before.periods[0])
    expect(after.periods[2].recoveredCents).toBeGreaterThan(0)
  })
})

describe('A payment outside the run belongs to a period, and carries a reason', () => {
  it('an off-cycle payment posts to the period it belongs to, not the day it was made', () => {
    const v = checkOffCycle({
      amountCents: 240_000,
      reason: 'CORRECTION_UNDERPAID',
      periodStart: new Date('2026-03-01T00:00:00Z'),
      payOn: new Date('2026-06-12T00:00:00Z'),
    })
    expect(v.ok).toBe(true)
    expect(v.postedAt!.toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(v.says).toContain('posted to 2026-03-01')
  })

  it('an off-cycle payment carries a reason, because a payment outside the run is one somebody will ask about', () => {
    const v = checkOffCycle({
      amountCents: 240_000,
      reason: 'because I said so',
      periodStart: new Date('2026-03-01T00:00:00Z'),
      payOn: new Date('2026-06-12T00:00:00Z'),
    })
    expect(v.ok).toBe(false)
    expect(v.problems[0]).toContain('an auditor opens with')
  })

  it('an advance has to say what it is against, or it is indistinguishable from an overpayment', () => {
    const bare = checkOffCycle({
      amountCents: 100_000,
      reason: 'ADVANCE',
      periodStart: new Date('2026-06-01T00:00:00Z'),
      payOn: new Date('2026-06-12T00:00:00Z'),
    })
    expect(bare.ok).toBe(false)

    const said = checkOffCycle({
      amountCents: 100_000,
      reason: 'ADVANCE',
      note: 'Against the July run, agreed with Ravi while the visa fee is outstanding.',
      periodStart: new Date('2026-06-01T00:00:00Z'),
      payOn: new Date('2026-06-12T00:00:00Z'),
    })
    expect(said.ok).toBe(true)
  })

  it('an off-cycle payment cannot be negative, because taking money back is reversing the original', () => {
    const v = checkOffCycle({
      amountCents: -100_000,
      reason: 'MISSED_FROM_RUN',
      periodStart: new Date('2026-06-01T00:00:00Z'),
      payOn: new Date('2026-06-12T00:00:00Z'),
    })
    expect(v.ok).toBe(false)
    expect(v.problems[0]).toContain('reverse the original')
  })
})
