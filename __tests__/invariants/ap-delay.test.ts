/**
 * How long money takes to travel down a chain, and who pays for the wait.
 *
 * The scenario these tests are written against is a real one and it is
 * the reason the file exists:
 *
 *   A client pays the prime at day 75 against sixty-day terms. The
 *   prime's terms with the sub are net 45 from receipt of client funds,
 *   so the sub is paid at day 120. The sub pays the bench vendor net 30
 *   from receipt: day 150. The bench vendor pays the consultant on the
 *   15th, because a person has rent.
 *
 *   The consultant is paid on day 15 for work funded on day 150, and the
 *   bench vendor — the smallest firm in the chain — finances 135 days of
 *   it.
 *
 * Nobody measures this, because every party can see its own hop and
 * nothing beyond it. The last group of tests is about being honest that
 * we cannot see past a party who is not here either.
 */

import { describe, it, expect } from 'vitest'
import {
  hopDelay, summariseHops, chainFloat, chainBlindSpot, beyondLastParty,
  payWhenPaidFlags, dpo, mirror, daysBetween,
  type Hop, type Chain, type ChainStep, type PurchasePeriod,
} from '@/lib/ap-delay'

/** Day zero of every scenario. The day the work was done. */
const WORKED = new Date('2026-01-01T00:00:00Z')

/** A day number relative to the work being done. */
function day(n: number): Date {
  return new Date(WORKED.getTime() + n * 86_400_000)
}

function bill(over: Partial<Hop> = {}): Hop {
  return {
    id: 'bill-1',
    side: 'OUT',
    payerName: 'Our firm',
    payeeName: 'Sub-vendor',
    currency: 'USD',
    amountMinor: 1_000_000,
    termsDays: 30,
    termsFrom: 'BILL_DATE',
    raisedAt: day(0),
    dueAt: day(30),
    settledAt: null,
    payWhenPaid: false,
    payeeIsAPerson: false,
    ...over,
  }
}

// ── One hop against its own terms ────────────────────────────────────

describe('One hop, measured against what was agreed', () => {

  it('a bill paid on the day it fell due is not late', () => {
    const d = hopDelay(bill({ settledAt: day(30) }), day(60))
    expect(d.state).toBe('SETTLED')
    expect(d.lateDays).toBe(0)
    expect(d.actualDays).toBe(30)
    expect(d.says).toContain('on the day it fell due')
  })

  it('a bill paid thirty days after it fell due is thirty days late, and says so', () => {
    const d = hopDelay(bill({ settledAt: day(60) }), day(90))
    expect(d.lateDays).toBe(30)
    expect(d.actualDays).toBe(60)
    expect(d.agreedDays).toBe(30)
    expect(d.says).toContain('30 days late')
  })

  it('a bill paid early is early, and is not reported as a problem', () => {
    const d = hopDelay(bill({ settledAt: day(20) }), day(60))
    expect(d.lateDays).toBe(-10)
    expect(d.says).toContain('10 days early')
  })

  it('a bill nobody has paid is outstanding rather than on time', () => {
    const d = hopDelay(bill({ settledAt: null }), day(45))
    expect(d.state).toBe('OUTSTANDING')
    expect(d.lateDays).toBeNull()
    expect(d.overdueDays).toBe(15)
    expect(d.elapsedDays).toBe(45)
  })

  it('a bill not yet due says how long is left rather than nothing', () => {
    const d = hopDelay(bill({ settledAt: null }), day(10))
    expect(d.state).toBe('OUTSTANDING')
    expect(d.overdueDays).toBe(0)
    expect(d.says).toContain('20 days to go')
  })

  it('a hop with no date it was raised on is a gap, never nought days', () => {
    const d = hopDelay(bill({ raisedAt: null, settledAt: day(10) }), day(60))
    expect(d.state).toBe('UNKNOWABLE')
    expect(d.actualDays).toBeNull()
    expect(d.says).toContain('read as paid on time')
  })

  it('the clock starts the day the bill arrived, not the day the period it covers ended', () => {
    // A period ending on the 31st and billed on the 6th is six days
    // nobody was counting. The bill date is what the terms run from.
    const arrived = hopDelay(bill({ raisedAt: day(6), dueAt: day(36), settledAt: day(36) }), day(60))
    expect(arrived.agreedDays).toBe(30)
    expect(arrived.lateDays).toBe(0)
  })

  it('a client paying at day seventy-five against sixty-day terms is fifteen days late', () => {
    const d = hopDelay(
      bill({
        id: 'client-invoice',
        side: 'IN',
        payerName: 'Client',
        payeeName: 'Prime',
        termsDays: 60,
        dueAt: day(60),
        settledAt: day(75),
      }),
      day(90)
    )
    expect(d.agreedDays).toBe(60)
    expect(d.lateDays).toBe(15)
  })
})

