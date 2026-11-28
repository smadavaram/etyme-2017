import { describe, it, expect } from 'vitest'
import { defaultContractFor, tierIn, checkContract, withDefaultsForMissingActs } from '@/lib/twin/role-contract'

// A saved contract written before an act existed has no tier for it.
const saved = () => {
  const d = defaultContractFor('PROGRAM_MANAGER')
  const drop = (l: readonly string[]) => l.filter((a) => a !== 'pod.sale.accept')
  return { ...d, version: 3, id: 'row-1', actsAlone: drop(d.actsAlone), needsApproval: drop(d.needsApproval), neverTouches: drop(d.neverTouches) }
}

describe('a saved role contract that predates an act', () => {
  it('reads the project acceptance at its shipped default tier, which is needs approval, not never', () => {
    expect(tierIn(saved(), 'pod.sale.accept')).toBe('NEEDS_APPROVAL')
  })
  it('does not rewrite the stored row it was given', () => {
    const c = saved()
    const before = JSON.stringify(c)
    withDefaultsForMissingActs(c)
    expect(JSON.stringify(c)).toBe(before)
  })
  it('can be saved again unchanged, because the missing act is filled at its default', () => {
    const filled = withDefaultsForMissingActs(saved())
    expect(checkContract(filled, 'PROGRAM_MANAGER')).toEqual([])
  })
  it('keeps a tier the company chose for an act it did place', () => {
    const c = saved()
    const moved = { ...c, needsApproval: c.needsApproval.filter((a) => a !== 'bill.draft'), neverTouches: [...c.neverTouches, 'bill.draft'] }
    expect(tierIn(moved, 'bill.draft')).toBe('NEVER')
  })
  it('still keeps a floor act out of every tier but never', () => {
    expect(tierIn(saved(), 'payroll.release')).toBe('NEVER')
  })
})
