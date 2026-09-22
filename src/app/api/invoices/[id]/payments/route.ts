import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { invoiceScope } from '@/lib/resolve-client-company'
import { booksFor, noteMoneyRead, seatMayPay, moneyTrailFor } from '@/lib/money/seated-books'
import { invoiceBetween, partiesOf } from '@/lib/money/invoice-parties'
import { fromUnits } from '@/lib/money-display'

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
            seated && !seated.ok ? seated.says : 'Requires payments.record permission',
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
  if (payer && invoice.status === 'ISSUED') {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_SUBMITTED',
          message: `Invoice ${invoice.number} has not been submitted yet. Your supplier sends it through the three-way match first; it can be paid once it has.`,
        },
      },
      { status: 409 }
    )
  }

  if (invoice.status === 'CANCELLED') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: 'Cannot record payment on a cancelled invoice' } },
      { status: 409 }
    )
  }

  if (invoice.status === 'PAID') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: 'Invoice is already fully paid' } },
      { status: 409 }
    )
  }

  const totalNum = Number(invoice.total)
  const paidNum = Number(invoice.paid)
  const outstanding = totalNum - paidNum

  // LEGACY_RULES.md: no overpayment
  if (amount > outstanding + 0.01) { // small tolerance for rounding
    return NextResponse.json(
      { error: {
        code: 'OVERPAYMENT',
        message:
          `${fromUnits(amount, invoice.currency)} is more than the ${fromUnits(outstanding, invoice.currency)} still owed on ` +
          `invoice ${invoice.number}. Record what actually arrived, or raise a credit note for the difference.`,
        field: 'amount',
      }},
      { status: 422 }
    )
  }

  const newPaid = paidNum + amount
  const newStatus = newPaid >= totalNum - 0.01 ? 'PAID' : 'PARTIALLY_PAID'

  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: id,
          amount,
          currency: invoice.currency,
          method: method ?? null,
          reference: reference ?? null,
          // Who paid and whose account it landed in — read off the
          // paper, not off the caller, so the row says the same thing
          // whichever side recorded it. The agreement where there is
          // one, the order where there is not.
          payerCompanyId: billedTo.id,
          receivedByCompanyId: billedBy.id,
          appliedAt: new Date(),
        },
      })

      await tx.invoice.update({
        where: { id },
        data: {
          paid: newPaid,
          status: newStatus,
        },
      })

      // Paid in full: the expenses that rode on this invoice are paid.
      //
      // Nothing completes an "invoice due" cycle here any more, because
      // nothing generates one. When an invoice falls due is the
      // invoice's own fact — `dueAt`, counted from the term and from the
      // day the client received it — and the AR desk reads it there.
      // Scheduling a second, earlier answer to the same question months
      // in advance is how the two came to disagree. See lib/cycle-kinds.
      if (newStatus === 'PAID') {
        await tx.expense.updateMany({ where: { invoiceId: id, status: 'INVOICED' }, data: { status: 'PAID' } })
      }

      await tx.automationLog.create({
        data: {
          companyId: reading?.companyId ?? caller.company!.id,
          action: 'PAYMENT_RECORDED',
          summary: `Payment of ${fromUnits(amount, invoice.currency)} recorded on invoice ${invoice.number}. ${newStatus === 'PAID' ? 'Invoice now fully paid.' : `${fromUnits(totalNum - newPaid, invoice.currency)} outstanding.`}`,
          reason:
            moneyTrailFor(reading?.seat ?? null, `Payment of ${fromUnits(amount, invoice.currency)} recorded`) ??
            `Recorded by ${caller.person.name} at ${caller.company!.name}, ${payer ? 'paying' : 'receiving'}`,
          payload: {
            paymentId: payment.id,
            recordedBy: {
              personId: caller.person.id,
              companyId: caller.company!.id,
              side: payer ? 'PAYER' : 'SUPPLIER',
              // Null on all but a seated payment, and the one fact a
              // client asking "on whose authority" needs.
              seatId: reading?.seat?.id ?? null,
              onBooksOf: reading?.companyId ?? caller.company!.id,
            },
            invoiceId: id,
            invoiceNumber: invoice.number,
            amount,
            method,
            reference,
            newPaid,
            newStatus,
          },
          reversible: true,
        },
      })

      void emit({
        type: 'invoice.paid',
        companyId: caller.company?.id ?? null,
        subjectType: 'Invoice',
        subjectId: id,
        actorPersonId: caller.person.id,
        payload: {
          invoiceNumber: invoice.number,
          paymentId: payment.id,
          amount,
          method,
          reference,
          paidToDate: newPaid,
          status: newStatus,
          // Whether this closed it. A part payment and a final payment are
          // the same event type with a different answer here, and an ERP
          // consumer needs to tell them apart.
          settled: newStatus === 'PAID',
        },
      })

      return payment
    })

    return NextResponse.json({
      data: {
        payment: {
          id: result.id,
          amount: Number(result.amount),
          method: result.method,
          reference: result.reference,
          receivedAt: result.receivedAt.toISOString(),
        },
        invoice: {
          id,
          number: invoice.number,
          total: totalNum,
          paid: newPaid,
          outstanding: totalNum - newPaid,
          status: newStatus,
        },
        message: newStatus === 'PAID'
          ? `Invoice ${invoice.number} fully paid`
          : `Payment recorded — ${fromUnits(totalNum - newPaid, invoice.currency)} remaining`,
      },
    }, { status: 201 })
  } catch (err: any) {
    reportError('Payment recording failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Payment recording failed' } },
      { status: 500 }
    )
  }
}
