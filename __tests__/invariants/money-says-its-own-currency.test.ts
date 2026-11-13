import { describe, it, expect } from 'vitest'
import { payFor, looksLikeShare, carryLedger, checkOffCycle } from '@/lib/pay-model'
import { resultOf, standing as orderStanding, settlementPlan, money as orderMoney, type Posting } from '@/lib/order'
import { benchCost, reserveBalance, drawFromReserve, type Policy } from '@/lib/bench-policy'
import { looseEnd, standing as looseStanding } from '@/lib/loose-ends'
import { commissionFor } from '@/lib/commission'
import { toCsv, yearEndPack, type Export, type Line } from '@/lib/payroll-export'
import { applyReceipt, collectionStage, checkWriteOff } from '@/lib/ar-ageing'

/**
 * Every amount money says, in its own currency and decimals (2026-11-08).
 * Pay-model, the order book, the bench reserve, the loose ends, the older
 * commission agreements, the payroll file and the collections ladder each
 * printed "$" with two decimals for every amount, so a rupee share read
 * dollars and a dong reserve read a hundredth of itself. Rupees and dollars
 * are never added: where a sum would cross two, each is said on its own.
 */

const NOW = new Date('2026-11-08T12:00:00Z')

describe('a dong amount reads whole dong, and a dollar amount keeps its cents', () => {
  it('a fixed-rate pay line in dong says the rate and the pay in whole dong', () => {
    const p = payFor({ model: 'FIXED_HOURLY', fixedRateCents: 250_000, hours: 40, billRateCents: 400_000, currency: 'VND' })
    const said = [p.says, ...p.working].join(' ')
    expect(said).toContain('₫250,000')
    expect(said).toContain('₫10,000,000')
    expect(said).not.toMatch(/\$|\.00/)
  })

  it('a fixed-rate pay line in dollars keeps its cents', () => {
    const p = payFor({ model: 'FIXED_HOURLY', fixedRateCents: 9_850, hours: 40, billRateCents: 13_000 })
    expect([p.says, ...p.working].join(' ')).toContain('$98.50')
  })

  it('a share of the bill in rupees reads rupees', () => {
    const p = payFor({ model: 'SHARE_OF_BILL', shareBps: 7_500, hours: 160, billRateCents: 200_000, currency: 'INR' })
    expect(p.working.join(' ')).toContain('₹')
    expect(p.working.join(' ')).not.toContain('$')
  })

  it('a pay rate that is a round share of the bill says both rates in their currency', () => {
    expect(looksLikeShare(400_000, 300_000, 'VND')?.says).toContain('₫300,000 is exactly 75% of ₫400,000')
  })

  it('the carried costs of a share in rupees read rupees', () => {
    const l = carryLedger([{ label: '2026-10', periodStart: new Date('2026-10-01'), hours: 1, billRateCents: 10_000_000, shareBps: 5_000, personalCostCents: 6_000_000 }], 'INR')
    expect(JSON.stringify(l)).toContain('₹')
    expect(JSON.stringify(l)).not.toContain('$')
  })

  it('an off-cycle payment in yen says whole yen', () => {
    const v = checkOffCycle({ amountCents: 50_000, reason: 'MISSED_HOURS', periodStart: new Date('2026-10-01'), payOn: new Date('2026-10-20'), currency: 'JPY' })
    if (v.ok) expect(v.says).toContain('¥50,000')
  })
})

describe('an order speaks in its own currency', () => {
  const posting = (kind: Posting['kind'], amountCents: number, currency = 'INR'): Posting =>
    ({ id: `${kind}-${amountCents}`, kind, amountCents, currency, postedAt: NOW } as Posting)

  it('an order in rupees says what it billed and made in rupees', () => {
    const r = resultOf([posting('REVENUE', 10_000_000), posting('PAY', -6_000_000)])
    expect(r.says).toContain('₹')
    expect(r.says).not.toContain('$')
  })

  it('a budget in dong says what is left in whole dong', () => {
    const s = orderStanding(50_000_000, [posting('PAY', -20_000_000, 'VND')])
    expect(s.says).toBe('₫30,000,000 left of ₫50,000,000.')
  })

  it('a settlement in rupees says rupees', () => {
    const plan = settlementPlan({ status: 'OPEN' as any, settlesToCode: 'CC-1', settlesToName: 'Delivery', currency: 'INR', postings: [posting('REVENUE', 10_000_000)], closingOn: NOW })
    expect(plan.says).not.toContain('$')
  })

  it('an order amount with no currency named still reads dollars with cents', () => {
    expect(orderMoney(123_456)).toBe('$1,234.56')
  })
})

