import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { units, rate } from '@/lib/money-display'

/**
 * The screen walk, 2026-11-03: an expense in dong read "₫170.00", cents
 * the dong does not have. The one formatter takes the currency's own
 * minor units, and the screens that printed two decimals for every
 * currency now go through it.
 */
describe('an amount shows the decimals its currency has', () => {
  it('an amount in dong or yen shows no cents, and an amount in dollars or rupees shows two', () => {
    expect(units(170, 'VND')).toBe('₫170')
    expect(units(3_000_000, 'VND')).toBe('₫3,000,000')
    expect(units(170, 'JPY')).toBe('¥170')
    expect(units(170, 'USD')).toBe('$170.00')
    expect(units(170.5, 'INR')).toBe('₹170.50')
    expect(units(null, 'USD')).toBe('—')
  })

  it('a rate in dong is read from its minor units, never divided by a hundred', () => {
    expect(rate(250_000, 'VND')).toBe('₫250,000/hr')
    expect(rate(9_850, 'USD')).toBe('$98.50/hr')
  })

  it('the expenses and purchase orders screens format through the one formatter', () => {
    for (const f of ['src/app/dashboard/expenses/page.tsx', 'src/app/dashboard/purchase-orders/page.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toMatch(/minimumFractionDigits: 2/)
      expect(src, f).not.toMatch(/format\(cents \/ 100\)/)
    }
  })
})
