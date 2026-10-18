import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { announceRaised, mayBeSent, markSent } from '@/lib/money/bill-send'

/**
 * POST /api/invoices/:id/submit
 *
 * Sends a bill: ISSUED → SUBMITTED, or a DRAFT raised and submitted in
 * one step.
 *
 * LEGACY_RULES.md §4: Invoice states: DRAFT → ISSUED → SUBMITTED → PAID / PARTIALLY_PAID / CANCELLED
 *
 * A draft is the supplier's twin's (lib/money/supplier-bills). Whoever
 * sends bills at the firm that raised it may send it here, the Owner the
 * twin acts for included: a person pressing Send is not the twin
 * approving its own work, and at a firm where only the Owner sends bills
 * this button is the only way the draft ever goes (release walk,
 * 2026-10-18). The same check and the same writes as a yes in Ask Etyme
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
  const check = await mayBeSent(id, companyId, ['ISSUED', 'DRAFT'])
  if (!check.ok) {
    return NextResponse.json(
      { error: { code: check.code, message: check.says, ...(check.checks ? { checks: check.checks } : {}) } },
      { status: check.status }
    )
  }

  try {
    const sent = await prisma.$transaction((tx) =>
      markSent(tx, { invoiceId: id, companyId, by: { personId: caller.person.id, name: caller.person.name } })
    )
    if (sent.raised) await announceRaised(id, companyId, { personId: caller.person.id })
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
