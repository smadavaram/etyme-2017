import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { matchInvoice } from '@/lib/invoice-match'
import { invoiceScope } from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'

/**
 * GET /api/invoices/:id/match
 *
 * Purchase order ↔ approved timesheet ↔ invoice.
 *
 * Read-only: it reports whether this invoice would pass, and why not. The
 * enforcement lives on the paths that move money (submit, approve) — this
 * is what an AP clerk opens to find out what to fix.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  // Same rule as the invoice itself. A match report names the purchase
  // order and what is left on it, which is the one number a competitor
  // bidding for the same account would most like to have.
  const scope = invoiceScope(caller)
  const mine = scope
    ? await prisma.invoice.findFirst({ where: { id, ...scope }, select: { id: true } })
    : null

  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  const result = await matchInvoice(id)

  if (!result) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: {
      invoiceId: id,
      matched: result.matched,
      summary: result.summary,
      checks: result.checks,
      purchaseOrder: result.poAfter
        ? {
            remaining: result.poAfter.remainingCents / 100,
            utilisationPercent: result.poAfter.utilisationPercent,
          }
        : null,
    },
  })
}
