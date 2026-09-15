import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  dueOn,
  resolveBillingTerms,
  anchorWords,
  isAnchor,
  PLATFORM_DEFAULTS,
} from '@/lib/billing-cascade'
import { ageInvoice, type ArInvoice } from '@/lib/ar-ageing'

/**
 * What the payment days are counted from.
 *
 * The invoice route computed `dueAt = period.end + paymentTerms`, always,
 * and it was wrong against almost every agreement anybody signs. NET 30
 * runs from receipt of the invoice. A period ending the 31st is billed on
 * the 6th, once the hours are in and approved, so counting from the 31st
 * claims the money due six days early — we chase a client who is not
 * late, and every days-sales-outstanding figure in the company is
 * overstated by however long it takes us to raise the bill.
 *
 * The other half of the fix is the case where the date cannot be known
 * yet. An invoice on receipt terms has, at the moment it is raised,
 * definitionally not been received. The honest answer there is not
 * "thirty days from today" — it is what the clock is waiting for.
 */

const PERIOD_END = new Date('2026-08-31T00:00:00.000Z')
const ISSUED = new Date('2026-09-06T00:00:00.000Z')
const RECEIVED = new Date('2026-09-09T00:00:00.000Z')
const day = (d: Date) => d.toISOString().slice(0, 10)

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const invoice = (over: Partial<ArInvoice>): ArInvoice => ({
  id: 'inv-1', number: 'IN_001', currency: 'USD',
  totalMinor: 500_000, paidMinor: 0,
  dueAt: new Date('2026-09-30T00:00:00.000Z'),
  customerId: 'c1', customerName: 'Nike',
  status: 'ISSUED',
  ...over,
})

