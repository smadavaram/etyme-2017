import type { Prisma } from '@prisma/client'
import { notify } from '@/lib/notify'
import { prisma } from '@/lib/db'
import { partiesOf } from '@/lib/money/invoice-parties'
import { hasPermission } from '@/lib/permissions'
import { amount } from '@/lib/money-display'
import { formatDayLong } from '@/lib/format-date'
import { payerSeats } from '@/lib/money/bank-check-read'

/**
 * The supplier is told the day it is paid (the founder, 2026-11-12):
 * which invoice, how much, the payer's reference and the day, in the app
 * and by email where email leaves, once per payment.
 *
 * Until this, a payment told the supplier nothing at all: the
 * `invoice.paid` event is a row in the payer's own event log, read by an
 * integration that asks for it, and a payment run's release or a typed-in
 * receipt's payment wrote no event and no notice.
 *
 * Once: the caller sends this only for a payment it has just written, and
 * the notice names the payment, so a confirmation read twice (which pays
 * nothing the second time) tells nobody twice.
 *
 * Every door that pays tells it, through the one payment function of its
 * kind (the founder, 2026-11-12): a supplier's bill that arrived on Etyme
 * through `recordInvoicePayment` (the receipt's page, the chat's Pay card,
 * told by `emitInvoicePaid` after the commit), and a typed-in invoice
 * receipt through `recordKeyedPayment` (the confirmation, a run's "Mark
 * it paid", the receipt's own Pay), told by the caller after the commit.
 * And where the payment lands on a bill the supplier raised on Etyme, the
 * notice names that bill and opens it.
 *
 * Never twice: a notice names its payment (`entityId`), and a payment
 * somebody was already told about is not told again, so a request retried
 * after the commit tells nobody a second time.
 *
 * Who is told: the supplier's seats that bill (`invoices.issue`), the
 * people who watch for the money; where nobody there bills, the seats that
 * record payments; where neither, the firm's first seat. A supplier with
 * no seat on Etyme is told nothing here, and the caller says so.
 */

export interface PaidFacts {
  paymentId: string
  payerName: string
  vendorCompanyId: string
  /** The supplier's own invoice number: what it knows the invoice by. */
  number: string
  amountCents: number
  currency: string
  paidAt: Date
  /** The payer's own bank or system reference. Null where the payer gave none. */
  payerReference: string | null
  /**
   * The bill the supplier raised on Etyme that this payment lands on, where
   * there is one: what it opens. Null where the supplier's invoice was
   * typed in by the payer and matches no bill of the supplier's here.
   */
  suppliersBill?: { id: string; number: string } | null
}

/** Where the supplier opens the bill it raised on Etyme. */
export function suppliersBillHref(id: string): string {
  return `/dashboard/invoices/${id}`
}

/** What the supplier reads. Pure. */
export function paidNotice(f: PaidFacts): { title: string; body: string; href: string | null } {
  const ref = f.payerReference?.trim()
  const bill = f.suppliersBill ?? null
  return {
    title: `${f.payerName} paid your invoice ${f.number}`,
    body:
      `${f.payerName} paid your invoice ${f.number}: ${amount(f.amountCents, f.currency)} ` +
      `on ${formatDayLong(f.paidAt)}` +
      (ref ? `, reference ${ref}.` : '. They gave no payment reference.') +
      (bill
        ? bill.number === f.number
          ? ` It is recorded on that invoice under Receivables.`
          : ` It is recorded on your invoice ${bill.number} under Receivables.`
        : ''),
    href: bill ? suppliersBillHref(bill.id) : null,
  }
}

/** Who at the supplier hears it. Pure. */
export function whoHearsPaid(seats: readonly { personId: string; permissions: readonly string[] }[]): string[] {
  const bills = seats.filter((s) => hasPermission([...s.permissions], 'invoices.issue'))
  if (bills.length > 0) return [...new Set(bills.map((s) => s.personId))]
  const pays = seats.filter((s) => hasPermission([...s.permissions], 'payments.record'))
  if (pays.length > 0) return [...new Set(pays.map((s) => s.personId))]
  return seats.length > 0 ? [seats[0].personId] : []
}

/**
 * Tell the supplier, once, after the payment has committed. Returns how
 * many people hold the notice: those told now, or, where this payment was
 * already told, those told then (and nobody is told again).
 */
export async function tellSupplierPaid(f: PaidFacts): Promise<number> {
  const already = await prisma.notification.findMany({
    where: { entityId: f.paymentId, companyId: f.vendorCompanyId, type: 'INVOICE' },
    select: { personId: true },
  })
  if (already.length > 0) return new Set(already.map((n) => n.personId)).size

  const people = whoHearsPaid(await payerSeats(f.vendorCompanyId))
  const { title, body, href } = paidNotice(f)
  // Awaited: the row is written before the caller answers, so a retry a
  // moment later finds it. Delivery by email still leaves on its own.
  await Promise.all(people.map((personId) =>
    notify({
      personId,
      companyId: f.vendorCompanyId,
      type: 'INVOICE',
      title,
      body,
      entityId: f.paymentId,
      channel: 'EMAIL',
      data: {
        paymentId: f.paymentId,
        invoiceNumber: f.number,
        amountMinor: f.amountCents,
        currency: f.currency,
        paidOn: f.paidAt.toISOString().slice(0, 10),
        payerReference: f.payerReference ?? null,
        ...(f.suppliersBill ? { invoiceId: f.suppliersBill.id, href } : {}),
      },
    })
  ))
  return people.length
}

/**
 * The bill the supplier raised on Etyme that a typed-in invoice receipt
 * stands for: the bill with the supplier's own number, raised by that
 * supplier to this payer. Null where there is none, or where the number
 * is somebody else's bill. Read inside the payment's transaction.
 */
export async function suppliersBillFor(
  db: Prisma.TransactionClient | typeof prisma,
  r: { number: string; vendorCompanyId: string; payerCompanyId: string },
): Promise<{ id: string; number: string } | null> {
  const inv = await db.invoice.findUnique({
    where: { number: r.number },
    select: {
      id: true,
      number: true,
      engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
      workOrder: { select: { issuedById: true, issuedToId: true } },
      invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } } },
    },
  })
  if (!inv) return null
  const parties = partiesOf({
    agreement: inv.engagement.msa,
    order: inv.workOrder,
    lines: inv.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })
  if (parties.vendor?.id !== r.vendorCompanyId || parties.client?.id !== r.payerCompanyId) return null
  return { id: inv.id, number: inv.number }
}
