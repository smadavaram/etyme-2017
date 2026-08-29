import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { decimalsFor } from '@/lib/money'
import { canAttachPoToBuyContract } from '@/lib/purchase-order'

/**
 * Supplier bills — the record without which nothing on the AP screen exists.
 *
 * ── Why this route is not optional ───────────────────────────────────
 *
 * `GET /api/ap` measures how long money takes to travel down a chain.
 * Every figure on it — days payable, chain float, who is financing whom —
 * comes off `VendorBill`, and a column nothing writes to is a feature
 * nobody has. So the measuring and the recording land together.
 *
 * ── Three dates, deliberately ────────────────────────────────────────
 *
 * `receivedAt`, `dueAt`, `paidAt`. Most systems keep one and call it the
 * invoice date, which is exactly what makes payment delay unmeasurable:
 * with one date you can say what is outstanding and you cannot say
 * whether anybody was late, and you certainly cannot say who funded the
 * gap.
 *
 *   **receivedAt** starts the clock. Not the end of the period the bill
 *   covers — a period ending on the 31st and billed on the 6th is six
 *   days nobody was counting.
 *
 *   **dueAt** is the terms, as they were actually applied to this bill
 *   rather than as a policy somewhere says they should be.
 *
 *   **paidAt** is the day money left. Null until it does, and never
 *   inferred from a status: "APPROVED" is a decision and not a payment.
 *
 * ── What it refuses ──────────────────────────────────────────────────
 *
 * A duplicate bill number from the same supplier, because paying the
 * same invoice twice is the commonest and most expensive AP error and
 * the schema already carries the unique key for it.
 *
 * A bill against a buy contract that employs somebody directly. You do
 * not receive a supplier invoice from your own W2 employee — they are
 * paid through payroll — and the same check that refuses a purchase
 * order there refuses a bill here.
 */

