import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agreedTermsFrom, withAgreed, stillAgreed } from '@/lib/money/agreed-terms'
import { whoMay, NEEDS } from '@/app/api/contracts/[id]/activate/gate'
import { paidBy, pairLine, describeLine } from '@/lib/order-naming'

/**
 * The Tapin walk, 2026-11-14, second round: three wirings in money's
 * screens onto sentence builders the schema owner changed (b431207b6).
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = 'src/app/dashboard/contracts/page.tsx'
const BOX = ['USD', 'CAD', 'GBP', 'EUR'] as const

describe('a 1099 or own-company line on Contracts never says payroll pays her', () => {
  it('the Contracts page passes the line’s contract type to every sentence about who pays the line', () => {
    const page = src(PAGE)
    expect(page).toContain("contractType: row.side === 'buy' ? row.buyContractType : null,")
    expect(page).toContain('contractType: row.buyContractType,')
    expect(page).toContain('contractType: contract.buyContractType,')
    expect(page).toContain("buyContractType: (tab === 'buy' ? c.contractType : c.pairedWith?.contractType) ?? null,")
  })

  it('the contracts list says how the paired buy line engages the person, so a sell line can say it', () => {
    expect(src('src/app/api/contracts/route.ts')).toContain('contractType: c.buyLinks[0].buyContract.contractType,')
  })

  it('a 1099 line with no order reads "Not yet on an order" on its chip, never "No order — payroll"', () => {
    expect(src(PAGE)).toContain("contractType: row.buyContractType }) === 'PAYROLL'")
    expect(paidBy({ side: 'BUY', personName: 'Marisol Quintero', paidToName: null, contractType: 'IND_1099' })).toBe('INVOICE_RECEIPT')
    expect(paidBy({ side: 'BUY', personName: 'Marisol Quintero', paidToName: null, contractType: 'W2' })).toBe('PAYROLL')
  })

  it('the sell line paired with a 1099 says what you pay her on her own invoice, and a W2 still reads payroll', () => {
    expect(pairLine({ side: 'SELL', counterpartName: null, contractType: 'IND_1099' })).not.toMatch(/payroll/i)
    expect(pairLine({ side: 'SELL', counterpartName: null, contractType: 'W2' })).toBe('Paired with payroll, because you employ them.')
    const own = describeLine({ order: null, companyId: 'c1', line: { side: 'BUY', personName: 'Marisol Quintero', contractType: 'C2C' } })
    expect(own.says).toMatch(/own company’s invoice/)
    expect(own.says).not.toMatch(/Payroll pays/)
  })
})

describe('who records or starts a placement names only roles the firm has seated', () => {
  it('where the firm seats neither role that starts a placement, the start names the Owner or an Admin', () => {
    expect(whoMay('activate', 'VENDOR', ['Owner', 'HR', 'Account Manager', 'AP & Payroll', 'Admin'])).toEqual(['Owner', 'Admin'])
  })

  it('where the firm seats a Contract Manager, only that role is named', () => {
    expect(whoMay('activate', 'VENDOR', ['Owner', 'HR', 'Contract Manager'])).toEqual(['Contract Manager'])
  })

  it('with no seats given, the shipped roles are named as before, and who may start a placement is unchanged', () => {
    expect(whoMay('activate', 'VENDOR')).not.toContain('Owner')
    expect(NEEDS.activate).toBe('assignments.write')
  })

  it('the start’s route and the contracts list both read the firm’s live seats', () => {
    expect(src('src/app/api/contracts/[id]/activate/route.ts'))
      .toContain("const who = whoMay('activate', caller.company?.kind, await seatedRoles(caller.company?.id))")
    expect(src('src/app/api/contracts/route.ts')).toContain("notYourButton(\n          'recording a placement',")
  })

  it('a seat with no Record a placement button reads the route’s sentence saying who records one', () => {
    const page = src(PAGE)
    expect(page).toContain('{framing?.create && !mayRecord && recordSays && (')
    expect(page).toContain("setRecordSays(typeof body.data?.recordSays === 'string' ? body.data.recordSays : null)")
  })
})

describe('Record a placement starts from the terms she agreed to on the bench', () => {
  const w2 = [{ termsEngagementType: 'W2', termsPayRateCents: 4500, termsPayCurrency: 'USD', termsAgreed: true }]
  const empty = { personId: '', engagementType: '', payRate: '', payCurrency: 'USD', boughtFromId: '' }

  it('the form starts with her agreed W2 terms and rate, and a person can still change them', () => {
    const agreed = agreedTermsFrom(w2, 'Marisol Quintero', 'USD', BOX)!
    expect(agreed.says).toBe('Filled from the terms Marisol Quintero agreed to on your bench: Employee of the firm (W2), $45/hr. You can change them.')
    const form = withAgreed(empty, 'p1', null, agreed)
    expect(form).toMatchObject({ personId: 'p1', engagementType: 'W2', payRate: '45.00', payCurrency: 'USD' })
    expect(stillAgreed(form, agreed)).toBe(true)
    // Changed by hand: the boxes keep the typed value, and the line saying
    // where they came from goes, because it no longer says what they hold.
    const typed = { ...form, payRate: '50.00', engagementType: 'IND_1099' }
    expect(stillAgreed(typed, agreed)).toBe(false)
    const page = src(PAGE)
    expect(page).toContain('onChange={(e) => setForm({ ...form, payRate: e.target.value })}')
    expect(page).toContain('onChange={(e) => setForm({ ...form, engagementType: e.target.value })}')
    expect(page).toContain('agreed: agreedTermsFrom(c.listings, name, homeCurrency, PAY_BOX_CURRENCIES),')
  })

  it('terms she has not said yes to fill nothing', () => {
    expect(agreedTermsFrom([{ ...w2[0], termsAgreed: false }], 'Marisol Quintero', 'USD', BOX)).toBeNull()
    expect(agreedTermsFrom([], 'Marisol Quintero', 'USD', BOX)).toBeNull()
  })

  it('a listing with no currency is read in the firm’s own currency', () => {
    const a = agreedTermsFrom([{ ...w2[0], termsPayCurrency: null }], 'Marisol Quintero', 'CAD', BOX)!
    expect(a.payCurrency).toBe('CAD')
    expect(a.payRate).toBe('45.00')
  })

  it('a rate in a currency the form does not take is said in its own currency and never typed into the box', () => {
    const a = agreedTermsFrom([{ termsEngagementType: 'IND_1099', termsPayRateCents: 120000, termsPayCurrency: 'INR', termsAgreed: true }], 'Arjun Rao', 'USD', BOX)!
    expect(a.payRate).toBeNull()
    expect(a.says).toMatch(/INR, so the pay rate is left blank\.$/)
    expect(a.says).toContain('₹')
    expect(withAgreed(empty, 'p2', null, a)).toMatchObject({ engagementType: 'IND_1099', payRate: '', payCurrency: 'USD' })
  })

  it('choosing another person empties the boxes the last person’s terms filled, and keeps what somebody typed', () => {
    const a = agreedTermsFrom(w2, 'Marisol Quintero', 'USD', BOX)!
    const filled = withAgreed(empty, 'p1', null, a)
    expect(withAgreed(filled, 'p3', a, null)).toMatchObject({ personId: 'p3', engagementType: '', payRate: '' })
    const typed = { ...filled, payRate: '52.00' }
    expect(withAgreed(typed, 'p3', a, null).payRate).toBe('52.00')
  })

  it('a person bought from a supplier has nothing filled, because her terms are with that supplier', () => {
    const a = agreedTermsFrom(w2, 'Marisol Quintero', 'USD', BOX)!
    expect(withAgreed({ ...empty, boughtFromId: 's1' }, 'p1', null, a)).toMatchObject({ engagementType: '', payRate: '' })
  })
})
