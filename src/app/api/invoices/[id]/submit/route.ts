import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

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

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      currency: true,
      engagementId: true,
      engagement: {
        select: {
          msa: {
            select: {
              vendorId: true,
              clientId: true,
            },
          },
        },
      },
    },
  })

  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
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
    console.error('Invoice submission failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Invoice submission failed' } },
      { status: 500 }
    )
  }
}
