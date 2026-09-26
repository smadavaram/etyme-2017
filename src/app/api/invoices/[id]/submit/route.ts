import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { matchAndRecord } from '@/lib/invoice-loop'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'

/**
 * POST /api/invoices/:id/submit
 *
 * Transitions an invoice from ISSUED → SUBMITTED.
 *
 * LEGACY_RULES.md §4: Invoice states: DRAFT → ISSUED → SUBMITTED → PAID / PARTIALLY_PAID / CANCELLED
 *
 * Only ISSUED invoices can be submitted. Sets submittedAt to now and writes
 * an AutomationLog entry for the transition.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires invoices.issue permission' } },
      { status: 403 }
    )
  }

  const { id } = await params

  // ── Ours to submit ─────────────────────────────────────────────────
  //
  // The permission above says this caller may issue invoices at their
  // own company. It says nothing about whose invoice this is, and an
  // invoice id is not a secret — so this route loaded any row by id and
  // pushed it into the three-way match on somebody else's behalf. It
  // even selected the two parties off the agreement and then compared
  // them to nothing.
  //
  // A bill is submitted by the firm that raised it, which the agreement,
  // the order, or a line on the invoice can each say
  // (`lib/money/invoice-parties`).
  const companyId = caller.company?.id ?? null
  const invoice = companyId
    ? await prisma.invoice.findFirst({
        where: { id, ...invoicesRaisedBy(companyId) },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          currency: true,
          engagementId: true,
          matchAttempt: true,
        },
      })
    : null

  if (!invoice) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: companyId
            ? 'No such invoice of yours. A bill is submitted by the firm that raised it.'
            : 'An invoice is a bill between two companies, and your seat is not at one.',
        },
      },
      { status: 404 }
    )
  }

  if (invoice.status !== 'ISSUED') {
    return NextResponse.json(
      { error: {
        code: 'INVALID_STATE',
        message: `Cannot submit invoice in "${invoice.status}" status — only ISSUED invoices can be submitted`,
      }},
      { status: 409 }
    )
  }

  // ── The control ──
  // Purchase order, approved timesheet, invoice. An invoice that does not
  // match cannot be sent to a client for payment — not flagged, not warned
  // about. This is the difference between a workflow tool and a system of
  // record, and it is the only thing here a finance team actually buys.
  //
  // Invoices raised before line-level receipting have no InvoiceLine rows;
  // those are let through with the gap recorded, because retro-blocking
  // historic invoices helps nobody.
  const lineCount = await prisma.invoiceLine.count({ where: { invoiceId: id } })
  if (lineCount > 0) {
    // Through the harness, so the run is counted and its verdicts kept.
    // The match itself is unchanged — it was correct, it just answered to
    // nobody.
    const attempt = invoice.matchAttempt + 1
    const { result: match } = await matchAndRecord(id, caller.company!.id, attempt)
    await prisma.invoice.update({ where: { id }, data: { matchAttempt: attempt } })

    if (match && !match.matched) {
      return NextResponse.json(
        {
          error: {
            code: 'MATCH_FAILED',
            message: `This invoice does not match its timesheets or purchase order: ${match.summary}`,
            checks: match.checks.filter(c => c.outcome === 'FAIL'),
          },
        },
        { status: 409 }
      )
    }
  }

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
        },
      })

      await tx.automationLog.create({
        data: {
          companyId: caller.company!.id,
          action: 'INVOICE_SUBMITTED',
          summary: `Invoice ${invoice.number} submitted for client review`,
          reason: `Invoice ${invoice.number} submitted for client review`,
          payload: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            engagementId: invoice.engagementId,
            total: Number(invoice.total),
            currency: invoice.currency,
            submittedBy: caller.person.id,
            submittedAt: now.toISOString(),
          },
          reversible: true,
        },
      })

      return updated
    })

    return NextResponse.json({
      data: {
        invoice: {
          id: result.id,
          number: result.number,
          status: result.status,
          total: Number(result.total),
          currency: result.currency,
          submittedAt: result.submittedAt?.toISOString() ?? null,
          dueAt: result.dueAt.toISOString(),
        },
        message: `Invoice ${result.number} submitted for client review`,
      },
    })
  } catch (err: any) {
    reportError('Invoice submission failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Invoice submission failed' } },
      { status: 500 }
    )
  }
}
