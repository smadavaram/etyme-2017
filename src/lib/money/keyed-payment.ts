import type { Prisma } from '@prisma/client'
import { decimalsFor } from '@/lib/money'
import { amount } from '@/lib/money-display'

/**
 * Mark a typed-in invoice receipt paid, from a confirmation the payer's
 * own system sent back. The write a payment run's line makes.
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
 * moved since it was read, so two uploads at once cannot both pay it.
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
  /** The payer's own bank or system reference, from the confirmation. */
  payerReference: string
  /** The Etyme payment reference the run's file carried. */
  etymeReference: string
  runId: string
  appliedById: string
  appliedByName: string
}

export type KeyedPaymentOutcome = { ok: true; paymentId: string; settled: boolean } | { ok: false; says: string }

export async function recordKeyedPayment(tx: Tx, p: KeyedPaymentInput): Promise<KeyedPaymentOutcome> {
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
    where: { id: p.billId, paidCents: p.expectPaidCents, status: { notIn: ['PAID', 'CANCELLED'] } },
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
      method: 'PAYMENT_RUN',
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
        `Payment of ${amount(p.amountCents, p.currency)} recorded on ${p.vendorName}’s invoice ${p.number}, ` +
        `from the confirmation of payment run ${p.runId}. ` + (settled ? 'Now paid in full.' : ''),
      reason: `Recorded by ${p.appliedByName} at ${p.payerName}, from the payer's own payment system (reference ${p.payerReference})`,
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
      },
      reversible: false,
    },
  })

  return { ok: true, paymentId: payment.id, settled }
}
