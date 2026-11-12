import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Walk 7, 2026-11-08: Brightmoor's AP & Payroll seat paid Consultis $4,160
 * on a typed-in invoice receipt with Consultis' bank details unchecked, and
 * saw no hold and no "Ask Rosalind Tay". The typed-in receipt's payment and
 * its screen now read one gate, bank included (`keyedPayGateNow`).
 */

const mayPayFirm = vi.fn()
const bankHoldAt = vi.fn()

vi.mock('@/lib/setup-gates', () => ({ mayPayFirm: (...a: unknown[]) => mayPayFirm(...a) }))
vi.mock('@/lib/money/bank-check-read', () => ({ bankHoldAt: (...a: unknown[]) => bankHoldAt(...a) }))
vi.mock('@/lib/db', () => ({
  prisma: { company: { findUnique: vi.fn(async () => ({ name: 'Brightmoor Staffing' })) } },
}))

import { keyedPayGateNow } from '@/lib/money/keyed-receipt'
import { receiptDoors, type ReaderRole } from '@/lib/money/receipt-screen'

const BILL = {
  number: 'INV-IHMDQC', status: 'RECEIVED', totalCents: 416_000, paidCents: 0, currency: 'USD',
  companyId: 'brightmoor', vendorCompanyId: 'consultis',
}
const PASSES = { match: { checks: [] } as any, hard: null }
const ASK_ROSALIND = 'Bank details not checked. Ask Rosalind Tay to check them, then pay.'

beforeEach(() => {
  mayPayFirm.mockReset()
  bankHoldAt.mockReset()
})

describe('a typed-in invoice receipt is never paid to a firm whose bank details nobody checked', () => {
  it('a typed-in receipt that passes the check is still held where the supplier’s bank is not checked, and the hold names who checks', async () => {
    mayPayFirm.mockResolvedValue({ ok: false, says: 'Consultis’ bank details are not checked.', step: 'BANK' })
    bankHoldAt.mockResolvedValue({ headline: 'Held: bank details not checked', says: ASK_ROSALIND, mayCheck: false, facts: null })
    const gate = await keyedPayGateNow(BILL, 'Consultis', PASSES, 'ap-payroll-seat')
    expect(gate).toMatchObject({ ok: false, code: 'BANK_NOT_CHECKED', says: ASK_ROSALIND })
    expect(mayPayFirm).toHaveBeenCalledWith('brightmoor', 'consultis')
    expect(bankHoldAt).toHaveBeenCalledWith({
      payer: { id: 'brightmoor', name: 'Brightmoor Staffing' },
      payee: { id: 'consultis', name: 'Consultis' },
      viewerId: 'ap-payroll-seat',
    })
  })

  it('the person who checks is offered the check on the held receipt, with the bank, the name and the last four digits', async () => {
    const facts = { bankName: 'Bellrock Bank', accountName: 'Consultis LLC', accountLast4: '0017' }
    mayPayFirm.mockResolvedValue({ ok: false, says: 'held', step: 'BANK' })
    bankHoldAt.mockResolvedValue({ headline: 'Held: bank details not checked', says: 'Bank details not checked. Check them, then pay.', mayCheck: true, facts })
    const gate = await keyedPayGateNow(BILL, 'Consultis', PASSES, 'rosalind')
    expect(gate).toMatchObject({ ok: false, code: 'BANK_NOT_CHECKED', bank: { mayCheck: true, facts } })
  })

  it('a typed-in receipt whose supplier’s bank is checked is paid on the check alone', async () => {
    mayPayFirm.mockResolvedValue({ ok: true })
    expect(await keyedPayGateNow(BILL, 'Consultis', PASSES, 'ap-payroll-seat')).toEqual({ ok: true })
    expect(bankHoldAt).not.toHaveBeenCalled()
  })

  it('a receipt the check refuses says the check’s refusal, and the bank is not read', async () => {
    const gate = await keyedPayGateNow({ ...BILL, status: 'PAID', paidCents: 416_000 }, 'Consultis', PASSES, null)
    expect(gate).toMatchObject({ ok: false, code: 'INVALID_STATE' })
    expect(mayPayFirm).not.toHaveBeenCalled()
  })

  it('the screen draws no Pay on a bank-held receipt, says who checks, and offers the check to the person who checks', () => {
    const role: ReaderRole = { mayRecord: true, recordSays: null, mayWaive: true, waiveSays: null, mayPay: true, paySays: null } as ReaderRole
    const facts = { bankName: 'Bellrock Bank', accountName: 'Consultis LLC', accountLast4: '0017' }
    const doors = receiptDoors(
      { number: 'INV-IHMDQC', vendorName: 'Consultis', status: 'RECEIVED', currency: 'USD', totalCents: 416_000, paidCents: 0, paymentCount: 0, inRun: null, checks: [], hard: null, waivers: [] } as any,
      role,
      { ok: false, says: ASK_ROSALIND, bank: { mayCheck: false, facts } },
    )
    expect(doors.pay).toEqual({ offered: false, says: ASK_ROSALIND, bank: { mayCheck: false, facts } })
  })
})

