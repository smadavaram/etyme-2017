import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftedAt, duplicateDrafts, type BillOnRecord } from '@/lib/money/duplicate-drafts'
import { withBankHold, receiptFlag, bankHoldTitle, stillHeld, type InvoiceVerdict } from '@/lib/twin/rules/invoice'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the duplicate-drafts repair reads a bill’s drafted day from what the record holds (walk 7)', () => {
  it('a bill’s drafted day is its first line’s, because a bill carries no created stamp of its own', () => {
    const first = new Date('2026-11-01T09:00:00Z')
    expect(draftedAt({
      issuedAt: null, submittedAt: null,
      invoiceLines: [{ createdAt: new Date('2026-11-02T09:00:00Z') }, { createdAt: first }],
    })).toEqual(first)
  })

  it('a bill with no lines is dated by the day it was issued, else sent, else not at all', () => {
    const issued = new Date('2026-10-12T00:00:00Z')
    expect(draftedAt({ issuedAt: issued, submittedAt: null, invoiceLines: [] })).toEqual(issued)
    expect(draftedAt({ issuedAt: null, submittedAt: null, invoiceLines: [] })).toBeNull()
  })

  it('a draft with no drafted day is never the one kept over a draft that has one', () => {
    const base = {
      status: 'DRAFT', periodStart: new Date('2026-10-04T00:00:00Z'), periodEnd: new Date('2026-10-10T00:00:00Z'),
      lines: [{ timesheetId: null, personId: 'rajesh', personName: 'Rajesh Iyer' }],
    }
    const groups = duplicateDrafts([
      { ...base, id: 'undated', number: 'IN-A', createdAt: null },
      { ...base, id: 'dated', number: 'IN-B', createdAt: new Date('2026-11-01T00:00:00Z') },
    ] as BillOnRecord[])
    expect(groups[0].keep.id).toBe('dated')
    expect(groups[0].withdraw.map((w) => w.id)).toEqual(['undated'])
  })

  it('the duplicate-drafts read asks the database only for fields a bill has, checked by the type check', () => {
    const file = src('src/lib/money/duplicate-drafts.ts')
    expect(file).toMatch(/satisfies Prisma\.InvoiceSelect/)
    expect(file).not.toMatch(/id: true, number: true, status: true, createdAt: true/)
  })

  it('the Bills page keeps its list when the duplicate-drafts read fails', () => {
    expect(src('src/app/dashboard/invoices/duplicate-drafts.tsx')).toMatch(/catch \{\s*setGroups\(\[\]\)/)
    expect(src('src/app/api/invoices/route.ts')).toMatch(/DUPLICATES_UNREADABLE/)
  })
})

describe('one bank gate for a typed-in invoice receipt, read by the payment and by its screen (walk 7)', () => {
  it('the typed-in receipt’s payment route and its screen both read the gate that includes the bank', () => {
    expect(src('src/app/api/ap/bills/route.ts')).toMatch(/await keyedPayGateNow\(bill, vendorName, check,/)
    expect(src('src/app/api/ap/bills/route.ts')).not.toMatch(/= keyedPayGate\(bill/)
    expect(src('src/lib/money/receipts-read.ts')).toMatch(/await keyedPayGateNow\(b, vendorName, check, viewerId\)/)
  })

  it('the hold is lifted where it is said: the receipt’s screen offers the check to the person who checks', () => {
    const screen = src('src/app/dashboard/ap/receipts.tsx')
    expect(screen).toMatch(/r\.doors\.pay\.bank\?\.mayCheck/)
    expect(screen).toMatch(/act: 'check-bank'/)
  })
})

describe('a bank hold on a clean receipt is a hold, never a mismatch (walk 7)', () => {
  const clean: InvoiceVerdict = {
    invoiceId: 'pr-0441', number: 'PR-2026-0441', supplierName: 'Pinnacle Resourcing', dueAt: null,
    verdict: 'CLEAN', ruleCited: 'Hours and rate match.', rationale: 'Pay it.', payable: true,
    failing: [], lines: [], rules: { hoursTolerancePct: 0.5, source: 'DEFAULT' },
  }
  const HOLD = 'Pinnacle Resourcing’s bank details are not checked. Renata Kowal or Camille Ostrander checks them on this invoice receipt, then it can be paid.'

  it('a clean receipt held on the supplier’s bank is marked as held on the bank, with the sentence naming who checks', () => {
    const held = withBankHold(clean, HOLD)
    expect(held).toMatchObject({ verdict: 'CLEAN', payable: false, heldOn: 'BANK', rationale: HOLD })
    expect(receiptFlag(held)).toBe('BANK_HOLD')
  })

  it('a receipt the check finds a difference on is a mismatch, and a bank hold never turns one into anything else', () => {
    const mismatch = { ...clean, verdict: 'MISMATCH' as const, payable: false }
    expect(receiptFlag(mismatch)).toBe('MISMATCH')
    expect(withBankHold(mismatch, HOLD)).toBe(mismatch)
    expect(receiptFlag({ ...clean, verdict: 'BLOCKED', payable: false })).toBe('MISMATCH')
  })

  it('a clean receipt held for any other reason is not payable and is not called a bank hold', () => {
    expect(receiptFlag({ ...clean, payable: false })).toBe('NOT_PAYABLE')
    expect(receiptFlag(clean)).toBe('NONE')
  })

  it('the notice about a bank hold names the receipt and the supplier and never says it does not match', () => {
    const title = bankHoldTitle({ number: 'PR-2026-0441', supplierName: 'Pinnacle Resourcing' })
    expect(title).toBe('PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked')
    expect(title).not.toMatch(/does not match/)
    expect(bankHoldTitle({})).toBe('An invoice receipt is held: the bank details are not checked')
  })

  it('a receipt once paid is no longer held, so a line said about it is not carried after the payment', () => {
    const held = withBankHold(clean, HOLD)
    expect(stillHeld(held, 'SUBMITTED')).toBe(true)
    expect(stillHeld(held, 'PAID')).toBe(false)
    expect(stillHeld(clean, 'SUBMITTED')).toBe(false)
    expect(stillHeld(null, null)).toBe(false)
  })
})
