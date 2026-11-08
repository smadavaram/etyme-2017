import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hoursAccepted, billAmountOf } from '@/app/api/timesheets/[id]/approve/reply-figures'
import { acceptedSays } from '@/app/api/timesheets/accepted-says'

const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/approve/route.ts'), 'utf8')

describe('the approval says back what the press decided, not what was filed', () => {
  it('an acceptance of fewer hours than filed says the accepted hours', () => {
    const said = acceptedSays({ hours: hoursAccepted({ hours: 38 }, 40), billMinor: null, currency: 'USD', billsName: null, paidBelow: null })
    expect(said).toBe('Accepted 38h.')
  })

  it('an acceptance of the whole week says the hours filed', () => {
    expect(hoursAccepted({ hours: null }, 40)).toBe(40)
    expect(hoursAccepted({ hours: undefined }, 40)).toBe(40)
  })

  it('the route hands the acceptance sentence the accepted hours', () => {
    expect(route).toContain('hours: hoursAccepted(accepted, hours),')
  })
})

describe('the reply reports a week’s value in its own currency', () => {
  it('a week billed in dollars reports dollars and cents', () => {
    expect(billAmountOf(520_000, 'USD')).toBe(5_200)
    expect(billAmountOf(412_60, 'USD')).toBe(412.6)
  })

  it('a week billed in dong reports its amount without inventing cents', () => {
    expect(billAmountOf(17_000_000, 'VND')).toBe(17_000_000)
  })

  it('a week billed in yen reports its amount without inventing cents', () => {
    expect(billAmountOf(64_000, 'JPY')).toBe(64_000)
  })

  it('the route never divides the week’s value by a hundred', () => {
    expect(route).not.toContain('value.totalCents / 100')
    expect(route).toContain('billAmountOf(value.totalCents, worthCurrency)')
  })
})
