import type { Prisma } from '@prisma/client'
import { emit, type EmitParams } from '@/lib/events'
import { fromUnits } from '@/lib/money-display'
import { fromPrismaDecimal, toDecimal } from '@/lib/money'
import { partiesOf } from '@/lib/money/invoice-parties'

/**
 * The one payment write.
 *
 * Every write a payment against an invoice makes, in one place: the
 * `Payment` row, the invoice's `paid` and `status`, the expenses that rode
 * on it moved from INVOICED to PAID once it is paid in full, the
 * PAYMENT_RECORDED automation log — and the `invoice.paid` event, which
 * it returns rather than sends, for the caller to emit after the commit.
 * `POST /api/invoices/:id/payments` calls it inside its transaction; the
 * twin's performer calls it the same way, so a payment made from the chat
 * and one made from the screen cannot write different rows.
 *
 * What it does NOT do is decide whether this caller may pay this invoice.
 * That stays with the caller, before the transaction: the scope that
 * finds the invoice in the reader's own books, the `payments.record`
 * permission, and the one gate — `payGate` and `mayPayInvoiceReceipt` in
 * lib/invoice-match — that a payer pays only what came through the match.
 * This function trusts that the caller asked those questions.
 *
 * What it does refuse, in a sentence, because they are facts about the
 * invoice and not about the caller:
 *   · an invoice that cannot say who it is between (the row must say who
 *     paid whom);
 *   · a cancelled or already-paid invoice;
 *   · an amount that is not a whole positive number of cents;
 *   · more than the balance owed. Integer cents, so no rounding
 *     tolerance: a cent over is over.
 *
 * An amount the caller does not pass is the balance owed.
 *
 * Money in, money out: the caller speaks integer minor units; `Invoice.total`,
 * `Invoice.paid` and `Payment.amount` are Decimals in whole currency, and
 * the conversion happens here, through lib/money, once.
 */

type Tx = Prisma.TransactionClient

export interface InvoicePaymentInput {
  invoiceId: string
  /** Integer minor units. Omitted or null pays the balance owed. */
  amountCents?: number | null
  method?: string | null
  reference?: string | null
  /** The person who pressed it — `Payment.appliedById`, the event's actor. */
  appliedById: string
  /**
   * Whose book the payment is on. A program office in a client's seat
   * pays from the client's book; everyone else, their own company. The
   * side — payer or supplier recording a receipt — is read from this
   * against the invoice's parties, never from the recorder's own firm.
   */
  onBooksOf: string
  /** The seat used, where one was. Null for a payment on one's own book. */
  seatId?: string | null
  /** The firm and name of whoever recorded it, for the trail. */
  recordedBy: { companyId: string; companyName: string; personName: string }
  /**
   * The trail's reason, where the caller has a better one than "Recorded
   * by … at …" — a seated payment's trail, or the twin's rule cited.
   */
  reason?: string | null
}

export type InvoicePaymentRefusal = {
  ok: false
  code: 'NOT_FOUND' | 'NOT_ATTRIBUTED' | 'INVALID_STATE' | 'OVERPAYMENT' | 'VALIDATION'
  says: string
  field?: 'amount'
}

export type InvoicePaymentRecorded = {
  ok: true
  payment: Prisma.PaymentGetPayload<{
    include: { payerCompany: { select: { name: true } }; receivedByCompany: { select: { name: true } } }
  }>
  status: 'PAID' | 'PARTIALLY_PAID'
  /** Which side recorded it: the firm paying, or the supplier recording money that arrived. */
  side: 'PAYER' | 'SUPPLIER'
  invoice: {
    id: string
    number: string
    currency: string
    totalCents: number
    paidCents: number
    outstandingCents: number
  }
  /** The reader's word for the document: the payer's invoice, the supplier's own bill. */
  doc: 'invoice' | 'bill'
  amountCents: number
  /**
   * The `invoice.paid` event, not yet emitted. Emit it with
   * `emitInvoicePaid` once the transaction has committed, never inside it.
   */
  event: EmitParams
}

export type InvoicePaymentResult = InvoicePaymentRecorded | InvoicePaymentRefusal

