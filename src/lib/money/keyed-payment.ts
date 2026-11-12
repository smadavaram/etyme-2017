import type { Prisma } from '@prisma/client'
import { decimalsFor } from '@/lib/money'
import { amount } from '@/lib/money-display'
import { suppliersBillFor, type PaidFacts } from '@/lib/money/paid-notice'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'
import { mayPayFirm } from '@/lib/setup-gates'

/**
 * Pay a typed-in invoice receipt. The one write, from every door (the
 * founder, 2026-11-12): the confirmation the payer's own system sent back,
 * a run's "Mark it paid", and the receipt's own Pay (`PATCH
 * /api/ap/bills`). No route writes a `Payment` row on a receipt itself.
 *
 * It returns what the supplier is told (`notice`); the caller tells it
 * with `tellSupplierPaid` once the transaction has committed, never
 * inside it, so a payment rolled back tells nobody.
 *
 * A payment run's lines are typed-in receipts (`VendorBill`), never a
 * platform invoice (`Invoice`): a `PaymentRunItem` names a receipt and
 * nothing else. So the confirmation cannot go through
 * `recordInvoicePayment`, which writes against an `Invoice`; it writes the
 * same three things that function and `PATCH /api/ap/bills` write, in one
 * transaction: the receipt's paid figure and date, the `Payment` row saying
 * who paid whom, and the PAYMENT_RECORDED automation log.
 *
 * What it trusts the caller asked first: the proof rule, the three-way
 * check and the bank check (`mayPayKeyedReceipt`), and that the amount is
 * the balance owed. What it refuses itself: a receipt whose paid figure
 * moved since it was read, so two uploads at once cannot both pay it; a
 * receipt that is not the payer's own or not in the currency it was read
 * in; and, read again on the transaction, a paying company with no
 * verified Owner yet or a supplier whose bank check was taken back.
 *
 * No cycle is closed: a typed-in receipt's dates are its own
 * (lib/cycle-kinds), the same as the run's release and the bills route.
 */

type Tx = Prisma.TransactionClient

export interface KeyedPaymentInput {
  billId: string
  payerCompanyId: string
  payerName: string
  vendorCompanyId: string
  vendorName: string
  number: string
  currency: string
  amountCents: number
  /** The paid figure the receipt was read at. The write refuses if it moved. */
  expectPaidCents: number
  paidAt: Date
  /** The payer's own bank or system reference. Null only on the receipt's own Pay, where it is optional. */
  payerReference: string | null
  /** The Etyme payment reference the run's file carried. Null off a run. */
  etymeReference: string | null
  /** The run the payment went in. Null for a receipt paid on its own. */
  runId: string | null
  /** How it was paid. A run's payment is PAYMENT_RUN. */
  method?: string | null
  appliedById: string
  appliedByName: string
  /** The trail's reason, where the caller has a better one (a seated payment). */
  reason?: string | null
  /** More facts for the trail (the seat it was made in). */
  trail?: Record<string, unknown>
}

export type KeyedPaymentOutcome =
  | { ok: true; paymentId: string; settled: boolean; paidCents: number; notice: PaidFacts }
  | { ok: false; says: string }