describe('A side is summarised without inventing an average out of nothing', () => {

  it('hops missing a date are left out of the average and counted separately', () => {
    const delays = [
      hopDelay(bill({ id: 'a', settledAt: day(40) }), day(90)),
      hopDelay(bill({ id: 'b', settledAt: day(35) }), day(90)),
      hopDelay(bill({ id: 'c', raisedAt: null }), day(90)),
    ]
    const s = summariseHops(delays, 'OUT')
    expect(s.measured).toBe(2)
    expect(s.unknowable).toBe(1)
    expect(s.meanLateDays).toBe(8) // (10 + 5) / 2 = 7.5, rounded
    expect(s.worstLateDays).toBe(10)
    expect(s.says).toContain('not counted as on time')
  })

  it('nothing settled yet produces no figure rather than a zero', () => {
    const s = summariseHops([hopDelay(bill({ settledAt: null }), day(10))], 'OUT')
    expect(s.meanLateDays).toBeNull()
    expect(s.says).toContain('no figure here')
  })
})

// ── The chain ────────────────────────────────────────────────────────

/** The founder's scenario, as data. */
function theChain(over: Partial<ChainStep>[] = []): Chain {
  const steps: ChainStep[] = [
    {
      payerName: 'Client', payeeName: 'Prime', currency: 'USD',
      amountMinor: 10_000_00, paidAt: day(75), termsDays: 60, termsFrom: 'BILL_DATE',
      payWhenPaid: false, observed: true, payeeIsAPerson: false,
    },
    {
      payerName: 'Prime', payeeName: 'Sub', currency: 'USD',
      amountMinor: 8_500_00, paidAt: day(120), termsDays: 45, termsFrom: 'RECEIPT_OF_FUNDS',
      payWhenPaid: true, observed: true, payeeIsAPerson: false,
    },
    {
      payerName: 'Sub', payeeName: 'Bench vendor', currency: 'USD',
      amountMinor: 7_200_00, paidAt: day(150), termsDays: 30, termsFrom: 'RECEIPT_OF_FUNDS',
      payWhenPaid: true, observed: true, payeeIsAPerson: false,
    },
    {
      payerName: 'Bench vendor', payeeName: 'Priya', currency: 'USD',
      amountMinor: 6_000_00, paidAt: day(15), termsDays: 15, termsFrom: 'PERIOD_END',
      payWhenPaid: false, observed: true, payeeIsAPerson: true,
    },
  ]
  over.forEach((o, i) => { if (o) steps[i] = { ...steps[i], ...o } })
  return { workedAt: WORKED, steps }
}

