import type { ExpenseToAccept } from '@/lib/money/expense-acceptance-read'
import { amount } from '@/lib/money-display'
import type { Permission } from '@/lib/permissions'

/**
 * An expense waiting on this firm to accept it, as a row on its queue.
 *
 * The founder, 2026-10-19 (decision 1): an expense is accepted like a
 * week. Each firm that pays for it accepts it before it pays, the client
 * first and then down the chain. Money decides whose turn it is
 * (`expensesWaitingOn` in `lib/money/expense-acceptance-read`) and owns
 * the one route that records the answer (`POST /api/expenses/:id/accept`).
 * This decides only what the row says and who hears it.
 *
 * Who hears: whoever signs the work or pays for it — the same two
 * permissions the accept route asks for, so the queue never offers a
 * card the route would refuse.
 *
 * What it names: the firm directly below this one, which is this firm's
 * own supplier and a name it already knows. Never the employer further
 * down, whose name is the firm in the middle's to keep, and nothing else
 * about who raised the expense.
 *
 * Pure: no database.
 */

/** The permissions the accept route asks for. One of them is enough. */
export const ACCEPTS_EXPENSES: readonly Permission[] = ['timesheets.approve', 'payments.record']

/** The row, less its category, which the queue's own list of types sets. */
export interface ExpenseAcceptanceDecision {
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  entityType: 'EXPENSE'
  entityId: string
  dueDate: null
  actionUrl: string
  /**
   * Whole dollars, the unit every other row on the queue carries, so the
   * page's "Value" adds like with like. Null for any other currency: the
   * page sums one total in dollars, and adding euros to it is a number
   * nobody could stand behind. The subtitle still says the amount.
   */
  amount: number | null
  /** What this firm may accept at most, in minor units — the card's Accept sends nothing more. */
  upToCents: number
  currency: string
  createdAt: string
}

/**
 * The kind of expense in plain words: TRAVEL reads "Travel". The stored
 * value is the machine's; the row is read by a person.
 */
export function kindWord(category: string): string {
  const words = category.trim().toLowerCase().replace(/_/g, ' ')
  return words ? words[0].toUpperCase() + words.slice(1) : 'Expense'
}

const DAY = 86_400_000

/**
 * The row for one expense this firm is next to accept.
 *
 * Urgency is counted from the day the worker's employer approved it,
 * because that is the only date the queue reads; a firm low in a long
 * chain may have received it later than that, and is shown it as older,
 * never as newer, than it is.
 */
export function expenseAcceptanceDecision(e: ExpenseToAccept, now: Date): ExpenseAcceptanceDecision {
  const since = e.approvedAt ?? e.periodStart
  const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY))
  const currency = (e.currency || 'USD').toUpperCase()
  return {
    title: `Accept expense — ${e.personName}`,
    subtitle: `${amount(e.upToCents, currency)} · ${kindWord(e.category)} · from ${e.from}`,
    urgency: days >= 5 ? 'HIGH' : days >= 2 ? 'MEDIUM' : 'LOW',
    entityType: 'EXPENSE',
    entityId: e.expenseId,
    dueDate: null,
    actionUrl: '/dashboard/expenses',
    amount: currency === 'USD' ? e.upToCents / 100 : null,
    upToCents: e.upToCents,
    currency,
    createdAt: since.toISOString(),
  }
}
