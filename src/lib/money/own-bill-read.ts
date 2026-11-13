import type { LeftAfterThisBill } from '@/lib/money/left-after-this-bill'

/**
 * What the firm that issued a bill reads about its own bill beside the
 * total: what is left on the order after this bill, and its own pay-to
 * details. Nothing of the client's.
 *
 * The coding view answers only the company that pays (2026-11-13,
 * `lib/money/coding-reader`): a client's cost centers and accounts are the
 * client's. That view also carried two facts that are the issuer's own,
 * the order's "left after this bill" and the pay-to line, and the issuer
 * lost them with the codes. They come back through this read, which
 * carries no cost center, no account, no cost split and no code of any
 * kind: its shape is fixed here, field by field, so nothing of the payer's
 * can ride along.
 *
 * No database in here, on purpose.
 */

/** The issuer's own pay-to line: the bank, the name on the account and four digits, never more. */
export interface IssuerPayTo {
  legalName: string
  accountName: string | null
  paymentMethod: string
  bankName: string | null
  accountLast4: string | null
}

/** The order's one figure, or the sentence saying why it is not given. */
export type IssuerOrderLeft =
  | { number: string; remainingCents: number; consumedPercent: number; overdrawn: boolean }
  | { number: string; unreadable: string }
  | null

export interface OwnBillView {
  workOrder: string | null
  purchaseOrderBalance: IssuerOrderLeft
  remitTo: IssuerPayTo | null
}

/**
 * The pay-to details, only where they are the issuer's own. A remit-to
 * that names any other company is not given, and no tax id, routing
 * digits or address leave here.
 */
export function issuerPayTo(
  remitTo: {
    companyId: string
    legalName: string
    accountName: string | null
    paymentMethod: string
    bankName: string | null
    accountLast4: string | null
  } | null,
  issuerId: string
): IssuerPayTo | null {
  if (!remitTo || remitTo.companyId !== issuerId) return null
  return {
    legalName: remitTo.legalName,
    accountName: remitTo.accountName,
    paymentMethod: remitTo.paymentMethod,
    bankName: remitTo.bankName,
    accountLast4: remitTo.accountLast4,
  }
}

/**
 * The one figure as the issuer reads it: what is left, how much is drawn,
 * and whether it is past the ceiling. Never computed here; it is
 * `leftAfterThisBill`'s answer, narrowed.
 */
export function issuerOrderLeft(left: LeftAfterThisBill): IssuerOrderLeft {
  if (!left) return null
  if ('unreadable' in left) return { number: left.number, unreadable: left.unreadable }
  return {
    number: left.number,
    remainingCents: left.remainingCents,
    consumedPercent: left.consumedPercent,
    overdrawn: left.overdrawn,
  }
}

export function ownBillView(input: {
  orderNumber: string | null
  left: LeftAfterThisBill
  remitTo: Parameters<typeof issuerPayTo>[0]
  issuerId: string
}): OwnBillView {
  return {
    workOrder: input.orderNumber,
    purchaseOrderBalance: issuerOrderLeft(input.left),
    remitTo: issuerPayTo(input.remitTo, input.issuerId),
  }
}

/**
 * The sentence the payer reads if it asks this door: its own view of the
 * same bill is the coding view, which already carries both facts.
 */
export function ownBillIsTheIssuers(invoiceNumber: string): string {
  return `${invoiceNumber} is yours to pay: its order and pay-to details are on its page, beside the cost coding.`
}
