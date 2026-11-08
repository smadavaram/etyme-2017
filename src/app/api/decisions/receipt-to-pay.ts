import { amount } from '@/lib/money-display'
import { daysSays } from './words'

/**
 * An invoice receipt waiting for this firm to pay it, as a row on its
 * queue.
 *
 * The queue held a receipt only once it was disputed. A supplier's
 * invoice that arrived, was sent through the three-way check and waited
 * to be paid sat on the Invoice receipts page and on nobody's list, so
 * the AP clerk read "Nothing needs you" over money owed (simulation,
 * 2026-10-20). Now the desk that records payments hears it.
 *
 * Only a receipt that passes the payment route's own gate,
 * `mayPayInvoiceReceipt` in `lib/invoice-match`, is a "Pay" row; one that
 * fails is held (`heldReceiptDecision` below). A receipt the twin asked
 * this seat to approve is still this one row, carrying the question's id:
 * the twin's yes pays nothing, so counting the question and then the
 * payment counted one receipt twice.
 *
 * Pure: no database.
 */

export interface ReceiptToPay {
  id: string
  number: string
  /** The firm that sent it — this firm's own supplier, a name it already knows. */
  vendorName: string
  /** What is still owed on it, in minor units. */
  outstandingCents: number
  currency: string
  dueAt: Date
  /** When it reached this firm, where known. */
  receivedAt: Date | null
}

export interface ReceiptToPayDecision {
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  entityType: 'INVOICE'
  entityId: string
  dueDate: string
  actionUrl: string
  /** Whole dollars, as every other row; null in another currency, which the page's dollar total cannot add. */
  amount: number | null
  createdAt: string
}

const DAY = 86_400_000

/** "due in 3 days", "due today", "due tomorrow", "5 days past due". */
export function dueSays(dueAt: Date, now: Date): string {
  const days = Math.round((Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), dueAt.getUTCDate()) -
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days > 1) return `due in ${daysSays(days)}`
  return `${daysSays(-days)} past due`
}

export function receiptToPayDecision(r: ReceiptToPay, now: Date): ReceiptToPayDecision {
  const currency = (r.currency || 'USD').toUpperCase()
  const daysToDue = Math.floor((r.dueAt.getTime() - now.getTime()) / DAY)
  return {
    title: `Pay invoice receipt — ${r.vendorName}`,
    subtitle: `Invoice ${r.number} · ${amount(r.outstandingCents, currency)} · ${dueSays(r.dueAt, now)}`,
    urgency: daysToDue < 0 ? 'HIGH' : daysToDue <= 7 ? 'MEDIUM' : 'LOW',
    entityType: 'INVOICE',
    entityId: r.id,
    dueDate: r.dueAt.toISOString(),
    actionUrl: `/dashboard/invoices/${r.id}`,
    amount: currency === 'USD' ? r.outstandingCents / 100 : null,
    createdAt: (r.receivedAt ?? r.dueAt).toISOString(),
  }
}

// ── A receipt that does not pass the check is held, not waiting ──────
//
// The walk, 2026-10-22: PR-2026-0442 bills 41.5 hours against 40 signed,
// and the queue read "waits for you to pay it" over a receipt the payment
// route refuses. Only a receipt that passes `mayPayInvoiceReceipt` is a
// "Pay" row; one that fails is a row of its own that says what is wrong
// and the way forward: an exception with a reason where the check may be
// waived (Addendum E: warn, capture a reason, proceed), the supplier's
// correction where it may not. Never both rows for one receipt.

/** One failing check, as the three-way check returns it. */
export interface FailingCheck {
  code: string
  overridable?: boolean
}

/** The order a person reads them in: the first one found names the row. */
const HELD_FOR: ReadonlyArray<[string, string]> = [
  ['RECEIPT', 'a week nobody signed'],
  ['DUPLICATE', 'billed before'],
  ['QUANTITY', 'hours don’t match'],
  ['PRICE', 'rate doesn’t match'],
  ['AMOUNT', 'amount doesn’t match'],
  ['PO_REQUIRED', 'no purchase order'],
  ['PO_STATUS', 'the order doesn’t cover it'],
  ['PO_BALANCE', 'over the order’s ceiling'],
  ['PERIOD', 'dates don’t match'],
  ['CONTRACT_PERIOD', 'dates don’t match'],
  ['EXTENSION', 'totals don’t add up'],
  ['HEADER_TOTAL', 'totals don’t add up'],
]

