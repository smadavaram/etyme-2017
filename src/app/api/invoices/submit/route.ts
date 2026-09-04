import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * POST /api/invoices/submit
 *
 * Bulk submit: transitions multiple invoices from ISSUED → SUBMITTED.
 *
 * Body: { invoiceIds: string[] }
 *
 * For each invoice, applies the same rules as the single submit endpoint:
 * only ISSUED invoices are transitioned. Non-ISSUED ones are skipped.
 *
 * Returns a summary with submitted/skipped/error counts and per-invoice results.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires invoices.issue permission' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { invoiceIds } = body

  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'invoiceIds must be a non-empty array', field: 'invoiceIds' } },
      { status: 422 }
    )
  }

  // Cap bulk operations at a reasonable size
  if (invoiceIds.length > 100) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Cannot submit more than 100 invoices at once', field: 'invoiceIds' } },
      { status: 422 }
    )
  }

  // Fetch all requested invoices in one query
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      currency: true,
      engagementId: true,
    },
  })

  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]))
  const now = new Date()

  let submitted = 0
  let skipped = 0
  let errors = 0
  const results: Array<{
    invoiceId: string
    number: string | null
    status: 'submitted' | 'skipped' | 'not_found'
    reason?: string
  }> = []

  try {
    await prisma.$transaction(async (tx) => {
      for (const invoiceId of invoiceIds) {
        const invoice = invoiceMap.get(invoiceId)

        if (!invoice) {
          errors++
          results.push({
            invoiceId,
            number: null,
            status: 'not_found',
            reason: 'Invoice not found',
          })
          continue
        }

        if (invoice.status !== 'ISSUED') {
          skipped++
          results.push({
            invoiceId,
            number: invoice.number,
            status: 'skipped',
            reason: `Current status is "${invoice.status}" — only ISSUED invoices can be submitted`,
          })
          continue
        }

        await tx.invoice.update({
          where: { id: invoiceId },
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
              bulk: true,
            },
            reversible: true,
          },
        })

        submitted++
        results.push({
          invoiceId,
          number: invoice.number,
          status: 'submitted',
        })
      }
    })
  } catch (err: any) {
    console.error('Bulk invoice submission failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Bulk invoice submission failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: {
      submitted,
      skipped,
      errors,
      results,
    },
  })
}
