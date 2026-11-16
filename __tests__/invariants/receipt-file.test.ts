/**
 * Layer 9, slice 1: the client's own file of the invoice receipts it
 * received. One row per receipt line, in the client's own codes, one
 * generic layout with a column picker, no bank details.
 */

import { describe, it, expect } from 'vitest'
import {
  receiptFile, pickColumns, RECEIPT_COLUMNS, DEFAULT_RECEIPT_COLUMNS,
  type ReceiptIn, type ReceiptLineIn, type CodeShare,
} from '@/lib/money/receipt-file'

const RUN = { id: 'run_abc123', currency: 'USD', scheduledFor: new Date('2026-11-13T00:00:00Z') }

const one = (over: Partial<CodeShare> = {}): CodeShare => ({
  key: 'cc1', costObjectType: 'COST_CENTER', costObject: 'CC-4100', glAccount: '6120', shareBps: 10_000, ...over,
})

function line(over: Partial<ReceiptLineIn> = {}): ReceiptLineIn {
  return {
    id: 'ln1', personId: 'p1', person: 'Ada North',
    periodStart: new Date('2026-11-01T00:00:00Z'), periodEnd: new Date('2026-11-07T00:00:00Z'),
    signedWeek: 'wk1', approver: 'Mina Hart', approvedOn: new Date('2026-11-09T00:00:00Z'),
    hours: 40, rateCents: 9_800, amountCents: 392_000, shares: [one()], ...over,
  }
}

function receipt(over: Partial<ReceiptIn> = {}): ReceiptIn {
  return {
    runItemId: 'item1', billId: 'bill1', number: 'NW-0441', vendorId: 'co_northwind', vendorName: 'Northwind Staffing',
    orderNumber: 'PO-77', orderLineId: 'buy1', amountCents: 392_000, owedCents: 392_000, currency: 'USD',
    dueAt: new Date('2026-11-20T00:00:00Z'), gate: { ok: true }, lines: [line()], ...over,
  }
}

const rowsOf = (csv: string) => csv.trim().split('\r\n').map((r) => r.split(','))

