import { describe, it, expect } from 'vitest'
import { readReceipt, type ReceiptLine } from '@/lib/money/receipt-read'

/**
 * An invoice receipt row shows who worked, the hours signed against the
 * hours billed, and whether it matches.
 *
 * The founder, on the client's list, 2026-09-30: "I can't see anything
 * about the job except the title — how can anyone approve such content."
 */

const week = (over: Partial<ReceiptLine>): ReceiptLine => ({
  lineId: 'l1', kind: 'HOURS', personName: 'Helena Marsh', jobTitle: 'ERP finance lead',
  periodStart: '2026-09-14', periodEnd: '2026-09-18',
  hoursBilled: 40, hoursSigned: 40, rateCents: 14_500, contractRateCents: 14_500, amountCents: 580_000, ...over,
})

describe('an invoice receipt row shows who worked, the hours signed against the hours billed, and whether it matches', () => {
  it('a week billed as signed at the contract rate says so, and shows the working', () => {
    const r = readReceipt({ matched: true, checks: [], lines: [week({})], currency: 'USD' })
    expect(r.people).toEqual(['Helena Marsh'])
    expect(r.jobs).toEqual(['ERP finance lead'])
    expect(r.verdict).toBe('Matches the signed hours and the contract rate')
    expect(r.row).toBe('1 person · 1 week · matches')
    expect(r.lines[0].says).toBe('40 h signed × $145/hr = $5,800.00')
    expect(r.hoursBilled).toBe(40)
    expect(r.hoursSigned).toBe(40)
  })

  it('a week that bills forty where thirty-eight were signed says "Bills 40 h; 38 h were signed"', () => {
    const r = readReceipt({
      matched: false,
      checks: [{ code: 'QUANTITY', outcome: 'FAIL', reason: 'Helena Marsh: billed 40h, approved 38h', lines: ['l1'] }],
      lines: [week({ hoursSigned: 38 })],
      currency: 'USD',
    })
    expect(r.matches).toBe(false)
    expect(r.verdict).toBe('Helena Marsh: Bills 40 h; 38 h were signed')
    expect(r.row).toBe('1 person · 1 week · does not match')
  })

  it('a rate over the contract’s is named with both rates', () => {
    const r = readReceipt({ matched: false, checks: [], lines: [week({ rateCents: 15_000 })], currency: 'USD' })
    expect(r.lines[0].says).toBe('Bills $150/hr; the contract rate is $145/hr')
  })

  it('hours nobody has signed are said as unsigned, and the total signed is no figure rather than a short one', () => {
    const r = readReceipt({ matched: false, checks: [], lines: [week({ hoursSigned: null })], currency: 'USD' })
    expect(r.lines[0].says).toBe('Bills 40 h; nobody has signed these hours yet')
    expect(r.hoursSigned).toBeNull()
  })

  it('two people over three weeks, all matching, read as one short line on the row', () => {
    const r = readReceipt({
      matched: true,
      checks: [],
      lines: [
        week({ lineId: 'a' }),
        week({ lineId: 'b', periodStart: '2026-09-21', periodEnd: '2026-09-25' }),
        week({ lineId: 'c', personName: 'Omar Haddad', rateCents: 13_200, contractRateCents: 13_200, amountCents: 528_000 }),
      ],
      currency: 'USD',
    })
    expect(r.row).toBe('2 people · 3 weeks · all match')
    expect(r.lines).toHaveLength(3)
  })

  it('a match that passed on an exception somebody recorded says so, never plain “matches”', () => {
    const r = readReceipt({
      matched: true,
      checks: [{ code: 'PRICE', outcome: 'OVERRIDDEN', reason: 'rate amendment not keyed' }],
      lines: [week({})],
      currency: 'USD',
    })
    expect(r.verdict).toBe('Matches, with 1 exception recorded by your desk')
    expect(r.row).toBe('1 person · 1 week · matches with exceptions')
  })
})

describe('the payer’s list and page read the check, and offer Pay only where it passed', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8')

  it('a row the reader is asked to pay is drawn with who worked, the hours, the check and the order, never the job title alone', () => {
    const page = src('app/dashboard/invoices/page.tsx')
    expect(page).toContain("columns={side === 'PAYABLE' ? payableColumns : columns}")
    for (const label of ["label: 'Who and what'", "label: 'Hours signed / billed'", "label: 'Check'"]) expect(page).toContain(label)
  })

  it('Pay is offered on a row only where the check passed and the supplier submitted it', () => {
    const page = src('app/dashboard/invoices/page.tsx')
    expect(page).toContain("const payable = r.matches && (row.status === 'SUBMITTED' || row.status === 'PARTIALLY_PAID')")
  })

  it('nothing is paid that does not pass the check at the moment it is paid', () => {
    const route = src('app/api/invoices/[id]/payments/route.ts')
    expect(route).toContain('const now = await matchInvoice(id)')
    expect(route).toContain("code: 'MATCH_FAILED'")
  })
})
