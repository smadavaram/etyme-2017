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
import { billRateMinor, CORVANE_COUNTRIES } from '@/lib/seed-corvane/plan'
import { minorPerUnit } from '@/lib/money'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('a report figure is kept per currency and never added across', () => {
  // A week of 40 hours at the seed's own bill rates: Dayton in dollars,
  // Vietnam in dong, Colombia in pesos (`billRateMinor`). Read from the
  // seed, so the run's figures are the size of the sample program's.
  const week = (cc: 'US' | 'VN' | 'CO') => {
    const cur = CORVANE_COUNTRIES[cc].currency
    return { cur, whole: (billRateMinor(cc) * 40) / minorPerUnit(cur) }
  }

  it('dollars, dong and pesos billed in one run are three figures, dollars first', () => {
    const us = week('US')
    const vn = week('VN')
    const co = week('CO')
    const billed = new ByCurrency()
    billed.add(us.cur, centsOf(us.whole))
    billed.add(vn.cur, centsOf(vn.whole))
    billed.add(co.cur, centsOf(co.whole))
    billed.add(us.cur.toLowerCase(), centsOf(us.whole))
    expect(billed.size).toBe(3)
    const says = billed.says()
    expect(says.startsWith(`${inCurrency(centsOf(us.whole * 2), 'USD')} (USD); `)).toBe(true)
    expect(says).toContain('(COP)')
    expect(says).toContain('(VND)')
    // Never the dong and the dollars read as one number.
    expect(says).not.toContain((vn.whole + us.whole * 2).toLocaleString('en-US'))
    expect(says).not.toMatch(/in all/)
  })

  it('a dong figure is whole dong, never divided by a hundred', () => {
    const vn = week('VN')
    expect(inCurrency(centsOf(vn.whole), 'VND')).toContain(vn.whole.toLocaleString('en-US'))
    expect(hundredthsOfMinor(billRateMinor('VN') * 40, 'VND')).toBe(centsOf(vn.whole))
    const us = week('US')
    expect(hundredthsOfMinor(billRateMinor('US') * 40, 'USD')).toBe(centsOf(us.whole))
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
