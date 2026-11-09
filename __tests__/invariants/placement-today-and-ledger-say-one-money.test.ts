import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftsOf } from '@/app/api/today/drafts'
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
  it('each draft carries only the amount of the weeks it holds', () => {
    const drafts = draftsOf([week('a', 400000), week('a', 400000), week('b', 112000), week(null, 999900)])
    expect(drafts.map((d) => [d.invoiceId, d.weeks, d.amountMinor])).toEqual([['a', 2, 800000], ['b', 1, 112000]])
  })

  it('a week no draft holds is never counted under a draft', () => {
    const drafts = draftsOf([week(null, 500000), week('c', 100)])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].amountMinor).toBe(100)
  })

  it('a draft holding a week that cannot be priced says it is not priced, rather than a partial sum', () => {
    expect(draftsOf([week('d', 1000), week('d', null)])[0].amountMinor).toBeNull()
  })

  it('a draft keeps its own currency', () => {
    expect(draftsOf([week('e', 924000000, 'VND')])[0]).toMatchObject({ currency: 'VND', amountMinor: 924000000 })
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
