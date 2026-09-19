import { describe, it, expect } from 'vitest'
import { chainTop } from '@/lib/chain-top'

/**
 * Northbend Athletic's dashboard said five contractors through four suppliers for
 * three people, and showed what CloudEPA charges Computer Systems for
 * Helena. The client sees the contract it pays, and nothing below it.
 */

const rung = (id: string, personId: string, companyId: string, clientCompanyId: string, billRate: number) =>
  ({ id, personId, companyId, clientCompanyId, billRate })

describe('what a client sees of a supply chain', () => {
  it('one person bought through two rungs is one contractor, supplied by the firm the client pays', () => {
    const top = chainTop([
      rung('sub', 'helena', 'cloudepa', 'computer-systems', 11800),
      rung('top', 'helena', 'computer-systems', 'nike', 14500),
    ])
    expect(top.map((c) => c.id)).toEqual(['top'])
  })

  it("a sub-supplier's rate never reaches the client's page", () => {
    const top = chainTop([
      rung('sub', 'helena', 'cloudepa', 'computer-systems', 11800),
      rung('top', 'helena', 'computer-systems', 'nike', 14500),
    ])
    expect(top.map((c) => c.billRate)).toEqual([14500])
  })

  it('a direct placement is left exactly as it is', () => {
    const direct = [rung('a', 'omar', 'brightmoor', 'nike', 13200)]
    expect(chainTop(direct)).toEqual(direct)
  })

  it('two people from the same supplier are two contractors, and a three-rung chain is still one', () => {
    const top = chainTop([
      rung('l', 'lucia', 'pinnacle', 'nike', 9800),
      rung('i', 'ingrid', 'pinnacle', 'nike', 11500),
      rung('c3', 'helena', 'bench-co', 'cloudepa', 9000),
      rung('c2', 'helena', 'cloudepa', 'computer-systems', 11800),
      rung('c1', 'helena', 'computer-systems', 'nike', 14500),
    ])
    expect(top.map((c) => c.id).sort()).toEqual(['c1', 'i', 'l'])
  })
})
