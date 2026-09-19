/**
 * The award raises the header, and the contract is its first line.
 *
 * A purchase order is one document: a header carrying the commitment —
 * who, how much, over what dates, on what terms — and a line for each
 * person at their own rate. CLAUDE.md, 2026-09-18. Until this was built
 * an award wrote the lines and never the header, so `WorkOrder` had zero
 * rows for the life of the product and every invoice failed the three
 * way match on a purchase order that did not exist.
 *
 * These are the rules that decide the number on the header and which
 * header a line goes on. They are arithmetic, so they are tested here
 * without a database; the walk through the routes is
 * `__integration__/award-order.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import {
  orderCeiling, orderNumbers, orderNumberAttempt, chooseHeader,
  headerWindow, lineAgreesWithHeader, ORDER_RHYTHM,
  type HeaderCandidate,
} from '@/lib/award'
import { annualValue } from '@/lib/requisition-approval'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function ceiling(over: Partial<Parameters<typeof orderCeiling>[0]> = {}) {
  return orderCeiling({
    budgetCents: null,
    billMaxCents: 12_000, // $120/hr
    headcount: 1,
    months: 12,
    hoursPerWeek: null,
    awardedRateCents: 10_000,
    annualValue,
    ...over,
  })
}

// ── The ceiling ────────────────────────────────────────────────

describe('The ceiling on the order is what the requisition was approved at', () => {

  it('the ceiling is the budget the requisition stated, rounded up to the thousand', () => {
    const c = ceiling({ budgetCents: 24_150_000 }) // $241,500
    expect(c?.basis).toBe('BUDGET')
    expect(c?.dollars).toBe(242_000)
  })

  it('where nobody stated a budget, the ceiling is the same estimate the approval chain routed on', () => {
    // $120/hr x 40 hours x 4 weeks x 12 months = $230,400 a year, which
    // is the figure `annualValue` gives the approval chain.
    const routed = annualValue({ billMaxCents: 12_000, headcount: 1, months: 12 })
    expect(routed.cents).toBe(23_040_000)

    const c = ceiling()
    expect(c?.basis).toBe('ESTIMATE')
    expect(c?.rawCents).toBe(routed.cents)
    // $230,400 is not a round number, and a ceiling is: $231,000.
    expect(c?.dollars).toBe(231_000)
  })

  it('a ceiling is a round number somebody signed, never a computed cent', () => {
    const c = ceiling({ billMaxCents: 10_733 }) // $107.33/hr — nothing round about it
    expect(c!.rawCents % 100_000).not.toBe(0)
    expect(c!.dollars % 1_000).toBe(0)
    expect(c!.dollars * 100).toBeGreaterThanOrEqual(c!.rawCents)
  })

  it('a two-year requisition is authorized for two years, not for one of them', () => {
    const twoYears = ceiling({ months: 24 })
    const oneYear = ceiling({ months: 12 })
    expect(twoYears!.rawCents).toBe(oneYear!.rawCents * 2)
  })

  it('a budget stated over two years comes back out whole, because it is what finance committed', () => {
    // `annualValue` halves it to route the approval against one year's
    // budget; the ceiling is the whole commitment, so it is multiplied
    // back by the same term and lands exactly where it started.
    const c = ceiling({ budgetCents: 50_000_000, months: 24 }) // $500,000
    expect(c?.rawCents).toBe(50_000_000)
    expect(c?.dollars).toBe(500_000)
  })

  it('a stated budget is never inflated to fit the placement', () => {
    // The budget is a not-to-exceed. A placement that will bill past it
    // is an exception for the AP desk to answer, not a number for the
    // award to quietly raise.
    const c = ceiling({ budgetCents: 5_000_000, billMaxCents: 20_000 })
    expect(c?.dollars).toBe(50_000)
  })

  it('a requisition with neither a budget nor a rate ceiling values the order at the line on it', () => {
    const c = ceiling({ budgetCents: null, billMaxCents: null, awardedRateCents: 9_500 })
    expect(c?.basis).toBe('LINE')
    // $95/hr x 160 hours x 12 months = $182,400.
    expect(c?.rawCents).toBe(18_240_000)
    expect(c?.says).toContain('no budget and no rate ceiling')
  })

  it('a part-time seat is authorized at what a part-time seat costs', () => {
    const half = ceiling({ hoursPerWeek: 20 })
    const full = ceiling({ hoursPerWeek: 40 })
    expect(half!.rawCents).toBe(full!.rawCents / 2)
  })

  it('a requisition for six people authorizes six people', () => {
    const six = ceiling({ headcount: 6 })
    const one = ceiling({ headcount: 1 })
    expect(six!.rawCents).toBe(one!.rawCents * 6)
  })

  it('no budget, no rate and no rate on the award states no ceiling at all rather than a plausible one', () => {
    expect(ceiling({ budgetCents: null, billMaxCents: null, awardedRateCents: 0 })).toBeNull()
  })

  it('every ceiling says which of the three it came from, in a sentence', () => {
    for (const c of [ceiling({ budgetCents: 10_000_000 }), ceiling(), ceiling({ billMaxCents: null, awardedRateCents: 8_000 })]) {
      expect(c?.says).toMatch(/authorized/)
      expect(['BUDGET', 'ESTIMATE', 'LINE']).toContain(c?.basis)
    }
  })
})

// ── Which header a line goes on ────────────────────────────────

const header = (over: Partial<HeaderCandidate> = {}): HeaderCandidate => ({
  id: 'wo-1',
  issuedById: 'client',
  issuedToId: 'supplier',
  status: 'OPEN',
  startDate: day('2026-01-01'),
  endDate: day('2026-12-31'),
  ...over,
})

const line = (over: Partial<Parameters<typeof chooseHeader>[1]> = {}) => ({
  issuedById: 'client',
  issuedToId: 'supplier',
  start: day('2026-03-01'),
  end: day('2026-09-30'),
  ...over,
})

describe('One open order per pair of firms — found, never raised twice', () => {

  it('a second person awarded to the same client goes on the order the first one opened', () => {
    const choice = chooseHeader([header()], line())
    expect(choice.id).toBe('wo-1')
    expect(choice.says).toContain('another line')
  })

  it('the first award between two firms has no order to join, so it raises one', () => {
    expect(chooseHeader([], line()).id).toBeNull()
  })

  it('an order to a different supplier is never borrowed, however well it fits', () => {
    const someoneElse = header({ id: 'wo-other', issuedToId: 'another-supplier' })
    expect(chooseHeader([someoneElse], line()).id).toBeNull()
  })

  it('an order from a different client is never borrowed either', () => {
    const someoneElse = header({ id: 'wo-other', issuedById: 'another-client' })
    expect(chooseHeader([someoneElse], line()).id).toBeNull()
  })

  it('a closed order authorizes nothing, so the next award raises a new one', () => {
    const choice = chooseHeader([header({ status: 'CLOSED' })], line())
    expect(choice.id).toBeNull()
    expect(choice.says).toContain('closed')
  })

  it('an order that ends before the placement does cannot authorize it', () => {
    const choice = chooseHeader([header({ endDate: day('2026-06-30') })], line())
    expect(choice.id).toBeNull()
    expect(choice.says).toContain('does not cover')
  })

  it('an order that starts after the work does cannot authorize it either', () => {
    const choice = chooseHeader([header({ startDate: day('2026-06-01') })], line())
    expect(choice.id).toBeNull()
  })

  it('an open-ended order covers a placement of any length', () => {
    expect(chooseHeader([header({ endDate: null })], line({ end: day('2030-01-01') })).id).toBe('wo-1')
  })

  it('a placement with no end date does not fit inside an order that has one', () => {
    expect(chooseHeader([header()], line({ end: null })).id).toBeNull()
  })

  it('where two open orders both cover it, the line joins the most recent commitment', () => {
    const older = header({ id: 'wo-old', startDate: day('2025-01-01'), endDate: day('2027-01-01') })
    const newer = header({ id: 'wo-new', startDate: day('2026-02-01'), endDate: day('2027-01-01') })
    expect(chooseHeader([older, newer], line()).id).toBe('wo-new')
  })

  it('a new order runs a month past the last day of the work, so it can carry the final invoice', () => {
    const w = headerWindow({ start: day('2026-03-01'), end: day('2026-09-30') })
    expect(w.startDate).toEqual(day('2026-03-01'))
    expect(w.endDate!.getTime() - day('2026-09-30').getTime()).toBe(30 * 86_400_000)
  })

  it('an open-ended placement raises an open-ended order rather than inventing a horizon', () => {
    expect(headerWindow({ start: day('2026-03-01'), end: null }).endDate).toBeNull()
  })
})

// ── The two numbers one document carries ───────────────────────

describe('One document, two numbers — the buyer’s and the seller’s', () => {

  it('the buyer’s number and the seller’s reference are both written at the award', () => {
    const n = orderNumbers({ buyerId: 'cmclientxyz12', sellerId: 'cmsupplierab34', on: day('2026-03-01') })
    expect(n.number).toMatch(/^PO-2026-/)
    expect(n.sellerNumber).toMatch(/^SO-2026-/)
  })

  it('the same two firms in the same year get the same number, so a second award finds the first order', () => {
    const a = orderNumbers({ buyerId: 'client-1', sellerId: 'supplier-1', on: day('2026-03-01') })
    const b = orderNumbers({ buyerId: 'client-1', sellerId: 'supplier-1', on: day('2026-11-20') })
    expect(a.number).toBe(b.number)
  })

  it('two different suppliers to one client never share a purchase order number', () => {
    const a = orderNumbers({ buyerId: 'client-1', sellerId: 'supplier-aaaaa', on: day('2026-03-01') })
    const b = orderNumbers({ buyerId: 'client-1', sellerId: 'supplier-bbbbb', on: day('2026-03-01') })
    expect(a.number).not.toBe(b.number)
  })

  it('where the number is already taken by an order that closed, the next one is offered', () => {
    expect(orderNumberAttempt('PO-2026-ABCDE', 1)).toBe('PO-2026-ABCDE')
    expect(orderNumberAttempt('PO-2026-ABCDE', 2)).toBe('PO-2026-ABCDE-2')
    expect(orderNumberAttempt('PO-2026-ABCDE', 3)).toBe('PO-2026-ABCDE-3')
  })
})

// ── The six fields that used to sit on both rows ───────────────

const terms = (over: Record<string, unknown> = {}) => ({
  ...ORDER_RHYTHM,
  paymentTerms: 45,
  startDate: day('2026-03-01'),
  endDate: day('2026-10-30'),
  ...over,
} as any)

describe('A line never disagrees with its header on the day it is written', () => {

  it('a header and the line written from it agree on all six', () => {
    const h = terms()
    const l = terms({ startDate: day('2026-03-01'), endDate: day('2026-09-30') })
    expect(lineAgreesWithHeader(h, l)).toEqual([])
  })

  it('a line billing on a different rhythm from its order is named as a disagreement', () => {
    expect(lineAgreesWithHeader(terms(), terms({ billFrequency: 'WEEKLY' })))
      .toEqual(['the order bills MONTHLY and the line says WEEKLY'])
  })

  it('a line anchored differently from its order is named as a disagreement', () => {
    expect(lineAgreesWithHeader(terms(), terms({ billAnchor: 'CONTRACT_START' })).length).toBe(1)
  })

  it('a line splitting a straddling period differently from its order is named as a disagreement', () => {
    expect(lineAgreesWithHeader(terms(), terms({ billStraddle: 'TO_LATER' })).length).toBe(1)
  })

  it('a line on net 30 under an order on net 45 is named as a disagreement', () => {
    expect(lineAgreesWithHeader(terms(), terms({ paymentTerms: 30 })))
      .toEqual(['the order is net 45 and the line is net 30'])
  })

  it('a line may not start before the order that authorizes it', () => {
    expect(lineAgreesWithHeader(terms(), terms({ startDate: day('2026-02-01') })))
      .toEqual(['the line starts before the order that authorizes it'])
  })

  it('a line may not run past the end of the order that authorizes it', () => {
    expect(lineAgreesWithHeader(terms(), terms({ endDate: day('2027-01-01') })))
      .toEqual(['the line runs past the end of the order that authorizes it'])
  })

  it('a line ending inside its order is no disagreement, because a header outlives its lines', () => {
    expect(lineAgreesWithHeader(terms(), terms({ endDate: day('2026-06-30') }))).toEqual([])
  })

  it('an open-ended line under an open-ended order agrees', () => {
    expect(lineAgreesWithHeader(terms({ endDate: null }), terms({ endDate: null }))).toEqual([])
  })
})
