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
const ownerGate = vi.fn()
const bankGate = vi.fn()
const reportError = vi.fn()
vi.mock('@/lib/owner-proof', () => ({ needsVerifiedOwnerAt: (...a: unknown[]) => ownerGate(...a) }))
vi.mock('@/lib/setup-gates', () => ({ mayPayFirm: (...a: unknown[]) => bankGate(...a) }))
vi.mock('@/lib/alerts', () => ({ reportError: (...a: unknown[]) => reportError(...a) }))

import { paidNotice, tellSupplierPaid, tellPaidOrReport, toldSays, suppliersBillHref, type PaidFacts } from '@/lib/money/paid-notice'
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
  ownerGate.mockReset().mockResolvedValue({ ok: true })
  bankGate.mockReset().mockResolvedValue({ ok: true })
  reportError.mockReset().mockResolvedValue(undefined)
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
    const told = BILLS.indexOf('await tellPaidOrReport(out.notice,')
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
  const wheres: Record<string, unknown>[] = []
  const tx = {
    vendorBill: {
      findUnique: async () => row,
      updateMany: async (a: { where: Record<string, unknown> }) => { wheres.push(a.where); if (moves === 1) writes.push('vendorBill.update'); return { count: moves } },
    },
    payment: { create: async () => { writes.push('payment.create'); return { id: 'pay-k' } } },
    automationLog: { create: async () => { writes.push('automationLog.create'); return {} } },
    invoice: { findUnique: async () => null },
  }
  return { tx: tx as never, writes, wheres }
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

describe('the typed-in receipt’s write reads its gates again and touches only the payer’s own receipt', () => {
  it('the paid figure is written only on the payer’s own receipt from that supplier, in the currency it was read in', async () => {
    const { tx, wheres } = keyedTx({ totalCents: 416_000, paidCents: 0, status: 'APPROVED' })
    await recordKeyedPayment(tx, KEYED)
    expect(wheres[0]).toMatchObject({ id: 'vb-1', companyId: 'brightmoor', vendorCompanyId: 'consultis', currency: 'EUR', paidCents: 0 })
  })

  it('a bank check taken back between the press and the write stops the money, in the gate’s own sentence, and writes nothing', async () => {
    bankGate.mockResolvedValue({ ok: false, says: 'Consultis’s bank details are not checked. Ask Rosalind Tay to check them, then pay.' })
    const { tx, writes } = keyedTx({ totalCents: 416_000, paidCents: 0, status: 'APPROVED' })
    const out = await recordKeyedPayment(tx, KEYED)
    expect(out).toEqual({ ok: false, says: 'Consultis’s bank details are not checked. Ask Rosalind Tay to check them, then pay.' })
    expect(writes).toEqual([])
  })

  it('a paying company that has no verified Owner at the moment of the write pays nothing', async () => {
    ownerGate.mockResolvedValue({ ok: false, says: 'Brightmoor Staffing pays no firm until it has a verified Owner.' })
    const { tx, writes } = keyedTx({ totalCents: 416_000, paidCents: 0, status: 'APPROVED' })
    const out = await recordKeyedPayment(tx, KEYED)
    expect(out.ok).toBe(false)
    expect(writes).toEqual([])
  })
})

describe('the day money left on a receipt’s own Pay', () => {
  it('a paid date after tomorrow is refused in a sentence naming the field, as the confirmation refuses it', () => {
    const pay = BILLS.slice(BILLS.indexOf('export async function PATCH'))
    expect(pay).toContain("message: 'The paid date has not happened yet. Enter the day the money left.'")
    expect(pay.indexOf('The paid date has not happened yet')).toBeLessThan(pay.indexOf('recordKeyedPayment(tx, {'))
  })
})

