import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { invoiceScope } from '@/lib/resolve-client-company'
import { booksFor, noteMoneyRead, moneyTrailFor } from '@/lib/money/seated-books'
import { partiesOf } from '@/lib/money/invoice-parties'
import { holdInvoice, supplierToldSays } from '@/lib/money/invoice-hold'
import { notifyBulk } from '@/lib/notify'

/**
 * POST /api/invoices/:id/hold   { reason }            — hold it, with a reason
 * POST /api/invoices/:id/hold   { release: true, reason? } — lift the hold
 *
 * The payer's desk may stop an invoice receipt from being paid while it
 * asks the supplier something, and it says why. A hold is not a refusal
 * of the invoice and not a dispute the supplier must answer: it is the
 * payer's own "not yet", and nobody pays through it. Lifting it puts the
 * invoice back where it was. Both are on the trail with the reason.
 *
 * Only the side that pays may hold, and only with the permission that
 * pays (`payments.record`), because holding a payment is a decision about
 * paying it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params

  const whose = caller.company ? await booksFor(caller, request) : null
  if (whose?.error) return whose.error
  const reading = whose?.books ?? null
  if (!hasPermission(reading?.caller.permissions ?? caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Holding a payment is for the desk that pays. Ask whoever runs accounts payable.' } },
      { status: 403 }
    )
  }
  const scope = reading && invoiceScope(caller) ? reading.invoiceWhere : null
  const invoice = scope
    ? await prisma.invoice.findFirst({
        where: { id, ...scope },
        select: {
          id: true, number: true, status: true,
          engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
          workOrder: { select: { issuedById: true, issuedToId: true } },
          invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } } },
        },
      })
    : null
  if (!invoice) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, { status: 404 })
  }

  const parties = partiesOf({
    agreement: invoice.engagement.msa,
    order: invoice.workOrder,
    lines: invoice.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })
  const payer = !!parties.client && (reading?.companyId ?? caller.company?.id) === parties.client.id

  const body = await request.json().catch(() => ({}))
  const verdict = holdInvoice({
    payer,
    status: invoice.status,
    number: invoice.number,
    release: body?.release === true,
    reason: typeof body?.reason === 'string' ? body.reason : null,
    by: caller.person.name,
  })
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status: verdict.status })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: verdict.to } })
      await tx.automationLog.create({
        data: {
          companyId: reading?.companyId ?? caller.company!.id,
          action: verdict.to === 'HELD' ? 'INVOICE_HELD' : 'INVOICE_HOLD_LIFTED',
          summary: verdict.says,
          reason: moneyTrailFor(reading?.seat ?? null, verdict.says) ?? `${caller.person.name} at ${caller.company!.name}`,
          payload: { invoiceId: id, number: invoice.number, from: invoice.status, to: verdict.to, reason: verdict.reason, by: caller.person.id },
          reversible: true,
        },
      })
    })
  } catch (err) {
    reportError('Invoice hold failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The hold was not saved. Try again.' } }, { status: 500 })
  }
  if (reading) noteMoneyRead(reading, `Invoice ${invoice.number} ${verdict.to === 'HELD' ? 'held' : 'released'}`)

  // The supplier is told, with the reason, at the desks that read its
  // own bills. A hold nobody explains is a phone call.
  if (parties.vendor && parties.client) {
    const staff = await prisma.context.findMany({
      where: { companyId: parties.vendor.id, type: 'EMPLOYEE', revokedAt: null },
      select: { personId: true, role: { select: { permissions: true } } },
    })
    const payerName =
      (await prisma.company.findUnique({ where: { id: parties.client.id }, select: { name: true } }))?.name ?? 'The client'
    const told = supplierToldSays({ payerName, number: invoice.number, to: verdict.to, reason: verdict.reason })
    const readers = staff.filter((c) => hasPermission(c.role?.permissions ?? [], 'invoices.read'))
    void notifyBulk(
      readers.map((c) => ({
        personId: c.personId, companyId: parties.vendor!.id, type: 'INVOICE' as const,
        title: told.title, body: told.body, entityId: id,
      }))
    )
  }

  return NextResponse.json({ data: { status: verdict.to, message: verdict.says } })
}
