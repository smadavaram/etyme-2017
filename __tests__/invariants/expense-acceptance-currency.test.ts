import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expenseCurrency, expenseOf } from '@/lib/money/expense-acceptance-read'

/**
 * An expense is in the currency it was spent in (`Expense.currency`,
 * written where it is raised). The acceptance and the bill read
 * `billCurrency` off the line instead, so a claim spent in pesos on a line
 * billed in dollars was accepted as dollars and could ride a dollar bill.
 */
const row = (currency: string | null, billCurrency: string) => ({
  id: 'e', companyId: 'c', personId: 'p', category: 'TRAVEL', billable: true, status: 'APPROVED',
  total: { toString: () => '2450.00' }, periodStart: new Date('2026-10-25T00:00:00Z'),
  company: { name: 'Corvane Packaging' }, person: { name: 'Fernanda Albuquerque' },
  currency, sellContractId: 'line', sellContract: { billCurrency, personId: 'p', buyLinks: [] },
})

describe('an expense is accepted in the currency it was spent in', () => {
  it('an expense spent in pesos on a line billed in dollars is accepted as pesos, not as dollars', () => {
    const e = expenseOf(row('MXN', 'USD'))
    expect(e.currency).toBe('MXN')
    expect(e.totalCents).toBe(245_000)
  })

  it('a dong expense carries no minor units, so 170,000 dong is 170,000 and never 17,000,000', () => {
    const e = expenseOf({ ...row('VND', 'USD'), total: { toString: () => '170000' } })
    expect(e.currency).toBe('VND')
    expect(e.totalCents).toBe(170_000)
  })

  it('an expense raised before the column existed reads the pay currency of the line paying the worker', () => {
    expect(expenseCurrency({
      currency: null,
      sellContract: { billCurrency: 'USD', personId: 'p', buyLinks: [{ buyContract: { payCurrency: 'INR', candidates: [{ personId: 'p', payCurrency: 'INR' }] } }] },
    })).toBe('INR')
    expect(expenseCurrency({ currency: null, sellContract: { billCurrency: 'GBP' } })).toBe('GBP')
  })

  it('the bill reads the expense’s own currency, so one in another currency than the bill is left off in a sentence and never added', () => {
    const gen = readFileSync(join(process.cwd(), 'src/lib/money/bill-generate.ts'), 'utf8')
    expect(gen).toContain('currency: expenseCurrency(e), periodStart: e.periodStart')
    expect(gen).not.toContain('currency: e.sellContract.billCurrency, periodStart: e.periodStart')
    const billing = readFileSync(join(process.cwd(), 'src/lib/expense-billing.ts'), 'utf8')
    expect(billing).toContain('nothing here converts one into the other')
  })
})
