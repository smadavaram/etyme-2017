import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mismatchTitle } from '@/lib/twin/performers'
import { receiptFlagNotices, flagClosedBy, RECEIPT_FLAG_ACT } from '@/lib/twin/held-notices'

/**
 * Walk 7, 2026-11-08: the twin recorded a bank hold on a clean receipt as
 * a mismatch, so both seats read "PR-2026-0441 from Pinnacle Resourcing
 * does not match what was accepted", the greeting said it "matches now",
 * and the line stayed after the receipt was paid.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a bank hold on a clean invoice receipt is told as a hold', () => {
  it('the notice about a receipt held on the supplier’s bank says it is held, never that it does not match', () => {
    const title = mismatchTitle({ number: 'PR-2026-0441', supplierName: 'Pinnacle Resourcing', verdict: 'CLEAN', heldOn: 'BANK', flag: 'BANK_HOLD' })
    expect(title).toBe('PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked')
    expect(title).not.toContain('does not match')
  })

  it('a receipt whose hours or rate differ is still told it does not match what was accepted', () => {
    expect(mismatchTitle({ number: 'PR-2026-0442', supplierName: 'Pinnacle Resourcing', verdict: 'MISMATCH', heldOn: null, flag: 'MISMATCH' }))
      .toBe('PR-2026-0442 from Pinnacle Resourcing does not match what was accepted')
  })

  it('the nightly run decides what the paying team is told with one answer, and carries the bank hold in what it records', () => {
    const src = read('src/lib/twin/run.ts')
    expect(src).toContain('const flag = receiptFlag(v)')
    expect(src).toContain('heldOn: v.heldOn ?? null, flag')
    // A payable receipt gets the question; every held one gets a line, never a silent pass.
    expect(src).toContain("if (flag === 'NONE') {")
    // The old branch on the verdict alone is gone, so a clean receipt held on the bank cannot fall into it.
    expect(src).not.toContain("if (v.verdict !== 'CLEAN') {\n      tally(await act({\n        companyId, action: 'invoice_receipt.flag_mismatch'")
  })

  it('the line about a receipt closes once it is paid, voided or cancelled, and stays while it is still held', () => {
    expect(flagClosedBy('PAID')).toBe(true)
    expect(flagClosedBy('VOID')).toBe(true)
    expect(flagClosedBy('CANCELLED')).toBe(true)
    expect(flagClosedBy('SUBMITTED')).toBe(false)
    expect(flagClosedBy(null)).toBe(false)
  })

  it('only the twin’s own receipt lines are closed this way, never another notice about the same invoice', () => {
    const rows = [
      { id: 'n1', entityId: 'inv1', data: { twinAction: RECEIPT_FLAG_ACT } },
      { id: 'n2', entityId: 'inv1', data: { twinAction: 'invoice_receipt.pay' } },
      { id: 'n3', entityId: 'inv1', data: null },
      { id: 'n4', entityId: null, data: { twinAction: RECEIPT_FLAG_ACT } },
    ]
    expect(receiptFlagNotices(rows).map((n) => n.id)).toEqual(['n1'])
  })

  it('Ask Etyme withholds a paid receipt’s line from "Since you last looked", and never says a bank hold "matches now"', () => {
    expect(read('src/app/api/conversations/twin/notices.ts')).toContain('for (const id of await closedFlagNotices(read)) withheld.add(id)')
    const told = read('src/app/api/conversations/twin/read.ts')
    expect(told).toContain("was?.flag ? was.flag === 'MISMATCH' : was?.verdict !== 'CLEAN'")
  })
})
