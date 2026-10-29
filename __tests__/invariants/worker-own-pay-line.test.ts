import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWorkersOwnPayLine } from '@/lib/money/paid-through'

/**
 * The Tapin walk, 2026-10-29: Ravi Kumar, Tapin's W2 at $45, read
 * "paid by Brightmoor Staffing · $100/hr" on his own page, which is
 * Brightmoor's price to Tapin. Supply's two readers of a worker's own pay
 * line now ask money's one rule (`isWorkersOwnPayLine`, `ownPayLineWhere`).
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

describe('a worker’s own pay line', () => {
  it('a worker’s own work page shows only the line that pays her, never a rung above', () => {
    // The shapes the walk met: the prime's line to the sub before the sub
    // wrote its own, and the sub's line that employs him.
    const lines = [
      { companyId: 'brightmoor', payRate: 100, contractType: 'C2C', vendorCompanyId: 'tapin', supplierSellContractId: null },
      { companyId: 'tapin', payRate: 45, contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null },
    ]
    const shown = lines.filter((l) => isWorkersOwnPayLine(l, []))
    expect(shown.map((l) => l.payRate)).toEqual([45])

    const route = src('app/api/me/work/route.ts')
    expect(route).toContain('.filter(l => isWorkersOwnPayLine(l.buyContract, ownCompanyIds))')
    expect(route).toContain('const ownCompanyIds = await ownCompanyIdsOf(personId)')
    expect(route).not.toContain('.filter(l => l.buyContract.supplierSellContractId === null)')
  })

  it('a worker’s own rate history reads only the line that pays her, never one bought from another firm', () => {
    const route = src('app/api/consultants/[id]/rate-progression/route.ts')
    expect(route).toContain('ownPayLineWhere(consultant.personId, await ownCompanyIdsOf(consultant.personId))')
    expect(route).not.toContain('isSelf ? { supplierSellContractId: null }')
  })
})