/**
 * The proof rule (founder, 2026-11-11): a company signed up under it pays
 * no firm until it has a verified Owner, refused before any write in the
 * gate's own sentence, which names the step. A company formed before the
 * rule pays as before. `recordInvoicePayment` is the one door the payment
 * route and the twin's performer both call.
 */
import { recordInvoicePayment } from '@/lib/money/invoice-payment'
import { readFileSync } from 'node:fs'

const KESTREL_HELD = { name: 'Kestrel Works', ownerProofRequiredAt: new Date('2026-11-12'), ownerVerifiedAt: null }
const BRIGHTMOOR_BEFORE = { name: 'Brightmoor Staffing', ownerProofRequiredAt: null, ownerVerifiedAt: null }
const OWNER_SAYS = 'Paying a firm waits until Kestrel Works has a verified Owner. Prove ownership under Setup → Prove ownership.'

function fakeTx(payer: Record<string, unknown>) {
  const writes: string[] = []
  const logged: { action: string; reason: string; payload: Record<string, unknown> }[] = []
  const write = (name: string) => async () => { writes.push(name); return {} }
  return {
    writes,
    logged,
    tx: {
      invoice: {
        findUnique: async () => ({
          id: 'inv-1', number: 'CNS-0042', total: '4160.00', paid: '0', status: 'SENT', currency: 'USD',
          engagement: { msa: { vendorId: 'consultis', clientId: 'payer' } },
          workOrder: null, invoiceLines: [],
        }),
        update: write('invoice.update'),
      },
      company: { findUnique: async () => payer },
      payment: { create: write('payment.create') },
      automationLog: { create: async (a: { data: { action: string; reason: string; payload: Record<string, unknown> } }) => { writes.push(`automationLog.create:${a.data.action}`); logged.push(a.data); return {} } },
    } as any,
  }
}
const PAY = (onBooksOf: string) => ({
  invoiceId: 'inv-1', method: 'ACH', reference: 'BR-7781', appliedById: 'ap-seat', onBooksOf,
  recordedBy: { companyId: onBooksOf, companyName: 'Payer', personName: 'Ana Ruiz' },
})

