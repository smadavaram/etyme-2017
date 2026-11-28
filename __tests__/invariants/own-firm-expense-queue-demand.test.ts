import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { approvesOnlyForWorker } from '@/lib/money/own-firm-expense'

/**
 * The fifth screen walk, 2026-11-04: Colleen Byrne's queue asked her to
 * approve her own $85 expense, filed before money made a one-person
 * firm's own expense approved on filing. The queue drops it through
 * money's `ownFirmExpenseIds`, so the mark and the greeting, which read
 * the queue, drop it too.
 */

const route = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')
const section2 = route.slice(route.indexOf('// ── 2. Expenses pending approval'), route.indexOf('// ── 2a.'))

describe('a one-person firm is never asked to approve her own expense on her queue', () => {
  it('a one-person firm’s own expense is never a decision on her queue, her mark or her greeting, and a firm with a team still sees its worker’s expense to approve', () => {
    expect(route).toContain("import { ownFirmExpenseIds } from '@/lib/money/own-firm-expense'")
    expect(section2).toContain('const ownFirm = await ownFirmExpenseIds(companyId, pendingExpenses)')
    expect(section2).toContain('for (const exp of pendingExpenses.filter((e) => !ownFirm.has(e.id))) {')
    // Only her own seat approves: her expense is dropped.
    expect(approvesOnlyForWorker([{ personId: 'colleen' }], 'colleen')).toBe(true)
    // Somebody else at the firm approves: the expense stays on the queue.
    expect(approvesOnlyForWorker([{ personId: 'colleen' }, { personId: 'bookkeeper' }], 'colleen')).toBe(false)
    expect(approvesOnlyForWorker([{ personId: 'owner' }], 'worker')).toBe(false)
  })
})
