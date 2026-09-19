import { hasAnyPermission, type Permission } from '@/lib/permissions'

/**
 * Who may open a money page — and the sentence said to whoever may not.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * `GET /api/ar` and `GET /api/ap` were gated on `margin.read || pnl.read`
 * from the day they were written, with a comment saying who owes what is
 * "the same class of fact as what a placement earns". It is not, and the
 * consequence was that the two desks the pages are NAMED AFTER were
 * refused by them: an Accounts Receivable clerk, whose job description in
 * `lib/company-defaults` reads "Bills the client and records what came
 * in", opened Accounts receivable and was turned away. So was AP &
 * Payroll, and so was a client's AP Clerk.
 *
 * The giveaway was inside the same files. Every WRITE was gated on the
 * work — `payments.record` to record a receipt, `invoices.issue` to send
 * a chasing letter — and every READ on margin. The clerk could record a
 * payment against the queue they could not see. A read strictly harder
 * than the write beside it is a copy-paste, not a decision.
 *
 * ── What the gate should be ──────────────────────────────────────────
 *
 * `invoices.read`. That is already the gate on `/api/invoices`,
 * `/api/expenses` and `/api/purchase-orders` — every other money read in
 * the domain — so AR and AP were the outliers rather than the rule.
 *
 * It holds because of what is actually on those pages. Accounts
 * receivable is the invoice book read by age: billed, paid, outstanding,
 * chased. Every figure on it is sell-side. Accounts payable is the bill
 * book read by due date: owed, overdue, days to pay. Every figure on
 * THAT is buy-side. Neither is a margin screen, because margin needs
 * both sides of the same piece of work at once — and where a page does
 * put them side by side, the fence below is what stands in front of it
 * rather than the page gate.
 *
 * It excludes exactly who it should. A Recruiter holds no `*.cost`, no
 * `margin.read`, no `pnl.read` and no `invoices.read`, which is the
 * single exclusion that stops a bench total being worked backwards into
 * somebody's salary. HR at a supplier "sees no money" and holds none of
 * them either. Neither gets in.
 *
 * ── Why a table and not four `if`s ───────────────────────────────────
 *
 * Because the bug was invisible until somebody sat in the seat. A table
 * naming, per page, the desks whose own blurb says they do this work is
 * a thing a test can walk: for every default role of every company kind,
 * the desk a money page is named for can open it. That test fails on the
 * commit that regresses the gate rather than on the day a clerk
 * telephones.
 */

// ── The fence that is actually about margin ──────────────────────────

/**
 * Seeing what a client paid BESIDE what its supplier was paid, for the
 * same piece of work, is seeing the margin on it — the subtraction is
 * left as an exercise. This is the one thing on either page that really
 * does need `margin.read`, and it is fenced per figure rather than per
 * page so the desk that pays suppliers keeps the page it pays from.
 */
export const BOTH_SIDES: readonly Permission[] = ['margin.read', 'pnl.read']

export function maySeeBothSides(permissions: readonly string[]): boolean {
  return hasAnyPermission(permissions, BOTH_SIDES)
}

/** Said in `gaps`, where the withheld figures would otherwise be. */
export const BOTH_SIDES_WITHHELD =
  'What a client paid and what its supplier was paid for the same work are not shown ' +
  'together here, because the gap between them is the margin on it. What the firm owes ' +
  'and when it falls due is all above. Ask whoever manages roles for the profitability ' +
  'desk if you need the chains.'

// ── The pages ────────────────────────────────────────────────────────

export interface MoneyPage {
  key: 'AR' | 'AP'
  /** What the reader calls it. Their word, not the route's. */
  title: string
  /** Holding any ONE of these opens it. */
  opensFor: readonly Permission[]
  /**
   * The default roles whose own job description is this page, by name in
   * `lib/company-defaults`. Every one of them must be able to open it,
   * and a test says so.
   */
  desks: readonly string[]
  /** What is missing and what to do about it. Never a permission code. */
  refusal: string
}

export const RECEIVABLE: MoneyPage = {
  key: 'AR',
  title: 'Accounts receivable',
  opensFor: ['invoices.read'],
  desks: ['Accounts Receivable', 'Finance', 'Account Manager', 'Owner', 'Admin'],
  refusal:
    'Accounts receivable is the invoice book: what has been billed, what came in, and how ' +
    'old the rest is. Reading it belongs to the desk that bills clients — Accounts ' +
    'Receivable or Finance. Ask whoever manages roles at your company to seat you there.',
}

export const PAYABLE: MoneyPage = {
  key: 'AP',
  title: 'Accounts payable',
  opensFor: ['invoices.read'],
  desks: ['AP & Payroll', 'Finance', 'AP Clerk', 'Owner', 'Admin'],
  refusal:
    'Accounts payable is the bill book: what suppliers have invoiced, when each falls due, ' +
    'and how long the firm is taking to pay. Reading it belongs to the desk that pays them ' +
    '— AP & Payroll, Finance, or an AP clerk. Ask whoever manages roles at your company to ' +
    'seat you there.',
}

export const MONEY_PAGES: readonly MoneyPage[] = [RECEIVABLE, PAYABLE]

/** May this caller open it at all? */
export function mayOpen(permissions: readonly string[], page: MoneyPage): boolean {
  return hasAnyPermission(permissions, page.opensFor)
}

/**
 * The refusal body, shaped like every other error in the app.
 *
 * It names the page and the desk. The old one said "A recruiter role
 * deliberately does not" to everybody it refused, which was true of a
 * recruiter and wrong in front of the AR clerk reading it — and a
 * refusal that misdescribes its reader is worse than a terse one,
 * because the reader goes and asks for the wrong thing.
 */
export function refusal(page: MoneyPage): {
  error: { code: 'FORBIDDEN'; message: string }
} {
  return { error: { code: 'FORBIDDEN', message: page.refusal } }
}

// ── Receiving what a supplier sent ───────────────────────────────────

/**
 * Who may record a supplier's invoice against a contract.
 *
 * This was `invoices.issue`, which is the permission for putting OUR
 * document in front of a customer — and the AP & Payroll desk does not
 * hold it, deliberately, because a firm where one desk both bills and
 * pays has no segregation at all. Nor does a client's AP Clerk, whose
 * blurb is "Matches and pays supplier invoices". So the desk whose whole
 * job is receiving supplier invoices could not record one.
 *
 * CLAUDE.md's vocabulary section is the giveaway: the party who ISSUES a
 * document names it, we do not raise a supplier's invoice, we receive
 * it. Receiving is the paying desk's act, so `payments.record` opens it.
 * `invoices.issue` is kept beside it rather than swapped for it — the
 * Accounts Receivable and Finance desks were already doing this and
 * taking it away would be a second bug of the same shape in the other
 * direction.
 */
export const RECEIVES_SUPPLIER_INVOICES: readonly Permission[] = [
  'payments.record',
  'invoices.issue',
]

export function mayRecordSupplierInvoice(permissions: readonly string[]): boolean {
  return hasAnyPermission(permissions, RECEIVES_SUPPLIER_INVOICES)
}

export const NOT_THE_PAYING_DESK =
  'Recording what a supplier has invoiced belongs to the desk that pays them — AP & ' +
  'Payroll, Finance, or an AP clerk. Ask whoever manages roles at your company to seat ' +
  'you there.'
