/**
 * A client's money, the way a client's money works.
 *
 * ── Why this is not the vendor's model turned around ─────────────────
 *
 * A supplier's books run revenue − cost = margin, and the top line is a
 * sell contract. A client has no sell contract. Their top line is the
 * **budget** a cost center was given, and everything below it is a
 * claim against it at a different stage of certainty.
 *
 * Asked for directly, and settled on SAP's terms: "do what SAP project
 * systems or internal order does." So this is availability control as
 * SAP does it, in the trade's words rather than SAP's:
 *
 *     Available = Budget − Commitment − Actual
 *
 * and the commitment is **relieved as it is consumed**. A twelve-month
 * contract at $98 commits the whole twelve months on the day it starts;
 * each week of accepted work moves out of the commitment and into
 * actual. Nothing is counted twice, and the four figures add up.
 *
 * ── Where the cost is recognized ─────────────────────────────────────
 *
 * At acceptance, not at payment. This is the one place SAP's answer
 * differs from the way the question is usually asked ("actuals means
 * what is paid already"), and following SAP here is right: the client
 * incurred the cost the moment it signed for the week. What the invoice
 * and the payment then do is settle a liability that already exists.
 *
 * So an approved timesheet is a goods receipt and posts actual cost.
 * Invoiced-and-unpaid and paid are *cash* views of that same actual,
 * shown underneath it rather than beside it — because adding them to
 * the actual would count the same work twice, which is exactly the
 * mistake this file exists to make impossible.
 *
 * ── What a client never has ──────────────────────────────────────────
 *
 * A bill. Nothing here computes revenue, margin, or what a supplier
 * makes. The client's whole question is how much of its own budget is
 * left, and every figure below answers a piece of that.
 */

const CENTS_PER_HOUR_DEFAULT_WEEK = 40
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export interface ContractFact {
  id: string
  /** The person on it, for the row. */
  personName: string
  supplierName: string
  /** Cents per hour the client pays — the rung this client is on, never a sub's rate. */
  billRateCents: number
  hoursPerWeek: number | null
  startDate: Date
  endDate: Date | null
  /** Live, or finished. Only a live contract still commits anything. */
  live: boolean
  /** This cost center's share, in basis points. 10000 = all of it. */
  shareBps: number
}

export interface AcceptedWork {
  contractId: string
  /** Hours the client signed for and will be charged for, at the ordinary rate. */
  hours: number
  /**
   * Of those, the hours over the week's limit that somebody has decided.
   *
   * Passed in already split rather than split here, because the split
   * is a weekly judgment on the daily hours and this file never sees
   * a day. `lib/overtime` does it once, for the invoice and for this,
   * so the two cannot disagree about what a week was worth.
   */
  overtimeHours?: number
  /**
   * What the approver actually applied, in basis points — the decision's
   * own `appliedBps`, never the contract's multiplier.
   *
   * There is no default premium here on purpose. A contract carrying
   * `overtimeMultiplierBps: 15000` used to make this file charge a cost
   * center time and a half for a week nobody had agreed to, which is
   * the bug this whole change exists to remove. Absent means the plain
   * rate.
   */
  overtimeAppliedBps?: number
  /**
   * Hours over the limit that nobody has decided yet.
   *
   * Not priced — they are worth somewhere between the plain rate and
   * the multiplier and nobody knows which, so they are named in
   * `unknowns` rather than guessed at. A plausible wrong number on a
   * budget screen is worse than a blank, because nobody audits good
   * news.
   */
  pendingOvertimeHours?: number
  /** Whether a bill for it has arrived and been settled. */
  invoiced: boolean
  paid: boolean
}

export interface AcceptedExpense {
  contractId: string
  amountCents: number
  invoiced: boolean
  paid: boolean
}

export interface ContractLine {
  contractId: string
  personName: string
  supplierName: string
  /** Signed and not yet worked. */
  committedCents: number
  /** Work accepted — the cost is incurred whether or not it is paid. */
  actualCents: number
  /** Of the actual: billed and still owed. */
  toPayCents: number
  /** Of the actual: settled. */
  paidCents: number
  /** committed + actual — everything this contract will take from the budget. */
  totalCents: number
  says: string
}

