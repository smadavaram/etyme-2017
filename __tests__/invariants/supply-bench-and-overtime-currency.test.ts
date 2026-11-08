import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { costOfDays } from '@/lib/bench-profit'
import type { Policy } from '@/lib/bench-policy'

/**
 * A bench day costs what the person is paid in, and a worker reads her own
 * overtime in the currency her pay line pays (money's round 9ac4717d8).
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const HALF: Policy = { policy: 'REDUCED_RATE', benchRateBps: 5000, carryDays: 90 }

describe('a bench day costs the currency it is paid in', () => {
  it('a bench day paid in rupees costs rupees, and nothing on the line says dollars', () => {
    const c = costOfDays({ days: 50, policy: HALF, payRateCents: 150_000, contractType: 'W2', currency: 'INR' })
    expect(c.costCents).not.toBeNull()
    expect(c.says).toContain('₹')
    expect(c.says).not.toContain('$')
    expect(c.counted ?? '').not.toContain('$')
  })

  it('a bench day paid in dollars still costs dollars and cents', () => {
    const c = costOfDays({ days: 50, policy: HALF, payRateCents: 6200, contractType: 'W2', currency: 'USD' })
    expect(c.says).toContain('$496.00 a day')
  })

  it('bench profit hands the person’s pay currency to the one bench cost rule and to the day rate', () => {
    const s = src('src/lib/bench-profit.ts')
    expect(s).toContain('benchCost({ ...policy, currency: input.currency }, {')
    expect(s).toContain('new Date(0), input.currency).dailyCents!')
  })
})

describe('a worker reads her own overtime in the currency she is paid', () => {
  it('her own page reads the wage line with her pay line’s currency, else the line’s', () => {
    expect(src('src/app/api/me/work/route.ts')).toContain(
      'wageLineFor({ ...bc, payCurrency: pay.payCurrency ?? bc.payCurrency }, caller.person.name, row)'
    )
  })
})
