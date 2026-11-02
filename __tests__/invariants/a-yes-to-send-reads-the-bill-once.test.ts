import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { billDue } from '@/lib/money/bill-generate'
import { dueAtOnSending } from '@/lib/money/bill-send'

/**
 * A yes to send a bill reads what money needs of the bill once.
 *
 * The architect's measurement, 2026-11-01, on a copy of the calibration
 * world: `POST /api/twin/approvals/:id` ran at 5.4 seconds at p95, and a
 * yes to send a bill made about 156 statements, ten of them the ledger's.
 * Money's share: the three-way check, twenty statements inside the
 * transaction to date the bill (the firms' names read through every
 * nested relation, for a sentence the sending never says), and the bill
 * read again after the commit for its own event and for who said yes.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const AGREEMENT = {
  id: 'msa-1', billFrequency: 'MONTHLY', billAnchor: 'CALENDAR', billStraddle: 'END',
  paymentTerms: 45, paymentTermsFrom: 'INVOICE_DATE', currency: 'USD',
}
const named = { ...AGREEMENT, vendor: { name: 'Tapin' }, client: { name: 'Brightmoor Staffing' } }
const PERIOD_END = new Date('2026-10-31T00:00:00Z')
const SENT_ON = new Date('2026-11-01T00:00:00Z')

function line(msa: Record<string, unknown> | null, workOrder: Record<string, unknown> | null = null) {
  return { paymentTerms: 30, paymentTermsFrom: 'PERIOD_END', billCurrency: 'USD', clientCompanyId: 'bm', termsDifferReason: null, msa, workOrder }
}

describe('the sending dates a bill by the agreement without reading any firm’s name', () => {
  it('a bill’s due date on sending is the same whether or not the firms’ names were read', () => {
    const withNames = billDue({
      line: line(named) as never, engagementAgreement: named as never,
      companyName: 'Tapin', customerName: 'Brightmoor Staffing', periodEnd: PERIOD_END, issuedAt: SENT_ON,
    }).due.dueAt
    const without = dueAtOnSending({
      periodEnd: PERIOD_END,
      engagement: { msa: { ...AGREEMENT, vendorId: 'tapin', clientId: 'bm' } },
      invoiceLines: [{ sellContract: line(AGREEMENT) as never }],
    } as never, SENT_ON)
    expect(without.toISOString()).toBe(withNames.toISOString())
    // 45 days from the day it is sent, as the agreement says.
    expect(without.toISOString().slice(0, 10)).toBe('2026-12-16')
  })

  it('a bill on an order with its own agreement is dated by that agreement the same way, names or none', () => {
    const order = { id: 'po-1', number: 'PO-1', billFrequency: 'MONTHLY', billAnchor: 'CALENDAR', billStraddle: 'END', paymentTerms: null, paymentTermsFrom: null, currency: 'USD', startDate: new Date('2026-10-01T00:00:00Z'), endDate: null, termsDifferReason: null }
    const withNames = billDue({
      line: line(null, { ...order, msa: named }) as never, engagementAgreement: null,
      companyName: 'Tapin', customerName: 'Brightmoor Staffing', periodEnd: PERIOD_END, issuedAt: SENT_ON,
    }).due.dueAt
    const without = dueAtOnSending({
      periodEnd: PERIOD_END,
      engagement: { msa: null },
      invoiceLines: [{ sellContract: line(null, { ...order, msa: AGREEMENT }) as never }],
    } as never, SENT_ON)
    expect(without.toISOString()).toBe(withNames.toISOString())
  })

  it('the sending reads the bill’s terms through the selects that name no firm', () => {
    const src = read('src/lib/money/bill-send.ts')
    const plan = src.slice(src.indexOf('export async function planSend'), src.indexOf('export async function markSent'))
    expect(plan).toMatch(/\.\.\.SEND_DUE_SELECT,/)
    expect(plan).toMatch(/dueAtOnSending\(inv, now\)/)
    expect(plan).not.toMatch(/\.\.\.DUE_SELECT/)
  })
})

describe('a send holds its transaction only for the writes (the founder-scale simulation, 2026-11-01)', () => {
  const src = read('src/lib/money/bill-send.ts')
  const markSent = src.slice(src.indexOf('export async function markSent'), src.indexOf('export async function tellPayerAfterSending'))

  it('everything the sending reads is read before its transaction, and the write reads nothing where it is handed the plan', () => {
    expect(markSent).toMatch(/const plan = a\.plan \?\? \(await planSend\(a\.invoiceId, a\.now \?\? new Date\(\), tx\)\)/)
    expect(markSent).not.toMatch(/tx\.invoice\.find|tx\.buyContract\.find|draftDecisionIds\(/)
  })

  it('the payer’s notice, which reads the whole bill, is no longer written inside the sending’s transaction', () => {
    expect(markSent).not.toMatch(/writePayerNoticesIn/)
  })

  it('a bill is still moved only from the status it was read in, so a second press finds it moved', () => {
    expect(markSent).toMatch(/where: \{ id: inv\.id, status: inv\.status \}/)
    expect(markSent).toMatch(/if \(moved\.count !== 1\) throw new Error\('ALREADY_MOVED'\)/)
  })

  for (const route of ['src/app/api/invoices/[id]/submit/route.ts', 'src/app/api/invoices/submit/route.ts']) {
    it(`${route.includes('[id]') ? 'Send' : 'the bulk Send'} plans before its transaction and tells the payer after the commit, before the letter goes`, () => {
      const r = read(route)
      const plan = r.indexOf('await planSend(')
      const tx = r.indexOf('prisma.$transaction(')
      const told = r.indexOf('await tellPayerAfterSending(')
      const letter = r.indexOf('await sendBillToCustomer(')
      expect(plan).toBeGreaterThan(0)
      expect(plan).toBeLessThan(tx)
      expect(told).toBeGreaterThan(tx)
      expect(told).toBeLessThan(letter)
    })
  }

  it('a yes in Ask Etyme plans in its check, writes short in the ledger’s transaction, and tells the payer before the letter', () => {
    const s = read('src/lib/money/supplier-bills.ts')
    expect(s).toMatch(/if \(c\.approverPersonId && c\.carry\) \{\s*try \{\s*c\.carry\.plan = await planSend\(c\.entity\.id\)/)
    expect(s).toMatch(/plan: c\.carry\?\.plan as SendPlan \| undefined/)
    const after = s.slice(s.indexOf('async after(c)'))
    expect(after.indexOf('await tellPayerAfterSending(')).toBeGreaterThan(0)
    expect(after.indexOf('await tellPayerAfterSending(')).toBeLessThan(after.indexOf('await sendBillToCustomer('))
  })

  it('telling the payer after the commit never throws: where it fails, staff are told and the delivery writes the notice itself', () => {
    const tell = src.slice(src.indexOf('export async function tellPayerAfterSending'))
    expect(tell).toMatch(/catch \(err\) \{\s*void reportError\('bill-payer-notice'/)
    // The delivery's own fallback, in conversation's file, is what "itself" means.
    expect(read('src/lib/notify/bill-delivery.ts')).toMatch(/const written = a\.resend \? \[\] : await writtenInTheSending\(bill\.id\)\s*if \(written\.length\) \{[\s\S]*?\} else \{\s*const seats = await payerSeats\(payer\.id\)/)
  })
})

describe('what one step read is handed to the next, never read again', () => {
  it('a yes in Ask Etyme hands what the sending read to the step after the commit, and the bill’s event reads nothing again', () => {
    const src = read('src/lib/money/supplier-bills.ts')
    expect(src).toMatch(/if \(c\.carry\) c\.carry\.sent = sent/)
    expect(src).toMatch(/announceRaised\(c\.entity\.id, c\.companyId, \{ personId: null, twin: true \}, c\.carry\?\.sent as Sent \| undefined\)/)
  })

  it('the person who said yes is the one the ledger hands over, and the answered question is read only where it hands nobody', () => {
    expect(read('src/lib/money/supplier-bills.ts')).toMatch(/const byPersonId = c\.approverPersonId \?\? \(await whoSaidYes\(c\)/)
  })

  it('Send and the bulk Send hand the sending’s answer to the bill’s event the same way', () => {
    expect(read('src/app/api/invoices/[id]/submit/route.ts')).toMatch(/announceRaised\(id, companyId, \{ personId: caller\.person\.id \}, sent\)/)
    expect(read('src/app/api/invoices/submit/route.ts')).toMatch(/announceRaised\(invoiceId, companyId, \{ personId: caller\.person\.id \}, sent\)/)
  })
})
