/**
 * Etyme does not pay; the client's own system pays, and Etyme tells the
 * supplier (the founder, 2026-11-12).
 *
 * An approved payment run leaves as a file the payer's system reads; the
 * confirmation comes back as a file or one typed reference; each receipt
 * it names is marked paid through the one payment write, and nothing it
 * does not name is touched.
 */

import { describe, it, expect } from 'vitest'
import {
  runFile, decimalAmount, lastFour, paymentReference, runItemOf, csvCell,
  RUN_FILE_COLUMNS, TOTAL_REFERENCE, type RunFileLine,
} from '@/lib/money/run-file'

const RUN = { id: 'run_abc123', currency: 'USD', scheduledFor: new Date('2026-11-13T00:00:00Z') }

function line(over: Partial<RunFileLine> = {}): RunFileLine {
  return {
    runItemId: 'item1',
    billId: 'bill1',
    number: 'PR-2026-0441',
    vendorName: 'Pinnacle Staffing',
    orderNumber: 'PO-2026-ADIVD',
    amountCents: 392_000,
    owedCents: 392_000,
    currency: 'USD',
    dueAt: new Date('2026-11-20T00:00:00Z'),
    bank: { bankName: 'First Ohio Bank', accountName: 'Pinnacle Staffing LLC', accountLast4: '4471' },
    gate: { ok: true },
    ...over,
  }
}

const rowsOf = (csv: string) => csv.trim().split('\r\n').map((r) => r.split(','))

describe('an approved payment run, exported as a file for the payer’s own system', () => {
  it('the file has one row per invoice receipt, with the supplier, its invoice, Etyme’s receipt, the order, the amount, the currency, the due date and the pay-to account', () => {
    const f = runFile(RUN, [line()])
    const [head, row] = rowsOf(f.csv)
    expect(head).toEqual([...RUN_FILE_COLUMNS])
    expect(row).toEqual([
      'ETY-item1', 'Pinnacle Staffing', 'PR-2026-0441', 'bill1', 'PO-2026-ADIVD',
      '3920.00', 'USD', '2026-11-20', 'First Ohio Bank', 'Pinnacle Staffing LLC', '4471',
    ])
    expect(f.rows).toBe(1)
    expect(f.says).toContain('Etyme sends no money')
  })

  it('a held receipt is never in the export, and is named in a sentence', () => {
    const held = line({
      runItemId: 'item2', billId: 'bill2', number: 'PR-2026-0442',
      gate: { ok: false, says: 'Pinnacle Staffing’s invoice PR-2026-0442 does not pass the check now: 41.5 hours billed against 40 accepted.' },
    })
    const f = runFile(RUN, [line(), held])
    expect(f.csv).not.toContain('PR-2026-0442')
    expect(f.csv).not.toContain('ETY-item2')
    expect(f.held.map((h) => h.number)).toEqual(['PR-2026-0442'])
    expect(f.says).toContain('One invoice receipt is left out')
    expect(f.says).toContain('41.5 hours billed against 40 accepted')
  })

  it('a receipt whose balance owed moved since the run was assembled is left out, never exported at the old figure', () => {
    const f = runFile(RUN, [line({ owedCents: 200_000 })])
    expect(f.rows).toBe(0)
    expect(f.held[0].says).toContain('assembled to pay 3920.00 USD and 2000.00 is owed on it now')
  })

  it('the export never carries a full account number, whatever it is handed', () => {
    const f = runFile(RUN, [line({ bank: { bankName: 'First Ohio Bank', accountName: 'Pinnacle', accountLast4: '000123456784471' } })])
    expect(f.csv).not.toContain('000123456784471')
    expect(rowsOf(f.csv)[1][10]).toBe('4471')
    expect(lastFour('12-34 5678')).toBe('5678')
    expect(lastFour(null)).toBe('')
  })

  it('a firm with no pay-to account on record is left out rather than exported with a blank one', () => {
    const f = runFile(RUN, [line({ bank: null })])
    expect(f.rows).toBe(0)
    expect(f.held[0].says).toContain('no pay-to account is on record for Pinnacle Staffing')
  })

  it('two currencies are never summed: each has its own total row, in its own places', () => {
    const f = runFile(RUN, [
      line(),
      line({ runItemId: 'item3', billId: 'bill3', currency: 'VND', amountCents: 9_240_000, owedCents: 9_240_000 }),
      line({ runItemId: 'item4', billId: 'bill4', currency: 'USD', amountCents: 5, owedCents: 5 }),
    ])
    expect(f.totals).toEqual([
      { currency: 'USD', minor: 392_005, amount: '3920.05' },
      { currency: 'VND', minor: 9_240_000, amount: '9240000' },
    ])
    const totals = rowsOf(f.csv).filter((r) => r[0] === TOTAL_REFERENCE)
    expect(totals.map((r) => [r[5], r[6]])).toEqual([['3920.05', 'USD'], ['9240000', 'VND']])
  })

  it('an amount is written from whole minor units in the currency’s own places, never through a float', () => {
    expect(decimalAmount(123_456_789, 'USD')).toBe('1234567.89')
    expect(decimalAmount(5, 'USD')).toBe('0.05')
    expect(decimalAmount(170, 'VND')).toBe('170')
    expect(decimalAmount(1_005, 'KWD')).toBe('1.005')
    expect(() => decimalAmount(1.5, 'USD')).toThrow()
  })

  it('the Etyme payment reference is stable and reads back to the line of the run it names', () => {
    expect(paymentReference('item1')).toBe('ETY-item1')
    expect(runItemOf(' ety-item1 ')).toBe('item1')
    expect(runItemOf('PR-2026-0441')).toBeNull()
    expect(runItemOf('ETY-')).toBeNull()
  })

  it('a cell a spreadsheet would read as a formula is written as text', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('Smith, Jones & Co')).toBe('"Smith, Jones & Co"')
  })
})
