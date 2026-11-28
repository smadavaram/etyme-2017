import { describe, it, expect } from 'vitest'
import { rateWordFor, chainUnderSays } from '@/lib/money/rate-words'

/**
 * Which rung's word a rate is said in, and who employs a person.
 *
 * The second Tapin walk (2026-10-31): Tapin employs Ravi on a W2 and bills
 * Brightmoor Staffing, which bills Northbend Athletic. Brightmoor read
 * "BILL RATE" over what it pays Tapin, and "Brightmoor employs Ravi".
 */

const TAPIN = { id: 'tapin', name: 'Tapin' }
const BRIGHTMOOR = { id: 'brightmoor', name: 'Brightmoor Staffing' }
const tapinsLine = { sellerId: TAPIN.id, sellerName: TAPIN.name, buyerId: BRIGHTMOOR.id, buyerName: BRIGHTMOOR.name }

describe('a rate is said in the word of the end the reader stands at', () => {
  it('to Tapin, the rate on its line to Brightmoor is its bill rate', () => {
    expect(rateWordFor(tapinsLine, TAPIN.id)).toEqual({ label: 'Bill rate', says: 'You bill Brightmoor Staffing' })
  })

  it('to Brightmoor, the same number is what it pays Tapin, never a bill rate', () => {
    expect(rateWordFor(tapinsLine, BRIGHTMOOR.id)).toEqual({ label: 'What you pay', says: 'Tapin bills you' })
  })

  it('a reader at neither end reads a neutral word and both names', () => {
    expect(rateWordFor(tapinsLine, 'northbend')).toEqual({ label: 'Rate', says: 'Tapin bills Brightmoor Staffing' })
    expect(rateWordFor(tapinsLine, null).label).toBe('Rate')
  })
})

describe('a firm employs a person only where its own line pays them by payroll', () => {
  it('Brightmoor, buying Ravi’s time from Tapin, buys from Tapin and does not employ him', () => {
    expect(chainUnderSays({ firmName: 'Brightmoor Staffing', personName: 'Ravi Kumar', buyLine: { vendorName: 'Tapin' } }))
      .toBe('Brightmoor Staffing buys Ravi’s time from Tapin.')
  })

  it('Tapin, paying Ravi by payroll, employs him directly', () => {
    expect(chainUnderSays({ firmName: 'Tapin', personName: 'Ravi Kumar', buyLine: { vendorName: null } }))
      .toBe('Tapin employs Ravi directly.')
  })

  it('a firm with a firm below it on the chain buys from that firm, even where its own line names no vendor', () => {
    expect(chainUnderSays({ firmName: 'Brightmoor Staffing', personName: 'Ravi Kumar', buyLine: { vendorName: null }, firmBelow: 'Tapin' }))
      .toBe('Brightmoor Staffing buys Ravi’s time from Tapin.')
    expect(chainUnderSays({ firmName: 'Brightmoor Staffing', personName: 'Ravi Kumar', buyLine: null, firmBelow: 'Tapin' }))
      .toBe('Brightmoor Staffing buys Ravi’s time from Tapin.')
  })

  it('a firm with no buy line and no firm below on the record is said to employ nobody: an absence is not employment', () => {
    expect(chainUnderSays({ firmName: 'Brightmoor Staffing', personName: 'Ravi Kumar', buyLine: null })).toBeNull()
  })
})
