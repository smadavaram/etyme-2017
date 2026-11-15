/**
 * What an empty list of invoice receipts says, for the firm reading it.
 *
 * The Tapin walk, 2026-11-14 (Area E): a supplier with W-2 people at its
 * clients, buying from no other firm, opened Payables and read only "No
 * invoice receipt has been typed in here yet." It did not say where a
 * receipt comes from, that the firm's own people are paid by payroll, or
 * where a receipt is paid. The Bills page's payables side read the bill
 * sentence where the receipt sentence belongs.
 *
 * One reader for both pages, so they cannot disagree. Every sentence is
 * true for the kind reading it: a client buys from suppliers; an MSP
 * places nobody and pays nobody; a one-person firm is paid by her own
 * bills; a supplier or integrator may pay its own employees by payroll.
 *
 * Pure: no React, no database.
 */

export const NO_RECEIPTS = 'No invoice receipts yet.'

/** Where a receipt comes from, for a firm that may buy a person from another firm. */
export const RECEIPT_COMES_FROM =
  'An invoice receipt is a supplier’s invoice for a person you buy from another firm. It is typed in here when it arrives.'

/** Where it is paid, said once beside the list. */
export const PAID_FROM_ITS_OWN_PAGE =
  'Each one is paid from its own page once it matches the order and the hours accepted.'

/** Said to a client: its suppliers send them. */
export const CLIENT_RECEIPTS_SAY =
  'Your suppliers send their invoices from the hours you approve. Each appears here as an invoice receipt once submitted, ' +
  'checked against the timesheets and the purchase order.'

export const OWN_EMPLOYEES_PAID_BY_PAYROLL = 'Your own employees are paid by payroll, not from here.'

export const PAYROLL_HREF = '/dashboard/payroll'

export interface ReceiptsEmpty {
  message: string
  detail: string
  /** Payroll, where the firm has W-2 people and the seat may open it. */
  link: { href: string; label: string } | null
}

export function receiptsEmpty(a: {
  kind: string | null | undefined
  /** The firm pays at least one person of its own through payroll. */
  employs: boolean
  /** The seat may open Payroll, and the firm's own menu draws it. */
  mayOpenPayroll: boolean
}): ReceiptsEmpty {
  if (a.kind === 'CLIENT') return { message: NO_RECEIPTS, detail: CLIENT_RECEIPTS_SAY, link: null }
  // Only a supplier or an integrator has a Payroll link (the navigation
  // table): an MSP pays nobody, and a one-person firm bills for herself.
  const payrollKind = a.kind === 'VENDOR' || a.kind === 'GSI'
  const employs = payrollKind && a.employs
  const detail = [RECEIPT_COMES_FROM, ...(employs ? [OWN_EMPLOYEES_PAID_BY_PAYROLL] : []), PAID_FROM_ITS_OWN_PAGE].join(' ')
  return {
    message: NO_RECEIPTS,
    detail,
    link: employs && a.mayOpenPayroll ? { href: PAYROLL_HREF, label: 'Open Payroll' } : null,
  }
}
