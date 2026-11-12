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
      '3920.00', 'USD', '2026-11-20', 'First Ohio Bank', 'Pinnacle Staffing LLC', '4471', '', '',
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

// ── The confirmation from the payer's own system ──────────────────────

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  confirmRun, parseConfirmation, parseAmount, readConfirmBody, confirmBody, CONFIRM_FIELDS,
  type ConfirmDeps, type RunLineFacts, type PayRow,
} from '@/lib/money/run-confirm'

const TODAY = new Date('2026-11-14T12:00:00Z')

function runLine(over: Partial<RunLineFacts> = {}): RunLineFacts {
  return {
    runItemId: 'item1', billId: 'bill1', number: 'PR-2026-0441', vendorName: 'Pinnacle Staffing',
    vendorCompanyId: 'pinnacle', amountCents: 392_000, currency: 'USD', totalCents: 392_000, paidCents: 0,
    status: 'APPROVED', receivedAt: new Date('2026-11-01T00:00:00Z'), ...over,
  }
}

/** A run held in memory: the write moves the receipt the way the database would, and counts. */
function world(lines: RunLineFacts[], over: Partial<ConfirmDeps> = {}) {
  const writes: PayRow[] = []
  const deps: ConfirmDeps = {
    ownerGate: async () => ({ ok: true }),
    loadRun: async () => ({ id: 'run1', status: 'APPROVED', currency: 'USD', lines: lines.map((l) => ({ ...l })) }),
    gateSays: async () => null,
    pay: async (row) => {
      const l = lines.find((x) => x.billId === row.billId)!
      if (l.paidCents !== row.expectPaidCents || l.status === 'PAID') return { ok: false, says: 'moved' }
      l.paidCents += row.amountCents
      if (l.paidCents >= l.totalCents) l.status = 'PAID'
      writes.push(row)
      return { ok: true, paymentId: `pay${writes.length}` }
    },
    today: TODAY,
    ...over,
  }
  return { deps, writes, lines }
}

const FILE = (rows: string[]) =>
  ['etyme_payment_reference,amount,currency,paid_date,payer_reference', ...rows].join('\r\n')

