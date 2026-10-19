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
 * ── Accepted like a week (the founder, 2026-10-19) ───────────────────
 *
 * The firm paying the bill accepts the expense before it pays it, and
 * the bill carries what that firm accepted — never the amount the worker
 * claimed, the same as hours. An expense the payer has not accepted, or
 * sent back, is left off with a sentence, as a week the firm above has
 * not accepted is. Whether this kind of expense is billable at all on
 * this leg is the agreement's between the two firms, where it says; the
 * employer's own `billable` flag decides only where the agreement is
 * silent (`lib/money/expense-acceptance`). An expense of a kind the
 * agreement leaves out is left off with a sentence naming the agreement.
 *
 * ── At every rung (2026-10-19) ───────────────────────────────────────
 *
 * In a chain each firm bills the expense to the firm above it, on its
 * own sell line, at what that firm accepted — once per line, the same
 * as a week (`InvoiceLine`'s unique is (expenseId, sellContractId)). The
 * expense's own `invoiceId` and its status INVOICED and PAID are the
 * employer's rung only (coordinator's decision, reversible by the
 * founder in a sentence): the employer's bill of it to the firm directly
 * above. So a firm above the employer reads whether it already billed an
 * expense from its own lines, never from that column, and an expense the
 * employer has already billed or been paid for is still one the firm in
 * the middle has to bill on. Its amount is in the currency it was raised
 * in; a bill in another currency leaves it off, said, because rupees and
 * dollars are never added and nothing here converts one into the other.
 *
 * Pure, so the rules — which expenses, and what the line says — are
 * tested as sentences. The routes do the reading and writing.
 */

import { notAcceptedSays, type PayersExpenseAcceptance } from '@/lib/money/expense-acceptance'
import { amount } from '@/lib/money-display'

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
  periodStart?: Date
  periodEnd: Date
  /** The firm the bill is to: the customer on the line being billed. */
  payerName?: string
  /**
   * The payer's own decision on this expense. Absent is the same as not
   * accepted: a bill never carries an expense nobody above accepted.
   */
  own?: PayersExpenseAcceptance
  /**
   * Whether this leg bills this kind of expense, from the agreement
   * between the two firms (`legBills`). Absent: the employer's own flag.
   */
  leg?: { bills: boolean; says: string | null }
  /**
   * True where the firm billing is above the employer, on a line over the
   * one the expense was raised on. `sellContractId` is then the billing
   * firm's own line, and `status`/`invoiceId` are the employer's rung's
   * and do not say whether this firm billed it; the caller reads that off
   * this firm's own lines.
   */
  aboveTheEmployer?: boolean
  /** The currency of the line it would be billed on. Absent: the expense's own. */
  billCurrency?: string
}

/** The employer's statuses at which a firm above may bill it on: it is approved, whatever the employer did with it since. */
const APPROVED_OR_BILLED = ['APPROVED', 'INVOICED', 'PAID']

/** One expense left off a bill, and why, in a sentence. */
export interface LeftOff {
  expenseId: string
  says: string
}

/**
 * Which expenses go on the bill, and which are left off and why.
 *
 * Not a candidate at all, and said nowhere: an expense still waiting on
 * the employer's approval, already billed, or one the employer carried as
 * its own cost where the agreement is silent — that is reimbursed through
 * pay and was never going to be billed.
 */
export function sortForBill(expenses: ExpenseRow[]): { on: ExpenseRow[]; leftOff: LeftOff[] } {
  const on: ExpenseRow[] = []
  const leftOff: LeftOff[] = []
  for (const e of expenses) {
    const candidate = e.aboveTheEmployer
      ? APPROVED_OR_BILLED.includes(e.status)
      : e.status === 'APPROVED' && e.invoiceId === null
    if (!candidate) continue
    const leg = e.leg ?? { bills: e.billable, says: null }
    if (!leg.bills) {
      if (leg.says) leftOff.push({ expenseId: e.id, says: `${e.personName}’s ${e.category.toLowerCase()} expense is not on this bill: ${leg.says}` })
      continue
    }
    if (e.billCurrency && e.billCurrency.toUpperCase() !== e.currency.toUpperCase()) {
      leftOff.push({
        expenseId: e.id,
        says:
          `${e.personName}’s ${e.category.toLowerCase()} expense is not on this bill: it was accepted in ${e.currency.toUpperCase()} ` +
          `and this bill is in ${e.billCurrency.toUpperCase()}, and nothing here converts one into the other.`,
      })
      continue
    }
    const why = notAcceptedSays(
      { personName: e.personName, category: e.category, periodStart: e.periodStart ?? e.periodEnd },
      e.payerName ?? 'the firm paying it',
      e.own ?? { kind: 'NONE' }
    )
    if (why) {
      leftOff.push({ expenseId: e.id, says: why })
      continue
    }
    on.push(e)
  }
  return { on, leftOff }
}

/** The ones that go on the next invoice. */
export function billableNow(expenses: ExpenseRow[]): ExpenseRow[] {
  return sortForBill(expenses).on
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

/**
 * What the line on the invoice says. Cents, like every other line, and
 * the amount the payer accepted — never the amount claimed. Called only
 * on an expense `sortForBill` put on the bill; an expense nobody accepted
 * has no amount to bill, and asking for one is a fault, not a zero.
 */
export function expenseLine(e: ExpenseRow, minorPerUnit = 100): ExpenseLine {
  const what = e.category.charAt(0) + e.category.slice(1).toLowerCase()
  if (e.own?.kind !== 'ACCEPTED') {
    throw new Error(`Expense ${e.id} has no acceptance from the firm paying it, so it has no amount to bill.`)
  }
  const claimed = Math.round(e.total * minorPerUnit)
  const accepted = e.own.cents
  return {
    expenseId: e.id,
    sellContractId: e.sellContractId,
    personId: e.personId,
    amountCents: accepted,
    description:
      `${e.personName} — ${what} expense: ${e.description}` +
      (accepted < claimed ? ` (accepted ${amount(accepted, e.currency)} of ${amount(claimed, e.currency)})` : ''),
    currency: e.currency,
    periodEnd: e.periodEnd,
  }
}

/** The total the expenses add to the invoice, in whole currency units. */
export function expenseTotal(lines: ExpenseLine[], minorPerUnit = 100): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0) / minorPerUnit
}
