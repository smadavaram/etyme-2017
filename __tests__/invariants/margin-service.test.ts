import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { billingOf, billingTotal, bookEarned, profitFrom, REVENUE_HEADING, AGREED_SPREAD, EARNED_MARGIN } from '@/lib/money/margin'
import { placementEarned, type SheetToPrice } from '@/lib/money/placement-earned'

/**
 * The one margin service (lib/money/margin). Two numbers, two names; one
 * heading the founder may rename; and the refusals that keep a plausible
 * wrong number off the screen.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
function week(sunday: string, client: number | null, employer: number | null): SheetToPrice {
  const start = d(sunday)
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)] = 8
  return {
    periodStart: start, periodEnd: new Date(start.getTime() + 6 * 86_400_000), days,
    assertions: [
      ...(client != null ? [{ role: 'CLIENT_APPROVAL', hours: client, rateCents: 0 }] : []),
      ...(employer != null ? [{ role: 'EMPLOYER_ACCEPTANCE', hours: employer, rateCents: 0 }] : []),
    ],
  }
}
const BILL = { openingRateCents: 11_500, periods: [], currency: 'USD' }
const PAY = { openingRateCents: 8_400, periods: [], currency: 'USD', overtime: null }

describe('the names', () => {
  it('the two numbers have two names, and neither is the bare word margin', () => {
    expect(AGREED_SPREAD).toBe('Agreed spread')
    expect(EARNED_MARGIN).toBe('Earned margin')
  })

  it('the heading over the revenue figures is one word, kept as Billed until the founder decides', () => {
    expect(REVENUE_HEADING).toBe('Billed')
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/profitability/page.tsx'), 'utf8')
    expect(page).toContain("data.labels?.revenue ?? 'Billed'")
  })
})

describe('earned margin', () => {
  it('Daniel Osei’s earned margin is his $115 less his $84 pay and 22% burden on it, never his bill rate as cost', () => {
    const e = placementEarned({
      sheets: [week('2026-09-06', 40, 40), week('2026-09-13', 40, 40), week('2026-09-20', 40, 40), week('2026-09-27', 40, 40)],
      bill: BILL, pay: PAY, burdenRate: 0.22,
    })
    expect(e.revenueCents).toBe(1_840_000)
    expect(e.costCents).toBe(1_344_000)
    expect(e.burdenCents).toBe(295_680)
    expect(e.marginCents).toBe(1_840_000 - 1_344_000 - 295_680)
    // 10.9%, beside a 27.0% agreed spread: the difference is the burden, line by line.
    expect(profitFrom(e, null).marginPct).toBe(10.9)
  })

  it('each week’s burden is rounded on its own, the way the books post it, so the two agree to the cent', () => {
    const e = placementEarned({
      sheets: [week('2026-09-06', 40, 37.33), week('2026-09-13', 40, 37.33)],
      bill: BILL, pay: PAY, burdenRate: 0.2211,
    })
    const perWeek = Math.round(Math.round(37.33 * 8_400) * 0.2211)
    expect(e.burdenCents).toBe(2 * perWeek)
  })

  it('earned margin with revenue and no cost behind it is blank, never a hundred per cent', () => {
    const e = placementEarned({ sheets: [week('2026-09-06', 40, null)], bill: BILL, pay: null })
    const p = profitFrom(e, null)
    expect(e.marginCents).toBeNull()
    expect(p.costUnknown).toBe(true)
    expect(p.marginPct).toBeNull()
  })

  it('the rate is taken over the weeks both sides signed, never over revenue with no cost against it', () => {
    const e = placementEarned({ sheets: [week('2026-09-06', 40, 40), week('2026-09-13', 40, null)], bill: BILL, pay: PAY })
    expect(e.revenueCents).toBe(2 * 40 * 11_500)
    expect(e.marginRevenueCents).toBe(40 * 11_500)
    expect(profitFrom(e, null).marginPct).toBe(27)
  })

  it('a book with one unpriced placement has no earned margin rate', () => {
    const priced = placementEarned({ sheets: [week('2026-09-06', 40, 40)], bill: BILL, pay: PAY })
    const unpriced = placementEarned({ sheets: [week('2026-09-06', 40, null)], bill: BILL, pay: null })
    const b = bookEarned([{ earned: priced, currency: 'USD' }, { earned: unpriced, currency: 'USD' }])
    expect(b.pct).toBeNull()
    expect(b.unpriced).toBe(1)
    expect(b.says).toMatch(/missing link/)
  })

  it('earned margin refuses to add rupees and dollars', () => {
    const a = placementEarned({ sheets: [week('2026-09-06', 40, 40)], bill: BILL, pay: PAY })
    const b = bookEarned([{ earned: a, currency: 'USD' }, { earned: a, currency: 'INR' }])
    expect(b.pct).toBeNull()
    expect(b.marginCents).toBeNull()
    expect(b.refusedBecause).toMatch(/never added/)
  })
})

describe('billed is three figures', () => {
  it('billed is three figures — accepted and not yet billed, billed, collected', () => {
    const b = billingOf({
      currency: 'USD',
      weeks: [{ sheetId: 'w1', revenueCents: 472_000 }, { sheetId: 'w2', revenueCents: 472_000 }, { sheetId: 'w3', revenueCents: 472_000 }],
      lines: [
        { amountCents: 472_000, timesheetId: 'w1', invoiceTotalCents: 944_000, invoicePaidCents: 944_000, currency: 'USD' },
        { amountCents: 472_000, timesheetId: 'w2', invoiceTotalCents: 944_000, invoicePaidCents: 472_000, currency: 'USD' },
      ],
    })
    expect(b.acceptedNotBilledCents).toBe(472_000)
    expect(b.billedCents).toBe(944_000)
    expect(b.collectedCents).toBe(472_000 + 236_000)
    expect(b.says).toContain('accepted and not yet billed')
  })

  it('a bill line in another currency is left out and said, never added', () => {
    const b = billingOf({
      currency: 'USD', weeks: [],
      lines: [{ amountCents: 100, timesheetId: null, invoiceTotalCents: 100, invoicePaidCents: 100, currency: 'INR' }],
    })
    expect(b.billedCents).toBe(0)
    expect(b.says).toMatch(/another currency left out/)
  })

  it('the three figures across a book refuse two currencies rather than add them', () => {
    const usd = billingOf({ currency: 'USD', weeks: [], lines: [] })
    const inr = billingOf({ currency: 'INR', weeks: [], lines: [] })
    expect(billingTotal([usd, inr])).toBeNull()
  })
})

describe('one door', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('the payroll page computes no spread of its own; it reads the one margin service', () => {
    const page = read('src/app/dashboard/payroll/page.tsx')
    expect(page).not.toMatch(/avgBill/)
    expect(read('src/app/api/payroll/route.ts')).toContain("from '@/lib/money/margin'")
  })

  it('the profitability route prices placements through the one margin service, not on its own', () => {
    const route = read('src/app/api/profitability/route.ts')
    expect(route).toContain('placementBooks(')
    expect(route).not.toContain('priceSheets(')
    expect(route).not.toContain('profitOf(')
  })

  it('a margin is never asked for without the viewing company', () => {
    expect(read('src/lib/money/margin.ts')).toContain("if (!companyId) throw new Error('placementBooks needs the viewing company")
  })
})
