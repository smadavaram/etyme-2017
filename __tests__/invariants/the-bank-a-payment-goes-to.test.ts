import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { bankGate } from '@/lib/setup-gate-rules'
import { firstPerFirm, PAY_TO_ORDER } from '@/lib/money/pay-to'

/**
 * Layer 7 money review, 2026-11-16: the payment gate reads the bank a
 * payment goes to, and nothing else. "A bank change clears the bank
 * check" only holds where the gate asks about the changed row; and a
 * waived bank item checks nothing, so it never opens the gate.
 */

const refused = { ok: false, step: 'BANK' }

describe('the payment gate reads the bank a payment goes to', () => {
  it('a firm whose payment details in use are not checked is not paid, whatever its supplier walk says', () => {
    expect(bankGate({ payee: 'Harborline Tech', remitOnFile: true, remitVerified: false, walkBankState: 'HELD' })).toMatchObject(refused)
    expect(bankGate({ payee: 'Harborline Tech', remitOnFile: true, remitVerified: false, walkBankState: null })).toMatchObject(refused)
  })

  it('a firm whose payment details in use are checked is paid', () => {
    expect(bankGate({ payee: 'Harborline Tech', remitOnFile: true, remitVerified: true, walkBankState: null })).toEqual({ ok: true })
  })

  it('a waived bank item on the supplier walk never counts as checked', () => {
    expect(bankGate({ payee: 'Northwind Staffing', remitOnFile: false, remitVerified: false, walkBankState: 'WAIVED' })).toMatchObject(refused)
  })

  it('a firm with no payment details on Etyme is paid only where the payer’s Finance held the bank item on its walk', () => {
    expect(bankGate({ payee: 'Northwind Staffing', remitOnFile: false, remitVerified: false, walkBankState: 'HELD' })).toEqual({ ok: true })
    expect(bankGate({ payee: 'Northwind Staffing', remitOnFile: false, remitVerified: false, walkBankState: 'PROVIDED' })).toMatchObject(refused)
    expect(bankGate({ payee: 'Northwind Staffing', remitOnFile: false, remitVerified: false, walkBankState: null })).toMatchObject(refused)
  })

  it('the bank a payment goes to is the default, else the first entered, one per firm', () => {
    expect(PAY_TO_ORDER).toEqual([{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }])
    const rows = [
      { companyId: 'a', id: 'new-default' },
      { companyId: 'a', id: 'old-checked' },
      { companyId: 'b', id: 'only' },
    ]
    const first = firstPerFirm(rows)
    expect(first.get('a')?.id).toBe('new-default')
    expect(first.get('b')?.id).toBe('only')
  })

  it('the gate, the check from a held receipt and the payment run’s file read the bank through that one reader', () => {
    const gate = readFileSync('src/lib/setup-gates.ts', 'utf8')
    expect(gate).toContain('payToRow(payeeCompanyId, db)')
    expect(gate).not.toMatch(/remitTo\.findFirst\(\{\s*where:\s*\{\s*companyId:\s*payeeCompanyId,\s*verifiedAt/)
    expect(readFileSync('src/lib/money/bank-check-read.ts', 'utf8')).toContain('return payToRow(payeeId)')
    const file = readFileSync('src/lib/money/run-file-read.ts', 'utf8')
    expect(file).toContain('payToRows(vendorIds)')
    expect(file).not.toContain('verifiedAt: { not: null }')
  })
})
