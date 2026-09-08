import { describe, it, expect } from 'vitest'
import {
  descend, whereHoursLive, hopsBelow, mayBill, legMargin, roleOf, type Rung,
} from '@/lib/work-chain'

/**
 * Adobe ← Computer Systems ← CloudEPA ← Priya.
 *
 * Two sell contracts. Computer Systems' buy contract points at
 * CloudEPA's sell contract, which is the edge that makes the ladder
 * walkable. CloudEPA employs Priya, so its own buy side points at
 * nobody and the ladder ends.
 */
const CHAIN: Rung[] = [
  {
    sellContractId: 'cs-sell', companyId: 'computer-systems',
    buyContractId: 'cs-buy', supplierSellContractId: 'cloudepa-sell',
  },
  {
    sellContractId: 'cloudepa-sell', companyId: 'cloudepa',
    buyContractId: 'cloudepa-buy', supplierSellContractId: null,
  },
]

const DIRECT: Rung[] = [
  {
    sellContractId: 'only', companyId: 'cloudepa',
    buyContractId: 'only-buy', supplierSellContractId: null,
  },
]

describe('Finding the hours from anywhere in the chain', () => {
  it('walks from the prime all the way down to the firm that employs the person', () => {
    expect(descend('cs-sell', CHAIN)).toEqual(['cs-sell', 'cloudepa-sell'])
  })

  it('finds the hours on the employer’s contract, not the prime’s', () => {
    expect(whereHoursLive('cs-sell', CHAIN)).toBe('cloudepa-sell')
  })

  it('treats a direct placement as a chain of one rather than a special case', () => {
    expect(descend('only', DIRECT)).toEqual(['only'])
    expect(whereHoursLive('only', DIRECT)).toBe('only')
    expect(hopsBelow('only', DIRECT)).toBe(0)
  })

  it('counts one firm standing between the client and the person', () => {
    expect(hopsBelow('cs-sell', CHAIN)).toBe(1)
    expect(hopsBelow('cloudepa-sell', CHAIN)).toBe(0)
  })

  it('lets the prime bill hours filed on its sub’s contract', () => {
    expect(mayBill('cs-sell', 'cloudepa-sell', CHAIN)).toBe(true)
  })

  it('refuses to let the sub bill hours filed above it', () => {
    // The ladder only descends. CloudEPA cannot reach up to Computer
    // Systems' contract, and should not be able to.
    expect(mayBill('cloudepa-sell', 'cs-sell', CHAIN)).toBe(false)
  })

  it('refuses to let anybody bill hours from a chain they are not on', () => {
    const other: Rung[] = [
      ...CHAIN,
      { sellContractId: 'someone-else', companyId: 'vertex', buyContractId: null, supplierSellContractId: null },
    ]
    expect(mayBill('cs-sell', 'someone-else', other)).toBe(false)
  })

  it('stops rather than hangs when the data points at itself', () => {
    const looped: Rung[] = [
      { sellContractId: 'a', companyId: 'x', buyContractId: null, supplierSellContractId: 'b' },
      { sellContractId: 'b', companyId: 'y', buyContractId: null, supplierSellContractId: 'a' },
    ]
    expect(descend('a', looped)).toEqual(['a', 'b'])
  })

  it('still answers when a rung further down was not read', () => {
    // A firm reading only its own rows sees the id below it and not the
    // row. That is a partial read, not a broken chain.
    const mineOnly: Rung[] = [CHAIN[0]]
    expect(descend('cs-sell', mineOnly)).toEqual(['cs-sell', 'cloudepa-sell'])
  })
})

describe('What each leg of a chain makes', () => {
  it('gives the prime $25 an hour on forty hours — $1,000', () => {
    const m = legMargin({ hours: 40, soldRateCents: 13_500, boughtRateCents: 11_000 })
    expect(m.revenueCents).toBe(540_000)
    expect(m.costCents).toBe(440_000)
    expect(m.marginCents).toBe(100_000)
  })

  it('gives the sub the same $1,000, and neither leg can see the other', () => {
    const m = legMargin({ hours: 40, soldRateCents: 11_000, boughtRateCents: 8_500 })
    expect(m.marginCents).toBe(100_000)
  })

  it('leaves the margin blank rather than reporting the whole invoice as profit', () => {
    const m = legMargin({ hours: 40, soldRateCents: 13_500, boughtRateCents: null })
    expect(m.revenueCents).toBe(540_000)
    expect(m.costCents).toBeNull()
    expect(m.marginCents).toBeNull()
  })
})

describe('Which company is saying what about a week of work', () => {
  const parties = {
    employerCompanyId: 'cloudepa',
    endClientCompanyId: 'adobe',
    clientCompanyId: 'computer-systems',
  }

  it('has the employer accepting what it will pay for', () => {
    expect(roleOf({ companyId: 'cloudepa', ...parties })).toBe('EMPLOYER_ACCEPTANCE')
  })

  it('has the end client saying the work happened', () => {
    expect(roleOf({ companyId: 'adobe', ...parties })).toBe('CLIENT_APPROVAL')
  })

  it('has the prime in the middle passing it up, which is neither of those', () => {
    expect(roleOf({ companyId: 'computer-systems', ...parties })).toBe('PASS_THROUGH')
  })

  it('treats a direct placement’s employer as the employer, not the client', () => {
    expect(roleOf({
      companyId: 'cloudepa', employerCompanyId: 'cloudepa',
      endClientCompanyId: null, clientCompanyId: 'cloudepa',
    })).toBe('EMPLOYER_ACCEPTANCE')
  })
})
