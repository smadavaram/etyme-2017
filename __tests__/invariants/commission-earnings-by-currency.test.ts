import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { earningsByPersonMonth, personMonths, type PostingRead } from '@/lib/money/commission-earnings'
import { totals } from '@/lib/money-display'

/**
 * The Commissions page grouped postings by person and month and added
 * every amount under the first posting's currency. Rupees and dollars are
 * never added: each currency's total is its own line.
 */

const TOBIAS = { id: 'tobias', name: 'Tobias Ferrand' }
const post = (amountCents: number, currency: string, day: string, person = TOBIAS): PostingRead => ({
  amountCents, currency, postedAt: new Date(`${day}T12:00:00Z`), says: null, person, projectOrder: { code: 'PO-1' },
})

describe('commission earnings are never added across currencies', () => {
  it('a person paid commission in dollars and rupees in one month reads two totals, one in each currency', () => {
    const rows = earningsByPersonMonth([post(50_000, 'USD', '2026-11-03'), post(1_200_000, 'INR', '2026-11-10'), post(25_000, 'USD', '2026-11-20')])
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.currency === 'USD')).toMatchObject({ amountCents: 75_000, period: '2026-11' })
    expect(rows.find((r) => r.currency === 'INR')).toMatchObject({ amountCents: 1_200_000, period: '2026-11' })
    expect(rows.find((r) => r.currency === 'INR')!.lines).toHaveLength(1)
  })

  it('a person paid commission in one currency in a month reads one total', () => {
    const rows = earningsByPersonMonth([post(50_000, 'USD', '2026-11-03'), post(25_000, 'usd', '2026-11-20')])
    expect(rows).toEqual([expect.objectContaining({ currency: 'USD', amountCents: 75_000, period: '2026-11' })])
    expect(rows[0].lines).toHaveLength(2)
  })

  it('two currencies in one month count as one person-month, not two', () => {
    const rows = earningsByPersonMonth([post(50_000, 'USD', '2026-11-03'), post(1_200_000, 'INR', '2026-11-10'), post(10_000, 'USD', '2026-10-10')])
    expect(personMonths(rows)).toBe(2)
  })

  it('the summary says each currency on its own and never one sum', () => {
    const rows = earningsByPersonMonth([post(50_000, 'USD', '2026-11-03'), post(1_200_000, 'INR', '2026-11-10')])
    const said = totals(rows.map((r) => ({ minor: r.amountCents, currency: r.currency })))
    expect(said).toContain('$500.00')
    expect(said).toContain('12,000')
    expect(said).not.toContain('12,500')
  })

  it('the route groups through the one function, so no second sum can come back', () => {
    const route = readFileSync('src/app/api/payroll/commissions/route.ts', 'utf8')
    expect(route).toContain('earningsByPersonMonth(postings)')
    expect(route).not.toMatch(/row\.amountCents \+= p\.amountCents/)
  })
})
