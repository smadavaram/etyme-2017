/**
 * What the worker's expense form sends, and what it refuses before sending.
 *
 * Pure: no database, no fetch. The form on Your work (`your-expense.tsx`)
 * asks five things — the day, the kind, the amount, a one-line note and,
 * where they have one, a link to the receipt — and this turns them into
 * the body `POST /api/expenses` takes from a worker filing their own
 * (`mayFileOwnExpense` in lib/money/own-expense, 2026-10-20). Whatever the
 * route then refuses is shown as it comes back; this only stops what is
 * plainly not an expense yet, so the worker is told on the screen rather
 * than after a round trip.
 *
 * ── What it does not send, on purpose ─────────────────────────────────
 *
 * - **Who it is for.** The route files it in the caller's own name; a
 *   `personId` naming anybody else is refused there, so none is sent.
 * - **Whether the client is billed for it.** That is the agreement's
 *   between each pair of firms (founder, 2026-10-19), never the worker's
 *   to say.
 * - **The receipt as a file.** `Expense` holds a link to a receipt and no
 *   file of one, so an upload box here would take a file and keep nothing.
 *   The form asks for a link until there is somewhere to keep the file.
 */

/**
 * The kinds of expense, in `Expense.category`'s own vocabulary — the one
 * the agreement's billable kinds are written in. None of them is about
 * any one trade: a travel nurse's flight and a validation engineer's
 * hotel are both Travel.
 */
export const EXPENSE_KINDS = [
  { key: 'TRAVEL', label: 'Travel' },
  { key: 'MEALS', label: 'Meals' },
  { key: 'EQUIPMENT', label: 'Equipment' },
  { key: 'TRAINING', label: 'Training' },
  { key: 'RELOCATION', label: 'Relocation' },
  { key: 'OTHER', label: 'Other' },
] as const

export type ExpenseKind = (typeof EXPENSE_KINDS)[number]['key']

/** Long enough for "Flight to the client site, Portland to San Jose, return", short enough to stay one line. */
export const NOTE_LONGEST = 140

export interface ExpenseAsTyped {
  /** The placement she files her hours on: her employer's line. */
  contractId: string
  /** YYYY-MM-DD, the day it was spent. */
  date: string
  kind: string
  /** As typed: "412.50", "1,200". */
  amount: string
  note: string
  /** A link to the receipt, or empty. */
  receiptUrl: string
  /** YYYY-MM-DD, today where the worker is. */
  today: string
}

export interface ExpenseBody {
  sellContractId: string
  category: ExpenseKind
  description: string
  periodStart: string
  periodEnd: string
  items: { description: string; quantity: number; unitPrice: number }[]
  receiptUrl?: string
}

export type ExpenseVerdict =
  | { ok: true; body: ExpenseBody }
  | { ok: false; field: 'contractId' | 'date' | 'kind' | 'amount' | 'note' | 'receiptUrl'; says: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** Whole currency, to the cent at most: "412", "412.5", "412.50". */
const MONEY = /^\d+(\.\d{1,2})?$/

/**
 * The amount as whole currency, to the cent — never in cents. The route
 * sums quantity × unit price straight into `Expense.total`, which is
 * whole currency, so a price sent in cents files a $412.50 flight as
 * $41,250.00 (the same fault the firm's form had, fixed there first).
 * Null where it is not an amount.
 */
export function amountOf(typed: string): number | null {
  const clean = typed.replace(/[,\s]/g, '')
  if (!MONEY.test(clean)) return null
  // Rounded to the cent through integer cents, so 0.1 + 0.2 never reaches the route.
  return Math.round(Number(clean) * 100) / 100
}

function isWebAddress(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** The body for `POST /api/expenses`, or the one sentence that says what to fix first. */
export function expenseBody(e: ExpenseAsTyped): ExpenseVerdict {
  if (!e.contractId) {
    return { ok: false, field: 'contractId', says: 'Choose the placement you spent it on.' }
  }
  if (!DAY.test(e.date) || Number.isNaN(Date.parse(`${e.date}T00:00:00Z`))) {
    return { ok: false, field: 'date', says: 'Enter the day you spent it.' }
  }
  if (e.date > e.today) {
    return { ok: false, field: 'date', says: 'That day has not happened yet. File an expense once you have paid it.' }
  }
  const kind = EXPENSE_KINDS.find((k) => k.key === e.kind)
  if (!kind) {
    return { ok: false, field: 'kind', says: 'Choose what kind of expense it is.' }
  }
  const amount = amountOf(e.amount)
  if (amount === null) {
    return { ok: false, field: 'amount', says: 'Enter the amount as a number, to the cent at most, like 412.50.' }
  }
  if (amount <= 0) {
    return { ok: false, field: 'amount', says: 'Enter the amount you paid. It cannot be nothing.' }
  }
  const note = e.note.trim().replace(/\s+/g, ' ')
  if (!note) {
    return { ok: false, field: 'note', says: 'Say in one line what it was for. Whoever approves it reads this first.' }
  }
  if (note.length > NOTE_LONGEST) {
    return { ok: false, field: 'note', says: `Keep the note to one line, ${NOTE_LONGEST} characters at most.` }
  }
  const receipt = e.receiptUrl.trim()
  if (receipt && !isWebAddress(receipt)) {
    return {
      ok: false,
      field: 'receiptUrl',
      says: 'The receipt link must be a web address that starts with https://. Leave it empty if you have none.',
    }
  }

  // One day: an expense is spent on a day, and the route asks for a period.
  const at = `${e.date}T00:00:00.000Z`
  return {
    ok: true,
    body: {
      sellContractId: e.contractId,
      category: kind.key,
      description: note,
      periodStart: at,
      periodEnd: at,
      items: [{ description: note, quantity: 1, unitPrice: amount }],
      ...(receipt ? { receiptUrl: receipt } : {}),
    },
  }
}
