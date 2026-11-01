/**
 * The simulation's money stations say one figure per currency.
 *
 * The calibration run of 2026-11-01 (reports/simulation-20261101175220.md,
 * the bills station) printed "$535,357,918.40 billed in all (USD)": bills
 * in Vietnamese dong, Colombian pesos and rupees added together and read
 * as dollars. Rupees and dollars are never added, in a report any more
 * than on a screen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ByCurrency, inCurrency, hundredthsOfMinor, centsOf } from '../../scripts/simulate/stages/money/book'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('a report figure is kept per currency and never added across', () => {
  it('dollars, dong and pesos billed in one run are three figures, dollars first', () => {
    const billed = new ByCurrency()
    billed.add('USD', centsOf(5200))
    billed.add('VND', centsOf(924_000_000))
    billed.add('COP', centsOf(18_400_000))
    billed.add('usd', centsOf(4000))
    expect(billed.size).toBe(3)
    const says = billed.says()
    expect(says.startsWith('$9,200.00 (USD); ')).toBe(true)
    expect(says).toContain('(COP)')
    expect(says).toContain('(VND)')
    expect(says).not.toMatch(/924,018|927,|in all/)
  })

  it('a dong figure is whole dong, never divided by a hundred', () => {
    expect(inCurrency(centsOf(924_000_000), 'VND')).toMatch(/924,000,000/)
    expect(hundredthsOfMinor(924_000_000, 'VND')).toBe(centsOf(924_000_000))
    expect(hundredthsOfMinor(520_000, 'USD')).toBe(centsOf(5200))
  })

  it('a figure with no currency on it is said as unnamed, never as dollars', () => {
    const t = new ByCurrency()
    t.add(undefined, centsOf(10))
    expect(t.says()).toBe('10.00 in a currency nobody named')
  })

  it('nothing counted says nothing, not a zero in somebody’s currency', () => {
    expect(new ByCurrency().says()).toBe('nothing')
  })
})

describe('no money station adds bills, receipts, payments, expenses or pay across currencies', () => {
  for (const station of ['bills', 'invoice-receipts', 'pay', 'three-way-check', 'expenses', 'payroll']) {
    it(`the ${station} station says its money through ByCurrency and never as one dollar total`, () => {
      const src = read(`scripts/simulate/stages/money/${station}.ts`)
      expect(src).toMatch(/new ByCurrency\(\)/)
      expect(src).not.toMatch(/in all \(USD\)|\(USD\)\.`|gross \(USD\)|dollars\(/)
    })
  }

  it('an invoice keyed in by email is in the currency of the payer’s own buy line, never dollars by default', () => {
    const src = read('scripts/simulate/stages/money/invoice-receipts.ts')
    expect(src).not.toMatch(/currency: 'USD'/)
    expect(src).toMatch(/currency: ccy, total: total \/ per/)
  })
})