describe('the client’s file of the invoice receipts it received', () => {
  it('each receipt line is one row, with the supplier, the order, the person, the signed week, the approver, the hours, the rate and the client’s own codes', () => {
    const f = receiptFile(RUN, [receipt()])
    const [head, row] = rowsOf(f.csv)
    expect(head).toEqual([...DEFAULT_RECEIPT_COLUMNS])
    expect(row).toEqual([
      'ln1:cc1', 'ln1', 'bill1', 'NW-0441', 'Northwind Staffing', 'co_northwind', 'PO-77', 'buy1', 'Ada North',
      '2026-11-01', '2026-11-07', 'wk1', 'Mina Hart', '2026-11-09', '40.00', '98.00', '3920.00', 'USD', '100%',
      'COST_CENTER', 'CC-4100', '6120', '2026-11-20',
    ])
    expect(f.rows).toBe(1)
    expect(f.personIds).toEqual(['p1'])
  })

  it('a line split across three cost centers is three rows that add back to the line to the cent, hours included', () => {
    const third = [
      one({ key: 'a', costObject: 'CC-A', shareBps: 3333 }),
      one({ key: 'b', costObject: 'CC-B', shareBps: 3333 }),
      one({ key: 'c', costObject: 'CC-C', shareBps: 3334 }),
    ]
    const f = receiptFile(RUN, [receipt({ amountCents: 10_000, owedCents: 10_000, lines: [line({ amountCents: 10_000, hours: 1, rateCents: 10_000, shares: third })] })])
    const rows = rowsOf(f.csv).slice(1)
    const col = (name: string) => DEFAULT_RECEIPT_COLUMNS.indexOf(name)
    expect(rows).toHaveLength(3)
    const cents = rows.map((r) => Math.round(Number(r[col('amount')]) * 100))
    expect(cents.reduce((a, b) => a + b, 0)).toBe(10_000)
    const hours = rows.map((r) => Math.round(Number(r[col('hours')]) * 100))
    expect(hours.reduce((a, b) => a + b, 0)).toBe(100)
    expect(new Set(rows.map((r) => r[col('etyme_row_id')])).size).toBe(3)
    expect(f.totals).toEqual([{ currency: 'USD', minor: 10_000, amount: '100.00' }])
  })

  it('a line with no code of the client’s is held from the file and named, and the receipt’s other lines stay in', () => {
    const f = receiptFile(RUN, [receipt({
      amountCents: 500_000, owedCents: 500_000,
      lines: [line(), line({ id: 'ln2', person: 'Bo Reyes', amountCents: 108_000, shares: [] })],
    })])
    expect(f.rows).toBe(1)
    expect(f.csv).not.toContain('ln2')
    expect(f.held).toHaveLength(1)
    expect(f.held[0]).toMatchObject({ lineId: 'ln2', person: 'Bo Reyes' })
    expect(f.says).toContain('Bo Reyes’s line')
    expect(f.says).toContain('no cost center or order of yours')
    expect(f.says).toContain('the rest of that invoice is in the file')
  })

  it('a receipt the payment gate refuses is never in the file, and the gate’s own sentence is said', () => {
    const f = receiptFile(RUN, [receipt({ gate: { ok: false, says: 'Northwind Staffing’s invoice NW-0441 does not pass the check now.' } })])
    expect(f.rows).toBe(0)
    expect(f.csv).not.toContain('NW-0441,')
    expect(f.held[0].lineId).toBeNull()
    expect(f.says).toContain('does not pass the check now')
    expect(f.says).toContain('Nothing in this run can be put in the file today')
  })

  it('a receipt recorded as a total with no lines is held, because there is no line to code', () => {
    const f = receiptFile(RUN, [receipt({ lines: [] })])
    expect(f.rows).toBe(0)
    expect(f.says).toContain('no lines')
  })

  it('a receipt whose lines do not add up to what the run pays is held whole', () => {
    const f = receiptFile(RUN, [receipt({ lines: [line({ amountCents: 391_999 })] })])
    expect(f.rows).toBe(0)
    expect(f.held[0].says).toContain('lines add up to 3919.99')
  })

  it('a receipt part-paid since the run was assembled is held, never exported at the old amount', () => {
    const f = receiptFile(RUN, [receipt({ owedCents: 100_000 })])
    expect(f.rows).toBe(0)
    expect(f.held[0].says).toContain('1000.00 is owed on it now')
  })

  it('a split that does not total a whole is held rather than exported short', () => {
    const f = receiptFile(RUN, [receipt({ lines: [line({ shares: [one({ shareBps: 9_000 })] })] })])
    expect(f.rows).toBe(0)
    expect(f.held[0].says).toContain('must total exactly 100%')
  })

  it('the file carries no bank name, account name or account digits', () => {
    const f = receiptFile(RUN, [receipt()])
    const names = f.columns.join(' ')
    expect(names).not.toMatch(/bank|account_name|last4|routing/)
    expect(RECEIPT_COLUMNS.map((c) => c.id).join(' ')).not.toMatch(/bank|last4|routing/)
  })

  it('amounts are in the currency’s own places and each currency has its own total, never a sum across two', () => {
    const dong = receipt({
      billId: 'b2', currency: 'VND', amountCents: 5_000_000, owedCents: 5_000_000,
      lines: [line({ id: 'ln9', amountCents: 5_000_000, rateCents: 100_000, shares: [one({ key: 'z' })] })],
    })
    const f = receiptFile(RUN, [receipt(), dong])
    expect(f.totals.map((t) => t.currency)).toEqual(['USD', 'VND'])
    expect(f.totals.find((t) => t.currency === 'VND')!.amount).toBe('5000000')
  })

  it('an internal order reads as its type and the code the client holds', () => {
    const f = receiptFile(RUN, [receipt({ lines: [line({ shares: [one({ costObjectType: 'INTERNAL_ORDER', costObject: 'IO-4711' })] })] })])
    expect(f.csv).toContain('INTERNAL_ORDER,IO-4711')
  })

  it('choosing and ordering columns changes the header and the cells and nothing else: rows and totals are the same', () => {
    const all = receiptFile(RUN, [receipt()])
    const some = receiptFile(RUN, [receipt()], ['cost_object', 'supplier_invoice_number'])
    expect(rowsOf(some.csv)).toEqual([['cost_object', 'supplier_invoice_number'], ['CC-4100', 'NW-0441']])
    expect(some.rows).toBe(all.rows)
    expect(some.totals).toEqual(all.totals)
    const noAmount = receiptFile(RUN, [receipt()], ['supplier'])
    expect(noAmount.totals).toEqual(all.totals)
  })

  it('a column the file does not have is refused in a sentence, and no choice means every column', () => {
    expect(pickColumns(['supplier', 'bank_name'])).toMatchObject({ ok: false })
    const r = pickColumns(['bank_name']) as { ok: false; says: string }
    expect(r.says).toContain('no column called “bank_name”')
    expect(pickColumns(null)).toEqual({ ok: true, ids: [...DEFAULT_RECEIPT_COLUMNS] })
    expect(pickColumns(['amount', 'supplier', 'amount'])).toEqual({ ok: true, ids: ['amount', 'supplier'] })
  })

  it('a cell that begins like a formula is never read as one by a spreadsheet', () => {
    const f = receiptFile(RUN, [receipt({ vendorName: '=HYPERLINK("x")' })])
    expect(f.csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
