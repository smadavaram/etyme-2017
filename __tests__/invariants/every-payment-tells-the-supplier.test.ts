import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every payment goes through one function, and the supplier is told every
 * time (the founder, 2026-11-12).
 *
 * A typed-in invoice receipt is paid by `recordKeyedPayment` from every
 * door: the confirmation, a run's "Mark it paid" and the receipt's own
 * Pay. A supplier's bill that arrived on Etyme is paid by
 * `recordInvoicePayment` from every door, the chat's included. No route
 * writes a Payment row itself, and the supplier hears of each payment
 * once, after it committed.
 */

const notificationFindMany = vi.fn()
const notify = vi.fn()
const payerSeats = vi.fn()
const emit = vi.fn()

vi.mock('@/lib/db', () => ({ prisma: { notification: { findMany: (...a: unknown[]) => notificationFindMany(...a) } } }))
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }))
vi.mock('@/lib/money/bank-check-read', () => ({ payerSeats: (...a: unknown[]) => payerSeats(...a) }))
vi.mock('@/lib/events', () => ({ emit: (...a: unknown[]) => emit(...a) }))

import { paidNotice, tellSupplierPaid, suppliersBillHref, type PaidFacts } from '@/lib/money/paid-notice'
import { recordKeyedPayment, type KeyedPaymentInput } from '@/lib/money/keyed-payment'
import { emitInvoicePaid, type InvoicePaymentResult } from '@/lib/money/invoice-payment'
import { markPaidBody } from '@/lib/money/run-confirm'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const BILLS = read('src/app/api/ap/bills/route.ts')
const RUNS = read('src/app/api/ap/payment-runs/route.ts')
const INVOICE = read('src/app/api/invoices/[id]/payments/route.ts')
const RUN_FORM = read('src/app/dashboard/ap/payment-run-file.tsx')
const AP_PAGE = read('src/app/dashboard/ap/page.tsx')

const FACTS: PaidFacts = {
  paymentId: 'pay-1', payerName: 'Northbend Athletic', vendorCompanyId: 'pinnacle', number: 'PR-2026-0441',
  amountCents: 392_000, currency: 'USD', paidAt: new Date('2026-11-13T00:00:00Z'), payerReference: 'ACH-88123',
}

beforeEach(() => {
  notificationFindMany.mockReset().mockResolvedValue([])
  notify.mockReset().mockResolvedValue({ id: 'n' })
  payerSeats.mockReset().mockResolvedValue([
    { personId: 'imelda', permissions: ['invoices.issue'] },
    { personId: 'owner', permissions: ['settings.manage'] },
  ])
  emit.mockReset().mockResolvedValue({ id: 'e' })
})

