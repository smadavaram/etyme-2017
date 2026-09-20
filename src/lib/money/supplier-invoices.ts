/**
 * What a client owes, when nothing it owes is a `VendorBill`.
 *
 * ── The empty page that lied ─────────────────────────────────────────
 *
 * A client opened Accounts payable and read "No supplier bills have
 * been recorded, so there is nothing to measure on the way out" — while
 * six invoices from its suppliers, unpaid, sat on Invoices one nav
 * entry away.
 *
 * Both records are right and neither is a duplicate of the other. The
 * vocabulary settles it (CLAUDE.md, "Bill, invoice receipt, payroll"):
 * **the party who issues a document names it.** A supplier issues its
 * invoice; the client receives it. On the platform that invoice is an
 * `Invoice` row raised by the supplier — the same row the supplier
 * reads as its receivable — and the client is its payer. `VendorBill`
 * is the other case: a bill a firm keys in from a supplier that is not
 * on the platform, or from a leg it buys rather than sells. A client
 * buying from suppliers who are all here has no `VendorBill` rows at
 * all, and never will.
 *
 * So a client's payables are the invoices its suppliers raised to it,
 * and this is the arithmetic for reading them as a payable book.
 *
 * ── What it refuses ──────────────────────────────────────────────────
 *
 * One book per currency, never added — a dollar invoice and a rupee
 * invoice make a number in neither. Outstanding, not total, because a
 * bill already paid is not owed. And where there is genuinely nothing,
 * it says so in the same sentence structure rather than showing a zero
 * that could be read as either "nothing owed" or "nothing recorded".
 *
 * No database in here, on purpose.
 */

import { amount } from '@/lib/money-display'

/** A supplier's invoice, as this file needs to read it. Minor units. */
export interface SupplierInvoiceRow {
  id: string
  number: string
  /** The firm that raised it. Null where nothing behind it says who. */
  supplierName: string | null
  currency: string
  totalMinor: number
  paidMinor: number
  dueAt: Date
  status: string
}

/** One currency's payable book. Never added to another. */
export interface PayableBook {
  currency: string
  /** Still owed — total less paid, over the open invoices. */
  owedMinor: number
  /** The part of that which is past its due date. */
  overdueMinor: number
  /** How many invoices are still open in this currency. */
  openCount: number
}

export interface SupplierInvoiceLedger {
  books: PayableBook[]
  /** Every recorded invoice, soonest due first. */
  rows: SupplierInvoiceRow[]
  /** How many of them are still open. */
  openCount: number
  /** What this says, as somebody would say it. */
  says: string
}

/** Nothing is owed on these, whatever they total. */
const NOT_OWED = ['CANCELLED', 'VOID', 'DRAFT']

/** A cent of rounding is not a debt. */
const SETTLED_TOLERANCE_MINOR = 1

function outstanding(row: SupplierInvoiceRow): number {
  return row.totalMinor - row.paidMinor
}

function open(row: SupplierInvoiceRow): boolean {
  return !NOT_OWED.includes(row.status) && outstanding(row) > SETTLED_TOLERANCE_MINOR
}

/**
 * The supplier invoices a company owes, read as a payable book.
 *
 * `now` is passed rather than read, so a test about an overdue bill is
 * a test about an overdue bill and not about the day it ran.
 */
export function supplierInvoicesOwed(
  rows: ReadonlyArray<SupplierInvoiceRow>,
  now: Date
): SupplierInvoiceLedger {
  const sorted = [...rows].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
  const openRows = sorted.filter(open)

  const byCurrency = new Map<string, PayableBook>()
  for (const row of openRows) {
    const book = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      owedMinor: 0,
      overdueMinor: 0,
      openCount: 0,
    }
    book.owedMinor += outstanding(row)
    if (row.dueAt.getTime() < now.getTime()) book.overdueMinor += outstanding(row)
    book.openCount += 1
    byCurrency.set(row.currency, book)
  }

  const books = [...byCurrency.values()].sort((a, b) => b.owedMinor - a.owedMinor)

  return {
    books,
    rows: sorted,
    openCount: openRows.length,
    says: sentence(books, sorted.length, openRows.length),
  }
}

function sentence(books: PayableBook[], recorded: number, openCount: number): string {
  if (recorded === 0) {
    return (
      'Nothing has been recorded to pay. What you owe appears here as your suppliers ' +
      'invoice you for hours you have signed.'
    )
  }

  if (openCount === 0) {
    return (
      `${recorded} supplier invoice${recorded === 1 ? ' has' : 's have'} been recorded and ` +
      'every one is paid. Nothing is open.'
    )
  }

  // One book at a time, joined by a word rather than by addition.
  const money = books
    .map((b) => `${amount(b.owedMinor, b.currency)}${books.length > 1 ? ` in ${b.currency}` : ''}`)
    .join(' and ')

  const overdue = books.filter((b) => b.overdueMinor > 0)
  const late = overdue.length
    ? ` ${overdue.map((b) => amount(b.overdueMinor, b.currency)).join(' and ')} of that is past its due date.`
    : ''

  return (
    `${openCount} supplier invoice${openCount === 1 ? '' : 's'} open, ${money}.${late} ` +
    'These are the invoices your suppliers raised to you — each one is on Invoices, ' +
    'under “We owe”, where it can be matched and paid.'
  )
}
