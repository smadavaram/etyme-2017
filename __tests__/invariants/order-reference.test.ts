import { describe, it, expect } from 'vitest'
import { orderReferenceLabel, carriesPrefix } from '@/lib/money/order-reference'

/**
 * Four rows on the contracts screen read "POPO-2026-K6KU1" and one on
 * the sell side read "SOSO-F8L1U". The reader's own word for the
 * document was printed in front of a number that already opened with
 * it.
 */
describe('An order number is printed as the number it is', () => {

  it('an order number that already begins with PO is printed once, not twice', () => {
    const label = orderReferenceLabel('PO-2026-K6KU1', 'PO')
    expect(label!.prefix).toBeNull()
    expect(label!.text).toBe('PO-2026-K6KU1')
  })

  it('a sales order number that already begins with SO gets no second SO in front of it', () => {
    const label = orderReferenceLabel('SO-F8L1U', 'SO')
    expect(label!.prefix).toBeNull()
    expect(label!.text).toBe('SO-F8L1U')
  })

  it('an order number with no prefix of its own is shown with the reader’s own word in front of it', () => {
    const label = orderReferenceLabel('4471', 'PO')
    expect(label!.prefix).toBe('PO')
    expect(label!.text).toBe('PO 4471')
  })

  it('a number that merely starts with the same two letters keeps its prefix, because POWERGRID is not a PO', () => {
    const label = orderReferenceLabel('POWERGRID-4471', 'PO')
    expect(label!.prefix).toBe('PO')
    expect(label!.text).toBe('PO POWERGRID-4471')
  })

  it('a lower-case prefix on the number counts as the prefix, because it is the same word', () => {
    expect(orderReferenceLabel('po-2026-K6KU1', 'PO')!.prefix).toBeNull()
  })

  it('a buyer’s number read by the seller keeps the seller’s own word, because the number is the other end’s', () => {
    // The document says PO-2026-K6KU1 and the reader calls it a sales
    // order. Dropping SO here would hide which end of the deal they
    // are standing at, and the disagreement is a fact about the paper.
    const label = orderReferenceLabel('PO-2026-K6KU1', 'SO')
    expect(label!.prefix).toBe('SO')
    expect(label!.text).toBe('SO PO-2026-K6KU1')
  })

  it('the number itself is never rewritten, only the word in front of it decided', () => {
    expect(orderReferenceLabel('PO-2026-386LO-R2', 'PO')!.reference)
      .toBe('PO-2026-386LO-R2')
  })

  it('a bystander reading a work order with no prefix of its own is given one', () => {
    expect(orderReferenceLabel('2026-4471', 'WO')!.text).toBe('WO 2026-4471')
  })

  it('an order number that is missing or blank produces no label at all rather than a bare word', () => {
    expect(orderReferenceLabel(null, 'PO')).toBeNull()
    expect(orderReferenceLabel('   ', 'PO')).toBeNull()
  })

  it('a prefix separated by a slash or an underscore is still the number carrying its own prefix', () => {
    expect(carriesPrefix('PO/2026/4471', 'PO')).toBe(true)
    expect(carriesPrefix('PO_2026_4471', 'PO')).toBe(true)
    expect(carriesPrefix('PO 4471', 'PO')).toBe(true)
    expect(carriesPrefix('POX-4471', 'PO')).toBe(false)
  })
})