describe('paying a firm waits for a verified Owner at a company formed under the proof rule', () => {
  it('a company held for a verified Owner is refused paying an invoice receipt, in the sentence that names the step, and nothing is paid: the only row written is the refusal, in the words the person read', async () => {
    mayPayFirm.mockResolvedValue({ ok: true })
    const { tx, writes, logged } = fakeTx(KESTREL_HELD)
    const r = await recordInvoicePayment(tx, PAY('payer'))
    expect(r).toEqual({ ok: false, code: 'OWNER_NOT_VERIFIED', says: OWNER_SAYS, href: '/dashboard/settings/setup/ownership' })
    expect(mayPayFirm).not.toHaveBeenCalled()
    expect(writes).toEqual(['automationLog.create:PAYMENT_REFUSED'])
    expect(logged[0]).toMatchObject({ reason: OWNER_SAYS, payload: { why: 'OWNER_NOT_VERIFIED', door: 'INVOICE_PAY', byPersonId: 'ap-seat', invoiceId: 'inv-1' } })
  })

  it('an invoice receipt refused over a supplier\u2019s unchecked bank details is kept as a refused payment, and nothing is paid', async () => {
    mayPayFirm.mockResolvedValue({ ok: false, says: 'Consultis\u2019 bank details are not checked.', step: 'BANK' })
    const { tx, writes, logged } = fakeTx(BRIGHTMOOR_BEFORE)
    const r = await recordInvoicePayment(tx, PAY('payer'))
    expect(r).toMatchObject({ ok: false, code: 'BANK_NOT_CHECKED' })
    expect(writes).toEqual(['automationLog.create:PAYMENT_REFUSED'])
    expect(logged[0]).toMatchObject({ reason: 'Consultis\u2019 bank details are not checked.', payload: { why: 'BANK_NOT_CHECKED' } })
  })

  it('a supplier recording money that arrived and typing too much is told so, and no refused payment is kept for a mistyped amount', async () => {
    const { tx, writes } = fakeTx(BRIGHTMOOR_BEFORE)
    const r = await recordInvoicePayment(tx, { ...PAY('consultis'), amountCents: 500_000 })
    expect(r).toMatchObject({ ok: false, code: 'OVERPAYMENT' })
    expect(writes).toEqual([])
  })

  it('a company formed before the rule pays as before: the owner gate lets it through to the bank check', async () => {
    mayPayFirm.mockResolvedValue({ ok: false, says: 'Consultis’ bank details are not checked.', step: 'BANK' })
    const { tx } = fakeTx(BRIGHTMOOR_BEFORE)
    const r = await recordInvoicePayment(tx, PAY('payer'))
    expect(r).toMatchObject({ ok: false, code: 'BANK_NOT_CHECKED' })
    expect(mayPayFirm).toHaveBeenCalledWith('payer', 'consultis', tx)
  })

  it('a supplier recording money that arrived is never held for the payer’s Owner', async () => {
    const { tx } = fakeTx(KESTREL_HELD)
    // More than is owed, so the run stops at the amount, before any write.
    const r = await recordInvoicePayment(tx, { ...PAY('consultis'), amountCents: 500_000 })
    expect(r).toMatchObject({ ok: false, code: 'OVERPAYMENT' })
  })

  it('paying a typed-in invoice receipt and releasing a payment run read the same gate before any write, on the paying company', () => {
    const bills = readFileSync('src/app/api/ap/bills/route.ts', 'utf8')
    const gate = bills.indexOf("needsVerifiedOwnerAt(reading.companyId, 'PAY')")
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(bills.indexOf('keyedPayGateNow(bill,'))
    const runs = readFileSync('src/app/api/ap/payment-runs/route.ts', 'utf8')
    const runGate = runs.indexOf("needsVerifiedOwnerAt(companyId, 'PAY')")
    expect(runGate).toBeGreaterThan(0)
    expect(runGate).toBeLessThan(runs.indexOf('recordKeyedPayment(tx,'))
    for (const src of [bills, runs]) expect(src).toContain('NextResponse.json(gateRefusal(owner), { status: 403 })')
  })
})