export async function recordKeyedPayment(tx: Tx, p: KeyedPaymentInput): Promise<KeyedPaymentOutcome> {
  // The two gates that can turn between the caller's read and this write,
  // read again on this transaction: the paying company's verified Owner
  // (the proof rule) and the supplier's bank check. A check revoked a
  // moment ago stops the money here, in the gate's own sentence. The
  // three-way check stays the caller's, run at the moment of the press.
  const owner = await needsVerifiedOwnerAt(p.payerCompanyId, 'PAY', tx as unknown as Parameters<typeof needsVerifiedOwnerAt>[2])
  if (!owner.ok) return { ok: false, says: owner.says }
  const bank = await mayPayFirm(p.payerCompanyId, p.vendorCompanyId, tx as unknown as Parameters<typeof mayPayFirm>[2])
  if (!bank.ok) return { ok: false, says: bank.says }

  const current = await tx.vendorBill.findUnique({
    where: { id: p.billId },
    select: { totalCents: true, paidCents: true, status: true },
  })
  if (!current) return { ok: false, says: `${p.vendorName}’s invoice ${p.number} is no longer on the record. Nothing was written.` }
  const newPaid = p.expectPaidCents + p.amountCents
  if (newPaid > current.totalCents) {
    return { ok: false, says: `${p.vendorName}’s invoice ${p.number} would be paid past its total. Nothing was written.` }
  }
  const settled = newPaid >= current.totalCents

  // Conditional on the figure it was read at: a second confirmation, or a
  // payment recorded on the receipt meanwhile, finds nothing to update.
  const moved = await tx.vendorBill.updateMany({
    // Only the payer's own receipt, in the currency it was read in.
    where: {
      id: p.billId,
      companyId: p.payerCompanyId,
      vendorCompanyId: p.vendorCompanyId,
      currency: p.currency,
      paidCents: p.expectPaidCents,
      status: { notIn: ['PAID', 'CANCELLED'] },
    },
    data: { paidCents: newPaid, paidAt: settled ? p.paidAt : null, status: settled ? 'PAID' : 'APPROVED' },
  })
  if (moved.count !== 1) {
    return { ok: false, says: `${p.vendorName}’s invoice ${p.number} was paid or changed while this was read. Nothing was written again.` }
  }

  const d = decimalsFor(p.currency)
  const payment = await tx.payment.create({
    data: {
      vendorBillId: p.billId,
      payerCompanyId: p.payerCompanyId,
      receivedByCompanyId: p.vendorCompanyId,
      amount: (p.amountCents / 10 ** d).toFixed(d),
      currency: p.currency,
      method: p.method === undefined ? 'PAYMENT_RUN' : p.method,
      reference: p.payerReference,
      receivedAt: p.paidAt,
      appliedAt: new Date(),
      appliedById: p.appliedById,
    },
    select: { id: true },
  })

  await tx.automationLog.create({
    data: {
      companyId: p.payerCompanyId,
      action: 'PAYMENT_RECORDED',
      summary:
        `Payment of ${amount(p.amountCents, p.currency)} recorded on ${p.vendorName}’s invoice ${p.number}` +
        (p.runId ? `, from payment run ${p.runId}. ` : '. ') +
        (settled ? 'Now paid in full.' : `${amount(current.totalCents - newPaid, p.currency)} outstanding.`),
      reason:
        p.reason ??
        `Recorded by ${p.appliedByName} at ${p.payerName}, paying` +
          (p.payerReference ? ` (reference ${p.payerReference})` : ''),
      payload: {
        vendorBillId: p.billId,
        paymentId: payment.id,
        number: p.number,
        runId: p.runId,
        etymeReference: p.etymeReference,
        payerReference: p.payerReference,
        paidBy: { companyId: p.payerCompanyId, name: p.payerName },
        paidTo: { companyId: p.vendorCompanyId, name: p.vendorName },
        paidCents: p.amountCents,
        currency: p.currency,
        paidAt: p.paidAt.toISOString(),
        settled,
        byPersonId: p.appliedById,
        method: p.method === undefined ? 'PAYMENT_RUN' : p.method,
        ...(p.trail ?? {}),
      },
      reversible: false,
    },
  })

  // Where the supplier raised this bill on Etyme, the notice names it.
  const suppliersBill = await suppliersBillFor(tx, {
    number: p.number, vendorCompanyId: p.vendorCompanyId, payerCompanyId: p.payerCompanyId,
  })

  return {
    ok: true,
    paymentId: payment.id,
    settled,
    paidCents: newPaid,
    notice: {
      paymentId: payment.id,
      payerName: p.payerName,
      vendorCompanyId: p.vendorCompanyId,
      number: p.number,
      amountCents: p.amountCents,
      currency: p.currency,
      paidAt: p.paidAt,
      payerReference: p.payerReference,
      suppliersBill,
    },
  }
}
