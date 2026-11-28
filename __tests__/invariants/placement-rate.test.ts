import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { rateToday } from '@/lib/placement-rate'

/**
 * The rate a placement's card shows is the one in force today. Found by
 * a browser walk as Brightmoor: Rosa Delgado's pay line read $66 an hour
 * two months after her $70 was approved on 29 July 2026 and paid by
 * payroll. The card now asks lib/contract-rate — the reader payroll and
 * billing already use — and says the change in a line.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const TODAY = d('2026-09-30')

// As lib/rate-line settles an approved rise: the $66 opening row from the
// line's first day, closed the day before, and the $70 from the rise.
const ROSA = [
  { id: 'open', rate: 6_600, fromDate: d('2026-02-02'), toDate: d('2026-07-28'), approvalState: 'APPROVED' },
  { id: 'rise', rate: 7_000, fromDate: d('2026-07-29'), toDate: null, approvalState: 'APPROVED' },
]

describe('the rate a placement shows', () => {
  it('a pay line shows the rate in force today, not the one it started on', () => {
    expect(rateToday(6_600, ROSA, TODAY).cents).toBe(7_000)
  })

  it('where a change is recorded, the line says when it took effect and what it was before', () => {
    const r = rateToday(6_600, ROSA, TODAY)
    expect(r.says).toBe('$70/hr since July 29, 2026 — was $66')
    expect(r.since).toBe('2026-07-29')
    expect(r.wasCents).toBe(6_600)
  })

  it('a change still waiting for approval does not move the rate shown or earn a line', () => {
    const waiting = [{ ...ROSA[1], approvalState: 'PROPOSED' }]
    expect(rateToday(6_600, waiting, TODAY)).toEqual({ cents: 6_600, since: null, wasCents: null, says: null })
  })

  it('a change dated after today is not shown as in force today', () => {
    const later = [{ ...ROSA[1], fromDate: d('2026-10-15') }]
    expect(rateToday(6_600, later, TODAY).cents).toBe(6_600)
    expect(rateToday(6_600, later, TODAY).says).toBeNull()
  })

  it('a line whose rate never changed shows its own rate and says nothing more', () => {
    expect(rateToday(11_200, [], TODAY)).toEqual({ cents: 11_200, since: null, wasCents: null, says: null })
  })

  it('the opening row a change writes behind itself is not read as a change', () => {
    expect(rateToday(6_600, [ROSA[0]], d('2026-05-01')).says).toBeNull()
  })

  it('a rate in another currency is said in that currency, cents and all', () => {
    const rows = [{ id: 'x', rate: 14_550, fromDate: d('2026-08-01'), toDate: null, approvalState: 'APPROVED' }]
    expect(rateToday(14_000, rows, TODAY, 'GBP').says).toBe('£145.50/hr since August 1, 2026 — was £140')
  })

  it("the placement reads both its bill rate and its pay rate through money's reader, never the line's stored column", () => {
    const route = readFileSync('src/app/api/placements/[id]/route.ts', 'utf8')
    expect(route).toContain('billRate: billToday ? money(billToday.cents) : null')
    expect(route).toContain('payRate: payToday ? money(payToday.cents) : null')
    expect(route).not.toMatch(/billRate: seeBill \? money\(placement\.billRate\)/)
    expect(route).not.toMatch(/payRate: seePay && seat \? money\(seat\.payRate\)/)
    const lib = readFileSync('src/lib/placement-rate.ts', 'utf8')
    expect(lib).toContain("from '@/lib/contract-rate'")
  })
})
