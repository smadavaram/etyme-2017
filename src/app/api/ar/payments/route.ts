import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { decimalsFor, fromPrismaDecimal } from '@/lib/money'
import { unappliedCash, applyReceipt, type Receipt } from '@/lib/ar-ageing'

/**
 * Cash application — the receipt that names nothing.
 *
 * ── Why this route exists ────────────────────────────────────────────
 *
 * `Payment.invoiceId` was made nullable so that genuinely unapplied cash
 * could be RECORDED. Nothing wrote it. So the schema said the problem was
 * solved and the AR screen carried a gap line admitting it was not:
 *
 *   "N payments arrived and were never keyed against an invoice. They are
 *    not in any figure on this screen — money you have and cannot count is
 *    a different problem from money you are owed, and the queue for
 *    placing it is not built yet."
 *
 * Adding a nullable column is not building a feature. This is the write,
 * the queue and the placing.
 *
 * ── Three verbs ──────────────────────────────────────────────────────
 *
 *   POST    a receipt arrived. Invoice optional — that is the whole point.
 *   GET     what is sitting unplaced, with payer, amount and date.
 *   PATCH   place one against an invoice.
 *
 * The refusals live in `applyReceipt` and are arithmetic, so they are
 * tested as arithmetic: a receipt already placed, a currency that does
 * not match, an invoice already settled, and — the one that loses money —
 * a receipt bigger than the debt, which would mark the invoice paid and
 * leave the excess existing nowhere.
 */

/** Draft and cancelled invoices are not things cash is applied to. */
const NOT_APPLICABLE = ['DRAFT', 'CANCELLED', 'VOID']

// ── The queue ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Cash we cannot place')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Receipts land in a company’s account' } },
      { status: 403 }
    )
  }
  if (
    !caller.permissions.includes('margin.read') &&
    !caller.permissions.includes('pnl.read')
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'You cannot see cash the firm holds and has not placed. It is the same class ' +
            'of fact as what a placement earns.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const now = new Date()

  const rows = await prisma.payment.findMany({
    where: { invoiceId: null, receivedByCompanyId: companyId },
    select: {
      id: true, amount: true, currency: true, method: true, reference: true,
      receivedAt: true, appliedAt: true, invoiceId: true,
      payerCompany: { select: { id: true, name: true } },
    },
    orderBy: { receivedAt: 'desc' },
    take: 2_000,
  })

  const receipts: Receipt[] = rows.map((r) => ({
    id: r.id,
    payerCompanyId: r.payerCompany?.id ?? null,
    payerName: r.payerCompany?.name ?? null,
    currency: r.currency,
    amountMinor: fromPrismaDecimal(r.amount, r.currency).minor,
    receivedAt: r.receivedAt,
    reference: r.reference,
    appliedToInvoiceId: r.invoiceId,
    appliedAt: r.appliedAt,
  }))

  const books = unappliedCash(receipts, now)

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      books: books.map((b) => ({
        currency: b.currency,
        totalMinor: b.totalMinor,
        oldestDays: b.oldestDays,
        says: b.says,
        receipts: b.receipts.map((r) => ({
          id: r.id,
          payerName: r.payerName,
          payerCompanyId: r.payerCompanyId,
          currency: r.currency,
          amountMinor: r.amountMinor,
          receivedAt: r.receivedAt,
          reference: r.reference,
        })),
      })),
      note:
        'Money that arrived and was never keyed against an invoice. It is not netted ' +
        'against what you are owed — until somebody says these are the same money, they ' +
        'are two separate facts, and netting them hides both.',
    },
  })
}

