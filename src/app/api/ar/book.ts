import { prisma } from '@/lib/db'
import { fromPrismaDecimal, minorPerUnit } from '@/lib/money'
import { ageBook, type ArInvoice, type Book } from '@/lib/ar-ageing'

/**
 * The receivable book, loaded once and used by every AR route.
 *
 * Not a route file — Next only routes `route.ts` — so this is an ordinary
 * module that happens to live beside the endpoints that share it.
 *
 * It exists because the reading endpoint and the sending endpoint have to
 * agree about exactly one thing: which invoices are open and how old they
 * are. If the screen and the letter disagree, a customer gets chased for
 * an invoice the screen shows as settled, and nobody can reconstruct why.
 * So the ladder never trusts a client-supplied list of invoices; it
 * recomputes the book from the same rows the screen did.
 */

/** Nothing owed on these, and nothing to chase. */
export const NOT_RECEIVABLE = ['DRAFT', 'CANCELLED', 'VOID']

/**
 * Invoices raised under an agreement where we are the VENDOR.
 *
 * Our side only. An invoice where we are the client is somebody else's
 * receivable and our payable, and mixing the two is how an AR report
 * shows a positive balance to a company that owes money.
 */
export async function loadReceivables(companyId: string) {
  return prisma.invoice.findMany({
    where: {
      engagement: { msa: { vendorId: companyId } },
      status: { notIn: NOT_RECEIVABLE },
    },
    select: {
      id: true, number: true, currency: true, total: true, paid: true,
      dueAt: true, status: true, periodStart: true, periodEnd: true, issuedAt: true,
      payments: { select: { amount: true, receivedAt: true } },
      billTo: { select: { id: true, name: true } },
      engagement: {
        select: {
          title: true,
          msa: { select: { client: { select: { id: true, name: true } }, paymentTerms: true } },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 5_000,
  })
}

export type RawReceivable = Awaited<ReturnType<typeof loadReceivables>>[number]

/**
 * Database rows to the shape the arithmetic works in.
 *
 * Exposure and arrears roll up on the CLIENT on the agreement, not on
 * whichever entity of theirs the invoice was posted to. A large client
 * signs in one entity and is billed through a shared services centre in
 * another; if they stop paying, both stop.
 *
 * `Invoice.total` and `Invoice.paid` are Prisma Decimals in whole
 * currency and everything downstream is integer minor units, so the
 * conversion happens here, once, through the currency's own exponent.
 */
export function toArInvoices(raw: RawReceivable[]): ArInvoice[] {
  return raw.map((i) => {
    const per = minorPerUnit(i.currency)
    const receipts = i.payments.reduce(
      (n, p) => n + Math.round(parseFloat(p.amount.toString()) * per),
      0
    )
    const lastAt = i.payments.reduce<Date | null>(
      (d, p) => (d == null || p.receivedAt > d ? p.receivedAt : d),
      null
    )
    return {
      id: i.id,
      number: i.number,
      currency: i.currency,
      totalMinor: fromPrismaDecimal(i.total, i.currency).minor,
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt,
      customerId: i.engagement.msa.client.id,
      customerName: i.engagement.msa.client.name,
      status: i.status,
      receiptsMinor: receipts,
      lastPaymentAt: lastAt,
    }
  })
}

/** Every invoice still carrying a balance, across every currency. */
export function openInvoiceIdsAcross(book: Book): Set<string> {
  return new Set(
    book.byCurrency.flatMap((cb) =>
      cb.invoices.filter((a) => a.outstandingMinor > 0).map((a) => a.id)
    )
  )
}

/** The whole thing: rows, converted rows, and the aged book. */
export async function loadBook(companyId: string, now: Date) {
  const raw = await loadReceivables(companyId)
  const invoices = toArInvoices(raw)
  return { raw, invoices, book: ageBook(invoices, now) }
}