export interface BudgetLedger {
  budgetCents: number | null
  committedCents: number
  actualCents: number
  toPayCents: number
  paidCents: number
  /** Budget − committed − actual. Null where no budget has been set. */
  availableCents: number | null
  /** How much of the budget is spoken for, 0–1. Null with no budget. */
  usedShare: number | null
  lines: ContractLine[]
  says: string
  /** What the figures rest on that somebody should know. */
  unknowns: string[]
}

const money = (cents: number): string => {
  const d = Math.round(cents / 100)
  return d >= 1000 ? `$${(d / 1000).toFixed(d >= 10_000 ? 0 : 1)}k` : `$${d}`
}

/**
 * The whole contract, start to finish, at this cost center's share.
 *
 * Rate × hours a week × the weeks it runs. This is the claim it makes
 * on the budget the day it is signed, and availability control is the
 * reason it matters: money promised to somebody is money that cannot
 * be promised to anybody else, whether or not the work has happened.
 *
 * Null where there is no end date. An open-ended engagement has no
 * ceiling, and inventing twelve months for one would put a figure on
 * the screen that no document anywhere supports.
 */
export function contractValueOf(c: ContractFact): number | null {
  if (!c.endDate) return null
  const weeks = (c.endDate.getTime() - c.startDate.getTime()) / MS_PER_WEEK
  if (weeks <= 0) return 0
  const hours = c.hoursPerWeek ?? CENTS_PER_HOUR_DEFAULT_WEEK
  return Math.round(c.billRateCents * hours * weeks * (c.shareBps / 10_000))
}

/**
 * What is still committed: the contract, less what has been accepted.
 *
 * ── The mistake this replaced ────────────────────────────────────────
 *
 * It counted the weeks between *today* and the last day. That looks
 * equivalent and is not. A commitment is relieved by receipts, never by
 * the calendar — so a contract that ran three months while nobody filed
 * a timesheet had three months of claim quietly vanish from the budget,
 * and the cost center read healthier than it was. Time passing is not
 * the same event as work being accepted, and only one of them relieves
 * a commitment.
 *
 * Written this way, committed + actual is always the contract total for
 * a live contract, which is what makes the four figures add up and the
 * same week impossible to count twice.
 */
export function commitmentOf(c: ContractFact, actualCents: number): number {
  if (!c.live) return 0
  const total = contractValueOf(c)
  if (total == null) return 0
  return Math.max(0, total - actualCents)
}

/**
 * The cost center's position, and every contract under it.
 *
 * `budgetCents` null means nobody has entered a budget. The figures
 * below it are still true and still worth showing — what is missing is
 * only the line they are measured against, and saying so is better
 * than showing a zero that reads like an overspend.
 */
