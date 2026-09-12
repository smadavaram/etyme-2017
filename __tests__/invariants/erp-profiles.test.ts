import { describe, it, expect } from 'vitest'
import {
  PROFILES,
  profileById,
  formatDate,
  formatMoney,
  render,
  type CodedLine,
} from '@/lib/erp-profiles'

/**
 * Etyme is not the general ledger. These are four ways of writing down the
 * same coded rows, because SAP, Oracle, QuickBooks and Workday each take a
 * flat file and each disagrees about column names and date formats.
 *
 * The tests that matter most are the refusals. An AP team that finds a
 * one-cent gap rejects the whole file and asks for it again tomorrow, so a
 * discrepancy is worth catching before anything is written.
 */

function line(over: Partial<CodedLine> = {}): CodedLine {
  return {
    invoiceNumber: 'INV-2026-0412',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-31',
    vendor: 'Cloudepa Inc.',
    billTo: 'Terumo BCT',
    poNumber: 'PO-9001',
    personName: 'John Martinez',
    costCenterCode: 'MFG-FIN-4100',
    glAccount: '6120',
    amount: 100,
    currency: 'USD',
    ...over,
  }
}

describe('the profiles themselves', () => {
  it('covers the four systems a finance team is actually running', () => {
    const ids = PROFILES.map((p) => p.id)
    expect(ids).toContain('SAP_S4')
    expect(ids).toContain('ORACLE_AP')
    expect(ids).toContain('QUICKBOOKS')
    expect(ids).toContain('WORKDAY_FIN')
  })

  it('offers a plain spreadsheet for anybody not on that list', () => {
    expect(profileById('GENERIC')).not.toBeNull()
  })

  it('says what a finance team actually does with each file', () => {
    // "SAP export" tells somebody nothing. "Loaded through FB60, and the
    // cost centre must already exist in SAP" tells them whether it will work.
    for (const p of PROFILES) {
      expect(p.howItLands.length, p.id).toBeGreaterThan(40)
    }
  })

  it('gives every profile at least an invoice number and an amount', () => {
    for (const p of PROFILES) {
      const from = p.columns.map((c) => c.from)
      expect(from, p.id).toContain('invoiceNumber')
      expect(from, p.id).toContain('amount')
    }
  })

  it('never names two columns the same thing in one file', () => {
    for (const p of PROFILES) {
      const headers = p.columns.map((c) => c.header)
      expect(new Set(headers).size, p.id).toBe(headers.length)
    }
  })
})

describe('writing dates the way each system insists', () => {
  it('gives SAP an unpunctuated date', () => {
    expect(formatDate('2026-08-01', 'YYYYMMDD')).toBe('20260801')
  })

  it('gives Oracle and QuickBooks a US date', () => {
    expect(formatDate('2026-08-01', 'MM/DD/YYYY')).toBe('08/01/2026')
  })

  it('gives Workday an ISO date', () => {
    expect(formatDate('2026-08-01T12:00:00Z', 'ISO')).toBe('2026-08-01')
  })
})

describe('writing money', () => {
  it('always uses two decimals, so a whole number is not read as cents', () => {
    expect(formatMoney(100)).toBe('100.00')
    expect(formatMoney(1234.5)).toBe('1234.50')
  })

  it('never uses a thousands separator, which would break a comma-delimited file', () => {
    // The oldest way to break one of these files, and every AP system
    // rejects the whole thing rather than the row.
    expect(formatMoney(1234567.89)).not.toContain(',')
  })
})

describe('refusing to write a file that would be rejected', () => {
  it('refuses when the rows do not sum to the invoice', () => {
    const r = render(profileById('SAP_S4')!, [line({ amount: 99.99 })], 100)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.problems[0].problem).toMatch(/do not sum/i)
      expect(r.problems[0].detail).toMatch(/cent out is rejected whole/i)
    }
  })

  it('writes the file when the rows sum exactly', () => {
    const r = render(profileById('SAP_S4')!, [line({ amount: 60 }), line({ amount: 40 })], 100)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.total).toBe(100)
  })

  it('refuses a line with no cost centre, and names who it is', () => {
    // A cost centre missing here is missing in their ledger too, and the
    // file bounces. Naming the line is cheaper than letting them find it.
    const r = render(
      profileById('ORACLE_AP')!,
      [line({ costCenterCode: null, personName: 'Meera Krishnan' })],
      100
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems[0].detail).toContain('Meera Krishnan')
  })

  it('lets an uncoded line through on the plain spreadsheet, which is for mapping by hand', () => {
    const r = render(profileById('GENERIC')!, [line({ costCenterCode: null, glAccount: null })], 100)
    expect(r.ok).toBe(true)
  })

  it('refuses an invoice with no lines at all', () => {
    const r = render(profileById('SAP_S4')!, [], 0)
    expect(r.ok).toBe(false)
  })
})

describe('the file itself', () => {
  const lines = [line({ amount: 60 }), line({ amount: 40, personName: 'Ravi Patel' })]

  it('uses the delimiter the system expects', () => {
    // SAP wants semicolons; a comma file is rejected on sight.
    const sap = render(profileById('SAP_S4')!, lines, 100)
    expect(sap.ok).toBe(true)
    if (sap.ok) expect(sap.result.content.split('\r\n')[0]).toContain(';')
  })

  it('numbers the lines, because a distribution line needs a position', () => {
    const r = render(profileById('ORACLE_AP')!, lines, 100)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const rows = r.result.content.trim().split('\r\n')
      expect(rows[1]).toContain(',1,')
      expect(rows[2]).toContain(',2,')
    }
  })

  it('quotes a value containing the delimiter rather than splitting the row', () => {
    const r = render(
      profileById('ORACLE_AP')!,
      [line({ vendor: 'Cloudepa, Inc.', amount: 100 })],
      100
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.content).toContain('"Cloudepa, Inc."')
  })

  it('writes an empty cell rather than the word null when a field is absent', () => {
    const r = render(profileById('GENERIC')!, [line({ poNumber: null })], 100)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.content).not.toContain('null')
  })

  it('names the file so two of them can be told apart six months later', () => {
    const r = render(profileById('QUICKBOOKS')!, lines, 100)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.result.fileName).toContain('quickbooks')
      expect(r.result.fileName).toContain('INV-2026-0412')
    }
  })

  it('ends every line the way a Windows finance system expects', () => {
    const r = render(profileById('SAP_S4')!, lines, 100)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.content.endsWith('\r\n')).toBe(true)
  })

  it('writes one row per coded line plus a header', () => {
    const r = render(profileById('WORKDAY_FIN')!, lines, 100)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.result.content.trim().split('\r\n')).toHaveLength(3)
      expect(r.result.lineCount).toBe(2)
    }
  })
})
