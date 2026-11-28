import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limitConverter } from '@/app/api/requisitions/job-currency'
import { SAMPLE_RATE_TABLE, type RateTable } from '@/lib/money/reporting-currency'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ON = new Date('2026-11-08T00:00:00Z')
const own: RateTable = {
  reportingCurrency: 'USD',
  rates: [{ from: 'INR', to: 'USD', rate: 0.012, effectiveOn: new Date('2026-10-01T00:00:00Z'), source: 'manual', recordedAt: new Date('2026-10-01T00:00:00Z'), setBy: 'Sharath' }],
  sample: false,
  label: 'Rates you set.',
}

describe('a job’s value is put beside a limit only at the company’s own rate', () => {
  it('the raise and the edit pass the job’s currency, the limit’s currency and the conversion', () => {
    for (const p of ['src/app/api/requisitions/route.ts', 'src/app/api/requisitions/[id]/route.ts']) {
      const src = read(p)
      expect(src).toContain('const facts: RequisitionFacts = {\n    currency,\n    limitCurrency,\n    convert,')
      expect(src).toContain('const convert = await companyLimitConverter(')
    }
  })

  it('a value in the limit’s own currency is itself, whatever rates are set', () => {
    expect(limitConverter(own, ON)(480_000, 'USD', 'USD')).toBe(480_000)
  })

  it('a value in rupees is put in dollars at the rate the company set', () => {
    expect(limitConverter(own, ON)(40_000_000, 'INR', 'USD')).toBe(480_000)
  })

  it('with no own rate, the conversion answers nothing and the rule routes the job to a person', () => {
    expect(limitConverter({ ...own, rates: [] }, ON)(40_000_000, 'INR', 'USD')).toBeNull()
  })

  it('the shipped sample table is never used to check a limit', () => {
    expect(SAMPLE_RATE_TABLE.rates.length).toBeGreaterThan(0)
    expect(limitConverter(SAMPLE_RATE_TABLE, ON)(40_000_000, 'INR', 'USD')).toBeNull()
  })
})
