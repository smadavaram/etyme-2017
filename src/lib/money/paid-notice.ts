import { notify } from '@/lib/notify'
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
  payerReference: string
}

/** What the supplier reads. Pure. */
export function paidNotice(f: PaidFacts): { title: string; body: string } {
  return {
    title: `${f.payerName} paid your invoice ${f.number}`,
    body:
      `${f.payerName} paid your invoice ${f.number}: ${amount(f.amountCents, f.currency)} ` +
      `on ${formatDayLong(f.paidAt)}, reference ${f.payerReference}.`,
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

/** Tell the supplier, once, after the payment has committed. Returns how many people were told. */
export async function tellSupplierPaid(f: PaidFacts): Promise<number> {
  const people = whoHearsPaid(await payerSeats(f.vendorCompanyId))
  const { title, body } = paidNotice(f)
  for (const personId of people) {
    void notify({
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
        payerReference: f.payerReference,
      },
    })
  }
  return people.length
}
