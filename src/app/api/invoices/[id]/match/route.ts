import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { matchInvoice } from '@/lib/invoice-match'
import { invoiceScope } from '@/lib/resolve-client-company'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
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
  // Who may look at an invoice at all is `invoiceScope` — a consultant
  // seat is not a party to a bill between two companies, however many of
  // their hours are on it. WHICH invoices are ours is the cascade in
  // `lib/money/invoice-parties`: the scope helper still asks the
  // agreement alone, and an agreement is optional now, so an invoice with
  // none behind it would 404 for the two firms whose bill it is. Their
  // helper is demand's; the substitution is here, in money's own routes.
  // And whose book it is. A program office sitting at the client's desk
  // opens the client's supplier invoices, under the client's own role,
  // with the read logged against the seat (`lib/money/seated-books`).
  // Unseated, this is `invoiceBetween(caller.company.id)` exactly as
  // before.
  const whose = caller.company ? await booksFor(caller, request) : null
  if (whose?.error) return whose.error
  const reading = whose?.books ?? null
  const mayLook = reading ? invoiceScope(caller) : null
  const scope = mayLook && reading ? reading.invoiceWhere : null
  const mine = scope
    ? await prisma.invoice.findFirst({ where: { id, ...scope }, select: { id: true } })
    : null

  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  if (reading) noteMoneyRead(reading, `Three-way match read on invoice ${id}`)

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
      workOrder: result.poAfter
        ? {
            remaining: result.poAfter.remainingCents / 100,
            utilisationPercent: result.poAfter.utilisationPercent,
          }
        : null,
    },
  })
}
