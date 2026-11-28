import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jobCurrencyOf } from '@/app/api/requisitions/job-currency'
import { annualValue, evaluateRequisition } from '@/lib/requisition-approval'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a job says its money in the client’s own currency', () => {
  it('a client that bills in dong raises jobs in dong, and a client with no currency in dollars', () => {
    expect(jobCurrencyOf({ currency: 'vnd' })).toBe('VND')
    expect(jobCurrencyOf({ currency: null })).toBe('USD')
    expect(jobCurrencyOf(null)).toBe('USD')
  })

  it('a job in dong states its budget in whole dong', () => {
    const v = annualValue({ budgetCents: 2_400_000_000, billMaxCents: null, headcount: 1, months: 12, currency: 'VND' })
    expect(v.says).toBe('the ₫2,400,000,000 budget you stated')
  })

  it('a job in dollars reads exactly as before, with nothing passed', () => {
    const v = annualValue({ budgetCents: 4_800_000, billMaxCents: null, headcount: 1, months: 12 })
    expect(v.says).toBe('the $48,000 budget you stated')
  })

  it('which jobs need approval does not move with the currency', () => {
    const facts = (currency?: string) => ({
      annualValueCents: 4_800_000, valueBasis: 'BUDGET' as const, valueSays: 'x', headcount: 1, billMaxCents: 9_000,
      skillMedianCents: null, costCenter: null, months: 12, ...(currency ? { currency } : {}),
    })
    expect(evaluateRequisition(facts('INR') as any, []).state).toBe(evaluateRequisition(facts() as any, []).state)
  })

  it('the raise and the edit pass the job’s currency to both readers', () => {
    for (const p of ['src/app/api/requisitions/route.ts', 'src/app/api/requisitions/[id]/route.ts']) {
      const src = read(p)
      expect(src).toContain('const currency = await jobCurrency(')
      expect(src).toMatch(/hoursPerWeek[^\n]*\n\s+currency,\n\s+\}\)/)
      expect(src).toContain('const facts: RequisitionFacts = {\n    currency,')
    }
  })

  it('the raise’s reply gives the annual value in whole units of the job’s currency', () => {
    const src = read('src/app/api/requisitions/route.ts')
    expect(src).toContain('annualValue: wholeFromMinor(value.cents, currency),')
    expect(src).not.toContain('annualValue: value.cents / 100')
  })
})
