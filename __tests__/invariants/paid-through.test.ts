import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { paidByPayroll, notPayrollSays, EMPLOYEE_CONTRACT_TYPES } from '@/lib/money/paid-through'
import { receiptPayments, buildExport, RECEIPT_CONTRACT_TYPES } from '@/lib/payroll-export'

/**
 * Payroll is for the firm's own employee. A supplier below — including
 * a worker's own company — is paid by invoice receipt, and so is a 1099
 * individual (CLAUDE.md, "Bill, invoice receipt, payroll"; "Buy contract
 * will pay supplier or run payroll for candidate"). One door says which.
 */

const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

describe('every line is paid one way', () => {
  it('payroll never pays a worker paid through their own company; the invoice receipt does', () => {
    expect(paidByPayroll({ contractType: 'C2C' })).toBe(false)
    expect(notPayrollSays({ personName: 'Ravi Subramanian', contractType: 'C2C' }))
      .toBe('Ravi Subramanian is paid through their own company’s invoice — see Invoice receipts.')
  })

  it('a worker bought from a supplier is paid through that supplier’s invoice, whatever the supplier calls them', () => {
    expect(paidByPayroll({ contractType: 'C2C', vendorCompanyId: 'consultis' })).toBe(false)
    expect(paidByPayroll({ contractType: 'W2', vendorCompanyId: 'consultis' })).toBe(false)
    expect(paidByPayroll({ contractType: 'W2', supplierSellContractId: 's1' })).toBe(false)
    expect(notPayrollSays({ personName: 'Ravi Subramanian', contractType: 'C2C', vendorName: 'Consultis' }))
      .toBe('Ravi Subramanian is paid through Consultis’s invoice — see Invoice receipts.')
  })

  it('a 1099 individual is paid on their own invoice, never by payroll', () => {
    expect(paidByPayroll({ contractType: 'IND_1099' })).toBe(false)
    expect(notPayrollSays({ personName: 'Dana Ruiz', contractType: 'IND_1099' }))
      .toBe('Dana Ruiz is paid on their own invoice as an independent contractor — see Invoice receipts.')
  })

  it('an employee of ours is paid by payroll, on every kind of employment', () => {
    for (const t of ['W2', 'C2H_W2', 'CDD', 'FIXED_TERM']) expect(paidByPayroll({ contractType: t })).toBe(true)
    expect([...EMPLOYEE_CONTRACT_TYPES]).toEqual(['W2', 'C2H_W2', 'CDD', 'FIXED_TERM'])
  })

  it('a line nobody typed is paid by neither until somebody says, rather than by payroll on a guess', () => {
    expect(paidByPayroll({ contractType: null })).toBe(false)
    expect(paidByPayroll({ contractType: 'UNKNOWN' })).toBe(false)
  })

  it('the same week is never paid twice, once by payroll and once by invoice receipt', () => {
    for (const t of ['W2', 'C2H_W2', 'CDD', 'FIXED_TERM', 'C2C', 'IND_1099']) {
      const byPayroll = paidByPayroll({ contractType: t })
      const byReceipt = (RECEIPT_CONTRACT_TYPES as readonly string[]).includes(t)
      expect(byPayroll && byReceipt, t).toBe(false)
      expect(byPayroll || byReceipt, t).toBe(true)
    }
    // And the year-end reads a receipt on an employee line as payroll's.
    expect(receiptPayments([{
      id: 'x', number: 'n', contractType: 'W2', payeeId: 'p', payeeName: 'P', currency: 'USD',
      totalCents: 1, paidCents: 1, paidAt: new Date(), status: 'PAID', runPayments: [],
    }]).postings).toHaveLength(0)
  })

  it('a 1099 individual never lands on the payroll file', () => {
    const e = buildExport('ADP', [{
      personName: 'Dana Ruiz', payrollId: null, contractType: 'IND_1099', weAreTheEmployer: true,
      periodStart: new Date('2026-08-03T00:00:00Z'), periodEnd: new Date('2026-08-07T00:00:00Z'),
      weeks: [], submittedHours: 40, acceptedHours: null, cutOvertime: 'ABOVE_THE_LINE',
      employerAcceptedAt: new Date('2026-08-08T00:00:00Z'), payRateCents: 5000,
    } as any])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toContain('independent contractor')
    expect(e.skipped[0].action).toBe('Settle it through accounts payable, not payroll.')
  })

  it('the payroll screen, the run, the file and back pay all ask the one door', () => {
    for (const f of ['app/api/payroll/route.ts', 'app/api/payroll/run/route.ts', 'lib/payroll-export.ts', 'lib/money/back-pay.ts', 'app/api/payroll/off-cycle/route.ts']) {
      expect(src(f), f).toMatch(/paidByPayroll/)
    }
  })
})
