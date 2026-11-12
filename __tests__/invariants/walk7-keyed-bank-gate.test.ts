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
  const write = (name: string) => async () => { writes.push(name); return {} }
  return {
    writes,
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
    } as any,
  }
}
const PAY = (onBooksOf: string) => ({
  invoiceId: 'inv-1', method: 'ACH', reference: 'BR-7781', appliedById: 'ap-seat', onBooksOf,
  recordedBy: { companyId: onBooksOf, companyName: 'Payer', personName: 'Ana Ruiz' },
})

describe('paying a firm waits for a verified Owner at a company formed under the proof rule', () => {
  it('a company held for a verified Owner is refused paying an invoice receipt, in the sentence that names the step, and nothing is written', async () => {
    mayPayFirm.mockResolvedValue({ ok: true })
    const { tx, writes } = fakeTx(KESTREL_HELD)
    const r = await recordInvoicePayment(tx, PAY('payer'))
    expect(r).toEqual({ ok: false, code: 'OWNER_NOT_VERIFIED', says: OWNER_SAYS, href: '/dashboard/settings/setup/ownership' })
    expect(mayPayFirm).not.toHaveBeenCalled()
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
    expect(runGate).toBeLessThan(runs.indexOf('applyRunPayment('))
    for (const src of [bills, runs]) expect(src).toContain('NextResponse.json(gateRefusal(owner), { status: 403 })')
  })
})