describe('the confirmation from the payer’s own system marks paid what it names, and nothing else', () => {
  it('a confirmation row naming a run line at the balance owed marks that receipt paid, with the payer’s reference and the day', async () => {
    const w = world([runLine()])
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3920.00,USD,2026-11-13,ACH-88123']) })
    expect(r.ok && r.paid.length).toBe(1)
    expect(w.writes[0]).toMatchObject({ billId: 'bill1', amountCents: 392_000, payerReference: 'ACH-88123' })
    expect(w.writes[0].paidAt.toISOString().slice(0, 10)).toBe('2026-11-13')
    expect(r.ok && r.says).toBe('1 invoice receipt was marked paid.')
  })

  it('a confirmation row with a wrong amount is refused and nothing is written', async () => {
    const w = world([runLine()])
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3900.00,USD,2026-11-13,ACH-88123']) })
    expect(w.writes).toEqual([])
    expect(r.ok && r.refused[0].says).toContain('says 3900.00 USD for Pinnacle Staffing’s invoice PR-2026-0441, and 3920.00 USD is owed on it')
    expect(r.ok && r.says).toBe('Nothing was marked paid. One row was refused, and nothing was written for it.')
  })

  it('a confirmation row in another currency is refused and nothing is written', async () => {
    const w = world([runLine()])
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3920.00,EUR,2026-11-13,ACH-88123']) })
    expect(w.writes).toEqual([])
    expect(r.ok && r.refused[0].says).toContain('owed in USD and the confirmation says EUR')
  })

  it('the same confirmation twice pays once', async () => {
    const w = world([runLine()])
    const csv = FILE(['ETY-item1,3920.00,USD,2026-11-13,ACH-88123'])
    await confirmRun(w.deps, { by: 'FILE', csv })
    const again = await confirmRun(w.deps, { by: 'FILE', csv })
    expect(w.writes.length).toBe(1)
    expect(again.ok && again.paid).toEqual([])
    expect(again.ok && again.refused[0].says).toContain('is already paid. Nothing was written again')
  })

  it('a receipt the file does not name stays unpaid', async () => {
    const w = world([runLine(), runLine({ runItemId: 'item2', billId: 'bill2', number: 'PR-2026-0443' })])
    await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3920.00,USD,2026-11-13,ACH-88123']) })
    expect(w.writes.map((x) => x.billId)).toEqual(['bill1'])
    expect(w.lines[1].status).toBe('APPROVED')
    expect(w.lines[1].paidCents).toBe(0)
  })

  it('a row naming a receipt that is not in this run is refused, and nothing is written for it', async () => {
    const w = world([runLine()])
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-somebodyelse,3920.00,USD,2026-11-13,X', 'PR-2026-0441,3920.00,USD,2026-11-13,X']) })
    expect(w.writes).toEqual([])
    expect(r.ok && r.refused.map((x) => x.says)).toEqual([
      'Line 2: ETY-somebodyelse names no invoice receipt in this run, so nothing was marked paid for it.',
      'Line 3: PR-2026-0441 names no invoice receipt in this run, so nothing was marked paid for it.',
    ])
  })

  it('a company held for a verified Owner cannot confirm payment', async () => {
    const w = world([runLine()], {
      ownerGate: async () => ({ ok: false, says: 'Paying a firm waits for a verified Owner.', href: '/dashboard/settings/setup' }),
    })
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3920.00,USD,2026-11-13,ACH-88123']) })
    expect(r).toMatchObject({ ok: false, status: 403, code: 'OWNER_NOT_VERIFIED' })
    expect(w.writes).toEqual([])
  })

  it('a receipt that fails the payment gate today is refused in the gate’s own sentence, never marked paid', async () => {
    const w = world([runLine()], { gateSays: async () => 'Bank details not checked. Ask Rosalind Tay to check them, then pay.' })
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3920.00,USD,2026-11-13,ACH-88123']) })
    expect(w.writes).toEqual([])
    expect(r.ok && r.refused[0].says).toContain('Ask Rosalind Tay to check them')
  })

  it('a paid date in the future, or before the receipt arrived, is refused', async () => {
    const w = world([runLine(), runLine({ runItemId: 'item2', billId: 'bill2' })])
    const r = await confirmRun(w.deps, { by: 'FILE', csv: FILE(['ETY-item1,3920.00,USD,2026-12-01,A', 'ETY-item2,3920.00,USD,2026-10-01,B']) })
    expect(w.writes).toEqual([])
    expect(r.ok && r.refused.map((x) => x.says)).toEqual([
      'Line 2: 2026-12-01 has not happened yet. A confirmation says the day money left.',
      'Line 3: Pinnacle Staffing’s invoice PR-2026-0441 cannot be paid on 2026-10-01, before it arrived.',
    ])
  })

  it('one typed reference for the whole run names every line of it, each at the run’s own amount', async () => {
    const w = world([runLine(), runLine({ runItemId: 'item2', billId: 'bill2', amountCents: 100, totalCents: 100 })])
    const r = await confirmRun(w.deps, { by: 'TYPED', reference: 'WIRE-551', paidOn: '2026-11-13' })
    expect(w.writes.map((x) => [x.billId, x.amountCents, x.payerReference])).toEqual([['bill1', 392_000, 'WIRE-551'], ['bill2', 100, 'WIRE-551']])
    expect(r.ok && r.says).toBe('2 invoice receipts were marked paid.')
  })

  it('a file with no reference or amount column is refused in one sentence before anything is read', () => {
    const p = parseConfirmation('amount,paid_date\r\n3920.00,2026-11-13')
    expect(p.ok).toBe(false)
    expect(!p.ok && p.says).toContain('no etyme_payment_reference, payer_reference columns')
  })

  it('the run’s own file, filled in by the payer’s system, comes back as its confirmation, and its total row is skipped', async () => {
    const filled = runFile(RUN, [line()]).csv.replace('4471,,', '4471,2026-11-13,ACH-88123')
    const p = parseConfirmation(filled)
    expect(p.ok && p.rows.map((r) => [r.reference, r.amount, r.paidOn, r.payerReference])).toEqual([['ETY-item1', '3920.00', '2026-11-13', 'ACH-88123']])
    const w = world([runLine()])
    const r = await confirmRun(w.deps, { by: 'FILE', csv: filled })
    expect(r.ok && r.paid.length).toBe(1)
  })

  it('an amount is read strictly: no more places than the currency has, no letters, thousands commas read', () => {
    expect(parseAmount('3,920.00', 'USD')).toBe(392_000)
    expect(parseAmount('3920.5', 'USD')).toBe(392_050)
    expect(parseAmount('3920.001', 'USD')).toBeNull()
    expect(parseAmount('$3920', 'USD')).toBeNull()
    expect(parseAmount('170', 'VND')).toBe(170)
    expect(parseAmount('170.5', 'VND')).toBeNull()
  })
})