describe('Chain float — the number nobody has', () => {

  it('the consultant paid on day fifteen for work funded on day one hundred and fifty is carried by the bench vendor for a hundred and thirty-five days', () => {
    const f = chainFloat(theChain())
    const vendor = f.parties.find((p) => p.partyName === 'Bench vendor')!
    expect(vendor.direction).toBe('FINANCING')
    expect(vendor.daysFinanced).toBe(135)
  })

  it('the party who pays out before it is paid in is financing the difference', () => {
    const f = chainFloat(theChain())
    expect(f.financiers.map((p) => p.partyName)).toEqual(['Bench vendor'])
    expect(f.says).toContain('Bench vendor carries the most')
  })

  it('a party paid before it pays out is being financed rather than financing', () => {
    const f = chainFloat(theChain())
    const prime = f.parties.find((p) => p.partyName === 'Prime')!
    expect(prime.direction).toBe('FINANCED_BY_OTHERS')
    expect(prime.daysFinanced).toBe(-45)

    const sub = f.parties.find((p) => p.partyName === 'Sub')!
    expect(sub.direction).toBe('FINANCED_BY_OTHERS')
    expect(sub.daysFinanced).toBe(-30)
  })

  it('the client at the top funds nothing in the chain and the worker at the bottom passes nothing on', () => {
    const f = chainFloat(theChain())
    expect(f.parties[0].partyName).toBe('Client')
    expect(f.parties[0].direction).toBe('EVEN')
    expect(f.parties[f.parties.length - 1].partyName).toBe('Priya')
    expect(f.parties[f.parties.length - 1].direction).toBe('EVEN')
  })

  it('the financing party furthest from the client is named as an inference, not a measurement of size', () => {
    const f = chainFloat(theChain())
    expect(f.deepestFinancier?.partyName).toBe('Bench vendor')
    expect(f.says).toContain('not a measurement of size')
  })

  it('end to end it is a hundred and fifty days from the work to the last party paid', () => {
    const f = chainFloat(theChain())
    expect(f.endToEndDays).toBe(150)
  })

  it('a party whose hop has not settled cannot be placed, and is not assumed to be even', () => {
    const f = chainFloat(theChain([undefined as any, { paidAt: null }]))
    const prime = f.parties.find((p) => p.partyName === 'Prime')!
    expect(prime.direction).toBe('UNKNOWN')
    expect(prime.daysFinanced).toBeNull()
    expect(f.complete).toBe(false)
    expect(f.gaps.join(' ')).toContain('Prime cannot be placed')
  })

  it('two currencies in one chain refuse to produce a float figure', () => {
    const f = chainFloat(theChain([undefined as any, undefined as any, { currency: 'INR' }]))
    expect(f.currency).toBeNull()
    expect(f.parties).toEqual([])
    expect(f.gaps[0]).toContain('Days can be compared across currencies and money cannot')
  })

  it('an empty chain says there is nothing to measure rather than returning zero days', () => {
    const f = chainFloat({ workedAt: WORKED, steps: [] })
    expect(f.endToEndDays).toBeNull()
    expect(f.says).toBe('Nothing to measure.')
  })
})

describe('Where the chain leaves the platform, we say so', () => {

  it('a chain with nobody missing says so rather than implying a guarantee', () => {
    const b = chainBlindSpot(theChain())
    expect(b.blind).toBe(false)
    expect(b.hopsObserved).toBe(4)
    expect(b.says).toContain('a record rather than')
  })

  it('where a party in the chain is not on the platform we say the chain stops there', () => {
    const b = chainBlindSpot(theChain([undefined as any, undefined as any, { observed: false }]))
    expect(b.blind).toBe(true)
    expect(b.firstUnseenName).toBe('Sub')
    expect(b.hopsObserved).toBe(3)
    expect(b.says).toContain('invite them')
  })

  it('a chain that ends at a supplier who is not here says the real financier is probably below them', () => {
    const b = beyondLastParty('TechVista', false)
    expect(b.blind).toBe(true)
    expect(b.says).toContain('further down than the last one visible')
    expect(b.says).toContain('invite them')
  })

  it('a supplier who is here continues the chain rather than ending it', () => {
    const b = beyondLastParty('TechVista', true)
    expect(b.blind).toBe(false)
    expect(b.says).toContain('measured the same way')
  })

  it('an unobserved hop is reported as a gap on the float as well', () => {
    const f = chainFloat(theChain([undefined as any, { observed: false }]))
    expect(f.complete).toBe(false)
    expect(f.gaps.join(' ')).toContain('not on the platform')
  })
})

// ── Pay when paid ────────────────────────────────────────────────────

