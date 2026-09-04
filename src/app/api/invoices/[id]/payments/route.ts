import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'

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

  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires payments.record permission' } },
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

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      total: true,
      paid: true,
      status: true,
      engagementId: true,
    },
  })

  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
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
        message: `Payment of $${amount.toFixed(2)} exceeds outstanding balance of $${outstanding.toFixed(2)}`,
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
          method: method ?? null,
          reference: reference ?? null,
        },
      })

      await tx.invoice.update({
        where: { id },
        data: {
          paid: newPaid,
          status: newStatus,
        },
      })

      await tx.automationLog.create({
        data: {
          companyId: caller.company!.id,
          action: 'PAYMENT_RECORDED',
          summary: `Payment of $${amount.toFixed(2)} recorded on invoice ${invoice.number}. ${newStatus === 'PAID' ? 'Invoice now fully paid.' : `$${(totalNum - newPaid).toFixed(2)} outstanding.`}`,
          reason: `Recorded by ${caller.person.name}`,
          payload: {
            paymentId: payment.id,
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
          : `Payment recorded — $${(totalNum - newPaid).toFixed(2)} remaining`,
      },
    }, { status: 201 })
  } catch (err: any) {
    console.error('Payment recording failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Payment recording failed' } },
      { status: 500 }
    )
  }
}
