/**
 * An expense, and the two companies that have to agree to it.
 *
 * The same shape as a timesheet and for the same reason: the client
 * agrees the cost was theirs to bear, and the employer agrees to
 * reimburse the person. Different assertions, different companies, and
 * in a chain almost never the same one.
 *
 * ── What 2017 got right and I had not ────────────────────────────────
 *
 * `ClientExpense` carried two cycles — `ce_cycle_id` for submission and
 * `ce_ap_cycle_id` for approval — so a client had a due date for
 * agreeing an expense exactly as they did for a timesheet. That is the
 * right shape and it was already there in 2016.
 *
 * Its states were pending · not_submitted · submitted · approved ·
 * bill_generated · rejected · invoice_generated · paid, and rejection
 * set it back to `not_submitted` rather than killing it — "rejected and
 * opened for resubmission". A rejected expense that cannot be corrected
 * is one the contractor swallows, and they remember.
 *
 * ── The one thing an expense has that a timesheet does not ───────────
 *
 * A receipt, and a policy that says whether it is allowed at all. An
 * expense over the limit is not a rejection — it is a question, and the
 * difference matters to somebody who has already spent the money.
 */

export type State =
  /** Being written. Nobody has seen it. */
  | 'DRAFT'
  /** With the client, waiting for them to agree the cost was theirs. */
  | 'SUBMITTED'
  /** The client agreed. Billable. */
  | 'CLIENT_APPROVED'
  /** The employer agreed to reimburse. Payable. */
  | 'AGREED'
  /** Sent back for correction. Not dead. */
  | 'RETURNED'
  /** On an invoice. */
  | 'INVOICED'
  /** Reimbursed. */
  | 'PAID'

export interface Policy {
  /** Above this, somebody has to say yes explicitly. Null = no limit. */
  limitCents: number | null
  /** Whether a receipt is required at all. */
  receiptRequired: boolean
  /** Above this, a receipt is required whatever the setting says. */
  receiptAboveCents: number | null
  /** Categories this client will pay for. Empty = anything. */
  allowed: string[]
}

export interface Expense {
  id: string
  personName: string
  category: string
  amountCents: number
  currency: string
  spentOn: Date
  description: string
  hasReceipt: boolean
  state: State
  clientApprovedAt: Date | null
  agreedAt: Date | null
  /** What the employer agreed to reimburse, where it differs. */
  agreedCents: number | null
  returnedNote: string | null
}

export interface Check {
  code: 'RECEIPT' | 'OVER_LIMIT' | 'CATEGORY' | 'AGE'
  ok: boolean
  says: string
  /** True where this stops it rather than flagging it. */
  blocking: boolean
}

/** Older than this and a client will argue about it, fairly. */
export const STALE_AFTER_DAYS = 90

/**
 * What the policy says about this one.
 *
 * Returns questions, not verdicts. An expense over the limit is not
 * fraud — it is usually a hotel in a city where the limit was set by
 * somebody who has not been there. Blocking it outright is how people
 * stop claiming and start resenting.
 */