describe('every field the confirmation refuses without, the screen offers', () => {
  const SCREEN = readFileSync(join(process.cwd(), 'src/app/dashboard/ap/payment-run-file.tsx'), 'utf8')
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/ap/payment-runs/route.ts'), 'utf8')

  it('each field the reader refuses with is one the screen’s body sends, and the screen draws an input for it', () => {
    const refusedFields = new Set<string>()
    for (const body of [{}, { id: 'r' }, { id: 'r', reference: 'x' }]) {
      const v = readConfirmBody(body)
      if (!v.ok) refusedFields.add(v.field)
    }
    expect([...refusedFields].sort()).toEqual(['id', 'paidOn', 'reference'])
    const sent = new Set(Object.keys(confirmBody({ runId: 'r', csv: 'a', reference: 'x', paidOn: '2026-11-13' })))
    for (const f of CONFIRM_FIELDS) expect(sent.has(f), f).toBe(true)
    for (const f of ['csv', 'reference', 'paidOn']) expect(SCREEN, `no input for ${f}`).toContain(`name="${f}"`)
    expect(SCREEN).toContain('confirmBody(')
  })

  it('the route reads its body through the one reader, and the confirmation’s write is the run line’s one write', () => {
    expect(ROUTE).toContain('readConfirmBody(body)')
    expect(ROUTE).toContain('recordKeyedPayment(tx,')
    expect(ROUTE).toContain('mayPayKeyedReceipt(billId)')
    expect(ROUTE).toContain("needsVerifiedOwnerAt(companyId, 'PAY')")
  })

  it('a filled-in field is sent and an empty one is not', () => {
    expect(confirmBody({ runId: 'r', reference: '  ', paidOn: '' })).toEqual({ action: 'confirm', id: 'r' })
  })
})

// ── The supplier is told ──────────────────────────────────────────────

import { paidNotice, whoHearsPaid } from '@/lib/money/paid-notice'

