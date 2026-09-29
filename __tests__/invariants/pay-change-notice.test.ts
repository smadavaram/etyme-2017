/**
 * The worker is told when their own pay rate is approved.
 *
 * The founder, 2026-09-29: "The worker is told when a new rate is
 * approved." In the app and by email, in plain English, their own pay
 * and never what the client is billed for them.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payChangeNotice, payDay } from '@/lib/money/pay-change-notice'

const NOW = new Date('2026-09-29T12:00:00Z')

describe('the worker is told their new pay rate in one plain sentence', () => {
  it('says "Your pay rate changes from $66 to $70 an hour from Wednesday, July 1."', () => {
    const n = payChangeNotice({
      fromCents: 6_600, toCents: 7_000, currency: 'USD', effectiveFrom: '2026-07-01', employerName: 'Brightmoor', now: NOW,
    })
    expect(n.title).toBe('Your pay rate has changed')
    expect(n.body.startsWith('Your pay rate changes from $66 to $70 an hour from Wednesday, July 1.')).toBe(true)
    expect(n.body).toContain('Brightmoor approved it.')
  })

  it('names the year where the change is not in this one', () => {
    expect(payDay('2027-01-04', NOW)).toBe('Monday, January 4, 2027')
    expect(payDay('2026-07-01', NOW)).toBe('Wednesday, July 1')
  })

  it('keeps the cents where a rate has them', () => {
    const n = payChangeNotice({
      fromCents: 6_650, toCents: 7_025, currency: 'USD', effectiveFrom: '2026-07-01', employerName: 'Brightmoor', now: NOW,
    })
    expect(n.body).toContain('from $66.50 to $70.25 an hour')
  })

  it('says a cut the same plain way', () => {
    const n = payChangeNotice({
      fromCents: 7_000, toCents: 6_600, currency: 'USD', effectiveFrom: '2026-10-05', employerName: 'Brightmoor', now: NOW,
    })
    expect(n.body).toContain('Your pay rate changes from $70 to $66 an hour from Monday, October 5.')
  })

  it('tells them back pay was put to the payroll desk to approve, and that it is not paid yet — never that it was paid', () => {
    const n = payChangeNotice({
      fromCents: 6_600, toCents: 7_000, currency: 'USD', effectiveFrom: '2026-06-15', employerName: 'Brightmoor',
      backPayCents: 41_400, backPayWeeks: ['2026-06-15', '2026-06-22'], now: NOW,
    })
    expect(n.body).toContain('back pay of $414.00 for the weeks of June 15, 2026 and June 22, 2026')
    expect(n.body).toContain("Brightmoor's payroll desk to approve. It is not paid yet.")
  })

  it('says nothing of back pay where none is owed', () => {
    const n = payChangeNotice({
      fromCents: 6_600, toCents: 7_000, currency: 'USD', effectiveFrom: '2026-07-01', employerName: 'Brightmoor',
      backPayCents: 0, now: NOW,
    })
    expect(n.body).not.toContain('back pay')
  })

  it('is told only from a buy line that pays the worker, and reads no bill rate anywhere', () => {
    // The notice is built from the BUY row alone. A SELL line, or a buy
    // line bought from another firm, tells nobody: that is a price
    // between two firms, and the worker is not party to it.
    const src = readFileSync(join(process.cwd(), 'src/lib/money/pay-change-notice.ts'), 'utf8')
    expect(src).toContain("change.contractType.toUpperCase() !== 'BUY'")
    expect(src).toContain('bc.vendorCompanyId || bc.supplierSellContractId')
    expect(src).not.toMatch(/billRate|sellContract\b/)
  })
})
