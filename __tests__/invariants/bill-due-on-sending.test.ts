/**
 * When a bill is due, read on the day it is sent (browser walk,
 * 2026-10-22). The supplier's twin offered Teleworld a bill "Due Sep 14,
 * 2026" and, once sent, it read "38 days late" on its first day. Terms are
 * the agreement's (founder, 2026-10-18), so the rule is two sentences:
 * the days run from the day the bill is sent unless the agreement says
 * otherwise, and where the agreement's own word makes the bill late
 * before it goes, the card says so before anybody says yes.
 */
import { describe, it, expect } from 'vitest'
import { sendingAnchor, pastDueOnSending, dueOn, resolveBillingTerms } from '@/lib/billing-cascade'
import { billDue } from '@/lib/money/bill-generate'
import { sendQuestion } from '@/lib/money/supplier-bills'

const day = (d: Date) => d.toISOString().slice(0, 10)
const AUG_15 = new Date('2026-08-15T00:00:00.000Z')
const OCT_22 = new Date('2026-10-22T00:00:00.000Z')

function teleworld(paymentTermsFrom: string | null, issuedAt = OCT_22) {
  return billDue({
    line: null,
    engagementAgreement: { paymentTerms: 30, paymentTermsFrom, client: { name: 'Northbend Athletic' } },
    companyName: 'Teleworld',
    customerName: 'Northbend Athletic',
    periodEnd: AUG_15,
    issuedAt,
  })
}

describe('a bill is dated by its agreement on the day it is sent', () => {
  it('where nobody said what the net days run from, they run from the day the bill is sent', () => {
    const { due, pastDue, terms_ } = teleworld(null)
    expect(terms_.paymentTermsFrom.value).toBe('INVOICE_DATE')
    expect(terms_.paymentTermsFrom.because).toMatch(/run from the day the bill is sent/)
    expect(day(due.dueAt)).toBe('2026-11-21')
    expect(pastDue).toBeNull()
  })

  it('where the agreement says the days run from the end of the work period, its date stands even when it has passed', () => {
    const { due, terms_ } = teleworld('PERIOD_END')
    expect(terms_.paymentTermsFrom.value).toBe('PERIOD_END')
    expect(terms_.paymentTermsFrom.source).toBe('AGREEMENT')
    expect(day(due.dueAt)).toBe('2026-09-14')
  })

  it('a bill the agreement makes past due on the day it is sent says how many days, in the due sentence the card shows', () => {
    const { due, pastDue } = teleworld('PERIOD_END')
    expect(pastDue).toEqual({ daysPast: 38, says: expect.stringMatching(/38 days past due the day it arrives/) })
    expect(due.says).toMatch(/^Due Sep 14, 2026 — net 30 from the end of the work period, Aug 15, 2026\. That date has passed: sent Oct 22, 2026, it is 38 days past due the day it arrives\.$/)
  })

  it('a bill that falls due on the very day it is sent says so, and one with days left says nothing extra', () => {
    const onTheDay = teleworld('PERIOD_END', new Date('2026-09-14T00:00:00.000Z'))
    expect(onTheDay.pastDue?.daysPast).toBe(0)
    expect(onTheDay.due.says).toMatch(/falls due the day it arrives/)
    const early = teleworld('PERIOD_END', new Date('2026-08-20T00:00:00.000Z'))
    expect(early.pastDue).toBeNull()
    expect(early.due.says).not.toMatch(/past due|falls due the day/)
  })

  it('a bill whose days run from receipt or approval is never past due on sending, because that clock has not started', () => {
    for (const anchor of ['RECEIPT_DATE', 'APPROVAL_DATE'] as const) {
      const v = dueOn({ anchor, days: 0, periodEnd: AUG_15, issuedAt: OCT_22 })
      expect(pastDueOnSending(v, OCT_22)).toBeNull()
    }
  })

  it('an anchor any document gave is kept as given; only silence becomes the day the bill is sent', () => {
    const nobody = resolveBillingTerms({ company: { name: 'Teleworld' }, agreement: null, contract: null })
    expect(nobody.paymentTermsFrom.value).toBe('PERIOD_END')
    expect(sendingAnchor(nobody.paymentTermsFrom).value).toBe('INVOICE_DATE')
    const said = resolveBillingTerms({
      company: { name: 'Teleworld' },
      agreement: { paymentTermsFrom: 'PERIOD_END', counterpartyName: 'Northbend Athletic' },
      contract: null,
    })
    expect(sendingAnchor(said.paymentTermsFrom)).toBe(said.paymentTermsFrom)
  })

  it("the twin's question says when the bill falls due before it asks to send it", () => {
    const { due } = teleworld('PERIOD_END')
    const q = sendQuestion({
      invoiceNumber: 'INV-0042', customerName: 'Northbend Athletic', periodLabel: 'August 1–15, 2026',
      totalSays: '$7,840.00', hours: 80, dueSays: due.says,
    })
    expect(q.indexOf('38 days past due')).toBeGreaterThan(-1)
    expect(q.indexOf('38 days past due')).toBeLessThan(q.indexOf('Send it?'))
    expect(q.endsWith('Send it?')).toBe(true)
  })
})
