import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recompute, type PricedLine } from '@/lib/invoice-match'

/**
 * A bill prices a week against the line it was decided on.
 *
 * Where a contract draws no overtime line, the approval asks the question
 * against the job's hours — Omar Haddad's 45-hour week on a 40-hour job.
 * The bill priced the same week against the contract's silence, so the
 * premium the client chose never reached the invoice or its check.
 */

const week = (over: Partial<PricedLine['timesheet'] & object> = {}, decided = true): PricedLine => ({
  hours: 45, rateCents: 13_200, amountCents: 40 * 13_200 + 5 * 19_800, sellContractId: 'sc',
  sellContract: null,
  timesheet: {
    id: 't', periodStart: new Date('2026-09-20T00:00:00Z'), periodEnd: new Date('2026-09-26T00:00:00Z'),
    totalHours: 45, days: { '2026-09-21': 9, '2026-09-22': 9, '2026-09-23': 9, '2026-09-24': 9, '2026-09-25': 9 },
    leaveDays: {}, sellContractId: 'sc',
    overtimeDecisions: decided
      ? [{ sellContractId: 'sc', weekOf: new Date('2026-09-20T00:00:00Z'), treatment: 'PREMIUM', appliedBps: 15_000, overtimeHours: 5, accrualBps: 0 }]
      : [],
    sellContract: { overtimeAfterHours: null, overtimeMultiplierBps: 15_000, billStraddle: 'SPLIT', requirement: { hoursPerWeek: 40 } },
    ...over,
  },
})

describe('an invoice prices a week decided against the job’s hours where the contract draws no line', () => {
  it('Omar’s forty-five hours on a forty-hour job, decided at time and a half, bill forty straight and five at the premium', () => {
    const w = recompute(week(), { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z'), label: '' })
    expect(w).not.toBeNull()
    expect(w!.hours).toBe(45)
    expect(w!.premiumCents).toBe(5 * 6_600)
  })

  it('bill generation and the check both read the line through lineFor with the job’s hours', () => {
    const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8')
    // One reading of the week's terms for the bill and the posting (lib/money/week-overtime-terms, 2026-11-03).
    expect(src('lib/money/bill-generate.ts')).toContain('weekOvertimeTerms({')
    expect(src('lib/money/week-overtime-terms.ts')).toContain('lineFor(i.line, i.requirement, { stillToSign: false, decided: answering.length > 0 })')
    expect(src('lib/invoice-match.ts')).toContain('lineFor(billed, billed.requirement ?? ts.sellContract.requirement')
  })
})

describe('a seat is told which desk reads what placements earn, and the Reports page asks only what it may read', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8')

  it('the profitability refusal names the desks that read margin, never guesses the reader is a recruiter', () => {
    const route = src('app/api/profitability/route.ts')
    expect(route).toContain("doing: 'Reading what placements earn'")
    expect(route).toContain("needs: ['margin.read', 'pnl.read']")
    expect(route).not.toContain('A recruiter role deliberately does not')
  })

  it('the Reports page asks only what the seat’s menu would open: cash flow where Bills or Invoice receipts open, Profitability where Profitability opens, and never the bench', () => {
    // Reports is cash flow and profitability, nothing else (the founder,
    // 2026-11-08): the bench and the bills list are no longer read here.
    const page = src('app/dashboard/reports/page.tsx')
    expect(page).toContain("mayOpen('/dashboard/ap', permissions) || mayOpen('/dashboard/ar', permissions)")
    expect(page).toContain("mayOpen('/dashboard/profitability', permissions)")
    expect(page).not.toContain('/api/bench')
    expect(page).not.toContain('/api/invoices')
  })
})
