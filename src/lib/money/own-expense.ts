/**
 * A worker files their own expense, on their own placement.
 *
 * ── Why this door exists ─────────────────────────────────────────────
 *
 * The simulation of 2026-10-20: a worker who paid for a flight to the
 * client's site could not file it. `POST /api/expenses` asked for a seat
 * that reads invoices, so only the employer could raise it, from the
 * worker's receipt. The worker is the one holding the receipt.
 *
 * So the expense route takes the worker's own filing, the way the worker
 * files their own week: on their own placement only, in their own name
 * only, and on the rung the employer holds — the one whose seller is not
 * itself buying them on another rung, the same rung their hours hang off
 * (`rungsToFile` in lib/consultant-portfolio). A filing on a rung above
 * would put the expense on the prime's line, which the employer never
 * sees and cannot approve.
 *
 * The worker's filing is the submission: it lands SUBMITTED, waiting on
 * the employer's approval (`/api/expenses/actions`), which is unchanged.
 * Each firm above then accepts it before it pays it, as before.
 *
 * Pure: no database.
 */

import { agreementName, legBills, type Leg } from '@/lib/money/expense-acceptance'

/** A sell line naming the worker, as this rule needs it. */
export interface ExpenseRung {
  id: string
  personId: string
  /** The firm selling the work on this rung. */
  companyId: string
  companyName: string
  /** The firm buying it on this rung. */
  clientCompanyId: string
  state: string
}

export type OwnExpenseVerdict =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409 | 422; code: string; says: string }

/** States a placement takes no expense in: it never ran. */
const NEVER_RAN = ['CANCELLED']

/**
 * Whether this person may file an expense on this line themselves.
 *
 * `rungs` is every sell line naming the line's person, the line itself
 * among them.
 */
export function mayFileOwnExpense(i: {
  callerPersonId: string
  /** The person the body names, where it names one. */
  askedPersonId?: string | null
  line: ExpenseRung | null
  rungs: ReadonlyArray<ExpenseRung>
}): OwnExpenseVerdict {
  if (i.askedPersonId && i.askedPersonId !== i.callerPersonId) {
    return {
      ok: false, status: 403, code: 'NOT_YOURS',
      says: 'You file your own expenses. Anybody else files theirs from their own page, and nobody files one for them.',
    }
  }
  if (!i.line) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'There is no placement here to file an expense on.' }
  }
  if (i.line.personId !== i.callerPersonId) {
    return {
      ok: false, status: 403, code: 'NOT_YOURS',
      says: 'This placement is not yours, so you cannot file an expense on it. Each person files their own, on their own placement.',
    }
  }
  if (NEVER_RAN.includes(i.line.state)) {
    return { ok: false, status: 409, code: 'NEVER_RAN', says: 'This placement was canceled before it started, so nothing is filed on it.' }
  }
  const line = i.line
  const buyers = i.rungs.filter((r) => r.id !== line.id && r.personId === line.personId).map((r) => r.clientCompanyId)
  if (buyers.includes(line.companyId)) {
    const own = i.rungs.find((r) => r.id !== line.id && r.personId === line.personId && !i.rungs.some((o) => o.id !== r.id && o.clientCompanyId === r.companyId))
    return {
      ok: false, status: 422, code: 'NOT_YOUR_RUNG',
      says:
        `File it on your placement with ${own?.companyName ?? 'the firm that employs you'}, which approves it. ` +
        `This line is ${line.companyName}’s, and an expense filed here would never reach your employer.`,
    }
  }
  return { ok: true }
}

// ── Whether the firm above is billed for it ──────────────────────────
//
// The founder, 2026-10-19: whether a kind of expense is billable comes
// from the agreement between each pair, never from the supplier's own
// flag — and so never from the worker's. The form on Your work sends no
// flag, on purpose, and the route stored `billable: true` for every
// filing that did not say: every worker's expense was put on the bill to
// the firm above unless somebody remembered to say no.
//
// So the flag stored on a filing is decided here, from the agreement on
// the line it is filed on: the employer's own leg, between the employer
// and the firm directly above it.
//
// - The agreement lists the kind: billable, and the sentence says so.
// - The agreement said, and does not list it: not billable, in the same
//   sentence the expenses page reads (`legBills`).
// - The agreement is silent, or there is none: not decided. Stored false,
//   because a guess of true is the employer's flag written by nobody, and
//   the sentence says the employer decides whether the firm above is
//   billed. Under a silent agreement `legBills` reads the stored flag, so
//   false keeps it the employer's own cost until somebody decides.
//
// A worker's own `billable` in the body is never read: it is not theirs
// to say.

export interface BillableOnFiling {
  /** What `Expense.billable` stores. */
  billable: boolean
  /** AGREEMENT where the agreement said; NOT_DECIDED where it is silent. */
  from: 'AGREEMENT' | 'NOT_DECIDED'
  /** One sentence for the person filing it. */
  says: string
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Whether an expense of this kind, filed on this leg, bills the firm above. */
export function billableOnFiling(i: { category: string; leg: Leg }): BillableOnFiling {
  const { leg } = i
  const kind = String(i.category).toLowerCase()
  const a = leg.agreement
  if (a && a.said) {
    const v = legBills({ category: String(i.category), billable: false }, leg)
    return {
      billable: v.bills,
      from: 'AGREEMENT',
      says: v.bills
        ? `${capitalize(agreementName(leg))} makes ${kind} expenses billable, so ${leg.payerName} is billed for it once it is accepted.`
        : v.says!,
    }
  }
  const silent = a
    ? `${capitalize(agreementName(leg))} does not say which expenses are billable`
    : `No agreement between ${leg.payerName} and ${leg.sellerName} says which expenses are billable`
  return {
    billable: false,
    from: 'NOT_DECIDED',
    says: `${silent}, so ${leg.sellerName} decides whether ${leg.payerName} is billed for it. For now it is recorded as ${leg.sellerName}’s own cost.`,
  }
}