describe('the bench reserve speaks in the person’s pay currency', () => {
  const policy: Policy = { policy: 'FULL_PAY', currency: 'INR' }

  it('a day on the bench paid in rupees says rupees', () => {
    const c = benchCost(policy, { idleDays: 5, billingDayRateCents: 400_000 })
    expect(c.says).toContain('₹')
    expect(c.says).not.toContain('$')
  })

  it('a reserve held in dong says whole dong', () => {
    const b = reserveBalance([{ kind: 'HOLD', amountCents: 3_000_000, at: NOW, says: '' }], 'VND')
    expect(b.says).toContain('₫3,000,000')
  })

  it('a draw from a rupee reserve says rupees', () => {
    expect(drawFromReserve(500_000, 200_000, 'the week of Nov 2', 'INR').says).toContain('₹')
  })
})

describe('sums that would cross two currencies are said per currency, never added', () => {
  it('billing at risk in dollars and rupees is said as two amounts, and no single total is given', () => {
    const at = (amountCents: number, currency: string) =>
      looseEnd('NO_BUY_CONTRACT', { id: `${currency}`, label: 'Ravi', amountCents, currency, since: NOW }, NOW)
    const s = looseStanding([at(1_360_000, 'USD'), at(40_000_000, 'INR')])
    expect(s.atRiskCents).toBeNull()
    expect(s.atRiskSays).toContain('$13,600.00')
    expect(s.atRiskSays).toContain('₹')
    expect(s.says).not.toContain('41,360,000')
  })

  it('billing at risk in one currency keeps its total', () => {
    const s = looseStanding([looseEnd('NO_BUY_CONTRACT', { id: 'a', label: 'Ravi', amountCents: 1_360_000, since: NOW }, NOW)])
    expect(s.atRiskCents).toBe(1_360_000)
    expect(s.atRiskSays).toBe('$13,600.00')
  })
})

describe('an older commission agreement says its own currency', () => {
  it('a per-hour commission in rupees reads rupees', () => {
    const r = commissionFor({ type: 'PER_HOUR', rate: 10_000, capCents: null, alreadyCents: 0, hours: 160, marginCents: 0, placementsStarted: 0, currency: 'INR' })
    expect(r.says).toContain('₹100.00')
    expect(r.says).not.toContain('$')
  })
})

describe('a payroll export in rupees says rupees', () => {
  const line = (over: Partial<Line> = {}): Line => ({
    payrollId: 'E1', personName: 'Ravi Kumar', contractType: 'W2', periodStart: new Date('2026-11-01'), periodEnd: new Date('2026-11-14'),
    hours: 80, overtimeHours: 0, rateCents: 150_000, regularCents: 12_000_000, overtimeCents: 0, totalCents: 12_000_000,
    uncoveredPremiumCents: 0, currency: 'INR', costCode: null, orderNumber: null, notes: [], ...over,
  } as Line)

  it('the generic payroll file names the rupee currency beside whole rupee amounts', () => {
    const e = { provider: 'GENERIC', lines: [line()], skipped: [], totalHours: 80, totalOvertimeHours: 0, totalCents: 12_000_000, uncoveredPremiumCents: 0, says: '', caveats: [] } as unknown as Export
    const csv = toCsv(e)
    expect(csv).toContain('1500.00,120000.00,0.00,INR')
  })

  it('a payroll file in yen carries whole yen, never a hundredth of it', () => {
    const e = { provider: 'GENERIC', lines: [line({ currency: 'JPY', rateCents: 3_000, regularCents: 240_000 })], skipped: [], totalHours: 80, totalOvertimeHours: 0, totalCents: 240_000, uncoveredPremiumCents: 0, says: '', caveats: [] } as unknown as Export
    expect(toCsv(e)).toContain('3000,240000,0,JPY')
  })

  it('the year-end summary of a rupee payroll says rupees', () => {
    const pack = yearEndPack([{ personId: 'p', personName: 'Ravi Kumar', hasTaxId: true, contractType: 'W2', amountCents: -12_000_000, currency: 'INR', postedAt: new Date('2026-06-01') }], 2026)
    expect(JSON.stringify(pack.summaries)).toContain('₹')
  })
})

