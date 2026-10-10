/**
 * A client-billable expense rides on the next invoice.
 *
 * Expenses had a status called INVOICED that a button set with no
 * invoice behind it, and a status called PAID that nothing set at all.
 * The claim was approved, the number never reached the client, and the
 * consultant who paid for the flight waited on a word.
 *
 * The rule: an expense that is approved, billable and not yet on an
 * invoice goes on the next invoice raised for its engagement, as a line
 * of its own with the expense behind it rather than a timesheet. It is
 * INVOICED when that invoice exists and PAID when that invoice is paid
 * in full. An expense the company will not bill on stays on the
 * employer's books and is reimbursed through pay, never through a
 * client invoice.
 *
 * Pure, so the two rules — which expenses, and what the line says — are
 * tested as sentences. The routes do the reading and writing.
 */

export interface ExpenseRow {
  id: string
  status: string
  billable: boolean
  invoiceId: string | null
  sellContractId: string
  personId: string
  personName: string
  category: string
  description: string
  /** Whole currency units, as the table stores it. */
  total: number
  currency: string
  periodEnd: Date
}

/** The ones that go on the next invoice. */
export function billableNow(expenses: ExpenseRow[]): ExpenseRow[] {
  return expenses.filter((e) => e.status === 'APPROVED' && e.billable && e.invoiceId === null)
}

export interface ExpenseLine {
  expenseId: string
  sellContractId: string
  personId: string
  amountCents: number
  description: string
  currency: string
  periodEnd: Date
}

/** What the line on the invoice says. Cents, like every other line. */
export function expenseLine(e: ExpenseRow, minorPerUnit = 100): ExpenseLine {
  const what = e.category.charAt(0) + e.category.slice(1).toLowerCase()
  return {
    expenseId: e.id,
    sellContractId: e.sellContractId,
    personId: e.personId,
    amountCents: Math.round(e.total * minorPerUnit),
    description: `${e.personName} — ${what} expense: ${e.description}`,
    currency: e.currency,
    periodEnd: e.periodEnd,
  }
}

/** The total the expenses add to the invoice, in whole currency units. */
export function expenseTotal(lines: ExpenseLine[], minorPerUnit = 100): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0) / minorPerUnit
}
