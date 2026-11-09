import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { announceRaised, mayBeSent, maySendBill, markSent, planSend, tellPayerAfterSending } from '@/lib/money/bill-send'
import { sendBillToCustomer } from '@/lib/notify/bill-delivery'
import { partiesOf } from '@/lib/money/invoice-parties'
import { notYoursToSendSays } from '@/lib/money/bill-sent-view'

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

  const { id } = await params

  // Whose bill it is, before whose role: a seat at the firm that pays the
  // bill is told who sends it, never that a role at its own firm does
  // (walk 9, 2026-11-09: Northbend's AP clerk was told its Owner sends
  // Brightmoor's bill, and the Owner was then refused too).
  const whose = await prisma.invoice.findUnique({
    where: { id },
    select: {
      engagement: { select: { msa: { select: { vendorId: true, clientId: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } } } },
      workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
    },
  })
  const notYours = whose ? notYoursToSendSays(partiesOf({ agreement: whose.engagement.msa, order: whose.workOrder }), caller.company?.id) : null
  if (notYours) {
    return NextResponse.json({ error: { code: 'NOT_YOURS_TO_SEND', message: notYours } }, { status: 403 })
  }

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Sending a bill', needs: 'invoices.issue', kind: caller.company?.kind, companyName: caller.company?.name }) } },
      { status: 403 }
    )
  }

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
  // The billing address was asked by `maySendBill` a moment ago, which refuses a firm with none.
  const check = await mayBeSent(id, companyId, ['ISSUED', 'DRAFT'], { addressRead: true })
  if (!check.ok) {
    return NextResponse.json(
      { error: { code: check.code, message: check.says, ...(check.checks ? { checks: check.checks } : {}), ...(check.step ? { step: check.step } : {}) } },
      { status: check.status }
    )
  }

  try {
    // Read first, write short: everything the sending reads is read before
    // its transaction (`planSend`), so the transaction holds a connection
    // only for the writes (the founder-scale simulation, 2026-11-01: sends
    // ran out of time inside it under load).
    const plan = await planSend(id)
    const sent = await prisma.$transaction((tx) =>
      markSent(tx, { invoiceId: id, companyId, by: { personId: caller.person.id, name: caller.person.name }, plan })
    )
    // The payer's people told in the app, before the letter goes.
    const told = await tellPayerAfterSending(id, companyId)
    // What the sending read is handed on, so the event reads nothing again.
    if (sent.raised) await announceRaised(id, companyId, { personId: caller.person.id }, sent)
    // Now that the bill is sent, it goes to the firm that pays it: a
    // letter off Etyme, a notice on it (lib/notify/bill-delivery). Outside
    // the transaction, because a letter cannot be called back; and a
    // failure here never unsends the bill — it says it was not delivered,
    // and Send again is the way it goes.
    // The bill as the notice read it is handed on, so the letter does not read it again.
    const delivered = await sendBillToCustomer({ invoiceId: id, byPersonId: caller.person.id, read: told.read }).catch((err) => {
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
        // Said beside the bill, never a reason it was held: work outside
        // the window of the order it is on (`orderWindowSays`).
        notes: check.notes,
        // Whom it reached, in the Bills page's own sentence: "Sent to
        // dana@acme.com on Oct 19", or why it was not. Null where the
        // delivery itself failed and staff were told.
        delivery: delivered?.says ?? null,
        // Where nobody at the payer can record a payment yet, the sender reads it.
        ...(told.why ? { payerNotice: told.why } : {}),
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
