import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Over what a seat reads what placements make (founder, 2026-11-08: the
 * Owner gives access by team, by role or for the whole company). The
 * narrowing is at the query: the sell lines a reach opens are the only
 * lines the margin service is asked about.
 */

const db = vi.hoisted(() => ({
  sellContract: { findMany: vi.fn() },
  contractCommission: { findMany: vi.fn() },
  submission: { findMany: vi.fn() },
  contractLink: { findMany: vi.fn() },
  orgUnit: { findMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

import { widest, reachSays, sellLinesInReach, teamsSay } from '@/lib/money/margin-reach'

beforeEach(() => { for (const t of Object.values(db)) for (const f of Object.values(t)) (f as any).mockReset() })

describe('who reads what placements make, and over what', () => {
  it('the Owner’s figure is the firm’s: a whole-company reach reads every line, unnarrowed', async () => {
    expect(await sellLinesInReach('brightmoor', { scope: 'COMPANY', unitIds: [] }, 'jenna')).toBeNull()
    expect(db.sellContract.findMany).not.toHaveBeenCalled()
  })

  it('a manager given margin for the Dayton team reads the Dayton placements’ margin and nothing else', async () => {
    db.sellContract.findMany.mockResolvedValue([{ id: 'dayton-1' }, { id: 'dayton-2' }])
    const ids = await sellLinesInReach('brightmoor', { scope: 'UNIT', unitIds: ['dayton', 'dayton-west'] }, 'valeria')
    expect(ids).toEqual(['dayton-1', 'dayton-2'])
    expect(db.sellContract.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'brightmoor',
      OR: [{ orgUnitId: { in: ['dayton', 'dayton-west'] } }, { deliveryUnitId: { in: ['dayton', 'dayton-west'] } }],
    })
  })

  it('a reader given margin on their own work reads the placements they work, sold, recruited or put forward', async () => {
    db.sellContract.findMany
      .mockResolvedValueOnce([{ id: 'own-line' }])
      .mockResolvedValueOnce([{ id: 'submitted-line' }])
    db.contractCommission.findMany
      .mockResolvedValueOnce([{ sellContractId: 'sold-line' }])
      .mockResolvedValueOnce([{ buyContractId: 'buy-1' }])
    db.submission.findMany.mockResolvedValue([{ requirementId: 'req-1', personId: 'rajesh' }])
    db.contractLink.findMany.mockResolvedValue([{ sellContractId: 'recruited-line' }])
    const ids = await sellLinesInReach('brightmoor', { scope: 'PERSON', unitIds: [] }, 'jonas')
    expect(new Set(ids)).toEqual(new Set(['own-line', 'sold-line', 'recruited-line', 'submitted-line']))
    // Every tie is read at the reader's own firm.
    expect(db.contractLink.findMany.mock.calls[0][0].where.sellContract).toEqual({ companyId: 'brightmoor' })
  })

  it('a reach the record cannot answer reads as no lines, never as the firm’s', async () => {
    expect(await sellLinesInReach('brightmoor', { scope: 'NONE', unitIds: [] }, 'x')).toEqual([])
    expect(await sellLinesInReach('brightmoor', { scope: 'UNIT', unitIds: [] }, 'x')).toEqual([])
    db.sellContract.findMany.mockRejectedValue(new Error('down'))
    expect(await sellLinesInReach('brightmoor', { scope: 'UNIT', unitIds: ['dayton'] }, 'x')).toEqual([])
  })

  it('margin.read and pnl.read together reach the wider of the two, and two team grants reach both teams', () => {
    expect(widest({ has: true, scope: 'PERSON', unitIds: [] }, { has: true, scope: 'COMPANY', unitIds: [] }).scope).toBe('COMPANY')
    expect(widest({ has: true, scope: 'UNIT', unitIds: ['a'] }, { has: true, scope: 'UNIT', unitIds: ['b'] }).unitIds).toEqual(['a', 'b'])
    expect(widest({ has: false, scope: 'NONE', unitIds: [] }, { has: true, scope: 'PERSON', unitIds: [] }).scope).toBe('PERSON')
  })

  it('a narrowed page says whose figures these are, so it never reads as the firm’s book', () => {
    expect(reachSays({ scope: 'UNIT', unitNames: ['Dayton'] }, 'Brightmoor Staffing'))
      .toBe('You read margin for the Dayton team and every team under it. The Owner reads Brightmoor Staffing’s whole book.')
    expect(reachSays({ scope: 'PERSON', unitNames: [] }, 'Brightmoor Staffing')).toContain('your own placements only')
    expect(reachSays({ scope: 'COMPANY', unitNames: [] }, 'Brightmoor Staffing')).toBeNull()
    expect(teamsSay(['Dayton', 'Belfast', 'Pune'])).toBe('the Dayton, Belfast and Pune teams')
  })

  it('Profitability is narrowed at the query: its pairs, its period cut and its postings read only the lines in reach', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/profitability/route.ts'), 'utf8')
    expect(route).toMatch(/const reach = await marginReachFor\(caller\)/)
    expect(route).toMatch(/pairsFor\(companyId, scope, only\)/)
    expect(route).toMatch(/pairsFor\(companyId, 'ALL', only\)/)
    expect(route).toMatch(/sellContractId: \{ in: only \}/)
    // The door stays yes or no; the reach is read after it, before any figure.
    expect(route.indexOf("hasPermission(caller.permissions, 'margin.read')")).toBeLessThan(route.indexOf('await marginReachFor(caller)'))
    expect(route.indexOf('await marginReachFor(caller)')).toBeLessThan(route.indexOf('await pairsFor('))
  })

  it('cash flow shows payroll only to a seat that reads the whole firm’s payroll', () => {
    const flow = readFileSync(join(process.cwd(), 'src/app/api/ap/cash-flow.ts'), 'utf8')
    expect(flow).toMatch(/permissionScope\(reading\.caller, 'payroll\.read'\)\)\.scope === 'COMPANY'/)
  })
})
