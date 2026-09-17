import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { invoiceScope } from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'
import { matchInvoice, recompute } from '@/lib/invoice-match'
import { OVERRIDABLE, decimalToCents } from '@/lib/three-way-match'
import { discountDeadline, discountOn, dueOn, ladderFor, resolveBillingTerms } from '@/lib/billing-cascade'

/**
 * GET /api/invoices/:id
 *
 * One invoice, with the three records the match compares: what was
 * authorized (the purchase order), what was witnessed (the approved
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
      workOrder: {
        select: {
          id: true, number: true, amount: true, status: true, endDate: true,
          // What we offer this client for settling early on this order.
          // A PO belongs to whoever pays, so on our own sales invoice
          // this is the client's order and its rungs narrow the standing
          // ladder for its own spend.
          earlyPaymentDiscounts: true,
        },
      },
      engagement: {
        select: {
          id: true, title: true,
          sellContracts: {
            select: { paymentTerms: true, paymentTermsFrom: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
          // The two parties hang off the master agreement, not the
          // engagement — an engagement is work under an MSA, not a
          // relationship in its own right.
          msa: {
            select: {
              client: { select: { id: true, name: true } },
              vendor: { select: { id: true, name: true } },
              paymentTerms: true, paymentTermsFrom: true,
              /** The standing ladder: what we offer this client on everything. */
              earlyPaymentDiscounts: true,
            },
          },
        },
      },
      invoiceLines: {
        include: {
          person: { select: { id: true, name: true } },
          timesheet: {
            select: {
              id: true, status: true, totalHours: true, periodStart: true, periodEnd: true,
              // What the line was priced from, so the screen can show
              // the working rather than a multiplication that does not
              // come out. Read through the same function the match uses.
              sellContractId: true, days: true, leaveDays: true,
              overtimeDecisions: true,
              sellContract: {
                select: {
                  overtimeAfterHours: true, overtimeMultiplierBps: true, billStraddle: true,
                },
              },
            },
          },
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

  // ── When it is due, and what settles it sooner ──────────────────────
  //
  // The due date was written when the invoice was raised and is not
  // recomputed here — a contract amended in March must not restate a
  // February promise. What IS computed is the day the clock counts from,
  // because the discount window counts from the same day, and whether
  // that day has happened at all.
  const contractTerms = invoice.engagement.sellContracts[0] ?? null
  const terms = resolveBillingTerms({
    company: { name: invoice.engagement.msa.vendor.name },
    agreement: {
      paymentTermsDays: invoice.engagement.msa.paymentTerms,
      paymentTermsFrom: invoice.engagement.msa.paymentTermsFrom,
      counterpartyName: invoice.engagement.msa.client.name,
    },
    contract: {
      paymentTermsDays: contractTerms?.paymentTerms,
      paymentTermsFrom: contractTerms?.paymentTermsFrom,
    },
  })

  const clock = dueOn({
    anchor: terms.paymentTermsFrom.value,
    days: terms.paymentTermsDays.value,
    periodEnd: invoice.periodEnd,
    issuedAt: invoice.issuedAt ?? invoice.periodEnd,
    receivedAt: invoice.receivedAt,
    approvedAt: null,
  })

  // The standing ladder, narrowed by the order's own where there is one.
  const ladder = ladderFor({
    agreement: invoice.engagement.msa.earlyPaymentDiscounts,
    order: invoice.workOrder?.earlyPaymentDiscounts ?? [],
  })

  const grossMinor = decimalToCents(invoice.total)
  const taxMinor = invoice.taxTotalCents ?? 0
  const offer = discountOn({
    ladder,
    anchoredOn: clock.anchoredOn,
    payingOn: new Date(),
    // `Invoice.total` is the work. Tax is carried beside it, and the
    // discount comes off the work only.
    netMinor: grossMinor,
    taxMinor,
    taxRegime: invoice.taxRegime,
  })
  const deadline = discountDeadline(ladder, clock.anchoredOn)

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
        // What the due date counts from, and whether that day has
        // happened. An invoice whose clock has not started is not late
        // however long it has been sitting there.
        terms: {
          days: terms.paymentTermsDays.value,
          anchor: terms.paymentTermsFrom.value,
          because: terms.paymentTermsFrom.because,
          clockStarted: clock.clockStarted,
          waitingFor: clock.waitingFor,
          says: clock.says,
        },
        // "2% off for paying within 10 days — $125.40 off $6,270 of
        // work, so $6,144.60 settles it."
        earlyPayment: {
          source: ladder.source,
          rungs: ladder.rungs,
          ladderSays: ladder.says,
          discount: offer.discountMinor / 100,
          pay: offer.payMinor / 100,
          says: offer.says,
          by: deadline?.by.toISOString().slice(0, 10) ?? null,
          taxNeedsAThought: offer.taxNeedsAThought,
        },
        engagement: invoice.engagement.title,
        vendor: invoice.engagement.msa.vendor,
        client: invoice.engagement.msa.client,
      },
      workOrder: invoice.workOrder
        ? {
            id: invoice.workOrder.id,
            number: invoice.workOrder.number,
            status: invoice.workOrder.status,
            amount: decimalToCents(invoice.workOrder.amount) / 100,
            endDate: invoice.workOrder.endDate?.toISOString().slice(0, 10) ?? null,
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
        // ── The working ───────────────────────────────────────────────
        //
        // A week signed at a premium does not multiply out: forty-five
        // hours at $132 is $5,940 and the line says $6,270, because five
        // of those hours were signed at time and a half. One row per
        // timesheet per contract is a deliberate constraint, so the two
        // lines a paper invoice would print are derived here instead —
        // from the decisions, by the same function the match checks the
        // line with, so the screen and the control cannot disagree.
        //
        // Empty where there is nothing to show: straight-time work, an
        // expense, or an invoice raised before overtime was a decision.
        // Then hours × rate is the whole story and the screen prints it.
        bands: (recompute(l, { start: invoice.periodStart, end: invoice.periodEnd, label: '' })?.bands ?? [])
          .map(b => ({
            kind: b.kind,
            hours: b.hours,
            rate: b.rateCents / 100,
            amount: b.amountCents / 100,
            says: b.says,
          })),
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
            workOrder: match.poAfter
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
