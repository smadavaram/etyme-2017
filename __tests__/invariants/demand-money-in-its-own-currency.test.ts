import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { perHour, checkStatedTerms } from '@/lib/award/hire-terms'
import { marginFloorFinding, marginPct } from '@/app/api/program/agreements/verdict'
import { standing } from '@/app/api/program/milestones/acceptance'
import { disputedBillDecision } from '@/app/api/decisions/disputed-bill'
import { listTotals, totalsRowOf, approvedValueSays, exportMoney } from '@/app/dashboard/timesheets/totals'

/**
 * The "₫170.00" class, in demand's files (money found it, 2026-11-08):
 * every amount says its own currency through money's one formatter, with
 * that currency's own decimals, and a total over two currencies is said
 * per currency, never summed.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-11-08T12:00:00Z')

describe('a rate on the terms reads in its own currency', () => {
  it('a dong pay rate reads whole dong', () => {
    expect(perHour(170_000, 'VND')).toBe('₫170,000/hr')
  })

  it('a dollar rate keeps cents', () => {
    expect(perHour(9_050, 'USD')).toBe('$90.50/hr')
    expect(perHour(9_000)).toBe('$90/hr')
  })

  it('a rate of nothing is never printed as a price, in any currency', () => {
    expect(perHour(0, 'VND')).toBeNull()
    expect(perHour(null, 'USD')).toBeNull()
  })

  it('the terms a firm states are said in the line’s currency', () => {
    const v = checkStatedTerms({ engagementType: 'W2', payRateCents: 170_000, personName: 'Linh Tran', firmName: 'Saigon Talent', ownCompany: null, currency: 'VND' })
    expect(v.ok && v.says).toBe('Saigon Talent offers Linh Tran ₫170,000/hr as its employee.')
  })

  it('the terms route reads the pay line’s currency, and the convert summary the agreement’s', () => {
    expect(read('src/app/api/submissions/[id]/terms/route.ts')).toContain('perHour(cand.payRate, cand.payCurrency)')
    expect(read('src/app/api/submissions/[id]/convert/route.ts')).toContain('converted to sell contract at ${rate(billRate, currency)}.')
  })

  it('the papering notice says the awarded rate through money’s formatter', () => {
    const src = read('src/lib/papering.ts')
    expect(src).toContain('return rate(cents, currency || \'USD\')')
    expect(src).not.toContain('(cents / 100)')
  })
})

describe('the margin floor reads both rates in their own currencies', () => {
  const contract = { id: 'c1', personName: 'Linh Tran', billRateCents: 170_000, billCurrency: 'VND', payRateCents: 120_000, payCurrency: 'VND', live: true }

  it('a rupee or dong line below the floor says both rates in that currency', () => {
    const f = marginFloorFinding(contract, 40)
    expect(f?.says).toBe('Linh Tran runs at 29.4% against a floor of 40% — ₫170,000/hr in, ₫120,000/hr out.')
  })

  it('a line billed in one currency and paid in another gets no margin, and says why', () => {
    const f = marginFloorFinding({ ...contract, billCurrency: 'USD', billRateCents: 9_000, payCurrency: 'INR', payRateCents: 300_000 }, 20)
    expect(f?.code).toBe('MARGIN_UNKNOWN')
    expect(f?.says).toContain('billed in USD and paid in INR')
    expect(marginPct(9_000, 300_000, { bill: 'USD', pay: 'INR' })).toBeNull()
  })
})

describe('milestones say money in the order’s own currency', () => {
  const ms = (amountCents: number) => ({ id: 'm', name: 'Go-live', amountCents, dueOn: null, acceptedAt: new Date('2026-11-01'), deliveredAt: null, status: 'ACCEPTED' })

  it('an order in dong says whole dong ready to bill', () => {
    expect(standing([ms(50_000_000)], NOW, 'VND').says).toBe('₫50,000,000 accepted and ready to bill.')
  })

  it('an order in dollars keeps its cents where it has them', () => {
    expect(standing([ms(1_240_050)], NOW, 'USD').says).toBe('$12,400.50 accepted and ready to bill.')
  })

  it('the milestones screen says the program’s totals per currency, never summed', () => {
    const page = read('src/app/dashboard/program/milestones/page.tsx')
    expect(page).toContain('totals(data.overallByCurrency.map((b) => ({ minor: b.standing[key], currency: b.currency })))')
    expect(read('src/app/api/program/milestones/route.ts')).toContain('overallByCurrency')
  })
})

describe('a disputed invoice receipt on the queue says its own currency', () => {
  const bill = { id: 'vb1', number: 'VN-1', vendorName: 'Saigon Talent', totalCents: 17_000_000, currency: 'VND', dueAt: null, receivedAt: NOW }

  it('a receipt in dong reads whole dong, and adds nothing to the dollar total', () => {
    const row = disputedBillDecision(bill, null, { mayRecordPayment: true, mayAcceptWeeks: true })!
    expect(row.subtitle.startsWith('₫17,000,000 · ')).toBe(true)
    expect(row.amount).toBeNull()
  })

  it('a receipt in dollars keeps its cents and its dollar amount', () => {
    const row = disputedBillDecision({ ...bill, totalCents: 412_060, currency: 'USD' }, null, { mayRecordPayment: true, mayAcceptWeeks: true })!
    expect(row.subtitle.startsWith('$4,120.60 · ')).toBe(true)
    expect(row.amount).toBe(4_120.6)
  })
})

describe('the timesheets list says its money in each currency', () => {
  const week = (cents: number, currency: string) => totalsRowOf({
    periodStart: '2026-10-04T00:00:00.000Z', totalHours: 40, status: 'APPROVED', flag: null, rate: { cents, currency },
  })

  it('a timesheet export in rupees says rupees', () => {
    expect(exportMoney(300_000, 'INR')).toBe('3000.00')
    expect(read('src/app/dashboard/timesheets/page.tsx')).toContain("'Value','Currency','Status'")
    expect(read('src/app/dashboard/timesheets/page.tsx')).toContain("(t.rate.currency || 'USD').toUpperCase()")
  })

  it('an export in dong carries whole dong, never cents', () => {
    expect(exportMoney(170_000, 'VND')).toBe('170000')
    expect(exportMoney(13_050, 'USD')).toBe('130.50')
  })

  it('the approved value in one currency is that currency’s own money', () => {
    const t = listTotals([week(170_000, 'VND')], { onServer: 1, payBasis: false })
    expect(approvedValueSays(t)).toBe('₫6,800,000')
  })

  it('weeks in two currencies are said side by side and never added', () => {
    const t = listTotals([week(10_000, 'USD'), week(300_000, 'INR')], { onServer: 2, payBasis: false })
    expect(t.approvedValueCents).toBeNull()
    expect(approvedValueSays(t)).toBe('$4,000 and ₹120,000')
  })

  it('weeks whose rate is withheld still show a dash, never $0', () => {
    const t = listTotals([totalsRowOf({ periodStart: '2026-10-04T00:00:00.000Z', totalHours: 40, status: 'APPROVED', flag: null, rate: { cents: null, withheld: true } })], { onServer: 1, payBasis: false })
    expect(approvedValueSays(t)).toBeNull()
  })
})