describe('what the payment days are counted from', () => {

  it('net thirty runs from what the contract says it runs from, and an invoice raised six days late is not due six days early', () => {
    const fromPeriod = dueOn({ anchor: 'PERIOD_END', days: 30, periodEnd: PERIOD_END, issuedAt: ISSUED })
    const fromReceipt = dueOn({
      anchor: 'RECEIPT_DATE', days: 30, periodEnd: PERIOD_END, issuedAt: ISSUED, receivedAt: RECEIVED,
    })

    // The old arithmetic, which is still right for a contract that says so.
    expect(day(fromPeriod.dueAt)).toBe('2026-09-30')
    // And the one almost every agreement actually says: thirty days from
    // the day it landed, which is nine days later and not late at all.
    expect(day(fromReceipt.dueAt)).toBe('2026-10-09')
  })

  it('an invoice anchored on the period end is due exactly where it always was, so nothing already raised moves', () => {
    // The platform default, and the column default, are both the end of
    // the work period — which is what the arithmetic did before anybody
    // could choose.
    expect(PLATFORM_DEFAULTS.paymentTermsFrom).toBe('PERIOD_END')
    const nobodySaid = resolveBillingTerms({
      company: { name: 'Brightmoor' },
      agreement: null,
      contract: null,
    })
    expect(nobodySaid.paymentTermsFrom.value).toBe('PERIOD_END')
    expect(day(dueOn({
      anchor: nobodySaid.paymentTermsFrom.value, days: 30, periodEnd: PERIOD_END, issuedAt: ISSUED,
    }).dueAt)).toBe(day(new Date(PERIOD_END.getTime() + 30 * 86_400_000)))
  })

  it("an agreement's anchor reaches a contract that never named one, and a contract that did wins", () => {
    const fromAgreement = resolveBillingTerms({
      company: { name: 'Brightmoor' },
      agreement: { paymentTermsFrom: 'RECEIPT_DATE', counterpartyName: 'Nike' },
      contract: { paymentTermsDays: 45 },
    })
    expect(fromAgreement.paymentTermsFrom.value).toBe('RECEIPT_DATE')
    expect(fromAgreement.paymentTermsFrom.source).toBe('AGREEMENT')
    expect(fromAgreement.paymentTermsFrom.because).toContain('agreement with Nike')

    const onThisPlacement = resolveBillingTerms({
      company: { name: 'Brightmoor' },
      agreement: { paymentTermsFrom: 'RECEIPT_DATE', counterpartyName: 'Nike' },
      contract: { paymentTermsFrom: 'INVOICE_DATE' },
    })
    expect(onThisPlacement.paymentTermsFrom.value).toBe('INVOICE_DATE')
    expect(onThisPlacement.paymentTermsFrom.source).toBe('CONTRACT')
  })

  it('a due date anchored on receipt says it is waiting on the client rather than guessing a date', () => {
    const raised = dueOn({
      anchor: 'RECEIPT_DATE', days: 30, periodEnd: PERIOD_END, issuedAt: ISSUED, receivedAt: null,
    })

    expect(raised.clockStarted).toBe(false)
    expect(raised.anchoredOn).toBeNull()
    expect(raised.waitingFor).toBe('the client to confirm they received it')
    expect(raised.says).toContain('Not payable yet')
    expect(raised.says).toContain('nobody has confirmed receipt')
    // The floor, not a promise: the soonest it could start is today.
    expect(raised.says).toContain('The earliest this could fall due is 2026-10-06')
    expect(day(raised.dueAt)).toBe('2026-10-06')
  })

  it('approval-anchored terms wait for the approval, and nothing here records one yet', () => {
    const raised = dueOn({
      anchor: 'APPROVAL_DATE', days: 30, periodEnd: PERIOD_END, issuedAt: ISSUED, approvedAt: null,
    })
    expect(raised.clockStarted).toBe(false)
    expect(raised.waitingFor).toBe('the client to approve it')

    // And once it is approved, the clock runs from that day.
    const approved = dueOn({
      anchor: 'APPROVAL_DATE', days: 30, periodEnd: PERIOD_END, issuedAt: ISSUED,
      approvedAt: new Date('2026-09-20T00:00:00.000Z'),
    })
    expect(approved.clockStarted).toBe(true)
    expect(day(approved.dueAt)).toBe('2026-10-20')
  })

  it('net zero is a real term: due on the day, not thirty days later', () => {
    const now = dueOn({
      anchor: 'RECEIPT_DATE', days: 0, periodEnd: PERIOD_END, issuedAt: ISSUED, receivedAt: RECEIVED,
    })
    expect(day(now.dueAt)).toBe('2026-09-09')
    expect(now.says).toContain('Due on 2026-09-09')
  })

  it('an invoice whose clock has not started is never overdue, whatever the calendar says', () => {
    const long = new Date('2026-12-25T00:00:00.000Z')

    const waiting = ageInvoice(
      invoice({ clockStarted: false, waitingFor: 'the client to confirm they received it' }),
      long
    )
    expect(waiting.daysOverdue).toBe(0)
    expect(waiting.bucket).toBe('CURRENT')
    expect(waiting.says).toContain('not payable yet')
    expect(waiting.says).toContain('must not be chased')

    // The same invoice, once receipt is confirmed and the clock runs, is
    // eighty-six days late and belongs in the last bucket.
    const running = ageInvoice(invoice({ clockStarted: true }), long)
    expect(running.daysOverdue).toBe(86)
    expect(running.bucket).toBe('D61_90')
  })

  it('an invoice that says nothing about its clock is aged the way it always was', () => {
    // Absent means running. Every invoice in the book today has no
    // opinion on this and must not change bucket because the field now
    // exists.
    const silent = ageInvoice(invoice({}), new Date('2026-10-15T00:00:00.000Z'))
    expect(silent.daysOverdue).toBe(15)
    expect(silent.bucket).toBe('D1_30')
  })

  it('a settled invoice reads as settled even while its clock is stopped', () => {
    const paid = ageInvoice(
      invoice({ clockStarted: false, paidMinor: 500_000, waitingFor: 'the client to approve it' }),
      new Date('2026-12-25T00:00:00.000Z')
    )
    expect(paid.settlement).toBe('SETTLED')
    expect(paid.says).toBe('Settled.')
  })

  it('every anchor has words a person would use, and nothing else is an anchor', () => {
    expect(anchorWords('RECEIPT_DATE')).toBe('the day the client received it')
    expect(anchorWords('PERIOD_END')).toBe('the end of the work period')
    expect(isAnchor('RECEIPT_DATE')).toBe(true)
    expect(isAnchor('WHENEVER')).toBe(false)
    expect(isAnchor(null)).toBe(false)
  })

  it('recording receipt starts the clock, and refuses a date before the invoice existed or after today', () => {
    const route = read('src/app/api/invoices/[id]/received/route.ts')
    expect(route).toContain('BEFORE_ISSUE')
    expect(route).toContain('because that day has not happened')
    // The due date moves only where the terms actually count from
    // receipt — recording that a client got a period-end invoice must
    // not rewrite a promise nobody renegotiated.
    expect(route).toContain("terms.paymentTermsFrom.value === 'RECEIPT_DATE' ? { dueAt: due.dueAt } : {}")
    expect(route).toContain('INVOICE_RECEIPT_RECORDED')
  })

  it('the invoice route counts from the contract and no longer adds thirty days to the period end', () => {
    const route = read('src/app/api/invoices/generate/route.ts')
    expect(route).toContain('dueOn({')
    expect(route).toContain('anchor: terms_.paymentTermsFrom.value')
    expect(route).not.toContain('new Date(period.end.getTime() + paymentTerms * 86400000)')
    // And it says what it counted from, rather than leaving an AR clerk
    // to work out why a date moved.
    expect(route).toContain('because: terms_.paymentTermsFrom.because')
  })

  it('the receivable book asks the contract what the clock counts from, and never re-dates an old invoice', () => {
    const book = read('src/app/api/ar/book.ts')
    expect(book).toContain('function clockOf')
    expect(book).toContain('receivedAt: true')
    expect(book).toContain('the client to confirm they received it')
    // The anchor is read; the due date is not recomputed.
    expect(book).not.toContain('dueOn(')
  })
})
