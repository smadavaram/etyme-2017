import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ladderFor,
  ownerOf,
  discountOn,
  discountDeadline,
  rateWords,
  type DiscountRow,
} from '@/lib/billing-cascade'

/**
 * "2/10 net 30" — two per cent off if it is settled within ten days.
 *
 * A staffing firm's problem is the gap between paying consultants on
 * Friday and being paid by the client in sixty days, so a rung that pulls
 * the cash in three weeks early is often worth more than the margin on
 * the placement. The rungs were a table with nothing reading it.
 *
 * Three rules decide every number here: the order overrides the agreement
 * rather than merging with it, the days count from the same day the net
 * terms do, and the discount comes off the work and never off the tax.
 */

const ANCHOR = new Date('2026-09-06T00:00:00.000Z')
const on = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const rung = (over: Partial<DiscountRow> & { withinDays: number; discountBps: number }): DiscountRow => ({
  id: `r-${over.withinDays}-${over.discountBps}`,
  msaId: 'msa-1',
  ...over,
})

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('what paying early is worth', () => {

  it('a rung belongs to exactly one document, and a rung on none or two is refused rather than guessed', () => {
    expect(ownerOf(rung({ withinDays: 10, discountBps: 200 })).owner).toBe('AGREEMENT')

    const orphan = ownerOf({ id: 'r1', withinDays: 10, discountBps: 200 })
    expect(orphan.ok).toBe(false)
    expect(orphan.says).toContain('a rung on nothing would apply to everything')

    const twoMasters = ownerOf({ id: 'r1', msaId: 'm', salesOrderId: 's', withinDays: 10, discountBps: 200 })
    expect(twoMasters.ok).toBe(false)
    expect(twoMasters.says).toContain('It was agreed in one of them. Which?')
  })

  it("an order's own terms replace the agreement's for its own spend, and are never merged with them", () => {
    const ladder = ladderFor({
      agreement: [rung({ withinDays: 20, discountBps: 100 }), rung({ withinDays: 10, discountBps: 200 })],
      order: [{ id: 'o1', purchaseOrderId: 'po-1', withinDays: 15, discountBps: 150 }],
    })

    // One rung, from the order. Taking 2/10 from the agreement and 1.5/15
    // from the order would offer a client a ladder that appears in
    // neither document.
    expect(ladder.source).toBe('ORDER')
    expect(ladder.rungs.map((r) => [r.withinDays, r.discountBps])).toEqual([[15, 150]])
    expect(ladder.says).toContain('replaces the standing terms')
  })

  it('the standing ladder is the agreement’s where an order says nothing', () => {
    const ladder = ladderFor({
      agreement: [rung({ withinDays: 20, discountBps: 100 }), rung({ withinDays: 10, discountBps: 200 })],
      order: [],
    })
    expect(ladder.source).toBe('AGREEMENT')
    // Shortest window first, which is how anybody reads a ladder.
    expect(ladder.rungs.map((r) => r.withinDays)).toEqual([10, 20])
    expect(ladder.says).toBe('2% paid within 10 days, 1% paid within 20 days — from the agreement.')
  })

  it('a client inside the ten-day window gets the two per cent, not the one per cent that was listed later', () => {
    const ladder = ladderFor({
      agreement: [rung({ withinDays: 20, discountBps: 100 }), rung({ withinDays: 10, discountBps: 200 })],
    })

    // Day eight: inside both windows, so the better of the two.
    const offer = discountOn({
      ladder, anchoredOn: ANCHOR, payingOn: on('2026-09-14'), netMinor: 627_000,
    })
    expect(offer.rung?.discountBps).toBe(200)
    expect(offer.daysTaken).toBe(8)
    expect(offer.discountMinor).toBe(12_540)
    expect(offer.payMinor).toBe(614_460)
    expect(offer.says).toContain('2% off for paid within 10 days')
  })

  it('a day past the last rung is the full amount, and says which rung was missed', () => {
    const ladder = ladderFor({ agreement: [rung({ withinDays: 10, discountBps: 200 })] })
    const offer = discountOn({
      ladder, anchoredOn: ANCHOR, payingOn: on('2026-09-20'), netMinor: 627_000,
    })
    expect(offer.rung).toBeNull()
    expect(offer.discountMinor).toBe(0)
    expect(offer.payMinor).toBe(627_000)
    expect(offer.says).toContain('Too late for a discount')
    expect(offer.says).toContain('2% for paid within 10 days')
  })

  it('net zero is a real rung: settle on the day or not at all', () => {
    const ladder = ladderFor({ agreement: [rung({ withinDays: 0, discountBps: 300 })] })

    const sameDay = discountOn({ ladder, anchoredOn: ANCHOR, payingOn: ANCHOR, netMinor: 100_000 })
    expect(sameDay.rung?.discountBps).toBe(300)
    expect(sameDay.discountMinor).toBe(3_000)
    expect(sameDay.says).toContain('3% off for paid on the day')

    const nextDay = discountOn({ ladder, anchoredOn: ANCHOR, payingOn: on('2026-09-07'), netMinor: 100_000 })
    expect(nextDay.rung).toBeNull()
  })

  it('the discount comes off the work and never off the tax', () => {
    const ladder = ladderFor({ agreement: [rung({ withinDays: 10, discountBps: 200 })] })
    const offer = discountOn({
      ladder, anchoredOn: ANCHOR, payingOn: on('2026-09-10'),
      netMinor: 100_000, taxMinor: 8_250, taxRegime: 'US_SALES_TAX',
    })

    // Two per cent of the work, and the tax in full: it is owed to an
    // authority whatever we agree with a client.
    expect(offer.discountMinor).toBe(2_000)
    expect(offer.payMinor).toBe(100_000 - 2_000 + 8_250)
    expect(offer.says).toContain('is unchanged: it is owed to an authority')
    expect(offer.taxNeedsAThought).toBe(false)
  })

  it('a regime whose tax base follows what was actually paid is flagged for a person, never adjusted here', () => {
    const ladder = ladderFor({ agreement: [rung({ withinDays: 10, discountBps: 200 })] })
    const offer = discountOn({
      ladder, anchoredOn: ANCHOR, payingOn: on('2026-09-10'),
      netMinor: 100_000, taxMinor: 20_000, taxRegime: 'UK_VAT',
    })

    // The rate is not touched. Prompt-payment discounts move the VAT
    // base in some regimes and not others, and guessing which is how an
    // under-declared return surfaces two years later with interest.
    expect(offer.discountMinor).toBe(2_000)
    expect(offer.payMinor).toBe(118_000)
    expect(offer.taxNeedsAThought).toBe(true)
    expect(offer.says).toContain('a call for whoever files the return')
  })

  it('a discount cannot be offered while the payment clock has not started', () => {
    const ladder = ladderFor({ agreement: [rung({ withinDays: 10, discountBps: 200 })] })
    const offer = discountOn({
      ladder, anchoredOn: null, payingOn: on('2026-09-10'), netMinor: 627_000,
    })

    // "Within ten days" of what? Of the same day the net terms count
    // from — and on receipt terms nobody has confirmed, that day has not
    // happened.
    expect(offer.rung).toBeNull()
    expect(offer.payMinor).toBe(627_000)
    expect(offer.says).toContain('counts from the same day the payment terms do')
  })

  it('an agreement with no rungs offers nothing, and says so rather than showing a zero', () => {
    const offer = discountOn({
      ladder: ladderFor({}), anchoredOn: ANCHOR, payingOn: on('2026-09-10'), netMinor: 627_000,
    })
    expect(offer.rung).toBeNull()
    expect(offer.says).toBe('No early-payment discount was agreed.')
  })

  it('the deadline is the last day the best rate is still available', () => {
    const ladder = ladderFor({
      agreement: [rung({ withinDays: 20, discountBps: 100 }), rung({ withinDays: 10, discountBps: 200 })],
    })
    const deadline = discountDeadline(ladder, ANCHOR)!
    expect(deadline.by.toISOString().slice(0, 10)).toBe('2026-09-16')
    expect(deadline.rung.discountBps).toBe(200)

    // Nothing to offer, nothing to promise.
    expect(discountDeadline(ladder, null)).toBeNull()
    expect(discountDeadline(ladderFor({}), ANCHOR)).toBeNull()
  })

  it('a rate is said the way a person says it', () => {
    expect(rateWords(200)).toBe('2%')
    expect(rateWords(150)).toBe('1.5%')
    expect(rateWords(75)).toBe('0.75%')
  })

  it('only the company that raised the order may agree what comes off it', () => {
    const route = read('src/app/api/purchase-orders/[id]/discounts/route.ts')
    expect(route).toContain('NOT_THE_PAYER')
    expect(route).toContain('so it is theirs to agree and yours to read')
    // A rung with nothing off it is not a term; ten per cent is not a
    // prompt-payment discount.
    expect(route).toContain('A rung with nothing off it is not a term')
    expect(route).toContain('it is a renegotiation')
    // Agreeing the same window again moves the rate rather than stacking.
    expect(route).toContain('purchaseOrderId_withinDays')
  })

  it('the invoice shows what settles it sooner, from the ladder in force', () => {
    const api = read('src/app/api/invoices/[id]/route.ts')
    expect(api).toContain('ladderFor({')
    expect(api).toContain('order: invoice.purchaseOrder?.earlyPaymentDiscounts')
    expect(api).toContain('anchoredOn: clock.anchoredOn')
    const page = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(page).toContain('inv.earlyPayment?.discount > 0')
    expect(page).toContain('not payable yet')
  })
})