/** RECEIVED · APPROVED · DISPUTED · PAID · CANCELLED */
const STATUSES = ['RECEIVED', 'APPROVED', 'DISPUTED', 'PAID', 'CANCELLED']

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Supplier bills')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A supplier bill is owed by a company' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Recording what the firm owes a supplier needs invoices.issue',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))

  const vendorCompanyId = String(body.vendorCompanyId ?? '')
  const number = String(body.number ?? '').trim()
  const currency = String(body.currency ?? 'USD').toUpperCase()
  const buyContractId = body.buyContractId ? String(body.buyContractId) : null
  const purchaseOrderId = body.purchaseOrderId ? String(body.purchaseOrderId) : null
  const projectOrderId = body.projectOrderId ? String(body.projectOrderId) : null
  const payWhenPaid = body.payWhenPaid === true

  if (!vendorCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A bill comes from a named supplier', field: 'vendorCompanyId' } },
      { status: 422 }
    )
  }
  if (vendorCompanyId === companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A company cannot bill itself. A bill has two parties.',
          field: 'vendorCompanyId',
        },
      },
      { status: 422 }
    )
  }
  if (!number) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A bill needs the supplier’s own number — it is how they will chase it',
          field: 'number',
        },
      },
      { status: 422 }
    )
  }

  // Accepted in whole currency, the way it reads on the supplier's
  // invoice, and stored in minor units like everything else. The exponent
  // comes from the currency.
  const totalValue = Number(body.total)
  if (!Number.isFinite(totalValue) || totalValue <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A bill is for a positive amount', field: 'total' } },
      { status: 422 }
    )
  }
  const totalCents = Math.round(totalValue * 10 ** decimalsFor(currency))

  const receivedAt = body.receivedAt ? new Date(String(body.receivedAt)) : new Date()
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : null
  const periodStart = body.periodStart ? new Date(String(body.periodStart)) : null
  const periodEnd = body.periodEnd ? new Date(String(body.periodEnd)) : null

  for (const [field, d] of [
    ['receivedAt', receivedAt], ['dueAt', dueAt], ['paidAt', paidAt],
    ['periodStart', periodStart], ['periodEnd', periodEnd],
  ] as const) {
    if (d && Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `That ${field} could not be read`, field } },
        { status: 422 }
      )
    }
  }

  if (!dueAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'A bill needs a due date. Without one there are no terms to measure against, ' +
            'and every delay figure on this supplier becomes a gap rather than a number.',
          field: 'dueAt',
        },
      },
      { status: 422 }
    )
  }
  if (dueAt < receivedAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A bill cannot fall due before it arrived',
          field: 'dueAt',
        },
      },
      { status: 422 }
    )
  }

  const status = String(body.status ?? (paidAt ? 'PAID' : 'RECEIVED')).toUpperCase()
  if (!STATUSES.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Status must be one of ${STATUSES.join(', ')}`, field: 'status' } },
      { status: 422 }
    )
  }

  const vendor = await prisma.company.findUnique({
    where: { id: vendorCompanyId },
    select: { id: true, name: true },
  })
  if (!vendor) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such supplier' } }, { status: 404 })
  }

  // ── A bill is not received from your own employee ───────────────────
  //
  // The same contradiction the purchase-order check refuses: a W2 buy
  // contract has no supplier on the other side of it. A person paid
  // through payroll does not send an invoice, and a worker carried here
  // as a supplier is the shape of a misclassification finding.
  if (buyContractId) {
    const bc = await prisma.buyContract.findUnique({
      where: { id: buyContractId },
      select: { id: true, companyId: true, contractType: true, vendorCompanyId: true },
    })
    if (!bc || bc.companyId !== companyId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No such buy contract here', field: 'buyContractId' } },
        { status: 404 }
      )
    }
    const allowed = canAttachPoToBuyContract({
      vendorCompanyId: bc.vendorCompanyId,
      contractType: bc.contractType,
    })
    if (!allowed.allowed) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: allowed.reason, field: 'buyContractId' } },
        { status: 422 }
      )
    }
  }

  const duplicate = await prisma.vendorBill.findUnique({
    where: { companyId_vendorCompanyId_number: { companyId, vendorCompanyId, number } },
    select: { id: true, totalCents: true, receivedAt: true },
  })
  if (duplicate) {
    return NextResponse.json(
      {
        error: {
          code: 'DUPLICATE',
          message:
            `${vendor.name} bill ${number} is already recorded, received on ` +
            `${duplicate.receivedAt.toISOString().slice(0, 10)}. Paying the same invoice ` +
            `twice is the commonest and most expensive mistake on this side of the ledger, ` +
            `so it is refused rather than added.`,
          field: 'number',
        },
      },
      { status: 409 }
    )
  }

  const bill = await prisma.vendorBill.create({
    data: {
      companyId,
      vendorCompanyId,
      number,
      buyContractId,
      purchaseOrderId,
      projectOrderId,
      periodStart,
      periodEnd,
      currency,
      totalCents,
      paidCents: paidAt ? totalCents : Math.round(Number(body.paid ?? 0) * 10 ** decimalsFor(currency)),
      receivedAt,
      dueAt,
      paidAt,
      status,
      payWhenPaid,
    },
    select: { id: true, number: true, totalCents: true, currency: true, dueAt: true },
  })

  return NextResponse.json({
    data: {
      bill,
      note: payWhenPaid
        ? 'Recorded with a pay-when-paid clause. That clause is where the wait travels ' +
          'downwards, so it is flagged on the AP screen rather than filed away.'
        : 'Recorded. The three dates are what make the delay on this supplier measurable ' +
          'at all — received, due, and the day money actually left.',
    },
  })
}

/**
 * PATCH /api/ap/bills — record that a bill was paid.
 *
 * `paidAt` is the day money left and it is never inferred from a status.
 * Marking a bill APPROVED is a decision somebody made; it is not a
 * payment, and treating it as one would make every float figure on the
 * chain wrong in the flattering direction.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Supplier bills')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A supplier bill is owed by a company' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Recording a payment needs payments.record' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which bill?', field: 'id' } },
      { status: 422 }
    )
  }

  const bill = await prisma.vendorBill.findUnique({
    where: { id },
    select: { id: true, companyId: true, currency: true, totalCents: true, paidCents: true, receivedAt: true },
  })
  if (!bill || bill.companyId !== caller.company.id) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such bill here' } }, { status: 404 })
  }

  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date()
  if (Number.isNaN(paidAt.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That paidAt could not be read', field: 'paidAt' } },
      { status: 422 }
    )
  }
  if (paidAt < bill.receivedAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A bill cannot be paid before it arrived',
          field: 'paidAt',
        },
      },
      { status: 422 }
    )
  }

  const paidValue = body.amount != null ? Number(body.amount) : null
  const addCents =
    paidValue == null
      ? bill.totalCents - bill.paidCents
      : Math.round(paidValue * 10 ** decimalsFor(bill.currency))

  if (!Number.isFinite(addCents) || addCents <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A payment is a positive amount', field: 'amount' } },
      { status: 422 }
    )
  }

  const newPaid = bill.paidCents + addCents
  const settled = newPaid >= bill.totalCents

  const updated = await prisma.vendorBill.update({
    where: { id },
    data: {
      paidCents: newPaid,
      // Only a bill paid in full carries a paid date. A part payment has
      // not closed the obligation, and dating it as if it had would
      // report the first instalment as the day the supplier was paid.
      paidAt: settled ? paidAt : null,
      status: settled ? 'PAID' : 'APPROVED',
    },
    select: { id: true, paidCents: true, totalCents: true, paidAt: true, status: true },
  })

  return NextResponse.json({
    data: {
      bill: updated,
      note: settled
        ? 'Paid in full. This is the date every float figure on this supplier counts to.'
        : 'Part paid. No paid date is set — the obligation is still open, and dating it ' +
          'now would report the first instalment as the day they were paid.',
    },
  })
}