/** "hours don't match": what holds it, in the AP clerk's words. */
export function heldFor(failing: readonly FailingCheck[]): string {
  for (const [code, says] of HELD_FOR) {
    if (failing.some((f) => f.code === code)) return says
  }
  return 'the check failed'
}

export interface HeldReceiptDecision {
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM'
  entityType: 'INVOICE'
  entityId: string
  dueDate: string
  actionUrl: string
  /** Null: a held receipt is not money this desk may pay today, so it is never added to what waits to be paid. */
  amount: null
  createdAt: string
}

export function heldReceiptDecision(
  r: ReceiptToPay,
  failing: readonly FailingCheck[],
  hours: { billed: number; signed: number | null } | null,
  now: Date
): HeldReceiptDecision {
  const currency = (r.currency || 'USD').toUpperCase()
  const daysToDue = Math.floor((r.dueAt.getTime() - now.getTime()) / DAY)
  const said = heldFor(failing)
  const hoursLine =
    hours && failing.some((f) => f.code === 'QUANTITY')
      ? hours.signed == null
        ? `${num(hours.billed)} hours billed, none signed`
        : `${num(hours.billed)} hours billed, ${num(hours.signed)} signed`
      : null
  // Every failing check may be waived, or one may not: the way forward is
  // the AP clerk's exception or the supplier's correction, never a button
  // the payment route would refuse.
  const waivable = failing.length > 0 && failing.every((f) => f.overridable === true)
  const way = failing.some((f) => f.code === 'RECEIPT')
    ? 'it can be paid once every week on it is signed and accepted'
    : waivable
      ? `record an exception with a reason, or ask ${r.vendorName} to correct it`
      : `it can be paid once ${r.vendorName} corrects it`
  return {
    title: `Held: ${said} — ${r.vendorName}`,
    subtitle: [`Invoice ${r.number}`, amount(r.outstandingCents, currency), hoursLine, way]
      .filter(Boolean).join(' · '),
    urgency: daysToDue <= 7 ? 'HIGH' : 'MEDIUM',
    entityType: 'INVOICE',
    entityId: r.id,
    dueDate: r.dueAt.toISOString(),
    // The receipt's own page, where the check is shown and the exception
    // is recorded (POST /api/invoices/:id/match/override).
    actionUrl: `/dashboard/invoices/${r.id}`,
    amount: null,
    createdAt: (r.receivedAt ?? r.dueAt).toISOString(),
  }
}

function num(h: number): string {
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100)
}

// ── Through the check, and held on the supplier's bank details ───────
//
// Walk 7, 2026-11-08, item 6: Pinnacle's PR-2026-0441 passed the
// three-way check, nobody had checked Pinnacle's bank details, and the
// queue read "waits for you to pay it · Pay" while the payment route
// refused it. A receipt is "Pay" only where the payment would go through:
// the check (`payGate`) and then the bank gate the payment write reads
// (`mayPayFirm` in lib/setup-gates). One that fails the bank gate is held
// here, in the sentence money's bank check says to this reader
// (`bankHoldAt` in lib/money/bank-check-read): "Bank details not checked.
// Ask Rosalind Tay to check them, then pay." to anybody else, "Check them,
// then pay." to the person who checks. Still one row: it was counted as
// "Pay" before, and is counted once as held now.

/** What money's bank check says about a held receipt, to the person reading the queue. */
export interface BankHold {
  says: string
  /** This reader is the person who checks, so the row opens the check. */
  mayCheck: boolean
}

export function bankHeldReceiptDecision(r: ReceiptToPay, hold: BankHold, now: Date): HeldReceiptDecision {
  const currency = (r.currency || 'USD').toUpperCase()
  const daysToDue = Math.floor((r.dueAt.getTime() - now.getTime()) / DAY)
  return {
    title: `Held: bank details not checked — ${r.vendorName}`,
    subtitle: [`Invoice ${r.number}`, amount(r.outstandingCents, currency), hold.says].join(' · '),
    urgency: daysToDue <= 7 ? 'HIGH' : 'MEDIUM',
    entityType: 'INVOICE',
    entityId: r.id,
    dueDate: r.dueAt.toISOString(),
    // The receipt's own page. For the person who checks, opened at the
    // hold (`#pay`), where the page draws the check itself ("They match:
    // record the check"); for anybody else, the page that says whom to ask.
    actionUrl: hold.mayCheck ? `/dashboard/invoices/${r.id}#pay` : `/dashboard/invoices/${r.id}`,
    amount: null,
    createdAt: (r.receivedAt ?? r.dueAt).toISOString(),
  }
}
