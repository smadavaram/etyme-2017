/**
 * Who is who on an invoice.
 *
 * A large client signs in one entity, is billed through a shared services
 * centre in another country, has the work done at a third site and pays
 * from a fourth. Collapsing those into one party is how an invoice reaches
 * the wrong address and ages ninety days before anybody notices.
 */

import { describe, it, expect } from 'vitest'
import { partnerFunctions, mayConsolidate, selfBilling } from '@/lib/billing-cascade'

const NIKE = { id: 'c-nike', name: 'Nike Inc' }
const NIKE_SSC = { id: 'c-ssc', name: 'Nike Shared Services BV' }
const NIKE_TREASURY = { id: 'c-tre', name: 'Nike Treasury Ltd' }
const BEAVERTON = {
  id: 'loc-bv', name: 'Beaverton campus', country: 'US', state: 'OR',
}

describe('Four parties, one client, and only one of them needs setting up', () => {
  it('when nobody has said otherwise, all four partner functions are the client on the agreement', () => {
    const p = partnerFunctions({ agreementClient: NIKE })
    expect(p.soldTo.party).toEqual(NIKE)
    expect(p.billTo.party).toEqual(NIKE)
    expect(p.payer.party).toEqual(NIKE)
    expect(p.soldTo.isDefault).toBe(true)
    expect(p.split).toBe(false)
    expect(p.says).toContain('Nike Inc throughout')
  })

  it('an invoice is addressed to the bill-to and settled by the payer, and they are allowed to differ', () => {
    const p = partnerFunctions({
      agreementClient: NIKE,
      engagement: { billTo: NIKE_SSC, payer: NIKE_TREASURY },
    })
    expect(p.billTo.party).toEqual(NIKE_SSC)
    expect(p.billTo.source).toBe('ENGAGEMENT')
    expect(p.payer.party).toEqual(NIKE_TREASURY)
    // The agreement is still with Nike Inc — that is what was signed.
    expect(p.soldTo.party).toEqual(NIKE)
    expect(p.split).toBe(true)
  })

  it('a contract beats the engagement, because the most specific thing somebody said wins', () => {
    const other = { id: 'c-oth', name: 'Nike Retail GmbH' }
    const p = partnerFunctions({
      agreementClient: NIKE,
      engagement: { billTo: NIKE_SSC },
      contract: { billTo: other },
    })
    expect(p.billTo.party).toEqual(other)
    expect(p.billTo.source).toBe('CONTRACT')
  })

  it('the ship-to is where the work was done, which is what decides the tax', () => {
    const p = partnerFunctions({
      agreementClient: NIKE,
      contract: { shipTo: BEAVERTON },
    })
    expect(p.shipTo?.party.state).toBe('OR')
    expect(p.shipTo?.source).toBe('CONTRACT')
  })

  it('a ship-to nobody stated stays null rather than defaulting to the client’s head office', () => {
    const p = partnerFunctions({ agreementClient: NIKE })
    expect(p.shipTo).toBeNull()
  })
})

describe('Consolidated billing joins contracts, never companies', () => {
  it('several contracts to one bill-to in one currency go on one invoice', () => {
    const v = mayConsolidate([
      { sellContractId: 's1', billToId: 'b', billToName: 'Nike SSC', payerId: 'p', currency: 'USD' },
      { sellContractId: 's2', billToId: 'b', billToName: 'Nike SSC', payerId: 'p', currency: 'USD' },
      { sellContractId: 's3', billToId: 'b', billToName: 'Nike SSC', payerId: 'p', currency: 'USD' },
    ])
    expect(v.ok).toBe(true)
    expect(v.together).toEqual(['s1', 's2', 's3'])
  })

  it('one invoice covering several contracts still names one bill-to, and refuses to consolidate across two of them', () => {
    const v = mayConsolidate([
      { sellContractId: 's1', billToId: 'b1', billToName: 'Nike SSC', payerId: 'p', currency: 'USD' },
      { sellContractId: 's2', billToId: 'b2', billToName: 'Nike Retail', payerId: 'p', currency: 'USD' },
    ])
    expect(v.ok).toBe(false)
    expect(v.together).toEqual([])
    expect(v.says).toContain('one company')
  })

  it('contracts billing in two currencies are never consolidated, because that total is a total of nothing', () => {
    const v = mayConsolidate([
      { sellContractId: 's1', billToId: 'b', billToName: 'Nike SSC', payerId: 'p', currency: 'USD' },
      { sellContractId: 's2', billToId: 'b', billToName: 'Nike SSC', payerId: 'p', currency: 'EUR' },
    ])
    expect(v.ok).toBe(false)
    expect(v.says).toContain('total of nothing')
  })

  it('contracts settled by two different payers are refused', () => {
    const v = mayConsolidate([
      { sellContractId: 's1', billToId: 'b', billToName: 'Nike SSC', payerId: 'p1', currency: 'USD' },
      { sellContractId: 's2', billToId: 'b', billToName: 'Nike SSC', payerId: 'p2', currency: 'USD' },
    ])
    expect(v.ok).toBe(false)
    expect(v.says).toContain('different payers')
  })
})

describe('Self-billing: their document, their number', () => {
  it('a self-billed invoice is flagged as issued by the client, and we never number it ourselves', () => {
    const v = selfBilling({ selfBilled: true, clientDocumentNumber: 'SB-9981' })
    expect(v.selfBilled).toBe(true)
    expect(v.mayNumberOurselves).toBe(false)
    expect(v.number).toBe('SB-9981')
  })

  it('a self-billed invoice refuses our own numbering sequence, because two numbers for one document is how a payment goes missing', () => {
    const v = selfBilling({ selfBilled: true, clientDocumentNumber: null })
    expect(v.mayNumberOurselves).toBe(false)
    expect(v.number).toBeNull()
    expect(v.says).toContain('the receipt matches neither')
  })

  it('an ordinary invoice takes the next number in our own sequence', () => {
    const v = selfBilling({ selfBilled: false })
    expect(v.mayNumberOurselves).toBe(true)
  })
})
