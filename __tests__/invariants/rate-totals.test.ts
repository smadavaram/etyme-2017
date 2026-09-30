import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { activeRateTotals } from '@/lib/money/rate-totals'

describe('the running bill rates are added one currency at a time', () => {
  it('rupees and dollars are never added: two currencies give two totals', () => {
    const t = activeRateTotals([
      { rate: 14_200, currency: 'USD', withheld: false },
      { rate: 11_600, currency: 'USD', withheld: false },
      { rate: 800_000, currency: 'INR', withheld: false },
    ])
    expect(t.byCurrency).toEqual([
      { currency: 'INR', cents: 800_000 },
      { currency: 'USD', cents: 25_800 },
    ])
    expect(t.refusedBecause).toBeNull()
  })

  it('one currency gives one total', () => {
    const t = activeRateTotals([{ rate: 14_200, currency: 'USD', withheld: false }])
    expect(t.byCurrency).toEqual([{ currency: 'USD', cents: 14_200 }])
  })

  it('a total over part of the book is not the book’s: one rate withheld from this desk blanks the total and says why', () => {
    const t = activeRateTotals([
      { rate: 14_200, currency: 'USD', withheld: false },
      { rate: null, currency: 'USD', withheld: true },
    ])
    expect(t.byCurrency).toEqual([])
    expect(t.refusedBecause).toBe('1 of 2 running lines bills at a rate this desk does not read, so there is no total.')
  })

  it('a running line with no bill rate set blanks the total rather than counting as nothing', () => {
    const t = activeRateTotals([
      { rate: 14_200, currency: 'USD', withheld: false },
      { rate: null, currency: 'USD', withheld: false },
    ])
    expect(t.byCurrency).toEqual([])
    expect(t.refusedBecause).toBe('1 of 2 running lines has no bill rate set, so there is no total.')
  })

  it('the Sell tab reads its total from this, never a sum in dollars', () => {
    const page = readFileSync('src/app/dashboard/contracts/page.tsx', 'utf8')
    expect(page).toMatch(/activeRateTotals\(/)
    expect(page).not.toMatch(/total \$\/hr/)
  })
})
