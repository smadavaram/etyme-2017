import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rate } from '@/lib/money-display'

const route = readFileSync(join(process.cwd(), 'src/app/api/placements/[id]/route.ts'), 'utf8')
const page = readFileSync(join(process.cwd(), 'src/app/dashboard/placements/[id]/page.tsx'), 'utf8')

describe('The agreed spread on a placement is said in the agreement’s own currency (2026-11-08)', () => {
  it('the placement route never divides the spread by a hundred, and sends it with its currency', () => {
    expect(route).not.toContain('spreadRateCents / 100')
    expect(route).toContain('wholeFromMinor(books.agreed.spreadRateCents, books.agreed.currency ?? placement.billCurrency)')
    expect(route).toContain('perHourCents: books.agreed.spreadRateCents')
  })

  it('the placement page formats it through money’s one rate formatter with that currency', () => {
    expect(page).toContain('moneyRate(a.perHourCents, a.currency)')
    expect(page).toContain('agreedRate(p.money.agreed)')
  })

  it('a dong spread reads whole dong and a dollar spread keeps its cents', () => {
    expect(rate(170, 'VND')).not.toMatch(/\.00/)
    expect(rate(1750, 'USD')).toMatch(/17\.50/)
  })
})
