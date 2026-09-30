import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { placementEarned, priceSheets, type SheetToPrice } from '@/lib/money/placement-earned'
import type { RatePeriod } from '@/lib/contract-rate'

/**
 * One placement's revenue, cost and margin, each hour at the rate in
 * force on the day it was worked. The shape is Rosa Delgado's: billed at
 * $112, paid $66, raised to $70 from Tuesday 29 July.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const RAISE: RatePeriod[] = [
  { id: 'opening', rateCents: 6_600, fromDate: d('2025-01-06'), toDate: d('2025-07-28'), approvalState: 'APPROVED' },
  { id: 'raise', rateCents: 7_000, fromDate: d('2025-07-29'), toDate: null, approvalState: 'APPROVED' },
]

function week(monday: string, opts: { client?: number | null; employer?: number | null } = {}): SheetToPrice {
  const start = d(monday)
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    const at = new Date(start.getTime() + i * 86_400_000)
    days[at.toISOString().slice(0, 10)] = 8
  }
  const client = opts.client === undefined ? 40 : opts.client
  const employer = opts.employer === undefined ? 40 : opts.employer
  return {
    periodStart: start,
    periodEnd: new Date(start.getTime() + 6 * 86_400_000),
    days,
    assertions: [
      ...(client != null ? [{ role: 'CLIENT_APPROVAL', hours: client, rateCents: 11_200 }] : []),
      ...(employer != null ? [{ role: 'EMPLOYER_ACCEPTANCE', hours: employer, rateCents: 6_600 }] : []),
    ],
  }
}

const BILL = { openingRateCents: 11_200, periods: [] as RatePeriod[], currency: 'USD' }
const PAY = { openingRateCents: 6_600, periods: RAISE, currency: 'USD' }

describe('a placement is priced day by day at the rate in force that day', () => {
  it("a placement's margin prices each day at the rate in force that day, so weeks before a raise cost the old rate", () => {
    const before = placementEarned({ sheets: [week('2025-07-14')], bill: BILL, pay: PAY })
    expect(before.costCents).toBe(40 * 6_600)
    expect(before.marginCents).toBe(40 * 11_200 - 40 * 6_600)

    const after = placementEarned({ sheets: [week('2025-08-04')], bill: BILL, pay: PAY })
    expect(after.costCents).toBe(40 * 7_000)
    expect(after.marginCents).toBe(40 * 11_200 - 40 * 7_000)

    // Never the line's own column across every week, and never today's rate across every week.
    const both = placementEarned({ sheets: [week('2025-07-14'), week('2025-08-04')], bill: BILL, pay: PAY })
    expect(both.costCents).toBe(40 * 6_600 + 40 * 7_000)
    expect(both.costCents).not.toBe(80 * 6_600)
    expect(both.costCents).not.toBe(80 * 7_000)
  })

  it('a week that crosses a raise is priced day by day, the old rate before the change and the new rate from it', () => {
    const crossing = placementEarned({ sheets: [week('2025-07-28')], bill: BILL, pay: PAY })
    // Monday 28 July at $66; Tuesday to Friday at $70.
    expect(crossing.costCents).toBe(8 * 6_600 + 32 * 7_000)
    expect(crossing.payRateChangeSays).toContain('8 hours at $66/hr from 2025-07-28 to 2025-07-28')
    expect(crossing.payRateChangeSays).toContain('32 hours at $70/hr from 2025-07-29 to 2025-08-01')
  })

  it('a raise on the bill side prices revenue the same way, so revenue and cost follow the same calendar', () => {
    const billRaise: RatePeriod[] = [
      { id: 'b', rateCents: 12_000, fromDate: d('2025-07-29'), toDate: null, approvalState: 'APPROVED' },
    ]
    const r = placementEarned({ sheets: [week('2025-07-28')], bill: { ...BILL, periods: billRaise }, pay: PAY })
    expect(r.revenueCents).toBe(8 * 11_200 + 32 * 12_000)
  })

  it('a raise only proposed, not approved, prices nothing', () => {
    const proposed: RatePeriod[] = [
      { id: 'p', rateCents: 9_000, fromDate: d('2025-07-01'), toDate: null, approvalState: 'PROPOSED' },
    ]
    const r = placementEarned({ sheets: [week('2025-08-04')], bill: BILL, pay: { ...PAY, periods: proposed } })
    expect(r.costCents).toBe(40 * 6_600)
  })
})

describe('revenue is what the client approved and cost is what the employer accepted', () => {
  it('revenue prices the hours the client approved and cost the hours the employer accepted, never one number times both rates', () => {
    const r = placementEarned({ sheets: [week('2025-07-14', { client: 40, employer: 38 })], bill: BILL, pay: PAY })
    expect(r.hoursBilled).toBe(40)
    expect(r.hoursPaid).toBe(38)
    expect(r.revenueCents).toBe(40 * 11_200)
    expect(r.costCents).toBe(38 * 6_600)
    expect(r.marginCents).toBe(40 * 11_200 - 38 * 6_600)
  })

  it('a week the client approved and the employer has not yet accepted is left out of the margin and said in a sentence', () => {
    const r = placementEarned({
      sheets: [week('2025-07-14'), week('2025-07-21', { employer: null })],
      bill: BILL, pay: PAY,
    })
    expect(r.revenueCents).toBe(80 * 11_200)
    expect(r.costCents).toBe(40 * 6_600)
    expect(r.marginCents).toBe(40 * 11_200 - 40 * 6_600)
    expect(r.marginWeeks).toBe(1)
    expect(r.weeksAwaitingPay).toBe(1)
    expect(r.says).toBe(
      'The margin covers the 1 week both sides have signed. 1 week is approved by the client and not yet accepted for pay, so it is billed and not yet costed.'
    )
  })

  it('with no week signed by both sides there is no margin yet, and it says why', () => {
    const r = placementEarned({ sheets: [week('2025-07-14', { employer: null })], bill: BILL, pay: PAY })
    expect(r.marginCents).toBeNull()
    expect(r.marginRefusedBecause).toBe('No week has been both approved by the client and accepted by the employer yet.')
  })
})

describe('a margin nobody can stand behind is blank, never good news', () => {
  it('a placement with no pay line behind it has no cost and no margin, not a perfect one', () => {
    const r = placementEarned({ sheets: [week('2025-07-14')], bill: BILL, pay: null })
    expect(r.revenueCents).toBe(40 * 11_200)
    expect(r.costCents).toBeNull()
    expect(r.marginCents).toBeNull()
    expect(r.costRefusedBecause).toContain('No buy line')
  })

  it('a pay line recorded at zero is a missing rate, and the margin is blank', () => {
    const r = placementEarned({ sheets: [week('2025-07-14')], bill: BILL, pay: { ...PAY, openingRateCents: 0 } })
    expect(r.costCents).toBeNull()
    expect(r.marginCents).toBeNull()
    expect(r.marginRefusedBecause).toContain('missing rate')
  })

  it('a placement billed in one currency and paid in another has no margin', () => {
    const r = placementEarned({ sheets: [week('2025-07-14')], bill: BILL, pay: { ...PAY, currency: 'INR' } })
    expect(r.costCents).toBe(40 * 6_600)
    expect(r.marginCents).toBeNull()
    expect(r.marginRefusedBecause).toBe('Billed in USD and paid in INR. One cannot be subtracted from the other.')
  })
})

describe('one reader for one question', () => {
  it('the profitability screen prices a placement through the same reader as the placement page', () => {
    const route = readFileSync('src/app/api/profitability/route.ts', 'utf8')
    expect(route).toMatch(/priceSheets\(/)
    expect(route).not.toMatch(/priceByDay\(\{\s*contractRateCents: c\.billRate/)
  })

  it('the book keeps its old fallback: a placement with no buy line is costed from the ledger and says it was', () => {
    const p = priceSheets({ sheets: [week('2025-07-14')], bill: BILL, pay: null })
    expect(p.payFromLine).toBe(false)
    expect(p.paidCents).toBe(40 * 6_600)
    expect(p.payRateFromLedger).toBe(6_600)
  })
})
