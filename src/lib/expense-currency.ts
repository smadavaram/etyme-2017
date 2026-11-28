/**
 * The currency an expense is in, decided once where it is raised.
 *
 * `Expense` carried amounts and no currency, so the Approvals row printed
 * every claim in dollars, which is wrong at a non-dollar site such as
 * Corvane's Monterrey or Ho Chi Minh City plants (2026-11-02). An expense
 * is the worker's money, reimbursed on the line that pays them, so it is
 * in that line's pay currency: the buy line this placement's sell line is
 * linked to, the person's own pay on it where it names them. A line that
 * pays nobody below it (a one-person firm bills for herself) is in the
 * currency it bills in.
 *
 *   expenseCurrencyFor(sellContractId, db)   'MXN', 'VND', 'USD', … or null
 *
 * Null only where the line is not on the record. Money's expense route
 * writes the answer on the row it creates; the seeds write it on theirs;
 * every row that prints an expense reads `Expense.currency` and, for an
 * expense raised before the column existed, the line's own currency.
 */
import type { prisma } from '@/lib/db'
import { format, fromDecimal } from '@/lib/money'

type Db = Pick<typeof prisma, 'sellContract'>

/** Pure: the pay currency of the line paying this person, else the line's own. */
export function currencyOfLine(line: {
  personId: string
  billCurrency: string
  buyLinks: readonly { buyContract: { payCurrency: string; candidates: readonly { personId: string; payCurrency: string }[] } }[]
}): string {
  for (const l of line.buyLinks) {
    const own = l.buyContract.candidates.find((c) => c.personId === line.personId)
    if (own) return own.payCurrency
  }
  return line.buyLinks[0]?.buyContract.payCurrency ?? line.billCurrency
}

/** What a reader selects on `Expense.sellContract` so `currencyOfExpense` can fall back to the line. */
export const LINE_CURRENCY_SELECT = {
  personId: true,
  billCurrency: true,
  buyLinks: {
    orderBy: { effectiveFrom: 'desc' },
    select: { buyContract: { select: { payCurrency: true, candidates: { select: { personId: true, payCurrency: true } } } } },
  },
} as const

type Line = Parameters<typeof currencyOfLine>[0]

/**
 * Pure: the currency an expense on the record is in. The row's own, where
 * it was written when the expense was raised; for an expense raised before
 * the column existed, its line's, by the same rule. Never a default: null
 * where neither is known, and the reader says the figure without a symbol.
 */
export function currencyOfExpense(e: { currency: string | null; sellContract: Line | null }): string | null {
  if (e.currency) return e.currency.toUpperCase()
  return e.sellContract ? currencyOfLine(e.sellContract).toUpperCase() : null
}

/**
 * Pure: a claim's whole-currency total as a person reads it, "$149.98",
 * "MX$2,450.00". Without a currency the figure is said with no symbol,
 * never as dollars nobody chose.
 */
export function claimSays(whole: number, currency: string | null): string {
  return currency ? format(fromDecimal(whole, currency)) : whole.toFixed(2)
}

export async function expenseCurrencyFor(sellContractId: string, db: Db): Promise<string | null> {
  const line = await db.sellContract.findUnique({
    where: { id: sellContractId },
    select: LINE_CURRENCY_SELECT,
  })
  return line ? currencyOfLine(line) : null
}
