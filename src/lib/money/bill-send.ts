/**
 * Sending a bill: through the three-way check, then to the customer.
 *
 * One door for the Submit button on a bill's page (`POST
 * /api/invoices/:id/submit`) and for the supplier's twin's `bill.send`,
 * which Accounts Receivable says yes to (2026-10-18). The twin drafts; a
 * person's yes sends; and what "send" does is this file, so a bill the
 * twin drafted and a bill raised on the Bills page reach the customer by
 * the same check and the same writes.
 *
 * Two starting points, one end:
 *
 *   ISSUED  raised on the Bills page. Sending moves it to SUBMITTED.
 *   DRAFT   drafted by the twin. Sending raises it — its issue date, its
 *           due date counted by the agreement's rule from today, the
 *           "bill to raise" date closed — and submits it, in one step.
 *
 * The check runs before anything is written. A bill that does not pass
 * it stays where it was, and the refusal says why in a sentence.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { matchAndRecord } from '@/lib/invoice-loop'
import { completeCycle } from '@/lib/cycle-complete'
import { invoicesRaisedBy, partiesOf } from '@/lib/money/invoice-parties'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT } from '@/lib/money/order-terms'
import { billDue } from '@/lib/money/bill-generate'
import { fromUnits } from '@/lib/money-display'

type Tx = Prisma.TransactionClient

export type SendCheck =
  | { ok: true; invoice: { id: string; number: string; status: string; matchAttempt: number } }
  | { ok: false; status: 404 | 409; code: string; says: string; checks?: { reason: string }[] }

/**
 * Whether this firm may send this bill now: it raised it, it is in a
 * state that can be sent, and it passes the three-way check. The check is
 * recorded through the harness (lib/invoice-loop) whether it passes or
 * not, the same as the Submit button always has.
 */
export async function mayBeSent(invoiceId: string, companyId: string, from: readonly ('ISSUED' | 'DRAFT')[]): Promise<SendCheck> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, ...invoicesRaisedBy(companyId) },
    select: { id: true, number: true, status: true, matchAttempt: true },
  })
  if (!invoice) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such bill of yours. A bill is sent by the firm that raised it.' }
  }
  if (!(from as readonly string[]).includes(invoice.status)) {
    return {
      ok: false, status: 409, code: 'INVALID_STATE',
      says: invoice.status === 'DRAFT'
        ? `Bill ${invoice.number} is still a draft.`
        : `Bill ${invoice.number} has already been sent, or is ${invoice.status.toLowerCase()}, so it cannot be sent again.`,
    }
  }

  // ── The control ──
  // Purchase order, approved timesheet, invoice. An invoice that does not
  // match cannot be sent to a client for payment — not flagged, not warned
  // about. Invoices raised before line-level receipting have no
  // InvoiceLine rows; those are let through with the gap recorded,
  // because retro-blocking historic invoices helps nobody.
  const lineCount = await prisma.invoiceLine.count({ where: { invoiceId } })
  if (lineCount > 0) {
    const attempt = invoice.matchAttempt + 1
    const { result: match } = await matchAndRecord(invoiceId, companyId, attempt)
    await prisma.invoice.update({ where: { id: invoiceId }, data: { matchAttempt: attempt } })
    if (match && !match.matched) {
      return {
        ok: false, status: 409, code: 'MATCH_FAILED',
        says: `This bill does not match its timesheets or purchase order: ${match.summary}`,
        checks: match.checks.filter((c) => c.outcome === 'FAIL'),
      }
    }
  }
  return { ok: true, invoice: { ...invoice, matchAttempt: invoice.matchAttempt + (lineCount > 0 ? 1 : 0) } }
}

export interface Sent {
  invoiceId: string
  number: string
  total: number
  currency: string
  dueAt: Date
  submittedAt: Date
  /** It was a draft, and sending raised it. */
  raised: boolean
}

/**
 * The writes, inside the caller's transaction. Moves only a bill still
 * in the state the check saw — a second yes, or a person pressing Submit
 * while the twin's question waited, finds it moved and is refused.
 */
