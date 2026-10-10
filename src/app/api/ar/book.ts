import { prisma } from '@/lib/db'
import { fromPrismaDecimal, minorPerUnit } from '@/lib/money'
import { ageBook, type ArInvoice, type Book } from '@/lib/ar-ageing'
import { resolveBillingTerms } from '@/lib/billing-cascade'
import { invoicesRaisedBy, partiesOf } from '@/lib/money/invoice-parties'

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
 * Invoices this company raised — the agreement, the order, or a line on
 * it saying that we are the firm that billed.
 *
 * Our side only. An invoice where we are the client is somebody else's
 * receivable and our payable, and mixing the two is how an AR report
 * shows a positive balance to a company that owes money.
 *
 * It used to read the agreement alone. An agreement is optional now, and
 * a relation filter on a null relation matches nothing — so a firm's own
 * bill would have disappeared from its own receivables and never been
 * chased. `lib/money/invoice-parties` holds the one cascade.
 */
export async function loadReceivables(companyId: string) {
  return prisma.invoice.findMany({
    where: {
      ...invoicesRaisedBy(companyId),
      status: { notIn: NOT_RECEIVABLE },
    },
    select: {
      id: true, number: true, currency: true, total: true, paid: true,
      dueAt: true, status: true, periodStart: true, periodEnd: true, issuedAt: true,
      // The day the client confirmed it landed. Null is not "today" — it
      // is nobody having said, and on terms counted from receipt that is
      // the difference between an invoice that is late and one whose
      // payment clock has not started.
      receivedAt: true,
      payments: { select: { amount: true, receivedAt: true } },
      // Credit notes come off the invoice before it is aged. An invoice
      // credited in full and then chased for ninety days is the failure
      // this join exists to prevent.
      creditNotes: { select: { amount: true, appliedAt: true, reasonCode: true } },
      billTo: { select: { id: true, name: true } },
      // Who this is addressed to, where no agreement says. The buyer
      // raised the order; the seller bills against it.
      workOrder: {
        select: {
          number: true,
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
          paymentTerms: true,
        },
      },
      // And where neither says, the lines billed on it do. Two of them,
      // not all: the book loads five thousand invoices and this is the
      // last resort of the three, so two lines is enough to name the
      // pair and to notice that the first two disagree. An invoice whose
      // third line names a different firm is caught where it costs
      // money — on the invoice itself and on a payment against it, both
      // of which load every line.
      invoiceLines: {
        select: {
          sellContract: {
            select: {
              companyId: true, clientCompanyId: true,
              company: { select: { id: true, name: true } },
              clientCompany: { select: { id: true, name: true } },
            },
          },
        },
        take: 2,
      },
      engagement: {
        select: {
          title: true,
          msa: {
            select: {
              vendorId: true, clientId: true,
              vendor: { select: { id: true, name: true } },
              client: { select: { id: true, name: true } },
              paymentTerms: true, paymentTermsFrom: true,
            },
          },
          // What the payment days are counted from, as this placement
          // agreed it. Read for the anchor only — the due date itself was
          // decided when the invoice was raised and is not recomputed
          // here, because a contract amended in March must not restate a
          // February promise.
          sellContracts: {
            select: { paymentTerms: true, paymentTermsFrom: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 5_000,
  })
}

export type RawReceivable = Awaited<ReturnType<typeof loadReceivables>>[number]

/**
 * The customer on one receivable, from whichever document says.
 *
 * Used for the roll-up and for the chase letter, so both name the same
 * firm. Null on an invoice nothing can attribute — which is chased by
 * nobody, deliberately: a dunning letter addressed to a guess is worse
 * than one that never goes out.
 */
export function customerOf(i: RawReceivable) {
  return partiesOf({
    agreement: i.engagement.msa,
    order: i.workOrder,
    lines: i.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })
}

/**
 * Database rows to the shape the arithmetic works in.
 *
 * Exposure and arrears roll up on the CLIENT on the agreement, not on
 * whichever entity of theirs the invoice was posted to. A large client
 * signs in one entity and is billed through a shared services center in
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
    // Only APPLIED credits reduce the debt. An issued-and-unapplied note
    // is a promise somebody has made and not yet posted, and reducing a
    // receivable on it would show a debt as smaller than the ledger says
    // — the one direction an AR figure must never be wrong in.
    //
    // Applied as a reduction of the TOTAL rather than an addition to
    // `paid`, because those are different facts: the client has not paid
    // the credited part, we have agreed they never will.
    const credited = i.creditNotes
      .filter((c) => c.appliedAt != null)
      .reduce((n, c) => n + fromPrismaDecimal(c.amount, i.currency).minor, 0)

    const gross = fromPrismaDecimal(i.total, i.currency).minor

    return {
      id: i.id,
      number: i.number,
      currency: i.currency,
      totalMinor: Math.max(0, gross - credited),
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt,
      // An invoice nothing can attribute gets a bucket of its own rather
      // than sharing one: two unknown customers added together is a
      // figure about nobody. Exposure and arrears roll up on the firm,
      // and where there is no firm there is no roll-up.
      customerId: customerOf(i).client?.id ?? `unattributed:${i.id}`,
      customerName: customerOf(i).client?.name ?? 'Not yet attributed',
      status: i.status,
      receiptsMinor: receipts,
      lastPaymentAt: lastAt,
      ...clockOf(i),
    }
  })
}

/**
 * Has this invoice's payment clock started?
 *
 * Two of the four anchors depend on the client doing something —
 * confirming receipt, approving the invoice — and until they do, the
 * days have nothing to count from. The stored due date on those is the
 * earliest the invoice could fall due and not a date anybody promised,
 * so the aging is told to leave it alone.
 *
 * The anchor is read from the contract and the agreement rather than
 * held on the invoice, which is a known soft spot: amending the anchor
 * on a live contract changes whether an old invoice is chaseable. The
 * due date itself does not move, because that was decided and written
 * when the invoice was raised. Snapshotting the anchor onto `Invoice`
 * would close it and is the architect's to grant.
 */
function clockOf(i: RawReceivable): { clockStarted: boolean; waitingFor: string | null } {
  const contract = i.engagement.sellContracts[0] ?? null
  const customer = customerOf(i).client?.name ?? 'the client'
  const msa = i.engagement.msa
  const anchor = resolveBillingTerms({
    company: { name: customer },
    // Null where the engagement has no agreement behind it, which is
    // ordinary: the cascade then runs order → contract → default, and
    // says which of them answered.
    agreement: msa
      ? {
          paymentTermsDays: msa.paymentTerms,
          paymentTermsFrom: msa.paymentTermsFrom,
          counterpartyName: customer,
        }
      : null,
    contract: {
      paymentTermsDays: contract?.paymentTerms,
      paymentTermsFrom: contract?.paymentTermsFrom,
    },
    order: i.workOrder
      ? { paymentTermsDays: i.workOrder.paymentTerms, number: i.workOrder.number }
      : null,
  }).paymentTermsFrom.value

  if (anchor === 'RECEIPT_DATE' && !i.receivedAt) {
    return { clockStarted: false, waitingFor: 'the client to confirm they received it' }
  }
  if (anchor === 'APPROVAL_DATE') {
    // Nothing records when a client approves an invoice, so this clock
    // cannot start. Said rather than aged: chasing on a date nobody
    // agreed to is the fault this whole change exists to fix.
    return { clockStarted: false, waitingFor: 'the client to approve it' }
  }
  return { clockStarted: true, waitingFor: null }
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
