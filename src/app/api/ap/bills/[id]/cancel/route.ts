import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { mayRecordSupplierInvoice, NOT_THE_PAYING_DESK } from '@/lib/money/desks'
import { booksFor, noteMoneyRead, seatedRefusal } from '@/lib/money/seated-books'
import { amount } from '@/lib/money-display'

/**
 * POST /api/ap/bills/:id/cancel   { reason }
 *
 * Cancel an invoice receipt this firm typed in by mistake — keyed twice,
 * keyed against the wrong order or the wrong week, or withdrawn by the
 * supplier — with a reason.
 *
 * Until this door the only correction was a direct write, so a mis-keyed
 * receipt either stayed on the record holding its week, or vanished with
 * no word of who removed it or why.
 *
 * What it does, and what it will not:
 *
 *   · The receipt stays on the record, CANCELLED, with its lines; it is
 *     never revived. A corrected one is typed in again, and a cancelled
 *     receipt holds no week, expense or milestone and draws nothing on its
 *     order (lib/money/keyed-receipt, lib/money/order-drawn).
 *   · Not once money has gone against it. A receipt with anything paid on
 *     it is a payment to undo first, never a receipt to cancel.
 *   · Not while it sits in a payment run waiting to be released: the run
 *     was approved with it in, so the run is cancelled first.
 *   · Written as `INVOICE_RECEIPT_CANCELLED`, a person's own act with the
 *     reason in their words, not reversible.
 *
 * Who: whoever records invoice receipts — the desk that may have keyed it
 * wrong is the desk that may take it back (`mayRecordSupplierInvoice`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Invoice receipts')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invoice receipt is owed by a company' } },
      { status: 403 }
    )
  }
  const { books: reading, error: booksError } = await booksFor(caller, request)
  if (booksError) return booksError

  if (!mayRecordSupplierInvoice(reading.caller.permissions)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: reading.seat ? seatedRefusal(reading.seat, 'Cancelling an invoice receipt') : NOT_THE_PAYING_DESK,
        },
      },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const reason = String(body.reason ?? '').trim()
  if (reason.length < 5) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say why it is cancelled — keyed twice, the wrong order, withdrawn by the supplier. It stays on the record with the receipt.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  const bill = await prisma.vendorBill.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, number: true, status: true, totalCents: true, paidCents: true, currency: true,
      vendorCompanyId: true, buyContractId: true, workOrderId: true, periodStart: true, periodEnd: true,
      vendorCompany: { select: { name: true } },
      _count: { select: { payments: true } },
      paymentRunItems: {
        where: { run: { status: { in: ['DRAFT', 'APPROVED'] } } },
        select: { run: { select: { id: true, status: true, scheduledFor: true } } },
      },
    },
  })
  if (!bill || bill.companyId !== reading.companyId) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such invoice receipt here' } }, { status: 404 })
  }
  const vendorName = bill.vendorCompany.name
  noteMoneyRead(reading, `Invoice receipt ${bill.number} cancelled`)

  if (bill.status === 'CANCELLED') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `${vendorName}’s invoice ${bill.number} is already cancelled.` } },
      { status: 409 }
    )
  }
  if (bill.paidCents > 0 || bill._count.payments > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'PAID',
          message:
            `${amount(bill.paidCents, bill.currency)} has already been paid on ${vendorName}’s invoice ${bill.number}, ` +
            `so it is not cancelled. Money that went out is undone with ${vendorName}, not by taking the receipt off the record.`,
        },
      },
      { status: 409 }
    )
  }
  const inRun = bill.paymentRunItems[0]?.run
  if (inRun) {
    return NextResponse.json(
      {
        error: {
          code: 'IN_A_RUN',
          message:
            `${vendorName}’s invoice ${bill.number} is in a payment run that is ${inRun.status === 'DRAFT' ? 'being put together' : 'approved and waiting to be released'}. ` +
            `Cancel the run first, then this receipt.`,
          runId: inRun.id,
        },
      },
      { status: 409 }
    )
  }

  // Moved only from the state read above, so a payment pressed in the
  // same moment finds it moved, or this finds it paid — never both.
  const moved = await prisma.$transaction(async (tx) => {
    const m = await tx.vendorBill.updateMany({
      where: { id: bill.id, status: bill.status, paidCents: 0 },
      data: { status: 'CANCELLED' },
    })
    if (m.count !== 1) return false
    await tx.automationLog.create({
      data: {
        companyId: reading.companyId,
        action: 'INVOICE_RECEIPT_CANCELLED',
        summary: `${vendorName}’s invoice ${bill.number} for ${amount(bill.totalCents, bill.currency)} cancelled by ${caller.person.name}`,
        reason,
        payload: {
          vendorBillId: bill.id,
          number: bill.number,
          vendorCompanyId: bill.vendorCompanyId,
          buyContractId: bill.buyContractId,
          workOrderId: bill.workOrderId,
          totalCents: bill.totalCents,
          currency: bill.currency,
          periodStart: bill.periodStart?.toISOString().slice(0, 10) ?? null,
          periodEnd: bill.periodEnd?.toISOString().slice(0, 10) ?? null,
          statusBefore: bill.status,
          byPersonId: caller.person.id,
          seatId: reading.seat?.id ?? null,
        },
        reversible: false,
      },
    })
    return true
  })
  if (!moved) {
    return NextResponse.json(
      { error: { code: 'ALREADY_MOVED', message: `${vendorName}’s invoice ${bill.number} changed while this was pressed. Open it again.` } },
      { status: 409 }
    )
  }

  return NextResponse.json({
    data: {
      id: bill.id,
      number: bill.number,
      status: 'CANCELLED',
      reason,
      by: caller.person.name,
      note:
        `Cancelled, and kept on the record with the reason. It holds no week and draws nothing on its order now, ` +
        `so ${vendorName}’s corrected invoice can be recorded in its place.`,
    },
  })
}
