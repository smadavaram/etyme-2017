import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { invoiceScope } from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'
import { dueOn, resolveBillingTerms } from '@/lib/billing-cascade'
import { ORDER_HEADER_SELECT, termsFor } from '@/lib/money/order-terms'
import { partiesOf } from '@/lib/money/invoice-parties'

/**
 * POST /api/invoices/:id/received
 *
 * The day the client says the invoice landed.
 *
 * ── Why this is a route and not a column somebody backfills ──────────
 *
 * NET 30 runs from receipt almost everywhere it is written down, and
 * until this exists the receipt date is a fact nobody in the system
 * holds. A due date on RECEIPT_DATE terms is therefore not late, not
 * early and not thirty days from anything — it is unknown, and the
 * invoice says so instead of aging.
 *
 * Recording it starts the clock. The due date is recomputed here and
 * written, so every reader downstream — the aging buckets, the dunning
 * ladder, the screen — sees one date and not three opinions.
 *
 * ── Who may say it ───────────────────────────────────────────────────
 *
 * Either party to the invoice. The client confirming it arrived is the
 * contractual fact; the supplier recording "their AP acknowledged it on
 * Tuesday" is how it actually reaches the system most days, and refusing
 * that would leave the clock stopped on every invoice a client never
 * clicks. Which of them said it is worth keeping, and is the one piece
 * of this not yet written — see the note in the transaction below.
 *
 * ── What it refuses ──────────────────────────────────────────────────
 *
 * A date in the future, and a date before we raised it. Both would move
 * a due date somewhere nobody agreed to, and a receipt that predates the
 * invoice is a typo every time.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const scope = invoiceScope(caller)
  const invoice = scope
    ? await prisma.invoice.findFirst({
        where: { id, ...scope },
        select: {
          id: true, number: true, issuedAt: true, periodEnd: true, receivedAt: true, dueAt: true,
          // Who this is addressed to, where no agreement says.
          workOrder: {
            select: {
              number: true,
              issuedById: true, issuedToId: true,
              issuedBy: { select: { id: true, name: true } },
              issuedTo: { select: { id: true, name: true } },
            },
          },
          engagement: {
            select: {
              msa: {
                select: {
                  vendorId: true, clientId: true,
                  paymentTerms: true, paymentTermsFrom: true,
                  client: { select: { id: true, name: true } },
                  vendor: { select: { id: true, name: true } },
                },
              },
              sellContracts: {
                select: {
                  paymentTerms: true, paymentTermsFrom: true,
                  // The net days are the purchase order's where this
                  // placement is on one, so recording receipt moves the
                  // date the document promised and not a stale copy.
                  workOrder: { select: ORDER_HEADER_SELECT },
                },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
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

  const body = await request.json().catch(() => ({}))
  const when = body?.receivedAt ? new Date(body.receivedAt) : new Date()

  if (Number.isNaN(when.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That is not a date.', field: 'receivedAt' } },
      { status: 422 }
    )
  }

  const now = new Date()
  if (when.getTime() > now.getTime() + 86_400_000) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'receivedAt',
          message:
            `${invoice.number} cannot have been received on ${when.toISOString().slice(0, 10)}, ` +
            'because that day has not happened. Payment terms would start in the future.',
        },
      },
      { status: 422 }
    )
  }

  const issued = invoice.issuedAt
  if (issued && when.getTime() < issued.getTime() - 86_400_000) {
    return NextResponse.json(
      {
        error: {
          code: 'BEFORE_ISSUE',
          field: 'receivedAt',
          message:
            `${invoice.number} was raised on ${issued.toISOString().slice(0, 10)} and cannot have ` +
            `been received on ${when.toISOString().slice(0, 10)}, which is before it existed.`,
        },
      },
      { status: 422 }
    )
  }

  // The same cascade the invoice was raised under: this contract, then
  // the agreement, then the end of the work period.
  const contract = invoice.engagement.sellContracts[0] ?? null
  const onOrder = contract ? termsFor('SELL', contract) : null
  const msa = invoice.engagement.msa
  const customer =
    partiesOf({ agreement: msa, order: invoice.workOrder }).client?.name ?? 'the client'
  const terms = resolveBillingTerms({
    company: { name: caller.company?.name ?? 'this company' },
    // Null where the engagement has no agreement behind it. The cascade
    // then runs order → contract → default and says which answered.
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
    order:
      onOrder?.from.paymentTermsDays === 'ORDER'
        ? { paymentTermsDays: onOrder.paymentTermsDays, number: onOrder.orderNumber }
        : null,
  })

  const due = dueOn({
    anchor: terms.paymentTermsFrom.value,
    days: terms.paymentTermsDays.value,
    periodEnd: invoice.periodEnd,
    issuedAt: issued ?? invoice.periodEnd,
    receivedAt: when,
    approvedAt: null,
  })

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id },
        data: {
          receivedAt: when,
          // Only where the clock actually runs from receipt. On terms
          // counted from the period end, receipt is worth recording and
          // changes nothing about when the money is due — moving the
          // date there would rewrite a promise nobody renegotiated.
          ...(terms.paymentTermsFrom.value === 'RECEIPT_DATE' ? { dueAt: due.dueAt } : {}),
        },
        select: { id: true, number: true, receivedAt: true, dueAt: true },
      })

      // ── The missing line, named rather than left silent ───────────
      //
      // This belongs in the automation log as an ATTRIBUTED act — a
      // person said the client received it, and on receipt terms that
      // moves a due date, so who said so is worth keeping.
      //
      // It is not written yet because a new action name needs a rung in
      // `src/lib/autonomy.ts`, which is the architect's file, and the
      // inventory has a second test that fails on a rung nothing writes.
      // The two changes have to land in one commit, and no single agent
      // may make both. Asked for: `INVOICE_RECEIPT_RECORDED`,
      // ATTRIBUTED, basis RULE. The write goes in beside it.

      return row
    })

    return NextResponse.json({
      data: {
        id: saved.id,
        number: saved.number,
        receivedAt: saved.receivedAt?.toISOString() ?? null,
        dueAt: saved.dueAt.toISOString(),
        anchor: terms.paymentTermsFrom.value,
        clockStarted: due.clockStarted,
        says: due.says,
      },
    })
  } catch (err) {
    reportError('Recording invoice receipt failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Could not record the receipt' } },
      { status: 500 }
    )
  }
}
