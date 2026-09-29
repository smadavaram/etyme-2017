/**
 * The weekly overtime line a worker's pay is judged on.
 *
 * The founder, 2026-09-29 ("yes to all"): a nonexempt US worker is owed
 * overtime after 40 hours a week even where the contract sets no line,
 * because the law sets it. The client's bill is unchanged — that is a
 * term on the sell contract, and this is the employer's duty to its
 * worker.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payLineFor, payLineOn, payLineSays, weeklyWorked, outsideTheUS, type PayLineInput } from '@/lib/money/pay-line'
import { sheetOvertime, wageLineFor } from '@/lib/money/sheet-overtime'
import { buildExport, type SheetToPay } from '@/lib/payroll-export'
import type { ExemptAssertion } from '@/lib/worker-classification'

const US = { wageRule: 'US_FLSA', payCurrency: 'USD', entityCountry: null, siteCountry: null }

const base: PayLineInput = {
  buyAfterHours: null,
  sellAfterHours: null,
  personName: 'Priya Venkataraman',
  employerName: 'Brightmoor',
  contractType: 'W2',
  weAreTheEmployer: true,
  exemptStatus: 'NONEXEMPT',
  where: US,
}

// Monday to Friday, nine hours a day: a forty-five-hour week.
const FORTY_FIVE = { '2026-08-03': 9, '2026-08-04': 9, '2026-08-05': 9, '2026-08-06': 9, '2026-08-07': 9 }

describe('a nonexempt US worker is owed overtime after forty hours even where no contract sets a line', () => {
  it('draws the line at forty where neither the buy line nor the sell line sets one, because the law does', () => {
    const line = payLineFor(base)
    expect(line.afterHours).toBe(40)
    expect(line.source).toBe('LAW')
    expect(line.reason).toBe('LAW')
  })

  it('uses the buy line’s own line where it sets one', () => {
    expect(payLineFor({ ...base, buyAfterHours: 37, sellAfterHours: 40 })).toMatchObject({ afterHours: 37, source: 'BUY', reason: 'LINE' })
  })

  it('uses the sell line’s line where only the sell line sets one, as before', () => {
    expect(payLineFor({ ...base, sellAfterHours: 35 })).toMatchObject({ afterHours: 35, source: 'SELL', reason: 'LINE' })
  })

  it('never holds a nonexempt US worker past forty, even where a contract sets its line later', () => {
    const line = payLineFor({ ...base, buyAfterHours: 45 })
    expect(line.afterHours).toBe(40)
    expect(line.reason).toBe('LINE_ABOVE_LAW')
    expect(payLineSays(line, { personName: 'Priya Venkataraman' }, weeklyWorked(FORTY_FIVE))).toContain(
      'a contract cannot set it later'
    )
  })

  it('prices the forty-five-hour week at time and a half on five hours, at a $66 rate: $165 of premium', () => {
    const wage = wageLineFor(
      { contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null, payModel: 'FIXED_HOURLY', overtimeAfterHours: null, overtimeMultiplierBps: 15_000 },
      'Priya Venkataraman',
      { status: 'NONEXEMPT', basis: null, wageRule: 'US_FLSA', assertedByCompanyId: 'co', assertedAt: new Date('2026-07-01T00:00:00Z'), note: null, reviewBy: null }
    )
    const [w] = sheetOvertime({
      days: FORTY_FIVE, afterHours: payLineFor(base).afterHours, contractRateCents: 6_600, periods: [],
      method: 'US_REGULAR_RATE', line: wage,
    })
    expect(w.overHours).toBe(5)
    expect(w.terms.floorBps).toBe(15_000)
    expect(Math.round(w.overtime!.premiumCents)).toBe(16_500)
  })

  it('says where the line came from, once a week has gone over forty', () => {
    const says = payLineSays(payLineFor(base), { personName: 'Priya Venkataraman' }, weeklyWorked(FORTY_FIVE))
    expect(says).toBe(
      "Neither contract sets an overtime line for Priya Venkataraman, so the law's applies: Priya Venkataraman is nonexempt and works in the US, and is owed time and a half for hours over 40 in a week (29 U.S.C. §207(a)(1))."
    )
    // A week of forty says nothing: nothing went over.
    expect(payLineSays(payLineFor(base), { personName: 'Priya' }, weeklyWorked({ '2026-08-03': 40 }))).toBeNull()
  })

  it('leaves paid leave out of the forty, because leave was paid but not worked', () => {
    const worked = weeklyWorked({ ...FORTY_FIVE, '2026-08-07': 17 }, { '2026-08-07': 8 })
    expect(worked.get('2026-08-03')).toBe(45)
  })
})

describe('who the law’s forty does not reach', () => {
  it('leaves an exempt worker on straight time where no contract sets a line', () => {
    expect(payLineFor({ ...base, exemptStatus: 'EXEMPT' })).toMatchObject({ afterHours: null, reason: 'EXEMPT' })
  })

  it('leaves a worker nobody has classified on straight time, and says in the existing words that nobody has said whether they are exempt', () => {
    const line = payLineFor({ ...base, exemptStatus: null, where: { ...US, wageRule: null } })
    expect(line).toMatchObject({ afterHours: null, reason: 'UNRECORDED' })
    const says = payLineSays(line, { personName: 'Priya Venkataraman', employerName: 'Brightmoor' }, weeklyWorked(FORTY_FIVE))!
    expect(says).toContain('Priya Venkataraman worked 5 hours over 40 in the week of')
    expect(says).toContain('Brightmoor has not said whether Priya Venkataraman is exempt from overtime')
    expect(says).toContain('paid at straight time, as before')
    // Never the half of the old sentence that would be untrue here.
    expect(says).not.toContain('left off the payroll file')
  })

  it('does not apply the US forty to work under the UK rules, and says so', () => {
    const line = payLineFor({ ...base, where: { ...US, wageRule: 'UK', payCurrency: 'GBP' } })
    expect(line).toMatchObject({ afterHours: null, reason: 'NOT_US' })
    expect(payLineSays(line, { personName: 'Oliver Grant', employerName: 'Brightmoor' }, weeklyWorked(FORTY_FIVE))).toBe(
      'Oliver Grant worked 45 hours in the week of August 3, 2026. The US 40-hour overtime line is not applied, because ' +
        'Brightmoor recorded Oliver Grant\'s work under the Working Time Regulations, not US law. Neither contract sets an ' +
        'overtime line, so every hour is paid at straight time.'
    )
  })

  it('does not apply the US forty where the employer recorded no country’s rules at all', () => {
    const line = payLineFor({ ...base, where: { ...US, wageRule: 'DEFAULT' } })
    expect(line.reason).toBe('NOT_US')
    expect(payLineSays(line, { personName: 'Ana', employerName: 'Brightmoor' }, weeklyWorked(FORTY_FIVE))).toContain(
      "has recorded no country's wage rules for Ana's work"
    )
  })

  it('does not apply the US forty where the rule on record is the US one but the work site, the paying entity or the pay is outside the US', () => {
    for (const where of [
      { ...US, siteCountry: 'IN' },
      { ...US, entityCountry: 'IN' },
      { ...US, payCurrency: 'INR' },
    ]) {
      const line = payLineFor({ ...base, where })
      expect(line).toMatchObject({ afterHours: null, reason: 'US_UNCONFIRMED' })
    }
    const line = payLineFor({ ...base, where: { ...US, siteCountry: 'IN', payCurrency: 'INR' } })
    expect(payLineSays(line, { personName: 'Karthik Menon', employerName: 'Teleworld' }, weeklyWorked(FORTY_FIVE))).toContain(
      "Teleworld's record says US wage law governs Karthik Menon's pay, but the work site is in India and pay is in INR, " +
        "so the US 40-hour overtime line is not applied until somebody records which country's rules govern."
    )
  })

  it('reads a site or an entity recorded in the US as no evidence against the US', () => {
    expect(outsideTheUS({ ...US, siteCountry: 'US', entityCountry: 'us' })).toEqual([])
  })

  it('never gives the law’s forty to a corp-to-corp company, a sole trader or a sub-vendor’s employee', () => {
    expect(payLineFor({ ...base, contractType: 'C2C' }).afterHours).toBeNull()
    expect(payLineFor({ ...base, contractType: 'IND_1099' }).afterHours).toBeNull()
    expect(payLineFor({ ...base, weAreTheEmployer: false }).afterHours).toBeNull()
    expect(payLineFor({ ...base, weAreTheEmployer: false }).reason).toBe('NOT_OUR_WAGE')
  })

  it('keeps a line a contract drew for everybody it does not reach, exactly as before', () => {
    expect(payLineFor({ ...base, exemptStatus: 'EXEMPT', buyAfterHours: 45 }).afterHours).toBe(45)
    expect(payLineFor({ ...base, exemptStatus: null, sellAfterHours: 45 }).afterHours).toBe(45)
    expect(payLineFor({ ...base, where: { ...US, wageRule: 'UK' }, sellAfterHours: 48 }).afterHours).toBe(48)
  })

  it('reads a buy line and the sell line above it the same way every pay reader does', () => {
    const line = payLineOn(
      { overtimeAfterHours: null, contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null, payCurrency: 'USD', entity: null },
      { overtimeAfterHours: null, workLocation: { country: 'US' } },
      { name: 'Priya Venkataraman', payCurrency: 'USD' },
      { status: 'NONEXEMPT', wageRule: 'US_FLSA' }
    )
    expect(line.afterHours).toBe(40)
    const bought = payLineOn(
      { overtimeAfterHours: null, contractType: 'W2', vendorCompanyId: 'sub', supplierSellContractId: null, payCurrency: 'USD', entity: null },
      null,
      { name: 'Priya Venkataraman' },
      { status: 'NONEXEMPT', wageRule: 'US_FLSA' }
    )
    expect(bought.afterHours).toBeNull()
  })
})

describe('the payroll file pays the law’s forty', () => {
  const nonexempt: ExemptAssertion = {
    status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'co-1', assertedByCompanyName: 'Brightmoor',
    assertedByName: 'Renata Kowal', assertedAt: new Date('2026-07-01T00:00:00Z'), note: null, reviewBy: null,
  }
  const sheet = (over: Partial<SheetToPay>): SheetToPay => ({
    personName: 'Priya Venkataraman', payrollId: 'E1', contractType: 'W2', weAreTheEmployer: true,
    periodStart: new Date('2026-08-03T00:00:00Z'), periodEnd: new Date('2026-08-09T00:00:00Z'),
    weeks: [{ weekOf: '2026-08-03', regularHours: 40, leaveHours: 0, overHours: 5, client: { treatment: null, appliedBps: null } }],
    submittedHours: 45, acceptedHours: null, employerAcceptedAt: new Date('2026-08-10T00:00:00Z'),
    payRateCents: 6_600, contractPremiumBps: null, payModel: 'FIXED_HOURLY', paidOnSalaryBasis: false,
    rule: 'US_FLSA', assertion: nonexempt, currency: 'USD', costCode: null, orderNumber: null, ...over,
  })

  it('pays a nonexempt worker’s forty-five-hour week five hours of overtime at time and a half where neither contract set a line', () => {
    const line = payLineFor(base)
    const e = buildExport('ADP', [sheet({ lineSays: payLineSays(line, { personName: 'Priya Venkataraman' }, weeklyWorked(FORTY_FIVE)) })])
    expect(e.lines[0].hours).toBe(40)
    expect(e.lines[0].overtimeHours).toBe(5)
    expect(e.lines[0].overtimeCents).toBe(5 * 6_600 * 1.5)
    expect(e.lines[0].notes.some((n) => n.includes("the law's applies"))).toBe(true)
  })

  it('carries the reason the US forty was not applied on the line it pays', () => {
    const e = buildExport('ADP', [
      sheet({
        weeks: [{ weekOf: '2026-08-03', regularHours: 45, leaveHours: 0, overHours: 0, client: { treatment: null, appliedBps: null } }],
        lineSays: 'The US 40-hour overtime line is not applied.',
      }),
    ])
    expect(e.lines[0].hours).toBe(45)
    expect(e.lines[0].overtimeHours).toBe(0)
    expect(e.lines[0].notes).toContain('The US 40-hour overtime line is not applied.')
  })
})

describe('the client’s bill does not move', () => {
  const root = join(__dirname, '..', '..', 'src')
  it('is priced by code that never reads the pay line, because the law’s forty is the employer’s duty and not a billing term', () => {
    for (const f of [
      'lib/periods.ts', 'lib/overtime.ts', 'lib/money/rung-billing.ts', 'lib/invoice-match.ts',
      'app/api/invoices/generate/route.ts', 'app/api/timesheets/[id]/approve/route.ts',
    ]) {
      expect(readFileSync(join(root, f), 'utf8')).not.toContain('pay-line')
    }
  })

  it('is read for pay by the run, the screen, the file and back pay, all through the one door', () => {
    for (const f of [
      'app/api/payroll/run/route.ts', 'app/api/payroll/route.ts', 'app/api/payroll/export/route.ts', 'lib/money/back-pay.ts',
    ]) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src).toContain("from '@/lib/money/pay-line'")
      // Nobody decides the line on their own any more.
      expect(src).not.toMatch(/overtimeAfterHours \?\? [a-zA-Z!.]+\.overtimeAfterHours/)
    }
  })
})