// ── Recording a receipt ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Recording a receipt')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Receipts land in a company’s account' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Recording a receipt needs payments.record' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))

  const currency = String(body.currency ?? 'USD').toUpperCase()
  const value = Number(body.amount)
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A receipt is money arriving, so a positive amount', field: 'amount' } },
      { status: 422 }
    )
  }

  const receivedAt = body.receivedAt ? new Date(String(body.receivedAt)) : new Date()
  if (Number.isNaN(receivedAt.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That receivedAt could not be read', field: 'receivedAt' } },
      { status: 422 }
    )
  }

  const invoiceId = body.invoiceId ? String(body.invoiceId) : null
  const payerCompanyId = body.payerCompanyId ? String(body.payerCompanyId) : null

  // Where an invoice IS named, the same arithmetic applies as when one is
  // chosen later. A receipt keyed straight onto an invoice it cannot
  // settle is the same mistake, made earlier.
  if (invoiceId) {
    const inv = await loadInvoice(invoiceId, companyId)
    if (!inv) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No such invoice of ours', field: 'invoiceId' } },
        { status: 404 }
      )
    }
    const verdict = applyReceipt(
      {
        currency,
        amountMinor: Math.round(value * 10 ** decimalsFor(currency)),
        appliedToInvoiceId: null,
      },
      inv.forArithmetic
    )
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: verdict.refusal!, message: verdict.says, field: 'invoiceId' } },
        { status: 422 }
      )
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        payerCompanyId,
        receivedByCompanyId: companyId,
        amount: value,
        currency,
        method: body.method ? String(body.method) : null,
        reference: body.reference ? String(body.reference) : null,
        receivedAt,
        appliedAt: invoiceId ? new Date() : null,
        appliedById: invoiceId ? realPersonId(caller) : null,
      },
      select: { id: true, amount: true, currency: true, receivedAt: true, invoiceId: true },
    })

    if (invoiceId) await rollUpInvoice(tx, invoiceId)
    return payment
  })

  return NextResponse.json(
    {
      data: {
        payment: created,
        note: invoiceId
          ? 'Recorded and placed against the invoice.'
          : 'Recorded as unapplied cash. It is on the queue with the payer, the amount and ' +
            'the date — which is what somebody matches by hand — and it is counted as money ' +
            'held rather than money owed.',
      },
    },
    { status: 201 }
  )
}

// ── Placing one ───────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Placing a receipt')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Receipts land in a company’s account' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Placing a receipt needs payments.record' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const paymentId = String(body.paymentId ?? '')
  const invoiceId = String(body.invoiceId ?? '')

  if (!paymentId || !invoiceId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Which receipt, and against which invoice?',
          field: paymentId ? 'invoiceId' : 'paymentId',
        },
      },
      { status: 422 }
    )
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true, amount: true, currency: true, invoiceId: true,
      receivedByCompanyId: true,
    },
  })
  if (!payment || payment.receivedByCompanyId !== companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such receipt of ours' } },
      { status: 404 }
    )
  }

  const inv = await loadInvoice(invoiceId, companyId)
  if (!inv) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such invoice of ours', field: 'invoiceId' } },
      { status: 404 }
    )
  }

  const verdict = applyReceipt(
    {
      currency: payment.currency,
      amountMinor: fromPrismaDecimal(payment.amount, payment.currency).minor,
      appliedToInvoiceId: payment.invoiceId,
    },
    inv.forArithmetic
  )

  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: verdict.refusal!, message: verdict.says } },
      { status: 422 }
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { invoiceId, appliedAt: new Date(), appliedById: realPersonId(caller) },
    })
    await rollUpInvoice(tx, invoiceId)
  })

  return NextResponse.json({
    data: {
      paymentId,
      invoiceId,
      invoiceOwesAfterMinor: verdict.invoiceOwesAfterMinor,
      note: verdict.says,
    },
  })
}

// ── Shared ────────────────────────────────────────────────────────────

async function loadInvoice(invoiceId: string, companyId: string) {
  const inv = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      engagement: { msa: { vendorId: companyId } },
      status: { notIn: NOT_APPLICABLE },
    },
    select: { id: true, number: true, currency: true, total: true, paid: true },
  })
  if (!inv) return null

  return {
    row: inv,
    forArithmetic: {
      number: inv.number,
      currency: inv.currency,
      totalMinor: fromPrismaDecimal(inv.total, inv.currency).minor,
      paidMinor: fromPrismaDecimal(inv.paid, inv.currency).minor,
    },
  }
}

/**
 * The invoice header follows its receipts, never the other way round.
 *
 * `Invoice.paid` is a Decimal and every screen reads it, so it has to
 * agree with the rows underneath. Recomputed from the receipts rather
 * than incremented, because an increment and a retry produce a client who
 * has apparently paid twice.
 */
async function rollUpInvoice(
  tx: { payment: { findMany: Function }; invoice: { findUnique: Function; update: Function } },
  invoiceId: string
) {
  const inv = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { currency: true, total: true, status: true },
  })
  if (!inv) return

  const receipts = await tx.payment.findMany({
    where: { invoiceId },
    select: { amount: true },
  })

  const paid = receipts.reduce(
    (n: number, p: { amount: { toString(): string } }) => n + parseFloat(p.amount.toString()),
    0
  )
  const total = parseFloat(inv.total.toString())

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paid,
      // Settled only when it is actually settled. A status is what
      // somebody typed; this is what the money says.
      status: paid >= total ? 'PAID' : inv.status === 'PAID' ? 'ISSUED' : inv.status,
    },
  })
}
