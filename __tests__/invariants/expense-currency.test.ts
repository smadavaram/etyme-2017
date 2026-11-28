import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { currencyOfLine, currencyOfExpense, claimSays } from '@/lib/expense-currency'
import { approvalAmountSays } from '@/app/dashboard/program/approval-words'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

const line = (over: Partial<Parameters<typeof currencyOfLine>[0]> = {}) => ({
  personId: 'maria',
  billCurrency: 'USD',
  buyLinks: [
    { buyContract: { payCurrency: 'USD', candidates: [{ personId: 'maria', payCurrency: 'MXN' }] } },
  ],
  ...over,
})

describe('the currency an expense is in', () => {
  it('an expense is in the pay currency of the line that pays the worker', () => {
    expect(currencyOfLine(line())).toBe('MXN')
  })

  it('a line paying a firm below, with no pay of the person named, is in that buy line\'s currency', () => {
    expect(currencyOfLine(line({ buyLinks: [{ buyContract: { payCurrency: 'VND', candidates: [] } }] }))).toBe('VND')
  })

  it('a one-person firm paid by nobody below her is in the currency she bills in', () => {
    expect(currencyOfLine(line({ billCurrency: 'EUR', buyLinks: [] }))).toBe('EUR')
  })

  it('an expense keeps the currency written when it was raised', () => {
    expect(currencyOfExpense({ currency: 'vnd', sellContract: line() })).toBe('VND')
  })

  it('an expense raised before the column exists reads the line\'s own currency, never a default', () => {
    expect(currencyOfExpense({ currency: null, sellContract: line() })).toBe('MXN')
    expect(currencyOfExpense({ currency: null, sellContract: null })).toBeNull()
  })

  it('a claim with no known currency is said without a symbol, never as dollars', () => {
    expect(claimSays(149.98, null)).toBe('149.98')
    expect(claimSays(149.98, 'USD')).toBe('$149.98')
    expect(claimSays(2450, 'MXN')).toBe('MX$2,450.00')
  })

  it('the Approvals row says a peso claim in pesos and a week in hours', () => {
    expect(approvalAmountSays({ kind: 'expense', amount: 2450, currency: 'MXN' })).toBe(' · MX$2,450.00')
    expect(approvalAmountSays({ kind: 'timesheet', amount: 40, currency: null })).toBe(' · 40 hours')
  })

  it('both doors that raise an expense write its currency, and the seeds do too', () => {
    const route = read('src/app/api/expenses/route.ts')
    expect(route.match(/currency: await expenseCurrencyFor\(/g)?.length).toBe(2)
    expect(read('src/lib/seed-world.ts')).toContain('currency: await expenseCurrencyFor(')
    expect(read('src/lib/seed-order-to-cash.ts')).toContain('currency: await expenseCurrencyFor(')
  })

  it('no row on the client\'s queue or its day prints an expense in dollars by default', () => {
    const view = read('src/app/api/program/view.ts')
    const decisions = read('src/app/api/decisions/route.ts')
    expect(view).not.toContain('$${Number(e.total)')
    expect(decisions).not.toContain('$${Number(exp.total)')
    expect(view).toContain('currencyOfExpense(')
    expect(decisions).toContain('currencyOfExpense(')
  })
})
