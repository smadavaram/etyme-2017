import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reconcile } from '@/lib/reconciliation'
import { orderSentence } from '@/lib/order-naming'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('The architect’s amounts are said in their own currency (2026-11-09)', () => {
  it('a reconciliation in dong reads whole dong, never cents behind a dollar sign', () => {
    const r = reconcile(
      [{ id: 'a', amountCents: 50_000_000, on: '2026-10-01', ref: 'IN-1' }],
      [{ amountCents: 49_000_000, on: '2026-10-01', ref: 'IN-1' }],
      'VND',
    )
    expect(r.currency).toBe('VND')
    const words = r.says + r.breaks.map((b) => b.says).join(' ')
    expect(words).not.toMatch(/\$/)
    expect(words).toMatch(/₫/)
    expect(words).not.toMatch(/₫[\d,]+\.\d\d/)
  })

  it('a reconciliation in dollars keeps its cents, as before', () => {
    const r = reconcile([{ id: 'a', amountCents: 10_050, on: '2026-10-01', ref: 'IN-1' }], [{ amountCents: 10_050, on: '2026-10-01', ref: 'IN-1' }])
    expect(r.says).toContain('$100.50')
  })

  it('the reconcile route reads the company’s currency, leaves bills in another currency out and says so, and never multiplies a typed amount by a hundred', () => {
    const route = src('src/app/api/integrations/reconcile/route.ts')
    expect(route).not.toMatch(/Number\(i\.total\) \* 100/)
    expect(route).not.toMatch(/Number\(t\.amount\) \* 100/)
    expect(route).toContain('minorFromWhole(i.total, currency)')
    expect(route).toContain('were left out: a reconciliation is in one currency')
    // The run keeps its currency, and a run from before reads as the company's.
    expect(route).toContain('      currency,\n      breaks: result.breaks as any,')
    expect(route).toContain('currency: r.currency ?? currency,')
  })

  it('a past reconciliation on the Integrations page is said through money’s formatter in its currency', () => {
    const page = src('src/app/dashboard/integrations/page.tsx')
    expect(page).not.toMatch(/differenceCents \/ 100/)
    expect(page).toContain('amount(Math.abs(r.differenceCents), r.currency ?? DEFAULT_CURRENCY)')
  })

  it('an order’s ceiling in dong reads whole dong, and a dollar ceiling reads dollars', () => {
    const parties = { issuedById: 'client', issuedToId: 'supplier' }
    const vnd = orderSentence({ ...parties, number: 'PO-7', amountCents: 500_000_000, currency: 'VND' } as never, 'client', 'Saigon Talent')
    expect(vnd).toMatch(/₫500,000,000/)
    expect(vnd).not.toMatch(/VND 5,000,000/)
    const usd = orderSentence({ ...parties, number: 'PO-8', amountCents: 120_000_000, currency: 'USD' } as never, 'client', 'Brightmoor')
    expect(usd).toMatch(/\$1,200,000/)
  })

  it('the seeded rate check says the asking rate in the client’s own currency', () => {
    const seed = src('src/lib/seed-standing.ts')
    expect(seed).not.toMatch(/\(s\.rate \/ 100\)/)
    expect(seed).toContain('Asked ${amount(s.rate, cur)} an hour')
  })

  it('every rate on a placement’s page is sent with its minor units and currency and said through money’s formatter', () => {
    const route = src('src/app/api/placements/[id]/route.ts')
    for (const f of ['billRateCents: billToday ? billToday.cents : null', 'payRateCents: payToday ? payToday.cents : null', 'rateCents: seeBill ? submission.rate : null', 'rateCents: seePay ? sentOnBy.rate : null']) {
      expect(route).toContain(f)
    }
    const page = src('src/app/dashboard/placements/[id]/page.tsx')
    expect(page).not.toMatch(/value=\{rate\(p\./)
    expect(page).not.toMatch(/stat-value">\{rate\(p\./)
  })
})
