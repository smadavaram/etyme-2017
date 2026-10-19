import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { billableNow, sortForBill, expenseLine, expenseTotal, type ExpenseRow } from '@/lib/expense-billing'

/**
 * A client-billable expense rides on the next invoice and is paid with it.
 *
 * INVOICED was a button with no invoice behind it; PAID was a word
 * nothing wrote. The flight the consultant paid for was approved and
 * then went nowhere.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const row = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 'e1', status: 'APPROVED', billable: true, invoiceId: null, sellContractId: 'sc1',
  personId: 'p1', personName: 'Tariq Al-Amin', category: 'TRAVEL', description: 'Flight PDX–DEN for the kickoff',
  total: 412.5, currency: 'USD', periodStart: new Date('2026-09-09T00:00:00Z'), periodEnd: new Date('2026-09-11T00:00:00Z'),
  payerName: 'Northbend Athletic', own: { kind: 'ACCEPTED', cents: 41_250 }, ...over,
})

describe('which expenses go on the next invoice', () => {
  it('an approved, billable expense the payer accepted and not yet on an invoice goes on', () => {
    expect(billableNow([row()]).map((e) => e.id)).toEqual(['e1'])
  })

  it('a non-billable expense never reaches a client invoice — it is reimbursed through pay', () => {
    expect(billableNow([row({ billable: false })])).toEqual([])
  })

  it('an expense still waiting on approval, or rejected, is not billed', () => {
    expect(billableNow([row({ status: 'SUBMITTED' }), row({ id: 'e2', status: 'REJECTED' })])).toEqual([])
  })

  it('an expense already on an invoice is not billed twice', () => {
    expect(billableNow([row({ invoiceId: 'inv1', status: 'INVOICED' })])).toEqual([])
  })
})

describe('the bill carries what the firm paying it accepted (the founder, 2026-10-19)', () => {
  it('a bill carries the expense at the amount the firm above accepted, never the amount the worker claimed', () => {
    const l = expenseLine(row({ own: { kind: 'ACCEPTED', cents: 38_000 } }))
    expect(l.amountCents).toBe(38_000)
    expect(l.description).toBe('Tariq Al-Amin — Travel expense: Flight PDX–DEN for the kickoff (accepted $380.00 of $412.50)')
    // And nothing nobody accepted has an amount at all.
    expect(() => expenseLine(row({ own: { kind: 'NONE' } }))).toThrow(/no acceptance from the firm paying it/)
  })

  it('an expense the payer has not accepted, or sent back, is left off the bill with a sentence', () => {
    const r = sortForBill([row({ own: { kind: 'NONE' } }), row({ id: 'e2', own: { kind: 'SENT_BACK', reason: 'No receipt for the cab.' } })])
    expect(r.on).toEqual([])
    expect(r.leftOff).toEqual([
      { expenseId: 'e1', says: 'Tariq Al-Amin’s travel expense of Sep 9, 2026 is not on this bill: Northbend Athletic has not accepted it yet.' },
      { expenseId: 'e2', says: 'Tariq Al-Amin’s travel expense of Sep 9, 2026 is not on this bill: Northbend Athletic sent it back (No receipt for the cab.).' },
    ])
  })

  it('an expense of a kind the agreement does not list is left off the bill with a sentence naming the agreement', () => {
    const says = 'The agreement between Northbend Athletic and Brightmoor does not list travel expenses as billable, so Northbend Athletic does not pay for this one.'
    const r = sortForBill([row({ leg: { bills: false, says } })])
    expect(r.on).toEqual([])
    expect(r.leftOff).toEqual([{ expenseId: 'e1', says: `Tariq Al-Amin’s travel expense is not on this bill: ${says}` }])
  })

  it('where the agreement lists the kind, the employer’s own flag does not keep it off the bill', () => {
    expect(sortForBill([row({ billable: false, leg: { bills: true, says: null } })]).on.map((e) => e.id)).toEqual(['e1'])
  })
})

describe('what the line says', () => {
  it('names the person, the kind of expense and what it was for, in cents', () => {
    const l = expenseLine(row())
    expect(l.description).toBe('Tariq Al-Amin — Travel expense: Flight PDX–DEN for the kickoff')
    expect(l.amountCents).toBe(41250)
    expect(l.expenseId).toBe('e1')
  })

  it('adds up in whole currency units the way the invoice total is kept', () => {
    expect(expenseTotal([expenseLine(row()), expenseLine(row({ id: 'e2', total: 87.5, own: { kind: 'ACCEPTED', cents: 8_750 } }))])).toBe(500)
  })
})

describe('the routes carry it through', () => {
  const GENERATE = read('src/lib/money/bill-generate.ts')
  const PAY = read('src/app/api/invoices/[id]/payments/route.ts')
  const ACTIONS = read('src/app/api/expenses/actions/route.ts')

  it('raising an invoice picks up the approved expenses the payer accepted on its contracts and marks them INVOICED with the invoice behind them', () => {
    expect(GENERATE).toContain("from '@/lib/expense-billing'")
    expect(GENERATE).toContain("status: 'APPROVED', invoiceId: null")
    // Billable is the agreement's where it says, and what goes on is what the payer accepted.
    expect(GENERATE).toContain('legBills(e, leg)')
    expect(GENERATE).toContain('payersOwn(leg.payerId,')
    expect(GENERATE).toContain("data: { status: 'INVOICED', invoiceId: invoice.id }")
  })

  it('an expense line has the expense behind it and no timesheet', () => {
    expect(GENERATE).toMatch(/expenseId: l\.expenseId,\s*timesheetId: null/)
  })

  it('an invoice with only expenses on it can still be raised', () => {
    expect(GENERATE).toContain('if (timesheets.length === 0 && expenseRows.length === 0 && milestones.length === 0)')
  })

  it('paying the invoice in full pays the expenses on it', () => {
    expect(PAY).toContain("await tx.expense.updateMany({ where: { invoiceId: id, status: 'INVOICED' }, data: { status: 'PAID' } })")
  })

  it('no button sets INVOICED any more', () => {
    expect(ACTIONS).toContain("const DECISIONS: Decision[] = ['submit', 'approve', 'reject']")
    expect(ACTIONS).not.toContain("updateData.status = 'INVOICED'")
  })
})