describe('the collections ladder says each bill’s own currency', () => {
  it('a receipt placed against a bill in yen says whole yen', () => {
    const v = applyReceipt({ currency: 'JPY', amountMinor: 30_000, appliedToInvoiceId: null }, { number: 'IN-7', currency: 'JPY', totalMinor: 100_000, paidMinor: 0 })
    expect(v.says).toContain('¥30,000')
    expect(v.says).toContain('¥70,000')
  })

  it('an overdue rupee customer is chased in rupees', () => {
    const v = collectionStage({
      customerId: 'c', customerName: 'Sundara', currency: 'INR', overdueMinor: 5_000_000, oldestDaysOverdue: 40,
      disputedMinor: 0, exposureMinor: 9_000_000, laddersSent: [], ownerName: null, promise: null, brokenPromises: 0,
    }, NOW)
    expect(JSON.stringify(v)).not.toContain('$')
  })

  it('a write-off in dong says whole dong', () => {
    const v = checkWriteOff({ amountMinor: 3_000_000, currency: 'VND', reason: 'UNCOLLECTABLE', note: 'Closed down', byPersonId: 'p' } as any)
    expect(v.says).not.toMatch(/30,000\.00/)
  })
})

describe('a pay line recorded by hand says its own currency', () => {
  it('a placement bought from a supplier in rupees says the rate in rupees', async () => {
    const { recordedLine } = await import('@/lib/money/recorded-line')
    const r = recordedLine({
      boughtFrom: { id: 'sup', name: 'Sundara' }, payRateCents: 150_000, personName: 'Ravi Kumar', firmName: 'Teleworld',
      ownCompany: null, currency: 'INR',
    })
    expect(r.ok && r.says).toContain('₹1,500')
    expect(r.ok && r.says).not.toContain('$')
  })
})

describe('a line paid in pounds is never read against the dollar wage floors', () => {
  it('the wage facts of a buy line carry its pay currency', async () => {
    const { wageLineFor } = await import('@/lib/money/sheet-overtime')
    const line = wageLineFor({
      contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null, payModel: 'FIXED_HOURLY',
      overtimeAfterHours: 40, overtimeMultiplierBps: 15_000, payCurrency: 'GBP',
    } as any, 'Aoife Kelly', null)
    expect(line.payCurrency).toBe('GBP')
  })

  it('a line paid in pounds is not screened against the dollar salary floor', async () => {
    const { screenExemption } = await import('@/lib/worker-classification')
    const s = screenExemption({ payModel: 'FIXED_HOURLY', payRateCents: 9_000, paidOnSalaryBasis: false, payCurrency: 'GBP' })
    expect(s.outcome).toBe('ETYME_CANNOT_SAY')
    expect(s.says).toContain('Paid in GBP')
  })

  it('the exempt route and the payroll file pass the buy line’s pay currency to the screen', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    expect(fs.readFileSync('src/app/api/contracts/[id]/exempt/route.ts', 'utf8').match(/payCurrency: contract\.payCurrency/g)?.length).toBe(2)
    expect(fs.readFileSync('src/lib/payroll-export.ts', 'utf8')).toContain('payCurrency: s.currency')
    expect(fs.readFileSync('src/lib/money/sheet-overtime.ts', 'utf8')).toContain('payCurrency: input.line.payCurrency')
  })
})