export function ledgerFor(input: {
  budgetCents: number | null
  contracts: ContractFact[]
  work: AcceptedWork[]
  expenses: AcceptedExpense[]
  on: Date
}): BudgetLedger {
  const { budgetCents, contracts, work, expenses } = input
  const byContract = new Map(contracts.map((c) => [c.id, c]))

  const lines: ContractLine[] = contracts.map((c) => {
    const share = c.shareBps / 10_000
    const mine = work.filter((w) => w.contractId === c.id)
    const myExpenses = expenses.filter((e) => e.contractId === c.id)

    const valueOfWork = (w: AcceptedWork) => {
      const ot = w.overtimeHours ?? 0
      // Absent is the plain rate, not a premium. Nothing multiplies a
      // rate here unless a person chose to.
      const bps = w.overtimeAppliedBps ?? 10_000
      return Math.round((Math.max(0, w.hours - ot) * c.billRateCents + ot * c.billRateCents * (bps / 10_000)) * share)
    }

    const hoursCents = mine.reduce((n, w) => n + valueOfWork(w), 0)
    const expenseCents = myExpenses.reduce((n, e) => n + Math.round(e.amountCents * share), 0)
    const actual = hoursCents + expenseCents
    const settled = (paid: boolean) =>
      mine.filter((w) => w.invoiced && w.paid === paid).reduce((n, w) => n + valueOfWork(w), 0) +
      myExpenses.filter((e) => e.invoiced && e.paid === paid).reduce((n, e) => n + Math.round(e.amountCents * share), 0)

    const paidCents = settled(true)
    const toPayCents = settled(false)
    const committedCents = commitmentOf(c, actual)

    return {
      contractId: c.id,
      personName: c.personName,
      supplierName: c.supplierName,
      committedCents,
      actualCents: actual,
      toPayCents,
      paidCents,
      totalCents: committedCents + actual,
      says: sentenceForLine(c, committedCents, actual, toPayCents),
    }
  })

  const sum = (pick: (l: ContractLine) => number) => lines.reduce((n, l) => n + pick(l), 0)
  const committedCents = sum((l) => l.committedCents)
  const actualCents = sum((l) => l.actualCents)
  const availableCents = budgetCents == null ? null : budgetCents - committedCents - actualCents

  const unknowns: string[] = []
  if (budgetCents == null) {
    unknowns.push('No budget has been set for this period, so there is nothing to measure the spend against.')
  }
  const assumed = contracts.filter((c) => c.live && c.hoursPerWeek == null).length
  if (assumed > 0) {
    unknowns.push(
      `${assumed} ${assumed === 1 ? 'contract does' : 'contracts do'} not state hours a week, ` +
        `so the commitment assumes ${CENTS_PER_HOUR_DEFAULT_WEEK}.`
    )
  }
  const undecided = work.reduce((n, w) => n + (w.pendingOvertimeHours ?? 0), 0)
  if (undecided > 0) {
    const weeks = work.filter((w) => (w.pendingOvertimeHours ?? 0) > 0).length
    unknowns.push(
      `${Math.round(undecided * 100) / 100} hours of overtime on ${weeks} ` +
        `${weeks === 1 ? 'timesheet is' : 'timesheets are'} waiting on somebody to say what ` +
        'happens to them, so they are not costed here yet.'
    )
  }

  const openEnded = contracts.filter((c) => c.live && !c.endDate).length
  if (openEnded > 0) {
    unknowns.push(
      `${openEnded} ${openEnded === 1 ? 'contract has' : 'contracts have'} no end date, so nothing ` +
        'is reserved for them beyond the work already accepted.'
    )
  }

  return {
    budgetCents,
    committedCents,
    actualCents,
    toPayCents: sum((l) => l.toPayCents),
    paidCents: sum((l) => l.paidCents),
    availableCents,
    usedShare: budgetCents == null || budgetCents <= 0 ? null : (committedCents + actualCents) / budgetCents,
    lines: [...lines].sort((a, b) => b.totalCents - a.totalCents),
    says: sentence(budgetCents, committedCents, actualCents, availableCents),
    unknowns,
  }
}

function sentenceForLine(c: ContractFact, committed: number, actual: number, toPay: number): string {
  const who = `${c.personName} through ${c.supplierName}`
  if (!c.live) {
    return `${who}: finished, ${money(actual)} of work accepted${toPay > 0 ? `, ${money(toPay)} still to pay` : ''}.`
  }
  if (committed === 0) {
    return `${who}: ${money(actual)} accepted so far, and nothing reserved ahead — no end date on the contract.`
  }
  return `${who}: ${money(actual)} accepted, ${money(committed)} still to run.`
}

/**
 * The one line at the top.
 *
 * Written for somebody who owns the budget and wants to know whether
 * they can afford the next hire, which is the only reason anybody opens
 * this screen.
 */
function sentence(
  budget: number | null,
  committed: number,
  actual: number,
  available: number | null
): string {
  if (budget == null) {
    return `${money(committed + actual)} committed and spent. Set a budget for this period to see what is left.`
  }
  if (available == null) return `${money(committed + actual)} committed and spent.`
  if (available < 0) {
    return (
      `${money(-available)} over budget. ${money(actual)} of work is already accepted and ` +
      `${money(committed)} more is committed against a ${money(budget)} budget.`
    )
  }
  const share = budget > 0 ? (committed + actual) / budget : 0
  if (share >= 0.9) {
    return `${money(available)} left of ${money(budget)} — under a tenth of the budget, with ${money(committed)} of it already committed.`
  }
  return `${money(available)} left of ${money(budget)}. ${money(actual)} accepted, ${money(committed)} committed and not yet worked.`
}
