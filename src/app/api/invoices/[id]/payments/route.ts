import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { invoiceScope } from '@/lib/resolve-client-company'
import { booksFor, noteMoneyRead, seatMayPay, moneyTrailFor } from '@/lib/money/seated-books'
import { invoiceBetween, partiesOf } from '@/lib/money/invoice-parties'
import { fromUnits } from '@/lib/money-display'
import { fromDecimal, fromPrismaDecimal, toDecimal } from '@/lib/money'
import { recordInvoicePayment, emitInvoicePaid, type InvoicePaymentResult } from '@/lib/money/invoice-payment'
import { matchInvoice, payGate, receiptStateRefusal } from '@/lib/invoice-match'

/**
 * POST /api/invoices/:id/payments
 *
 * BUILD.md §3: Record a payment against an invoice.
 *
 * LEGACY_RULES.md §4.7–4.8:
 *   - ReceivePayment: individual receipts against invoices
 *   - Can be posted as discount
 *   - If sum of all payments >= total → PAID, otherwise → PARTIALLY_PAID
 *   - No overpayment allowed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // Whose money is moving, and by whose rule.
  //
  // A program office in a client's seat pays from the CLIENT's book with
  // the CLIENT's role. Its own clerks may pay its own suppliers all day;
  // inside somebody else's program it may pay nothing at all unless that
  // client seated it at a desk that pays, and the refusal says so in the
  // client's own words rather than naming a permission.
  const whose = caller.company ? await booksFor(caller, request) : null
  if (whose?.error) return whose.error
  const reading = whose?.books ?? null

  if (!hasPermission(reading?.caller.permissions ?? caller.permissions, 'payments.record')) {
    const seated = reading?.seat ? seatMayPay(reading.seat) : null
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            seated && !seated.ok ? seated.says : askTheDesk({ doing: 'Recording a payment', needs: 'payments.record', kind: caller.company?.kind, companyName: caller.company?.name }),
        },
      },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json()
  const { amount, method, reference } = body

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'amount must be a positive number', field: 'amount' } },
      { status: 422 }
    )
  }

  // Through the same scope every invoice read uses. A payment is the
  // one write here that moves money in the books, and it checked the
  // caller's permission inside their own company and nothing about
  // whose invoice it was — so an accountant at one firm could mark
  // another firm's invoice paid, and the receivable quietly vanished
  // from the dunning run.
  // Who may look at an invoice at all is `invoiceScope` — a consultant
  // seat is not a party to a bill between two companies, however many of
  // their hours are on it. WHICH invoices are ours is the cascade in
  // `lib/money/invoice-parties`: the scope helper still asks the
  // agreement alone, and an agreement is optional now, so an invoice with
  // none behind it would 404 for the two firms whose bill it is. Their
  // helper is demand's; the substitution is here, in money's own routes.
  // And whose book it is — resolved above, before the permission gate,
  // because in a seat the gate itself is the client's.
  const mayLook = reading ? invoiceScope(caller) : null
  const scope = mayLook && reading ? reading.invoiceWhere : null
  const invoice = scope
    ? await prisma.invoice.findFirst({
        where: { id, ...scope },
        select: {
          id: true,
          number: true,
          total: true,
          paid: true,
          status: true,
          currency: true,
          engagementId: true,
          periodEnd: true,
          engagement: {
            select: {
              msa: { select: { vendorId: true, clientId: true } },
            },
          },
          // Who the two firms are where no agreement says. A payment row
          // has to name both — "the payment says who paid whom" — so the
          // same cascade answers here as on every other read.
          workOrder: { select: { issuedById: true, issuedToId: true } },
          invoiceLines: {
            select: { sellContract: { select: { companyId: true, clientCompanyId: true } } },
          },
        },
      })
    : null

  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  // Which side is writing this. The supplier records a receipt — money
  // that arrived, whatever state the invoice was in when it did. The
  // payer records a payment, and pays only what reached it through the
  // match: an invoice still ISSUED has not been submitted, has not been
  // checked against the hours and the purchase order, and is not yet a
  // debt. Paying it would be paying around the one control finance buys
  // this for.
  const parties = partiesOf({
    agreement: invoice.engagement.msa,
    order: invoice.workOrder,
    lines: invoice.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })

  // A payment that cannot say who paid whom is not recorded. The row
  // would post cash into the books against nobody, and unapplied cash
  // with no payer is the one thing an AR clerk cannot clear by hand.
  if (!parties.vendor || !parties.client) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_ATTRIBUTED',
          message:
            `Invoice ${invoice.number} cannot say who it is between, so a payment against it ` +
            `cannot say who paid whom. ${parties.says}`,
        },
      },
      { status: 422 }
    )
  }

  const { vendor: billedBy, client: billedTo } = parties
  // The side is the BOOK's, not the reader's. A program office recording
  // a payment for the client it runs is on the paying side, because the
  // client is — and reading the office's own id here would have made
  // every seated payment look like a supplier recording a receipt, which
  // skips the control that an invoice must clear the match first.
  const payer = (reading?.companyId ?? caller.company!.id) === billedTo.id
  // The reader's word for the document: the payer holds its supplier's
  // invoice, the firm that raised it holds its own bill. The party who
  // issues a document names it (CLAUDE.md, "Bill, invoice receipt,
  // payroll").
  const Doc = payer ? 'Invoice' : 'Bill'
  // A client pays what came through the match, and only that (CLAUDE.md,
  // station 9) — through one gate, `payGate` in lib/invoice-match, which
  // the job twin's approval reads too, so the desk and the twin cannot
  // disagree about what is payable. In its order: an invoice still
  // ISSUED has not been submitted, has not been checked against the
  // hours and the purchase order, and is not yet a debt; one held by the
  // payer's own desk waits until the hold is lifted where it was put;
  // and the check is run again at the moment money leaves, because the
  // hours or the order behind it can move after submission. An exception
  // somebody recorded with a reason counts as passing; a failure nobody
  // answered does not.
  if (payer) {
    const byState = receiptStateRefusal(invoice)
    const gate = byState ?? payGate(invoice, await matchInvoice(id))
    if (!gate.ok) {
      return NextResponse.json({ error: { code: gate.code, message: gate.says } }, { status: 409 })
    }
  }

  // Every write a payment makes — the row, the invoice's paid and status,
  // the expenses it carried, the trail and the event — is the one payment
  // function's, which the twin's performer calls too, so a payment from
  // the chat and one from this screen cannot write different rows. The
  // cancelled, already-paid and over-the-balance refusals are its too.
  // The amount arrives in whole currency, as a person types it, and is
  // carried in integer minor units from here.
  const amountCents = fromDecimal(amount, invoice.currency).minor

  let recorded: InvoicePaymentResult
  try {
    recorded = await prisma.$transaction((tx) =>
      recordInvoicePayment(tx, {
        invoiceId: id,
        amountCents,
        method: method ?? null,
        reference: reference ?? null,
        appliedById: caller.person.id,
        onBooksOf: reading?.companyId ?? caller.company!.id,
        seatId: reading?.seat?.id ?? null,
        recordedBy: {
          companyId: caller.company!.id,
          companyName: caller.company!.name,
          personName: caller.person.name,
        },
        reason: moneyTrailFor(reading?.seat ?? null, `Payment of ${fromUnits(amount, invoice.currency)} recorded`),
      })
    )
  } catch (err: any) {
    reportError('Payment recording failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Payment recording failed' } },
      { status: 500 }
    )
  }

  if (!recorded.ok) {
    const status = recorded.code === 'NOT_FOUND' ? 404
      : recorded.code === 'INVALID_STATE' || recorded.code === 'BANK_NOT_CHECKED' ? 409 : 422
    return NextResponse.json(
      {
        error: {
          code: recorded.code, message: recorded.says,
          ...(recorded.field ? { field: recorded.field } : {}),
          ...(recorded.step ? { step: recorded.step } : {}),
        },
      },
      { status }
    )
  }

  // Committed: only now does the world hear the invoice was paid.
  void emitInvoicePaid(recorded)

  const result = recorded.payment
  const totalNum = toDecimal({ minor: recorded.invoice.totalCents, currency: invoice.currency })
  const newPaid = toDecimal({ minor: recorded.invoice.paidCents, currency: invoice.currency })
  const outstanding = toDecimal({ minor: recorded.invoice.outstandingCents, currency: invoice.currency })
  const newStatus = recorded.status
  return NextResponse.json({
    data: {
      // In the shape every reader of a payment row reads: minor units
      // and the currency beside them, how it was paid, and who paid
      // whom. The screen read `amountMinor` off this and got nothing
      // back, so the payment just made showed "—" for its amount.
      // `amount` stays for older readers, in whole currency.
      payment: {
        id: result.id,
        amount: Number(result.amount),
        amountMinor: fromPrismaDecimal(result.amount, result.currency ?? invoice.currency).minor,
        currency: result.currency ?? invoice.currency,
        method: result.method,
        reference: result.reference,
        receivedAt: result.receivedAt.toISOString(),
        paidBy: result.payerCompany?.name ?? null,
        paidTo: result.receivedByCompany?.name ?? null,
        recordedBy: caller.person.name,
      },
      invoice: {
        id,
        number: invoice.number,
        total: totalNum,
        paid: newPaid,
        outstanding,
        status: newStatus,
      },
      message: newStatus === 'PAID'
        ? `${Doc} ${invoice.number} fully paid`
        : `Payment recorded — ${fromUnits(outstanding, invoice.currency)} remaining`,
    },
  }, { status: 201 })
}
