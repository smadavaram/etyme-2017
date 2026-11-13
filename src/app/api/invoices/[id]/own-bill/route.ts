import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { partiesOf } from '@/lib/money/invoice-parties'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { codingReader } from '@/lib/money/coding-reader'
import { leftAfterThisBill } from '@/lib/money/left-after-this-bill'
import { ownBillIsTheIssuers, ownBillView } from '@/lib/money/own-bill-read'
import { recordRefusal } from '@/lib/access-log'

/**
 * GET /api/invoices/:id/own-bill
 *
 * The firm that issued a bill reads two facts of its own beside it: what
 * is left on the order after this bill, and its own pay-to details (the
 * bank, the name on the account and four digits). Nothing of the
 * client's: no cost center, no account, no cost split, no code of any
 * kind (`lib/money/own-bill-read` fixes the shape).
 *
 * The coding view answers only the company that pays, since 2026-11-13,
 * and these two facts went with it; this read gives them back to the
 * issuer alone. The figure is `leftAfterThisBill`, the same door the
 * coding view reads, so both sides of one bill read one number; an order
 * holding a document in another currency gives no figure and says why.
 *
 * The payer is told in one sentence where its own view is. Anybody else
 * gets what an invoice that does not exist gets. Both refusals are on the
 * access log before they are sent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const notFound = () =>
    NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, { status: 404 })
  if (!caller.company) return notFound()
  const whose = await booksFor(caller, request)
  if (whose.error) return whose.error
  const books = whose.books

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true, number: true, currency: true, total: true,
      engagement: {
        select: {
          msa: {
            select: {
              vendorId: true, clientId: true,
              vendor: { select: { id: true, name: true } },
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
      workOrder: {
        select: {
          id: true, number: true, amount: true, currency: true, status: true, endDate: true,
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
        },
      },
      remitTo: {
        select: {
          companyId: true, legalName: true, accountName: true,
          paymentMethod: true, bankName: true, accountLast4: true,
        },
      },
    },
  })
  if (!invoice) return notFound()

  const parties = partiesOf({ agreement: invoice.engagement.msa, order: invoice.workOrder })
  const reader = codingReader({
    readerCompanyId: books.companyId,
    vendor: parties.vendor,
    payer: parties.client,
    invoiceNumber: invoice.number,
  })
  if (reader.kind !== 'ISSUER' || !parties.vendor) {
    // Written before the refusal is sent (CLAUDE.md, 2026-10-08).
    await recordRefusal([{ companyId: parties.vendor?.id ?? caller.company.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason:
        reader.kind === 'PAYER'
          ? `Refused the issuer's own read of ${invoice.number} to the company that pays it: its view is the cost coding.`
          : `Refused the issuer's own read of ${invoice.number}: the reader is not the firm that issued it.`,
    })
    if (reader.kind === 'PAYER') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: ownBillIsTheIssuers(invoice.number) } }, { status: 403 })
    }
    return notFound()
  }
  noteMoneyRead(books, `the order and pay-to on ${invoice.number}`)

  const left = await leftAfterThisBill(invoice)
  return NextResponse.json({
    data: ownBillView({
      orderNumber: invoice.workOrder?.number ?? null,
      left,
      remitTo: invoice.remitTo,
      issuerId: parties.vendor.id,
    }),
  })
}