describe('every payment goes through one function', () => {
  it('no route that pays writes a Payment row itself', () => {
    for (const [name, src] of [['ap/bills', BILLS], ['payment-runs', RUNS], ['invoices/[id]/payments', INVOICE]] as const) {
      expect(src, name).not.toMatch(/payment\.create\(/)
    }
  })

  it('a typed-in receipt is paid by the one keyed write from its own Pay, from the confirmation and from Mark it paid', () => {
    expect(BILLS).toContain('recordKeyedPayment(tx, {')
    expect(RUNS).toContain('recordKeyedPayment(tx, {')
    // "Mark it paid" is the confirmation typed for the whole run.
    const pay = RUNS.slice(RUNS.indexOf("// action === 'pay'"), RUNS.indexOf('// ── The confirmation from the payer'))
    expect(pay).toContain('return confirm(caller, companyId, { id, reference, paidOn })')
  })

  it('a supplier’s bill that arrived on Etyme is paid by the one invoice write, and its notice is sent after the commit', () => {
    expect(INVOICE).toContain('recordInvoicePayment(tx, {')
    expect(INVOICE).toContain('await emitInvoicePaid(recorded)')
    expect(INVOICE.indexOf('await emitInvoicePaid(recorded)')).toBeGreaterThan(INVOICE.indexOf('prisma.$transaction('))
  })

  it('the receipt’s own Pay tells the supplier only after the payment has committed', () => {
    const tx = BILLS.indexOf('recordKeyedPayment(tx, {')
    const told = BILLS.indexOf('await tellSupplierPaid(out.notice)')
    expect(told).toBeGreaterThan(tx)
    expect(BILLS.slice(tx, told)).toContain('if (!out.ok)')
  })
})

describe('Mark it paid asks for the payer’s reference and the paid date', () => {
  it('a press without a reference or a paid date is refused in a sentence naming the field', () => {
    const pay = RUNS.slice(RUNS.indexOf("// action === 'pay'"))
    expect(pay).toContain("field: 'reference', message: 'Enter the reference your bank or payment system gave this payment, then mark it paid.'")
    expect(pay).toContain("field: 'paidOn', message: 'Enter the day the money left, then mark it paid.'")
    // Asked before any gate or write.
    expect(pay.indexOf("field: 'reference'")).toBeLessThan(pay.indexOf("needsVerifiedOwnerAt(companyId, 'PAY')"))
  })

  it('the run’s row draws both fields beside Mark it paid and always sends them, so an empty one is refused, not guessed', () => {
    expect(RUN_FORM).toContain('name="markReference"')
    expect(RUN_FORM).toContain('name="markPaidOn"')
    expect(RUN_FORM).toContain('markPaidBody({ runId, reference, paidOn })')
    expect(AP_PAGE).toContain('<MarkRunPaid')
    expect(markPaidBody({ runId: 'r', reference: '  ', paidOn: '' })).toEqual({ action: 'pay', id: 'r', reference: '', paidOn: '' })
    expect(markPaidBody({ runId: 'r', reference: ' ACH-1 ', paidOn: '2026-11-13' })).toEqual({ action: 'pay', id: 'r', reference: 'ACH-1', paidOn: '2026-11-13' })
  })
})

describe('what the supplier reads', () => {
  it('the notice carries the amount in the receipt’s own currency', () => {
    expect(paidNotice({ ...FACTS, amountCents: 412_550, currency: 'EUR' }).body).toContain('€4,125.50')
    const inr = paidNotice({ ...FACTS, amountCents: 8_500_000, currency: 'INR' }).body
    expect(inr).toMatch(/₹/)
    expect(inr).not.toContain('$')
  })

  it('where the payment lands on a bill the supplier raised on Etyme, the notice names that bill and opens it', () => {
    const own = paidNotice({ ...FACTS, suppliersBill: { id: 'inv-9', number: 'PR-2026-0441' } })
    expect(own.body).toBe(
      'Northbend Athletic paid your invoice PR-2026-0441: $3,920.00 on November 13, 2026, reference ACH-88123. ' +
      'It is recorded on that invoice under Receivables.'
    )
    expect(own.href).toBe(suppliersBillHref('inv-9'))
    const other = paidNotice({ ...FACTS, number: 'CON-77', suppliersBill: { id: 'inv-9', number: 'PR-2026-0441' } })
    expect(other.body).toContain('It is recorded on your invoice PR-2026-0441 under Receivables.')
    expect(paidNotice(FACTS).href).toBeNull()
  })

  it('a payment made with no reference says so plainly, never "reference null"', () => {
    const n = paidNotice({ ...FACTS, payerReference: null })
    expect(n.body).toContain('They gave no payment reference.')
    expect(n.body).not.toMatch(/null|undefined/)
  })

  it('the supplier is told once per payment: the same payment told again tells nobody', async () => {
    expect(await tellSupplierPaid(FACTS)).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({ personId: 'imelda', entityId: 'pay-1', channel: 'EMAIL' })

    notificationFindMany.mockResolvedValue([{ personId: 'imelda' }])
    expect(await tellSupplierPaid(FACTS)).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('the notice for a bill raised on Etyme opens that bill', async () => {
    await tellSupplierPaid({ ...FACTS, suppliersBill: { id: 'inv-9', number: 'PR-2026-0441' } })
    expect(notify.mock.calls[0][0].data).toMatchObject({ href: '/dashboard/invoices/inv-9', invoiceId: 'inv-9' })
  })
})

// ── The keyed write ───────────────────────────────────────────────────

function keyedTx(row: { totalCents: number; paidCents: number; status: string }, moves = 1) {
  const writes: string[] = []
  const tx = {
    vendorBill: {
      findUnique: async () => row,
      updateMany: async () => { if (moves === 1) writes.push('vendorBill.update'); return { count: moves } },
    },
    payment: { create: async () => { writes.push('payment.create'); return { id: 'pay-k' } } },
    automationLog: { create: async () => { writes.push('automationLog.create'); return {} } },
    invoice: { findUnique: async () => null },
  }
  return { tx: tx as never, writes }
}

const KEYED: KeyedPaymentInput = {
  billId: 'vb-1', payerCompanyId: 'brightmoor', payerName: 'Brightmoor Staffing', vendorCompanyId: 'consultis',
  vendorName: 'Consultis', number: 'CON-77', currency: 'EUR', amountCents: 416_000, expectPaidCents: 0,
  paidAt: new Date('2026-11-12T00:00:00Z'), payerReference: 'SEPA-1', etymeReference: null, runId: null,
  method: 'ACH', appliedById: 'desmond', appliedByName: 'Desmond Achebe',
}

describe('a typed-in receipt paid through the one write', () => {
  it('writes exactly one Payment row and hands back what the supplier is told, in the receipt’s currency', async () => {
    const { tx, writes } = keyedTx({ totalCents: 416_000, paidCents: 0, status: 'APPROVED' })
    const out = await recordKeyedPayment(tx, KEYED)
    expect(out.ok).toBe(true)
    expect(writes.filter((w) => w === 'payment.create')).toHaveLength(1)
    if (!out.ok) return
    expect(out.notice).toMatchObject({ paymentId: 'pay-k', amountCents: 416_000, currency: 'EUR', number: 'CON-77', payerReference: 'SEPA-1', suppliersBill: null })
    expect(paidNotice(out.notice).body).toContain('€4,160.00')
  })

  it('a second press on a receipt already paid writes no payment and hands back nothing to tell', async () => {
    const { tx, writes } = keyedTx({ totalCents: 416_000, paidCents: 0, status: 'APPROVED' }, 0)
    const out = await recordKeyedPayment(tx, KEYED)
    expect(out).toEqual({ ok: false, says: 'Consultis’s invoice CON-77 was paid or changed while this was read. Nothing was written again.' })
    expect(writes).toEqual([])
  })
})

// ── The invoice write, told after the commit ──────────────────────────

const RECORDED = {
  ok: true,
  event: { type: 'invoice.paid', companyId: 'northbend', subjectType: 'Invoice', subjectId: 'inv-9' },
  notice: { ...FACTS, suppliersBill: { id: 'inv-9', number: 'PR-2026-0441' } },
} as unknown as InvoicePaymentResult

describe('a supplier’s bill paid through the one invoice write', () => {
  it('the supplier is told once the payment has committed, and the same payment told again tells nobody', async () => {
    await emitInvoicePaid(RECORDED)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({ personId: 'imelda', entityId: 'pay-1' })
    // The chat's door calls the same function; once the notice is on the
    // record, nobody is told a second time.
    notificationFindMany.mockResolvedValue([{ personId: 'imelda' }])
    await emitInvoicePaid(RECORDED, { actorKind: 'TWIN', actorTwinKind: 'PROGRAM_MANAGER' } as never)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('a supplier recording money that arrived is never told of its own entry', async () => {
    await emitInvoicePaid({ ...(RECORDED as object), notice: null } as unknown as InvoicePaymentResult)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('a refused payment emits nothing and tells nobody', async () => {
    expect(await emitInvoicePaid({ ok: false, code: 'INVALID_STATE', says: 'Invoice is already fully paid' })).toBeNull()
    expect(emit).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