describe('the supplier is told the day it is paid, once per payment', () => {
  it('the notice names the invoice, the amount in its currency, the payer’s reference and the paid date', () => {
    const n = paidNotice({
      paymentId: 'pay1', payerName: 'Northbend Athletic', vendorCompanyId: 'pinnacle', number: 'PR-2026-0441',
      amountCents: 392_000, currency: 'USD', paidAt: new Date('2026-11-13T00:00:00Z'), payerReference: 'ACH-88123',
    })
    expect(n.title).toBe('Northbend Athletic paid your invoice PR-2026-0441')
    expect(n.body).toBe('Northbend Athletic paid your invoice PR-2026-0441: $3,920.00 on November 13, 2026, reference ACH-88123.')
  })

  it('a dong payment is said in dong, with no cents', () => {
    const n = paidNotice({
      paymentId: 'pay2', payerName: 'Corvane Packaging', vendorCompanyId: 'v', number: 'HCM-12',
      amountCents: 9_240_000, currency: 'VND', paidAt: new Date('2026-11-13T00:00:00Z'), payerReference: 'VCB-1',
    })
    expect(n.body).not.toMatch(/\.\d\d\b/)
    expect(n.body).toContain('9,240,000')
  })

  it('the supplier’s billing seats hear it; where nobody bills, whoever records payments; where neither, the first seat', () => {
    expect(whoHearsPaid([
      { personId: 'owner', permissions: ['settings.manage'] },
      { personId: 'ar', permissions: ['invoices.issue'] },
    ])).toEqual(['ar'])
    expect(whoHearsPaid([
      { personId: 'owner', permissions: ['settings.manage'] },
      { personId: 'ap', permissions: ['payments.record'] },
    ])).toEqual(['ap'])
    expect(whoHearsPaid([{ personId: 'owner', permissions: [] }])).toEqual(['owner'])
    expect(whoHearsPaid([])).toEqual([])
  })

  it('the supplier is told only for a payment the confirmation has just written, so the same file twice tells nobody twice', () => {
    const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/ap/payment-runs/route.ts'), 'utf8')
    const confirmPart = ROUTE.slice(ROUTE.indexOf('async function confirm('))
    expect(confirmPart).toMatch(/for \(const p of result\.paid\) \{\s*told\.set\(p\.paymentId, await tellSupplierPaid\(/)
  })
})

// ── What the screen keeps saying once the run is paid ─────────────────

import { confirmSummary, confirmedLine } from '@/lib/money/run-confirm'

describe('the person who brought the confirmation back reads what it did, on the run’s row', () => {
  const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/ap/page.tsx'), 'utf8')
  const FORM = readFileSync(join(process.cwd(), 'src/app/dashboard/ap/payment-run-file.tsx'), 'utf8')

  it('the summary says how many were marked paid, how many suppliers were told by name, who has nobody to tell, and every refusal', () => {
    const s = confirmSummary({
      says: '2 invoice receipts were marked paid. Nimbus Talent has nobody on Etyme to tell, so tell them yourself.',
      paid: [{ vendorName: 'Pinnacle Staffing', suppliersTold: 2 }, { vendorName: 'Nimbus Talent', suppliersTold: 0 }],
      refused: [{ line: 4, reference: 'ETY-x', says: 'Line 4: ETY-x names no invoice receipt in this run, so nothing was marked paid for it.' }],
    })
    expect(s.says).toContain('Nimbus Talent has nobody on Etyme to tell')
    expect(s.told).toBe('1 supplier was told: Pinnacle Staffing.')
    expect(s.refused.map((x) => x.says)).toEqual(['Line 4: ETY-x names no invoice receipt in this run, so nothing was marked paid for it.'])
    expect(confirmSummary({ says: 'Nothing was marked paid.', paid: [] }).told).toBeNull()
  })

  it('the summary is kept on the run’s row outside the form, so it stays after the run turns paid and the form goes', () => {
    expect(PAGE).toContain('setConfirmed((m) => ({ ...m, [r.id]: summary }))')
    const summaryAt = PAGE.indexOf('<RunConfirmSummary summary={confirmed[r.id]} />')
    const formGate = PAGE.indexOf("{desk.mayRun && r.status !== 'PAID' && r.status !== 'CANCELLED' && (")
    expect(summaryAt).toBeGreaterThan(0)
    expect(summaryAt).toBeLessThan(formGate)
    expect(FORM).toContain('onDone(said)')
  })

  it('on reload a paid run says who confirmed it, when, and the payer’s reference', () => {
    expect(confirmedLine('run1', [
      { appliedAt: new Date('2026-11-13T15:00:00Z'), appliedByName: 'Rosalind Tay', reference: 'ACH-88123' },
      { appliedAt: new Date('2026-11-13T15:00:01Z'), appliedByName: 'Rosalind Tay', reference: 'ACH-88123' },
    ])).toBe('Confirmed paid by Rosalind Tay on 2026-11-13, payer’s reference ACH-88123.')
    expect(PAGE).toContain("r.status === 'PAID' && r.confirmed")
  })

  it('a run marked paid by hand carries the run’s own id, which is never shown as the payer’s reference', () => {
    expect(confirmedLine('run1', [{ appliedAt: new Date('2026-11-13T00:00:00Z'), appliedByName: 'Desmond Achebe', reference: 'run1' }]))
      .toBe('Confirmed paid by Desmond Achebe on 2026-11-13, with no payer’s reference.')
    expect(confirmedLine('run1', [])).toBeNull()
  })

  it('pressing Approve it, Mark it paid or Cancel shows the route’s own sentence on that run’s row, and a refusal too', () => {
    expect(PAGE).toContain('setRowSaid((m) => ({ ...m, [id]: { says: b.data.note } }))')
    expect(PAGE).toContain('setRowSaid((m) => ({ ...m, [id]: { says: e.message, failed: true } }))')
    expect(PAGE).toContain('{rowSaid[r.id].says}')
  })
})
