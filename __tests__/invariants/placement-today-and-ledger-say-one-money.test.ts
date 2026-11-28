import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftsOf, withExpenses } from '@/app/api/today/drafts'
import { refusedRationale } from '@/lib/twin/ledger'

/**
 * The tester's scale audit, 2026-11-09: three views kept their own sums
 * after money built one definition (a9594c4cd). The founder: this is
 * about the reconciliation and calculation, not the wording.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const week = (invoiceId: string | null, amountMinor: number | null, currency = 'USD') => ({
  draft: invoiceId ? { invoiceId, number: `IN-${invoiceId}`, says: `Bill IN-${invoiceId} is drafted, not sent.` } : null,
  amountMinor,
  currency,
})

describe('Today never prints a draft’s number beside the whole unbilled total', () => {
  const bills = new Map([
    ['a', { totalMinor: 2208000, currency: 'USD', weeks: 5 }],
    ['b', { totalMinor: 112000, currency: 'USD', weeks: 1 }],
  ])

  it('a draft carries its own bill’s total, expenses included, never a sum of its weeks’ hours', () => {
    // 192 h × $112 = $21,504 of hours, and a $576 expense line: the bill is $22,080 (walk 9).
    const drafts = draftsOf([week('a', 400000), week('a', 400000), week('b', 112000), week(null, 999900)], bills)
    expect(drafts.map((d) => [d.invoiceId, d.amountMinor])).toEqual([['a', 2208000], ['b', 112000]])
  })

  it('a draft says the weeks its own bill holds', () => {
    expect(draftsOf([week('a', 1), week('a', 1)], bills)[0].weeks).toBe(5)
  })

  it('a week no draft holds is never counted under a draft', () => {
    const drafts = draftsOf([week(null, 500000), week('b', 100)], bills)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].amountMinor).toBe(112000)
  })

  it('a draft whose bill was not read says it is not priced, rather than a partial sum', () => {
    expect(draftsOf([week('z', 1000)], bills)[0].amountMinor).toBeNull()
  })

  it('a draft keeps its own bill’s currency', () => {
    expect(draftsOf([week('v', 924000000, 'VND')], new Map([['v', { totalMinor: 924000000, currency: 'VND', weeks: 1 }]]))[0])
      .toMatchObject({ currency: 'VND', amountMinor: 924000000 })
  })

  it('signed and not billed adds each line’s unbilled expenses to the weeks, by currency, and the week count is unchanged', () => {
    const t = withExpenses([{ currency: 'USD', amountMinor: 13137600, pricedMinor: 13137600, count: 30, unpriced: 0 }], new Map([['USD', 57600]]))
    expect(t).toEqual([{ currency: 'USD', amountMinor: 13195200, pricedMinor: 13195200, count: 30, unpriced: 0 }])
  })

  it('the Today page draws each draft’s own amount, not the client’s total', () => {
    const page = read('src/app/dashboard/page.tsx')
    expect(page).toContain('amount(d.amountMinor, d.currency)')
  })
})

describe('the twin’s ledger reads a refusal as a refusal', () => {
  it('a refused row written from today says the refusal as its reason, and keeps the act’s own reason in the payload', () => {
    const src = read('src/lib/twin/ledger.ts')
    const refuse = src.slice(src.indexOf('async function refuse('), src.indexOf('async function refuse(') + 1600)
    expect(refuse).toContain('rationale: says')
    expect(refuse).toContain('rationaleTheActGave: base.rationale')
  })

  it('a refused row written before today is read from payload.said on the ledger page', () => {
    expect(refusedRationale({ outcome: 'REFUSED', rationale: 'Pay it. The hours match.', payload: { said: 'Nobody seated may decide this.' } }))
      .toBe('Nobody seated may decide this.')
  })

  it('a row that was not refused says its own reason', () => {
    expect(refusedRationale({ outcome: 'DONE', rationale: 'Pay it. The hours match.', payload: { said: 'x' } })).toBe('Pay it. The hours match.')
  })

  it('a refused row with nothing in the payload keeps the reason it has', () => {
    expect(refusedRationale({ outcome: 'REFUSED', rationale: 'The record says no.', payload: null })).toBe('The record says no.')
  })
})

describe('the placement page keeps no money sums of its own', () => {
  const route = read('src/app/api/placements/[id]/route.ts')

  it('it reads the order through the order ledger and the line through the line reader', () => {
    expect(route).toContain('orderLedgers([header.id])')
    expect(route).toContain('signedAndBilled([placement.id])')
  })

  it('it never multiplies an order’s amount by a hundred, which reads a dong order a hundred times too large', () => {
    expect(route).not.toMatch(/Number\(order\.amount\)\s*\*\s*100/)
    expect(route).not.toMatch(/Number\(i\.total\)\s*\*\s*100/)
  })

  it('it never reads only the newest twelve invoice lines or weeks', () => {
    expect(route).not.toMatch(/take:\s*12\b/)
  })
})
