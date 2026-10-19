/**
 * Every invoice receipt this firm typed in, as the Accounts payable
 * screen reads it: its lines, the check as it stands now, the exceptions
 * on it with who and why, whether it may be paid or cancelled and why
 * not, and who paid whom.
 *
 * The check is the one the payment runs (`checkKeyedReceipt`, then
 * `keyedPayGate`), so the screen's Pay button and the payment route
 * cannot disagree about one receipt. The doors are `receiptDoors`, which
 * holds the same two refusals as the cancel door and the same waiver
 * rules as the waiver route.
 */

import { prisma } from '@/lib/db'
import { checkKeyedReceipt, keyedPayGate, asKeyed, KEYED_SELECT } from '@/lib/money/keyed-receipt'
import { receiptDoors, paymentSays, type Doors, type ReaderRole } from '@/lib/money/receipt-screen'
import { decimalsFor } from '@/lib/money'
import { formatDay } from '@/lib/format-date'
import type { MatchCheck } from '@/lib/three-way-match'

/** The most receipts the screen lists at once, newest first. */
export const MOST_RECEIPTS = 200

export interface ReceiptRow {
  id: string
  number: string
  supplier: string
  status: string
  currency: string
  totalMinor: number
  paidMinor: number
  receivedAt: string
  dueAt: string | null
  periodStart: string | null
  periodEnd: string | null
  lines: { kind: 'HOURS' | 'EXPENSE' | 'MILESTONE'; says: string; hours: number | null; rateMinor: number | null; amountMinor: number }[]
  /** Every check, as it stands now; empty on a paid or cancelled receipt. */
  checks: MatchCheck[]
  /** A week this firm has not accepted: the sentence. */
  notAccepted: string | null
  hard: string | null
  doors: Doors
  payments: string[]
  /** Why it was cancelled, by whom, where it was. */
  cancelled: string | null
}

export async function receiptsFor(companyId: string, role: ReaderRole): Promise<ReceiptRow[]> {
  const bills = await prisma.vendorBill.findMany({
    where: { companyId },
    select: {
      ...KEYED_SELECT,
      dueAt: true,
      lines: {
        select: {
          ...KEYED_SELECT.lines.select,
          timesheet: { select: { periodStart: true, person: { select: { name: true } } } },
          expense: { select: { category: true, periodStart: true, person: { select: { name: true } } } },
          milestone: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        select: {
          amount: true, currency: true, method: true, reference: true, receivedAt: true,
          payerCompany: { select: { name: true } },
          receivedByCompany: { select: { name: true } },
          appliedBy: { select: { name: true } },
        },
        orderBy: { receivedAt: 'asc' },
      },
      paymentRunItems: {
        where: { run: { status: { in: ['DRAFT', 'APPROVED'] } } },
        select: { run: { select: { status: true } } },
      },
    },
    orderBy: { receivedAt: 'desc' },
    take: MOST_RECEIPTS,
  })

  const cancelledIds = bills.filter((b) => b.status === 'CANCELLED').map((b) => b.id)
  const cancelLogs = cancelledIds.length
    ? await prisma.automationLog.findMany({
        where: { companyId, action: 'INVOICE_RECEIPT_CANCELLED', OR: cancelledIds.map((id) => ({ payload: { path: ['vendorBillId'], equals: id } })) },
        select: { reason: true, summary: true, at: true, payload: true },
      })
    : []

  const rows: ReceiptRow[] = []
  for (const b of bills) {
    const vendorName = b.vendorCompany.name
    const open = b.status !== 'PAID' && b.status !== 'CANCELLED'
    const check = open ? await checkKeyedReceipt(asKeyed(b), 'pay') : null
    // The payment route refuses an unaccepted week first, in the sentence
    // that names it; the screen says the same.
    const gate = !check
      ? { ok: false, says: null }
      : check.notAccepted
        ? { ok: false, says: check.notAccepted.says }
        : keyedPayGate(b, vendorName, check)
    const run = b.paymentRunItems[0]?.run ?? null
    const doors = receiptDoors(
      {
        number: b.number, vendorName, status: b.status, currency: b.currency,
        totalCents: b.totalCents, paidCents: b.paidCents, paymentCount: b.payments.length,
        inRun: run ? { status: run.status === 'DRAFT' ? 'DRAFT' : 'APPROVED' } : null,
        checks: check?.match.checks ?? [],
        hard: check?.hard?.says ?? null,
        waivers: b.matchOverrides.map((o) => ({
          code: o.code, reason: o.reason, byName: o.by.name, at: o.createdAt, totalCentsAtOverride: o.totalCentsAtOverride,
        })),
      },
      role,
      gate,
    )
    const log = cancelLogs.find((l) => (l.payload as Record<string, unknown> | null)?.vendorBillId === b.id)
    rows.push({
      id: b.id,
      number: b.number,
      supplier: vendorName,
      status: b.status,
      currency: b.currency,
      totalMinor: b.totalCents,
      paidMinor: b.paidCents,
      receivedAt: b.receivedAt.toISOString(),
      dueAt: b.dueAt?.toISOString() ?? null,
      periodStart: b.periodStart?.toISOString().slice(0, 10) ?? null,
      periodEnd: b.periodEnd?.toISOString().slice(0, 10) ?? null,
      lines: b.lines.map((l) => ({
        kind: l.timesheetId ? 'HOURS' : l.expenseId ? 'EXPENSE' : 'MILESTONE',
        says: l.timesheet
          ? `${l.timesheet.person?.name ?? 'Somebody'} · week of ${formatDay(l.timesheet.periodStart)}`
          : l.expense
            ? `${l.expense.person?.name ?? 'Somebody'} · ${l.expense.category.toLowerCase()} expense · ${formatDay(l.expense.periodStart)}`
            : l.milestone
              ? `Milestone · ${l.milestone.name}`
              : 'A line',
        hours: l.hours == null ? null : Number(l.hours.toString()),
        rateMinor: l.rateCents,
        amountMinor: l.amountCents,
      })),
      checks: check?.match.checks ?? [],
      notAccepted: check?.notAccepted?.says ?? null,
      hard: check?.hard?.says ?? null,
      doors,
      payments: b.payments.map((p) =>
        paymentSays({
          paidBy: p.payerCompany?.name ?? 'This company',
          paidTo: p.receivedByCompany?.name ?? vendorName,
          amountMinor: Math.round(parseFloat(p.amount.toString()) * 10 ** decimalsFor(p.currency)),
          currency: p.currency,
          at: p.receivedAt,
          method: p.method,
          reference: p.reference,
          recordedBy: p.appliedBy?.name ?? null,
        })
      ),
      cancelled: log ? `${log.summary} on ${formatDay(log.at)}: “${log.reason}”` : null,
    })
  }
  return rows
}
