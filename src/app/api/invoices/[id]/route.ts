import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { invoiceScope } from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'
import { matchInvoice } from '@/lib/invoice-match'
import { OVERRIDABLE, decimalToCents } from '@/lib/three-way-match'

/**
 * GET /api/invoices/:id
 *
 * One invoice, with the three records the match compares: what was
 * authorised (the purchase order), what was witnessed (the approved
 * timesheets behind each line), and what is being asked for.
 *
 * An AP clerk opens this to find out what to fix, so the match travels with
 * it rather than sitting behind a second request — and every check says
 * whether a human is allowed to wave it through, because "why is there no
 * button" is the question that sends people back to email.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  // Both parties to the bill, and nobody else. This route took the id and
  // returned the invoice — number, total, purchase order and its ceiling —
  // to any authenticated caller, which on a marketplace means competitors.
  const scope = invoiceScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, ...scope },
    include: {
      purchaseOrder: { select: { id: true, number: true, amount: true, status: true, endDate: true } },
      engagement: {
        select: {
          id: true, title: true,
          // The two parties hang off the master agreement, not the
          // engagement — an engagement is work under an MSA, not a
          // relationship in its own right.
          msa: {
            select: {
              client: { select: { id: true, name: true } },
              vendor: { select: { id: true, name: true } },
            },
          },
        },
      },
      invoiceLines: {
        include: {
          person: { select: { id: true, name: true } },
          timesheet: { select: { id: true, status: true, totalHours: true, periodStart: true, periodEnd: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      matchOverrides: { include: { by: { select: { id: true, name: true } } } },
      payments: { select: { amount: true, receivedAt: true } },

    },
  })

  if (!invoice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
      { status: 404 }
    )
  }

  const match = await matchInvoice(id)
  const payments = await prisma.payment.findMany({
    where: { invoiceId: id }, select: { amount: true },
  })
  const paidCents = payments.reduce((sum, p) => sum + decimalToCents(p.amount), 0)

  return NextResponse.json({
    data: {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        periodStart: invoice.periodStart.toISOString().slice(0, 10),
        periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
        dueAt: invoice.dueAt.toISOString().slice(0, 10),
        currency: invoice.currency,
        total: decimalToCents(invoice.total) / 100,
        paid: paidCents / 100,
        engagement: invoice.engagement.title,
        vendor: invoice.engagement.msa.vendor,
        client: invoice.engagement.msa.client,
      },
      purchaseOrder: invoice.purchaseOrder
        ? {
            id: invoice.purchaseOrder.id,
            number: invoice.purchaseOrder.number,
            status: invoice.purchaseOrder.status,
            amount: decimalToCents(invoice.purchaseOrder.amount) / 100,
            endDate: invoice.purchaseOrder.endDate?.toISOString().slice(0, 10) ?? null,
          }
        : null,
      // Each line with the receipt behind it. A line whose timesheet is not
      // APPROVED is the commonest reason an invoice cannot be paid, so the
      // receipt's own state is shown rather than merely counted.
      lines: invoice.invoiceLines.map(l => ({
        id: l.id,
        person: l.person,
        hours: Number(l.hours),
        rate: l.rateCents / 100,
        amount: l.amountCents / 100,
        description: l.description,
        receipt: l.timesheet
          ? {
              id: l.timesheet.id,
              status: l.timesheet.status,
              approvedHours: Number(l.timesheet.totalHours),
              period: `${l.timesheet.periodStart.toISOString().slice(0, 10)} → ${l.timesheet.periodEnd.toISOString().slice(0, 10)}`,
            }
          : null,
      })),
      match: match
        ? {
            matched: match.matched,
            cleanMatch: match.cleanMatch,
            summary: match.summary,
            checks: match.checks.map(c => ({
              ...c,
              // Say plainly whether this is anybody's to wave through.
              overridable: OVERRIDABLE[c.code],
            })),
            purchaseOrder: match.poAfter
              ? {
                  remaining: match.poAfter.remainingCents / 100,
                  utilisationPercent: match.poAfter.utilisationPercent,
                }
              : null,
          }
        : null,
      overrides: invoice.matchOverrides.map(o => ({
        code: o.code,
        reason: o.reason,
        by: o.by,
        at: o.createdAt.toISOString(),
        totalAtOverride: o.invoiceTotalCentsAtOverride / 100,
      })),
    },
  })
}
