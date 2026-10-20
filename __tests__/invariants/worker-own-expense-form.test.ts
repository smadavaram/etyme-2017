/**
 * The worker files their own expense from Your work.
 *
 * Money opened `POST /api/expenses` to a worker filing their own on their
 * own placement (2026-10-20, lib/money/own-expense). The worker's page had
 * no form, so the door existed and nobody could reach it. The form's
 * rules are pure (`own-expense.ts`); the page is checked at source, in the
 * style of my-work-papers.test.ts, because it is a client component with
 * no route handler to call.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { EXPENSE_KINDS, NOTE_LONGEST, amountOf, expenseBody, type ExpenseAsTyped } from '@/app/dashboard/my-work/own-expense'

const TODAY = '2026-10-20'
const typed = (over: Partial<ExpenseAsTyped> = {}): ExpenseAsTyped => ({
  contractId: 'sc_techpeple_helena',
  date: '2026-10-14',
  kind: 'TRAVEL',
  amount: '412.50',
  note: 'Flight to the client site',
  receiptUrl: '',
  today: TODAY,
  ...over,
})

const read = (f: string) => readFileSync(join(process.cwd(), 'src/app/dashboard/my-work', f), 'utf8')

describe('the worker’s own expense form', () => {
  it('the expense is sent on the placement she files her hours on, as one line for the amount she paid', () => {
    const v = expenseBody(typed())
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.body).toEqual({
      sellContractId: 'sc_techpeple_helena',
      category: 'TRAVEL',
      description: 'Flight to the client site',
      periodStart: '2026-10-14T00:00:00.000Z',
      periodEnd: '2026-10-14T00:00:00.000Z',
      items: [{ description: 'Flight to the client site', quantity: 1, unitPrice: 412.5 }],
    })
  })

  it('an amount with cents is sent to the cent in whole currency, never in cents', () => {
    expect(amountOf('412.50')).toBe(412.5)
    expect(amountOf('1,200')).toBe(1200)
    expect(amountOf('0.10')).toBe(0.1)
    expect(amountOf('19.99')).toBe(19.99)
  })

  it('an amount that is not a number, is nothing, or goes past the cent is refused in a sentence before anything is sent', () => {
    for (const amount of ['', 'abc', '-5', '12.345', '$40']) {
      const v = expenseBody(typed({ amount }))
      expect(v.ok, amount).toBe(false)
      if (!v.ok) expect(v.says).toMatch(/^Enter the amount/)
    }
    const zero = expenseBody(typed({ amount: '0' }))
    expect(zero.ok).toBe(false)
    if (!zero.ok) expect(zero.says).toBe('Enter the amount you paid. It cannot be nothing.')
  })

  it('a day that has not happened yet is refused in a sentence', () => {
    const v = expenseBody(typed({ date: '2026-10-21' }))
    expect(v).toEqual({ ok: false, field: 'date', says: 'That day has not happened yet. File an expense once you have paid it.' })
    expect(expenseBody(typed({ date: TODAY })).ok).toBe(true)
  })

  it('an expense with no note is refused, because whoever approves it reads the note first', () => {
    const v = expenseBody(typed({ note: '   ' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('Whoever approves it reads this first')
    const long = expenseBody(typed({ note: 'x'.repeat(NOTE_LONGEST + 1) }))
    expect(long.ok).toBe(false)
  })

  it('a receipt link must be a web address, and a file name typed into it is refused in a sentence', () => {
    const v = expenseBody(typed({ receiptUrl: 'receipt scan 3.jpg' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('must be a web address')
    const ok = expenseBody(typed({ receiptUrl: 'https://drive.example/receipt-412' }))
    expect(ok.ok && ok.body.receiptUrl).toBe('https://drive.example/receipt-412')
  })

  it('a receipt is optional, and an expense without one is sent without one', () => {
    const v = expenseBody(typed({ receiptUrl: '' }))
    expect(v.ok && 'receiptUrl' in v.body).toBe(false)
  })

  it('the worker never names who the expense is for or whether the client is billed for it: the route and the agreement decide', () => {
    const v = expenseBody(typed())
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.body).not.toHaveProperty('personId')
    expect(v.body).not.toHaveProperty('billable')
  })

  it('the kinds offered are the six the expense book already uses, and none of them belongs to one trade', () => {
    expect(EXPENSE_KINDS.map((k) => k.key)).toEqual(['TRAVEL', 'MEALS', 'EQUIPMENT', 'TRAINING', 'RELOCATION', 'OTHER'])
    for (const k of EXPENSE_KINDS) expect(k.label).not.toMatch(/software|laptop|license|cloud/i)
    expect(expenseBody(typed({ kind: 'SOFTWARE' })).ok).toBe(false)
  })

  it('Your work draws the expense form beside the week, on the placement her hours go on', () => {
    const page = read('page.tsx')
    const week = page.indexOf('<FileYourWeek')
    const expense = page.indexOf('<YourExpense on={data.filing}')
    expect(week).toBeGreaterThan(0)
    expect(expense).toBeGreaterThan(week)
    expect(page.slice(week, expense)).not.toContain('<YourPay')
  })

  it('the form posts to the expense route as the worker and shows the route’s own sentence, refusal or not', () => {
    const form = read('your-expense.tsx')
    expect(form).toContain("fetch('/api/expenses'")
    expect(form).toContain('readJson(res)')
    expect(form).toContain('setError(e.message)')
    expect(form).toContain("j.data?.message")
  })

  it('the form offers no upload box whose file would be thrown away: an expense keeps a link to its receipt and no file', () => {
    const form = read('your-expense.tsx')
    expect(form).not.toMatch(/type="file"/)
    expect(form).toContain('Link to the receipt')
  })

  it('the form never says desk or program office', () => {
    const form = read('your-expense.tsx') + read('own-expense.ts')
    const words = form.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
    expect(words).not.toMatch(/\bdesk\b|program office/i)
  })
})
