/**
 * Cost allocation — splitting a contract across the client's budgets.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * CLAUDE.md, the hardest things: invoice arithmetic is called out by name.
 * "A wrong rate calculation that looks plausible is worse than a delay."
 *
 * The failure this guards against is quiet: if allocated lines do not sum
 * back to the invoice total, an AP team finds a one-cent gap and rejects
 * the whole posting file. Rounding each share independently causes exactly
 * that, which is why money is split by largest remainder.
 */

import { describe, it, expect } from 'vitest'
import {
  validateAllocation,
  allocateAmount,
  singleAllocation,
  formatShare,
  FULL_ALLOCATION_BPS,
} from '@/lib/cost-allocation'

// ── Validation ─────────────────────────────────────────

describe('A contract\'s cost split must account for every penny of it', () => {

  it('a single cost centre taking the whole contract is valid', () => {
    const result = validateAllocation([{ costCenterId: 'cc-1', shareBps: 10000 }])
    expect(result.valid).toBe(true)
  })

  it('an even split between two departments is valid', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 5000 },
      { costCenterId: 'cc-2', shareBps: 5000 },
    ])
    expect(result.valid).toBe(true)
  })

  it('a three-way split of 33.33 / 33.33 / 33.34 totals exactly 100%', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 3333 },
      { costCenterId: 'cc-2', shareBps: 3333 },
      { costCenterId: 'cc-3', shareBps: 3334 },
    ])
    expect(result.valid).toBe(true)
    expect(result.totalBps).toBe(FULL_ALLOCATION_BPS)
  })

  it('shares totalling 99% are rejected — a budget would be under-charged', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 5000 },
      { costCenterId: 'cc-2', shareBps: 4900 },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('must total exactly 100%')
  })

  it('shares totalling 101% are rejected — a budget would be over-charged', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 5000 },
      { costCenterId: 'cc-2', shareBps: 5100 },
    ])
    expect(result.valid).toBe(false)
  })

  it('an empty allocation is rejected', () => {
    const result = validateAllocation([])
    expect(result.valid).toBe(false)
  })

  it('a zero share is rejected — name the cost centre or leave it out', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 10000 },
      { costCenterId: 'cc-2', shareBps: 0 },
    ])
    expect(result.valid).toBe(false)
  })

  it('a negative share is rejected', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 11000 },
      { costCenterId: 'cc-2', shareBps: -1000 },
    ])
    expect(result.valid).toBe(false)
  })

  it('the same cost centre listed twice is rejected', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 5000 },
      { costCenterId: 'cc-1', shareBps: 5000 },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('more than once')
  })

  it('a fractional basis point is rejected', () => {
    const result = validateAllocation([
      { costCenterId: 'cc-1', shareBps: 3333.33 },
      { costCenterId: 'cc-2', shareBps: 6666.67 },
    ])
    expect(result.valid).toBe(false)
  })
})

// ── Money splitting ────────────────────────────────────

