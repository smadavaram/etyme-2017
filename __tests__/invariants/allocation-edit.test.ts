import { describe, it, expect } from 'vitest'
import { planAllocationEdit, type AllocationRow } from '@/lib/money/allocation-edit'

const one: AllocationRow[] = [{ id: 'a1', costCenterId: 'cc1', internalOrderId: null, glAccount: null, shareBps: 10_000 }]
const two: AllocationRow[] = [
  { id: 'a1', costCenterId: 'cc1', internalOrderId: null, glAccount: null, shareBps: 6_000 },
  { id: 'a2', costCenterId: 'cc2', internalOrderId: null, glAccount: '6100', shareBps: 4_000 },
]

describe('correcting a contract’s cost coding', () => {
  it('a new GL account on the only line is accepted and names what changed', () => {
    const p = planAllocationEdit(one, { allocationId: 'a1', glAccount: ' 6200 ' })
    expect(p).toMatchObject({ ok: true, changes: { glAccount: '6200' }, fields: ['GL account'] })
  })
  it('a different cost center and an order are accepted together', () => {
    const p = planAllocationEdit(one, { allocationId: 'a1', costCenterId: 'cc9', internalOrderId: 'io1' })
    expect(p).toMatchObject({ ok: true, changes: { costCenterId: 'cc9', internalOrderId: 'io1' } })
  })
  it('an empty GL account clears the override', () => {
    const p = planAllocationEdit(two, { allocationId: 'a2', glAccount: '' })
    expect(p).toMatchObject({ ok: true, changes: { glAccount: null } })
  })
  it('a share that would leave the shares at 90 percent is refused in a sentence', () => {
    const p = planAllocationEdit(one, { allocationId: 'a1', sharePct: 90 })
    expect(p).toEqual({ ok: false, says: 'The shares on a contract add up to 100%. This change would make them 90.00%.' })
  })
  it('moving a share on a split is refused unless the shares still add up to 100 percent', () => {
    expect(planAllocationEdit(two, { allocationId: 'a1', sharePct: 70 }).ok).toBe(false)
    expect(planAllocationEdit(two, { allocationId: 'a1', sharePct: 60, glAccount: '7000' }).ok).toBe(true)
  })
  it('a save that changes nothing is refused so a held line is not released for nothing', () => {
    const p = planAllocationEdit(one, { allocationId: 'a1', sharePct: 100, glAccount: '' })
    expect(p.ok).toBe(false)
  })
  it('a line that is not on this contract is refused', () => {
    expect(planAllocationEdit(one, { allocationId: 'zz', glAccount: '1' }).ok).toBe(false)
  })
  it('a cost center already used by another line of the contract is refused', () => {
    const p = planAllocationEdit(two, { allocationId: 'a2', costCenterId: 'cc1' })
    expect(p).toEqual({ ok: false, says: 'Another line of this contract already uses that cost center.' })
  })
  it('a share of zero or over 100 percent is refused', () => {
    expect(planAllocationEdit(one, { allocationId: 'a1', sharePct: 0 }).ok).toBe(false)
    expect(planAllocationEdit(one, { allocationId: 'a1', sharePct: 101 }).ok).toBe(false)
  })
})
