import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { announceRaised, mayBeSent, maySendBill, markSent } from '@/lib/money/bill-send'
import { sendBillToCustomer } from '@/lib/notify/bill-delivery'

/**
 * POST /api/invoices/:id/submit
 *
 * Sends a bill: ISSUED → SUBMITTED, or a DRAFT raised and submitted in
 * one step.
 *
 * LEGACY_RULES.md §4: Invoice states: DRAFT → ISSUED → SUBMITTED → PAID / PARTIALLY_PAID / CANCELLED
 *
 * A draft is the supplier's twin's (lib/money/supplier-bills). Whoever
 * else sends bills at the firm that raised it sends it here; the Owner
 * the twin drafted it for sends it only where nobody else at the firm
 * sends bills (`maySendBill`, 2026-10-26: decision #2 of 2026-10-19
 * covers the document, not the door). The same check and the same writes as a yes in Ask Etyme
 * (`lib/money/bill-send`), with the sender recorded.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Sending a bill', needs: 'invoices.issue', kind: caller.company?.kind, companyName: caller.company?.name }) } },
      { status: 403 }
    )
  }

  const { id } = await params

  // ── Ours to submit, and through the check ──────────────────────────
  //
  // A bill is submitted by the firm that raised it, which the agreement,
  // the order, or a line on the invoice can each say
  // (`lib/money/invoice-parties`), and an invoice that does not match its
  // order and its signed weeks is not sent — not flagged, not warned
  // about. Both are asked in `lib/money/bill-send`, the one door the
  // supplier's twin's `bill.send` goes through too (2026-10-18), with the
  // firm's own `...invoicesRaisedBy(companyId)` scope.
  const companyId = caller.company?.id ?? null
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'A bill is between two companies, and your seat is not at one.' } },
      { status: 404 }
    )
  }
  // Who sends it, before the check writes anything. A bill Ask Etyme
  // drafted on this person's authority is sent by another seat that sends
  // bills wherever one exists, and by them only where nobody else does
  // (`maySendBill`; coordinator, 2026-10-26, on the founder's decision #2
  // of 2026-10-19). A bill a person drafted is sent by any seat that sends bills.
  const who = await maySendBill({ personId: caller.person.id, companyId, permissions: caller.permissions }, { id })
  if (!who.ok) {
    // A skipped setup step is not a missing permission: 409, with the step it names.
    return who.code === 'SETUP_INCOMPLETE'
      ? NextResponse.json({ error: { code: who.code, message: who.says, step: who.step } }, { status: 409 })
      : NextResponse.json({ error: { code: who.code, message: who.says } }, { status: 403 })
  }
  const check = await mayBeSent(id, companyId, ['ISSUED', 'DRAFT'])
  if (!check.ok) {
    return NextResponse.json(
      { error: { code: check.code, message: check.says, ...(check.checks ? { checks: check.checks } : {}), ...(check.step ? { step: check.step } : {}) } },
      { status: check.status }
    )
  }

  try {
    const sent = await prisma.$transaction((tx) =>
      markSent(tx, { invoiceId: id, companyId, by: { personId: caller.person.id, name: caller.person.name } })
    )
    if (sent.raised) await announceRaised(id, companyId, { personId: caller.person.id })
    // Now that the bill is sent, it goes to the firm that pays it: a
    // letter off Etyme, a notice on it (lib/notify/bill-delivery). Outside
    // the transaction, because a letter cannot be called back; and a
    // failure here never unsends the bill — it says it was not delivered,
    // and Send again is the way it goes.
    const delivered = await sendBillToCustomer({ invoiceId: id, byPersonId: caller.person.id }).catch((err) => {
      void reportError('bill-delivery', err, { companyId }).catch(() => {})
      return null
    })
    const result = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, status: true, total: true, currency: true, submittedAt: true, dueAt: true } })
    return NextResponse.json({
      data: {
        invoice: {
          id: result.id,
          number: result.number,
          status: result.status,
          total: Number(result.total),
          currency: result.currency,
          submittedAt: result.submittedAt?.toISOString() ?? sent.submittedAt.toISOString(),
          dueAt: result.dueAt.toISOString(),
        },
        message: sent.raised ? `Bill ${result.number} raised and sent for client review` : `Bill ${result.number} submitted for client review`,
        // Whom it reached, in the Bills page's own sentence: "Sent to
        // dana@acme.com on Oct 19", or why it was not. Null where the
        // delivery itself failed and staff were told.
        delivery: delivered?.says ?? null,
        // Where nobody at the payer can record a payment yet, the sender reads it.
        ...(sent.payerNotice.why ? { payerNotice: sent.payerNotice.why } : {}),
      },
    })
  } catch (err: any) {
    if (err instanceof Error && err.message.startsWith('ALREADY_MOVED')) {
      return NextResponse.json(
        { error: { code: 'INVALID_STATE', message: 'This bill was sent a moment ago by somebody else.' } },
        { status: 409 }
      )
    }
    reportError('Invoice submission failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The bill could not be submitted' } },
      { status: 500 }
    )
  }
}