describe('a typed-in invoice receipt is never recorded as already paid', () => {
  const bills = readFileSync('src/app/api/ap/bills/route.ts', 'utf8')
  const post = bills.slice(bills.indexOf('export async function POST'), bills.indexOf('export async function PATCH'))

  it('a receipt typed in with a paid date, a paid amount or the status PAID is refused before anything is written, in a sentence that says to pay it from its row', () => {
    const refusal = post.indexOf('if (paidOnIntake)')
    expect(refusal).toBeGreaterThan(0)
    expect(post).toContain("paidAt != null || Number(body.paid ?? 0) > 0 || statusAsked === 'PAID'")
    expect(refusal).toBeLessThan(post.indexOf('prisma.vendorBill.create'))
    expect(post).toContain('then pay it from its row')
  })

  it('intake writes every receipt unpaid, so the only way to pay one is the one payment function behind the Owner and bank gates', () => {
    const create = post.slice(post.indexOf('prisma.vendorBill.create'))
    expect(create).toContain('paidCents: 0,')
    expect(create).toContain('paidAt: null,')
    expect(post).not.toMatch(/paidCents:\s*paidAt/)
    expect(bills.indexOf('recordKeyedPayment(tx,')).toBeGreaterThan(bills.indexOf('export async function PATCH'))
  })
})

describe('every door that pays keeps a refused payment before it says the refusal', () => {
  const read = (p: string) => readFileSync(p, 'utf8')

  it('the payment route keeps a three-way check refusal before it answers, and never a document that is only not submitted yet', () => {
    const route = read('src/app/api/invoices/[id]/payments/route.ts')
    const kept = route.indexOf("door: 'INVOICE_PAY'")
    expect(kept).toBeGreaterThan(0)
    expect(kept).toBeLessThan(route.indexOf('return NextResponse.json({ error: { code: gate.code, message: gate.says } }, { status: 409 })'))
  })

  it('paying a typed-in receipt keeps the Owner, three-way check, week and bank refusals before each is said', () => {
    const bills = read('src/app/api/ap/bills/route.ts')
    expect(bills.indexOf("await refusedPay('OWNER_NOT_VERIFIED', owner.says)")).toBeLessThan(bills.indexOf('NextResponse.json(gateRefusal(owner), { status: 403 })'))
    expect(bills).toContain("await refusedPay('MATCH_FAILED', check.notAccepted.says)")
    expect(bills).toContain('if (why) await refusedPay(why, gate.says)')
  })

  it('releasing a payment run and marking it paid from a confirmation keep every rule\u2019s refusal before the answer goes', () => {
    const runs = read('src/app/api/ap/payment-runs/route.ts')
    for (const why of ['OWNER_NOT_VERIFIED', 'MATCH_FAILED', 'BANK_NOT_CHECKED']) expect(runs).toContain(`await refusedRelease('${why}'`)
    expect(runs).toContain("door: 'RUN_CONFIRM', why: 'OWNER_NOT_VERIFIED'")
    expect(runs).toContain("why: gate.code === 'BANK_NOT_CHECKED' ? 'BANK_NOT_CHECKED' : 'MATCH_FAILED'")
  })

  it('a payment refusal is a rule\u2019s only: the three-way check, a check that could not run or an unaccepted week, the bank, or the Owner, and never a state or a typing mistake', async () => {
    const { refusalWhy } = await import('@/lib/money/payment-refused')
    expect(refusalWhy('MATCH_FAILED')).toBe('MATCH_FAILED')
    expect(refusalWhy('NOT_CHECKED')).toBe('MATCH_FAILED')
    expect(refusalWhy('WEEK_NOT_ACCEPTED')).toBe('MATCH_FAILED')
    expect(refusalWhy('BANK_NOT_CHECKED')).toBe('BANK_NOT_CHECKED')
    expect(refusalWhy('OWNER_NOT_VERIFIED')).toBe('OWNER_NOT_VERIFIED')
    for (const c of ['NOT_SUBMITTED', 'HELD', 'INVALID_STATE', 'OVERPAYMENT', 'VALIDATION']) expect(refusalWhy(c)).toBeNull()
  })
})