export async function recordInvoicePayment(
  tx: Tx,
  input: InvoicePaymentInput
): Promise<InvoicePaymentResult> {
  const { invoiceId, method, reference, appliedById, onBooksOf, recordedBy } = input
  const seatId = input.seatId ?? null

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      total: true,
      paid: true,
      status: true,
      currency: true,
      engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
      workOrder: { select: { issuedById: true, issuedToId: true } },
      invoiceLines: {
        select: { sellContract: { select: { companyId: true, clientCompanyId: true } } },
      },
    },
  })
  if (!invoice) return { ok: false, code: 'NOT_FOUND', says: 'Invoice not found' }

  const parties = partiesOf({
    agreement: invoice.engagement.msa,
    order: invoice.workOrder,
    lines: invoice.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })
  if (!parties.vendor || !parties.client) {
    return {
      ok: false,
      code: 'NOT_ATTRIBUTED',
      says:
        `Invoice ${invoice.number} cannot say who it is between, so a payment against it ` +
        `cannot say who paid whom. ${parties.says}`,
    }
  }
  const { vendor: billedBy, client: billedTo } = parties
  const payer = onBooksOf === billedTo.id
  const doc = payer ? 'invoice' : 'bill'
  const Doc = payer ? 'Invoice' : 'Bill'
  const currency = invoice.currency

  if (invoice.status === 'CANCELLED') {
    return { ok: false, code: 'INVALID_STATE', says: `Cannot record payment on a cancelled ${doc}` }
  }
  if (invoice.status === 'PAID') {
    return { ok: false, code: 'INVALID_STATE', says: `${Doc} is already fully paid` }
  }

  const totalCents = fromPrismaDecimal(invoice.total, currency).minor
  const paidCents = fromPrismaDecimal(invoice.paid, currency).minor
  const owedCents = totalCents - paidCents
  const money = (minor: number) => fromUnits(toDecimal({ minor, currency }), currency)

  if (owedCents <= 0) {
    return { ok: false, code: 'INVALID_STATE', says: `${Doc} ${invoice.number} has nothing left owed on it.` }
  }

  const amountCents = input.amountCents ?? owedCents
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return {
      ok: false,
      code: 'VALIDATION',
      says: 'A payment is a positive amount in whole cents. Enter what actually arrived.',
      field: 'amount',
    }
  }

  // LEGACY_RULES.md §4.8: no overpayment.
  if (amountCents > owedCents) {
    return {
      ok: false,
      code: 'OVERPAYMENT',
      says:
        `${money(amountCents)} is more than the ${money(owedCents)} still owed on ` +
        `${doc} ${invoice.number}. Record what actually arrived, or raise a credit note for the difference.`,
      field: 'amount',
    }
  }

  const newPaidCents = paidCents + amountCents
  const status: 'PAID' | 'PARTIALLY_PAID' = newPaidCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID'
  const amount = toDecimal({ minor: amountCents, currency })
  const newPaid = toDecimal({ minor: newPaidCents, currency })

  const payment = await tx.payment.create({
    data: {
      invoiceId,
      amount,
      currency,
      method: method ?? null,
      reference: reference ?? null,
      // Who paid and whose account it landed in — read off the paper, not
      // off the recorder, so the row says the same thing whichever side
      // recorded it.
      payerCompanyId: billedTo.id,
      receivedByCompanyId: billedBy.id,
      appliedAt: new Date(),
      appliedById,
    },
    include: {
      payerCompany: { select: { name: true } },
      receivedByCompany: { select: { name: true } },
    },
  })

  await tx.invoice.update({ where: { id: invoiceId }, data: { paid: newPaid, status } })

  // Paid in full: the expenses that rode on this invoice are paid. When an
  // invoice falls due is its own `dueAt`; no cycle is completed here.
  if (status === 'PAID') {
    await tx.expense.updateMany({ where: { invoiceId, status: 'INVOICED' }, data: { status: 'PAID' } })
  }

  await tx.automationLog.create({
    data: {
      companyId: onBooksOf,
      action: 'PAYMENT_RECORDED',
      summary:
        `Payment of ${money(amountCents)} recorded on ${doc} ${invoice.number}. ` +
        (status === 'PAID' ? `${Doc} now fully paid.` : `${money(totalCents - newPaidCents)} outstanding.`),
      reason:
        input.reason ??
        `Recorded by ${recordedBy.personName} at ${recordedBy.companyName}, ${payer ? 'paying' : 'receiving'}`,
      payload: {
        paymentId: payment.id,
        recordedBy: {
          personId: appliedById,
          companyId: recordedBy.companyId,
          side: payer ? 'PAYER' : 'SUPPLIER',
          // Null on all but a seated payment, and the one fact a client
          // asking "on whose authority" needs.
          seatId,
          onBooksOf,
        },
        invoiceId,
        invoiceNumber: invoice.number,
        amount,
        method: method ?? undefined,
        reference: reference ?? undefined,
        newPaid,
        newStatus: status,
      },
      reversible: true,
    },
  })

  // Not emitted here. The event is written on its own connection, so a
  // rollback of the caller's transaction after this point would leave an
  // `invoice.paid` for a payment that does not exist. It is returned, and
  // the caller emits it after the commit through `emitInvoicePaid`.
  const event: EmitParams = {
    type: 'invoice.paid',
    companyId: recordedBy.companyId,
    subjectType: 'Invoice',
    subjectId: invoiceId,
    actorPersonId: appliedById,
    payload: {
      invoiceNumber: invoice.number,
      paymentId: payment.id,
      amount,
      method: method ?? undefined,
      reference: reference ?? undefined,
      paidToDate: newPaid,
      status,
      // A part payment and a final payment are the same event type with a
      // different answer here, and an ERP consumer needs to tell them apart.
      settled: status === 'PAID',
    },
  }

  return {
    ok: true,
    payment,
    status,
    side: payer ? 'PAYER' : 'SUPPLIER',
    invoice: {
      id: invoice.id,
      number: invoice.number,
      currency,
      totalCents,
      paidCents: newPaidCents,
      outstandingCents: totalCents - newPaidCents,
    },
    doc,
    amountCents,
    event,
  }
}

/**
 * Send the `invoice.paid` event of a payment that has committed.
 *
 * Call it after `prisma.$transaction(...)` has returned, never inside the
 * callback: a payment rolled back must leave no event behind. A refusal
 * emits nothing. The twin's performer passes its own actor, so the event
 * says the twin recorded it under the person it acts for.
 */
export function emitInvoicePaid(
  result: InvoicePaymentResult,
  actor?: Pick<EmitParams, 'actorKind' | 'actorTwinKind'>
): Promise<{ id: string } | null> {
  if (!result.ok) return Promise.resolve(null)
  return emit({ ...result.event, ...(actor ?? {}) })
}