describe('Pay-when-paid is where the float gets pushed down', () => {

  it('pay-when-paid between two companies is flagged as ordinary and noted', () => {
    const flags = payWhenPaidFlags([bill({ payWhenPaid: true })], day(45))
    expect(flags).toHaveLength(1)
    expect(flags[0].enforceability).toBe('BETWEEN_COMPANIES')
    expect(flags[0].severity).toBe('NOTE')
  })

  it('pay-when-paid is flagged harder where the party below it is a person', () => {
    const flags = payWhenPaidFlags(
      [bill({ payWhenPaid: true, payeeName: 'Priya', payeeIsAPerson: true })],
      day(45)
    )
    expect(flags[0].enforceability).toBe('AGAINST_A_PERSON')
    expect(flags[0].severity).toBe('WARN')
    expect(flags[0].says).toContain('generally unenforceable against a worker')
  })

  it('an obligation without the clause is not flagged at all', () => {
    expect(payWhenPaidFlags([bill({ payWhenPaid: false })], day(45))).toEqual([])
  })

  it('a pay-when-paid bill still unpaid says how long it has been open', () => {
    const flags = payWhenPaidFlags([bill({ payWhenPaid: true, settledAt: null })], day(90))
    expect(flags[0].stillWaiting).toBe(true)
    expect(flags[0].openDays).toBe(90)
    expect(flags[0].says).toContain('open 90 days')
  })
})

// ── Days payable outstanding ─────────────────────────────────────────

/** Newest month first, the way the countback walks. */
const PURCHASES: PurchasePeriod[] = [
  { label: '2026-07', days: 31, purchasesMinor: 40_000_00 },
  { label: '2026-06', days: 30, purchasesMinor: 30_000_00 },
  { label: '2026-05', days: 31, purchasesMinor: 20_000_00 },
]

describe('Days payable outstanding, computed the way days sales outstanding is', () => {

  it('days payable outstanding counts back through real purchases rather than dividing by an average', () => {
    // 55,000 owed. July's 40,000 covers 40,000 of it in 31 days. The
    // remaining 15,000 takes half of June's 30,000, which is half of 30
    // days — 15. Total 46.
    const d = dpo(55_000_00, PURCHASES)
    expect(d.days).toBe(46)
    expect(d.periodsUsed).toBe(2)
  })

  it('the textbook formula is shown beside it and never relied on', () => {
    const d = dpo(55_000_00, PURCHASES)
    // 55,000 / 90,000 x 92 days = 56 days. Eleven days adrift, and it is
    // the growth in buying that moved it, not how we pay.
    expect(d.naiveDays).toBe(56)
    expect(d.days).not.toBe(d.naiveDays)
  })

  it('a quiet month still consumes its days, because it genuinely makes the payable older', () => {
    const quiet: PurchasePeriod[] = [
      { label: '2026-07', days: 31, purchasesMinor: 0 },
      { label: '2026-06', days: 30, purchasesMinor: 30_000_00 },
    ]
    expect(dpo(30_000_00, quiet).days).toBe(61)
  })

  it('days payable outstanding returns nothing when payables exceed every purchase on record', () => {
    const d = dpo(200_000_00, PURCHASES)
    expect(d.days).toBeNull()
    expect(d.says).toContain('history problem, not a payment figure')
  })

  it('owing suppliers nothing is nought days, not a missing figure', () => {
    expect(dpo(0, PURCHASES).days).toBe(0)
  })
})

describe('Our days payable beside our days to get paid', () => {

  it('our days payable beside our days to get paid says which way the float runs', () => {
    const m = mirror(68, 30)
    expect(m.direction).toBe('FINANCING')
    expect(m.gapDays).toBe(38)
    expect(m.says).toContain('fund 38 days')
  })

  it('paying slower than we are paid says we are doing it to our suppliers', () => {
    const m = mirror(30, 68)
    expect(m.direction).toBe('FINANCED_BY_OTHERS')
    expect(m.gapDays).toBe(-38)
    expect(m.says).toContain('one layer down')
  })

  it('a missing figure on either side shows no comparison rather than half of one', () => {
    expect(mirror(null, 30).direction).toBe('UNKNOWN')
    expect(mirror(68, null).direction).toBe('UNKNOWN')
    expect(mirror(null, 30).gapDays).toBeNull()
  })
})

describe('Days are counted the same way ageing counts them', () => {

  it('a whole day is a whole day and part days do not round up', () => {
    expect(daysBetween(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T23:00:00Z'))).toBe(1)
  })
})