describe('a notice that fails is never said as nobody to tell', () => {
  it('a notice that throws is reported to staff and answers minus one, and the payment stands', async () => {
    notify.mockRejectedValue(new Error('mail down'))
    expect(await tellPaidOrReport(FACTS, 'test')).toBe(-1)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('the sentence says we could not tell a firm whose notice failed, and nobody on Etyme only where nobody is there', () => {
    expect(toldSays([{ vendorName: 'Consultis', told: -1 }])).toBe('We could not tell Consultis it was paid, so tell them yourself.')
    expect(toldSays([{ vendorName: 'Consultis', told: 0 }])).toBe('Consultis has nobody on Etyme to tell, so tell them yourself.')
    expect(toldSays([{ vendorName: 'Consultis', told: 2 }])).toBe('Consultis is told, in the app and by email where email can leave.')
    expect(toldSays([{ vendorName: 'A', told: 1 }, { vendorName: 'B', told: -1 }, { vendorName: 'C', told: 0 }]))
      .toBe('We could not tell B it was paid, so tell them yourself. C has nobody on Etyme to tell, so tell them yourself.')
  })

  it('the receipt’s own Pay and a run’s confirmation both tell through the reporting door, never a silent catch', () => {
    expect(BILLS).not.toMatch(/tellSupplierPaid\([^)]*\)\.catch\(\(\) => 0\)/)
    expect(RUNS).not.toMatch(/tellSupplierPaid\([^)]*\)\.catch\(\(\) => 0\)/)
    expect(BILLS).toContain('toldSays(')
    expect(RUNS).toContain('toldSays(')
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

// ── Before anybody presses Pay, at a company waiting for a verified Owner ──

import { receiptDoors } from '@/lib/money/receipt-screen'
import { receiptPayPanel } from '@/lib/money/receipt-pay-panel'

describe('a company waiting for a verified Owner sees the sentence and no Pay control', () => {
  const OWNER_SAYS = 'Paying a firm waits until Kestrel Staffing has a verified Owner. Prove ownership under Setup → Prove ownership.'

  it('a typed-in receipt’s Pay is not offered, and its door carries the gate’s sentence and the link to Prove ownership', () => {
    const doors = receiptDoors(
      {
        number: 'CON-77', vendorName: 'Consultis', status: 'APPROVED', currency: 'USD', totalCents: 416_000, paidCents: 0,
        paymentCount: 0, inRun: null, checks: [], hard: null, waivers: [],
      } as never,
      { mayPay: true, mayWaive: true, mayRecord: true, paySays: null, waiveSays: null, recordSays: null } as never,
      { ok: false, says: OWNER_SAYS, href: '/dashboard/settings/setup/ownership' },
    )
    expect(doors.pay).toEqual({ offered: false, says: OWNER_SAYS, href: '/dashboard/settings/setup/ownership' })
  })

  it('the receipts list asks the owner gate before the bank or the check, the order the payment route asks', () => {
    const READ = read('src/lib/money/receipts-read.ts')
    expect(READ).toContain('const ownerWaits = await payWaitsAt(companyId)')
    const at = READ.indexOf('? { ok: false, says: ownerWaits.says, href: ownerWaits.href }')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(READ.indexOf('keyedPayGateNow(b, vendorName, check, viewerId)'))
    expect(read('src/app/dashboard/ap/receipts.tsx')).toContain("<OwnerGateLine line={{ says: r.doors.pay.says, href: r.doors.pay.href, linkSays: 'Prove ownership' }} />")
  })

  it('a supplier’s bill on its own page reads the gate’s sentence in place of Pay, never beside it', () => {
    const ROUTE = read('src/app/api/invoices/[id]/route.ts')
    const waits = ROUTE.indexOf('const waits = await payWaitsAt(parties.client.id)')
    expect(waits).toBeGreaterThan(0)
    expect(waits).toBeLessThan(ROUTE.indexOf('const bank = await mayPayFirm(parties.client.id, parties.vendor.id)'))
    const MONEY = read('src/app/dashboard/invoices/invoice-money.tsx')
    expect(MONEY).toContain("payPanel.kind === 'OWNER_WAITS'")
    expect(MONEY).toContain('<OwnerGateLine className="mt-2" line={{ says: payPanel.says, href: payPanel.href, linkSays: payPanel.linkSays }} />')
    // The Pay form is drawn only where the panel says PAY.
    expect(MONEY).toContain("const gateSaysPay = payPanel.kind === 'PAY'")
    // A payable receipt is PAY before the owner gate is read; the gate is the route's.
    expect(receiptPayPanel({ direction: 'PAYABLE', invoice: { number: 'X', status: 'SUBMITTED' }, match: { matched: true, summary: '', checks: [], lines: [] }, supplierName: 'S' }).kind).toBe('PAY')
  })

  it('Payables says the line at the top, and the payment run draws no Mark it paid or confirmation while it waits', () => {
    expect(AP_PAGE).toContain('<OwnerGateLine line={data.payWaits} />')
    expect(AP_PAGE).toContain("{r.status === 'APPROVED' && !data?.payWaits && (\n                    <ConfirmRunPaid")
    expect(AP_PAGE).toContain("{r.status === 'APPROVED' && !data?.payWaits && (\n                    <MarkRunPaid")
    expect(read('src/app/api/ap/route.ts').match(/payWaits,/g)?.length).toBe(3)
    expect(RUNS).toContain('payWaitsAt(companyId)')
  })
})