export function check(e: Expense, p: Policy, now: Date): Check[] {
  const out: Check[] = []
  const money = (c: number) => `${e.currency === 'USD' ? '$' : ''}${(c / 100).toFixed(2)}`

  // ── Receipt ──
  const needsReceipt =
    p.receiptRequired ||
    (p.receiptAboveCents != null && e.amountCents > p.receiptAboveCents)

  if (needsReceipt && !e.hasReceipt) {
    out.push({
      code: 'RECEIPT',
      ok: false,
      says:
        p.receiptAboveCents != null && !p.receiptRequired
          ? `Anything over ${money(p.receiptAboveCents)} needs a receipt.`
          : 'This client asks for a receipt on every claim.',
      // The one genuine block. Without it, nobody downstream can prove
      // the cost was incurred, and it is the first thing an auditor asks.
      blocking: true,
    })
  } else {
    out.push({ code: 'RECEIPT', ok: true, says: 'Receipt attached.', blocking: false })
  }

  // ── Limit ──
  if (p.limitCents != null && e.amountCents > p.limitCents) {
    out.push({
      code: 'OVER_LIMIT',
      ok: false,
      says:
        `${money(e.amountCents)} against a limit of ${money(p.limitCents)}. ` +
        `Not refused — somebody has to say yes to it deliberately.`,
      blocking: false,
    })
  }

  // ── Category ──
  if (p.allowed.length > 0 && !p.allowed.some((c) => c.toLowerCase() === e.category.toLowerCase())) {
    out.push({
      code: 'CATEGORY',
      ok: false,
      says: `This client does not reimburse ${e.category.toLowerCase()}.`,
      blocking: true,
    })
  }

  // ── Age ──
  const days = Math.floor((now.getTime() - e.spentOn.getTime()) / 86_400_000)
  if (days > STALE_AFTER_DAYS) {
    out.push({
      code: 'AGE',
      ok: false,
      says: `Spent ${days} days ago. Past ${STALE_AFTER_DAYS} days a client will query it, fairly.`,
      blocking: false,
    })
  }

  return out
}

export interface Gates {
  maySubmit: boolean
  mayBill: boolean
  mayReimburse: boolean
  billableCents: number
  reimbursableCents: number
  says: string
}

/**
 * What may happen next.
 *
 * Billing follows the client's agreement and reimbursement follows the
 * employer's, separately — because a contractor waiting to be paid back
 * for a hotel should not wait on a client's approval queue.
 */
export function gates(
  e: Expense,
  checks: Check[],
  names: { client: string; employer: string }
): Gates {
  const blocked = checks.filter((c) => !c.ok && c.blocking)

  const billable = e.clientApprovedAt ? e.amountCents : 0
  const reimbursable = e.agreedAt ? (e.agreedCents ?? e.amountCents) : 0

  return {
    maySubmit: blocked.length === 0,
    mayBill: e.clientApprovedAt != null,
    mayReimburse: e.agreedAt != null,
    billableCents: billable,
    reimbursableCents: reimbursable,
    says: gateSays(e, blocked, names, billable, reimbursable),
  }
}

function gateSays(
  e: Expense,
  blocked: Check[],
  names: { client: string; employer: string },
  billable: number,
  reimbursable: number
): string {
  const money = (c: number) => `${e.currency === 'USD' ? '$' : ''}${(c / 100).toFixed(2)}`

  if (blocked.length > 0) return blocked.map((b) => b.says).join(' ')

  if (e.state === 'RETURNED') {
    return e.returnedNote
      ? `Sent back: ${e.returnedNote} Correct it and send it again.`
      : 'Sent back for correction. It is not lost — fix it and resubmit.'
  }

  if (!e.clientApprovedAt && !e.agreedAt) {
    return `${money(e.amountCents)} with ${names.client} to agree.`
  }

  if (e.clientApprovedAt && !e.agreedAt) {
    return `${names.client} agreed ${money(billable)}. Waiting on ${names.employer} to reimburse.`
  }

  if (!e.clientApprovedAt && e.agreedAt) {
    return `${names.employer} will reimburse ${money(reimbursable)}. Not billable until ${names.client} agrees.`
  }

  if (billable !== reimbursable) {
    return `Billing ${money(billable)}, reimbursing ${money(reimbursable)}.`
  }

  return `${money(billable)} agreed both ways. Billable and reimbursable.`
}

/**
 * Sending one back.
 *
 * Never a terminal state. 2017 had this right: rejection set an expense
 * back to not-submitted and the contractor could fix it. A rejected
 * expense that cannot be corrected is one somebody swallows, and they
 * remember it far longer than the money.
 */
export function returnIt(note: string): { ok: boolean; state: State; says: string } {
  if (note.trim().length < 5) {
    return {
      ok: false,
      state: 'SUBMITTED',
      says: 'Say what is wrong with it. Somebody has already spent this money.',
    }
  }
  return {
    ok: true,
    state: 'RETURNED',
    says: `Sent back for correction: ${note.trim()}`,
  }
}
