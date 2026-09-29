import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { disputedBillDecision } from '@/app/api/decisions/disputed-bill'
import { notAcceptedSays } from '@/lib/money/payers-acceptance'

/**
 * An invoice receipt that did not match, on the decisions queue.
 *
 * Money's 12796ceee (CLAUDE.md, "What each rung may bill, and when",
 * rule 3): a week the paying firm has not accepted blocks the invoice
 * receipt over it, with no waiver. So that receipt is not "held until
 * somebody says why it should go in" — nobody can. It goes to the desk
 * that accepts the week, in money's own sentence.
 */

const bill = {
  id: 'bill-1',
  number: 'CEPA-0914',
  vendorName: 'CloudEPA',
  totalCents: 312_000,
  dueAt: new Date('2026-10-15T00:00:00Z'),
  receivedAt: new Date('2026-09-21T00:00:00Z'),
}
const helenasWeek = notAcceptedSays(
  'Computer Systems',
  [{ id: 'ts-1', periodStart: new Date('2026-09-14T00:00:00Z'), personName: 'Helena Marsh' }],
  'pay'
)
const apClerk = { mayRecordPayment: true, mayAcceptWeeks: false }
const weekDesk = { mayRecordPayment: false, mayAcceptWeeks: true }

describe('an invoice receipt blocked by a week the paying firm has not accepted', () => {
  it("says which firm has not accepted whose week, and to accept it first, in money's own sentence", () => {
    const row = disputedBillDecision(bill, helenasWeek, weekDesk)!
    expect(row.subtitle).toBe(
      '$3120.00 · Computer Systems has not accepted Helena Marsh’s week of September 14. Accept it first, then pay this invoice.'
    )
  })

  it('never says it is held until somebody says why it should go in, because nobody can', () => {
    const row = disputedBillDecision(bill, helenasWeek, weekDesk)!
    expect(row.subtitle).not.toContain('says why it should go in')
    expect(row.title).toBe('Invoice receipt CEPA-0914 from CloudEPA waits on a week you have not accepted')
  })

  it('goes to the desk that accepts weeks and opens the timesheets, not the AP page', () => {
    const row = disputedBillDecision(bill, helenasWeek, weekDesk)!
    expect(row.actionUrl).toBe('/dashboard/timesheets')
  })

  it('is not put on an AP clerk who cannot accept the week, since there is nothing there to decide', () => {
    expect(disputedBillDecision(bill, helenasWeek, apClerk)).toBeNull()
  })
})

describe('an invoice receipt that did not match for a reason somebody may waive', () => {
  it('still says it is held out of payment runs until somebody says why it should go in', () => {
    const row = disputedBillDecision(bill, null, apClerk)!
    expect(row.title).toBe('Invoice receipt CEPA-0914 from CloudEPA does not match')
    expect(row.subtitle).toBe('$3120.00 · held out of payment runs until somebody says why it should go in')
    expect(row.actionUrl).toBe('/dashboard/ap')
  })

  it('an empty sentence from money means every week is accepted, and the mismatch stays waivable', () => {
    expect(disputedBillDecision(bill, '', apClerk)?.actionUrl).toBe('/dashboard/ap')
  })

  it('stays with the desk that pays and is not put on the desk that only accepts weeks', () => {
    expect(disputedBillDecision(bill, null, weekDesk)).toBeNull()
  })
})

describe('the decisions queue asks money, not its own copy of the rule', () => {
  it('reads the waiting weeks from the same door the AP exception queue uses, ending "then pay", since the invoice is already recorded', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')
    expect(route).toContain("import { payersBook } from '@/lib/money/payers-acceptance-read'")
    expect(route).toMatch(/payersBook\(\{\s*buyContractId: b\.buyContractId, periodStart: b\.periodStart, periodEnd: b\.periodEnd, then: 'pay',/)
    expect(route).toContain("mayAcceptWeeks: hasAnyPermission(caller.permissions, ['timesheets.approve'])")
  })
})