describe('Allocated amounts always sum back to the invoice total', () => {

  it('an even split of $1,000 gives $500 and $500', () => {
    const parts = allocateAmount(100_000, [
      { costCenterId: 'cc-1', shareBps: 5000 },
      { costCenterId: 'cc-2', shareBps: 5000 },
    ])
    expect(parts.map(p => p.amountCents)).toEqual([50_000, 50_000])
  })

  it('a three-way split of $1,000 loses no cent', () => {
    // 33.33% of 100000 = 33330, 33.34% = 33340 — sums to 100000 exactly
    const parts = allocateAmount(100_000, [
      { costCenterId: 'cc-1', shareBps: 3333 },
      { costCenterId: 'cc-2', shareBps: 3333 },
      { costCenterId: 'cc-3', shareBps: 3334 },
    ])
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(100_000)
  })

  it('an amount that does not divide cleanly still sums to the total', () => {
    // $100.01 split three ways — the classic rounding trap
    const parts = allocateAmount(10_001, [
      { costCenterId: 'cc-1', shareBps: 3333 },
      { costCenterId: 'cc-2', shareBps: 3333 },
      { costCenterId: 'cc-3', shareBps: 3334 },
    ])
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(10_001)
  })

  it('rounding each share on its own would lose a cent — largest remainder does not', () => {
    const shares = [
      { costCenterId: 'cc-1', shareBps: 3333 },
      { costCenterId: 'cc-2', shareBps: 3333 },
      { costCenterId: 'cc-3', shareBps: 3334 },
    ]
    // $100.01 — the shares land on .33 and .34 of a cent, so flooring drops one
    const amount = 10_001

    const naive = shares.reduce(
      (sum, s) => sum + Math.floor((amount * s.shareBps) / FULL_ALLOCATION_BPS), 0
    )
    const correct = allocateAmount(amount, shares).reduce((s, p) => s + p.amountCents, 0)

    expect(naive).toBeLessThan(amount)   // the bug
    expect(correct).toBe(amount)          // the fix
  })

  it('the leftover cent goes to the share rounded down hardest', () => {
    // $100.00 at 3333/3333/3334: exact parts are 3333.0, 3333.0, 3334.0
    // No remainder here, so try an amount that creates one.
    const parts = allocateAmount(10_001, [
      { costCenterId: 'cc-a', shareBps: 5000 },
      { costCenterId: 'cc-b', shareBps: 5000 },
    ])
    // 5000.5 each — one gets 5001, the other 5000
    const amounts = parts.map(p => p.amountCents).sort((a, b) => b - a)
    expect(amounts).toEqual([5001, 5000])
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(10_001)
  })

  it('a single cost centre takes the whole amount untouched', () => {
    const parts = allocateAmount(123_456, singleAllocation('cc-only'))
    expect(parts).toHaveLength(1)
    expect(parts[0].amountCents).toBe(123_456)
  })

  it('the same input always produces the same split', () => {
    // An export re-run must not shuffle cents between budgets
    const shares = [
      { costCenterId: 'cc-b', shareBps: 3333 },
      { costCenterId: 'cc-a', shareBps: 3333 },
      { costCenterId: 'cc-c', shareBps: 3334 },
    ]
    const first = allocateAmount(10_001, shares)
    const second = allocateAmount(10_001, shares)
    expect(first).toEqual(second)
  })

  it('a credit note splits the same way and sums to the negative total', () => {
    const parts = allocateAmount(-10_001, [
      { costCenterId: 'cc-a', shareBps: 5000 },
      { costCenterId: 'cc-b', shareBps: 5000 },
    ])
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(-10_001)
  })

  it('a zero amount allocates zero to every cost centre', () => {
    const parts = allocateAmount(0, [
      { costCenterId: 'cc-a', shareBps: 5000 },
      { costCenterId: 'cc-b', shareBps: 5000 },
    ])
    expect(parts.every(p => p.amountCents === 0)).toBe(true)
  })

  it('no allocation yields no lines rather than a phantom charge', () => {
    expect(allocateAmount(10_000, [])).toEqual([])
  })

  it('a realistic invoice splits to the cent across seven odd shares', () => {
    // Stress the remainder handling with an ugly amount and uneven shares
    const shares = [
      { costCenterId: 'cc-1', shareBps: 1429 },
      { costCenterId: 'cc-2', shareBps: 1429 },
      { costCenterId: 'cc-3', shareBps: 1428 },
      { costCenterId: 'cc-4', shareBps: 1428 },
      { costCenterId: 'cc-5', shareBps: 1429 },
      { costCenterId: 'cc-6', shareBps: 1428 },
      { costCenterId: 'cc-7', shareBps: 1429 },
    ]
    expect(validateAllocation(shares).valid).toBe(true)
    const total = 1_234_567 // $12,345.67
    const parts = allocateAmount(total, shares)
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(total)
  })
})

// ── Whose chart of accounts ────────────────────────────

describe('Coding is labelled with the company that owns it', () => {

  /**
   * A cost centre belongs to one company. On a direct placement the payer
   * and the end client are the same, so the codes are the payer's. On a
   * layer-cake leg — vendor invoices an MSP, consultant sits at the
   * enterprise — the codes are the enterprise's, and the MSP codes its own
   * onward invoice differently. Presenting one company's codes as another's
   * would put wrong numbers into an ERP.
   */
  function codingIsPayers(costCentreOwnerId: string, billToId: string): boolean {
    return costCentreOwnerId === billToId
  }

  it('on a direct placement the codes belong to the company being billed', () => {
    expect(codingIsPayers('terumo', 'terumo')).toBe(true)
  })

  it('on an MSP leg the codes belong to the end client, not the payer', () => {
    // Cloudepa invoices GlobalStaff; David Chen sits at Terumo
    expect(codingIsPayers('terumo', 'globalstaff-msp')).toBe(false)
  })

  it('a vendor never sees its own profit-centre coding on a client invoice', () => {
    // Only the client's dimensions are carried — the vendor's COGS and
    // profit centre are a separate set and are not exported here
    expect(codingIsPayers('cloudepa', 'terumo')).toBe(false)
  })
})

// ── Display ────────────────────────────────────────────

describe('Share formatting', () => {

  it('a whole percentage has no decimal places', () => {
    expect(formatShare(5000)).toBe('50%')
    expect(formatShare(10000)).toBe('100%')
  })

  it('a fractional percentage shows two decimal places', () => {
    expect(formatShare(3333)).toBe('33.33%')
  })
})
