import { prisma } from '@/lib/db'

/**
 * Which of a firm's payment details a payment goes to: the one reader.
 *
 * The row in use is the firm's default; where it has none, the first it
 * entered. The payment gate (`mayPayFirm` in lib/setup-gates), the bank
 * check from a held receipt (lib/money/bank-check-read) and a payment
 * run's file (lib/money/run-file-read) all read this row, so the row a
 * payer checks is the row the gate asks about and the row the file prints.
 *
 * Never "some checked row" (Layer 7 money review, 2026-11-16): a firm that
 * makes new, unchecked details its default while older ones stand checked
 * is not paid until the new ones are checked, because the new ones are
 * where it asked to be paid.
 */

type Db = Pick<typeof prisma, 'remitTo'>

/** Default first, then the first entered; the id breaks a tie so two reads never disagree. */
export const PAY_TO_ORDER = [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }]

const PAY_TO_SELECT = {
  id: true, companyId: true, bankName: true, accountName: true, legalName: true, accountLast4: true, verifiedAt: true,
} as const

export interface PayToRow {
  id: string
  companyId: string
  bankName: string | null
  accountName: string | null
  legalName: string
  accountLast4: string | null
  verifiedAt: Date | null
}

/** The payment details a payment to this firm goes to, or null where it has none. */
export async function payToRow(companyId: string, db: Db = prisma): Promise<PayToRow | null> {
  return db.remitTo.findFirst({ where: { companyId }, orderBy: PAY_TO_ORDER, select: PAY_TO_SELECT })
}

/** The same row for several firms at once, by firm. A firm with none is absent. */
export async function payToRows(companyIds: readonly string[], db: Db = prisma): Promise<Map<string, PayToRow>> {
  const rows = companyIds.length
    ? await db.remitTo.findMany({ where: { companyId: { in: [...companyIds] } }, orderBy: PAY_TO_ORDER, select: PAY_TO_SELECT })
    : []
  return firstPerFirm(rows)
}

/** Pure: the first row per firm, from rows already in `PAY_TO_ORDER`. */
export function firstPerFirm<R extends { companyId: string }>(ordered: readonly R[]): Map<string, R> {
  const out = new Map<string, R>()
  for (const r of ordered) if (!out.has(r.companyId)) out.set(r.companyId, r)
  return out
}

// ── What a bill prints ────────────────────────────────────────────────
//
// Layer 7 money review, 2026-11-16: a bill printed an older checked row
// while the firm's default was new and unchecked, so a client paying off
// the bill could pay an account the firm had moved away from. A bill now
// prints the row `payToRow` names, read when the bill is read, and only
// where that row is checked. Otherwise it prints no account at all and
// says the details are being confirmed (`payToSays` in
// lib/money/pay-to-words). Never an older or an unchecked row.

/** The fields a bill prints, beside the ones `payToRow` reads. */
const ON_BILL_SELECT = {
  ...PAY_TO_SELECT, paymentMethod: true, addressLines: true, country: true, taxId: true, routingLast4: true,
} as const

export interface PayToOnBill extends PayToRow {
  paymentMethod: string
  addressLines: string[]
  country: string
  taxId: string | null
  routingLast4: string | null
}

/** Pure: the row a bill prints, which is the pay-to row where it is checked, else none. */
export function printedOnBill<R extends { verifiedAt: Date | null }>(row: R | null): R | null {
  return row?.verifiedAt ? row : null
}

/**
 * What a bill issued by this firm prints today, and whether the firm has
 * details on Etyme at all (so the sentence in their place is true).
 */
export async function payToOnBill(
  issuerId: string,
  db: Db = prisma,
): Promise<{ row: PayToOnBill | null; entered: boolean }> {
  const row = await db.remitTo.findFirst({ where: { companyId: issuerId }, orderBy: PAY_TO_ORDER, select: ON_BILL_SELECT })
  return { row: printedOnBill(row), entered: row != null }
}
