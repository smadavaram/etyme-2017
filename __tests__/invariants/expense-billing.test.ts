import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { billableNow, expenseLine, expenseTotal, type ExpenseRow } from '@/lib/expense-billing'

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
  total: 412.5, currency: 'USD', periodEnd: new Date('2026-09-11T00:00:00Z'), ...over,
})

describe('which expenses go on the next invoice', () => {
  it('an approved, billable expense not yet on an invoice goes on', () => {
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

describe('what the line says', () => {
  it('names the person, the kind of expense and what it was for, in cents', () => {
    const l = expenseLine(row())
    expect(l.description).toBe('Tariq Al-Amin — Travel expense: Flight PDX–DEN for the kickoff')
    expect(l.amountCents).toBe(41250)
    expect(l.expenseId).toBe('e1')
  })

  it('adds up in whole currency units the way the invoice total is kept', () => {
    expect(expenseTotal([expenseLine(row()), expenseLine(row({ id: 'e2', total: 87.5 }))])).toBe(500)
  })
})

describe('the routes carry it through', () => {
  const GENERATE = read('src/app/api/invoices/generate/route.ts')
  const PAY = read('src/app/api/invoices/[id]/payments/route.ts')
  const ACTIONS = read('src/app/api/expenses/actions/route.ts')

  it('raising an invoice picks up the approved billable expenses on its contracts and marks them INVOICED with the invoice behind them', () => {
    expect(GENERATE).toContain("from '@/lib/expense-billing'")
    expect(GENERATE).toContain("status: 'APPROVED', billable: true, invoiceId: null")
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