export async function markSent(
  tx: Tx,
  a: { invoiceId: string; companyId: string; by: { personId: string | null; name: string }; now?: Date }
): Promise<Sent> {
  const now = a.now ?? new Date()
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: a.invoiceId },
    select: {
      id: true, number: true, status: true, total: true, currency: true, dueAt: true,
      periodEnd: true, engagementId: true,
      engagement: {
        select: {
          msa: {
            select: {
              vendorId: true, clientId: true,
              billFrequency: true, billAnchor: true, billStraddle: true,
              paymentTerms: true, paymentTermsFrom: true, currency: true,
              vendor: { select: { id: true, name: true } },
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
      workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
      invoiceLines: {
        select: {
          sellContractId: true,
          timesheet: { select: { periodEnd: true } },
          sellContract: {
            select: {
              paymentTerms: true, paymentTermsFrom: true, billCurrency: true,
              companyId: true, clientCompanyId: true,
              company: { select: { id: true, name: true } },
              clientCompany: { select: { id: true, name: true } },
              ...SELL_LINE_TERMS_SELECT,
              workOrder: { select: ORDER_HEADER_SELECT },
            },
          },
        },
      },
    },
  })
  const raised = inv.status === 'DRAFT'
  if (inv.status !== 'DRAFT' && inv.status !== 'ISSUED') {
    throw new Error(`ALREADY_MOVED:${inv.status}`)
  }

  let dueAt = inv.dueAt
  if (raised) {
    // Raised today, so dated today: the due date is counted again by the
    // agreement's rule from the day it actually goes, never from the day
    // the twin drafted it.
    const parties = partiesOf({
      agreement: inv.engagement.msa,
      order: inv.workOrder,
      lines: inv.invoiceLines.map((l) => l.sellContract).filter((c): c is NonNullable<typeof c> => c != null),
    })
    const line = inv.invoiceLines.find((l) => l.sellContract)?.sellContract ?? null
    dueAt = billDue({
      line,
      engagementAgreement: inv.engagement.msa,
      companyName: parties.vendor?.name ?? 'this company',
      customerName: parties.client?.name ?? 'the client',
      periodEnd: inv.periodEnd,
      issuedAt: now,
    }).due.dueAt
  }

  const moved = await tx.invoice.updateMany({
    where: { id: inv.id, status: inv.status },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      ...(raised ? { issuedAt: now, dueAt } : {}),
    },
  })
  if (moved.count !== 1) throw new Error('ALREADY_MOVED')

  if (raised) {
    // The "bill to raise" date each line was heading for is done now that
    // it is raised — the step generation skips for a draft.
    const latest = new Map<string, Date>()
    for (const l of inv.invoiceLines) {
      if (!l.sellContractId || !l.timesheet) continue
      const was = latest.get(l.sellContractId)
      if (!was || l.timesheet.periodEnd > was) latest.set(l.sellContractId, l.timesheet.periodEnd)
    }
    for (const [sellContractId, periodEnd] of latest) {
      await completeCycle(tx, { sellContractId, kind: 'INVOICE_GENERATE', periodEnd })
    }
    await tx.automationLog.create({
      data: {
        companyId: a.companyId,
        action: 'INVOICE_GENERATED',
        summary: `Bill ${inv.number} raised from its draft: ${fromUnits(Number(inv.total), inv.currency)}, due ${dueAt.toISOString().slice(0, 10)}`,
        reason: `Sent by ${a.by.name}`,
        payload: { invoiceId: inv.id, number: inv.number, engagementId: inv.engagementId, fromDraft: true },
        reversible: false,
      },
    })
  }

  await tx.automationLog.create({
    data: {
      companyId: a.companyId,
      action: 'INVOICE_SUBMITTED',
      summary: `Bill ${inv.number} submitted for client review`,
      reason: `Bill ${inv.number} submitted for client review`,
      payload: {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        engagementId: inv.engagementId,
        total: Number(inv.total),
        currency: inv.currency,
        submittedBy: a.by.personId,
        submittedAt: now.toISOString(),
      },
      reversible: true,
    },
  })

  return {
    invoiceId: inv.id, number: inv.number, total: Number(inv.total), currency: inv.currency,
    dueAt, submittedAt: now, raised,
  }
}
