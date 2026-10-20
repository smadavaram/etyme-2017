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
