/**
 * An expense is accepted like a week.
 *
 * The founder, 2026-10-19 ("go with your recommendations", decision 1):
 * the worker's employer approves an expense for reimbursement; each firm
 * above accepts it before it pays it, the client first and then down the
 * chain, nobody accepting their own; whether a kind of expense is
 * billable comes from the agreement between each pair, not from the
 * supplier's own flag.
 *
 * ── What it was ───────────────────────────────────────────────────────
 *
 * Only the firm that raised an expense approved it, and the firm paying
 * for it never did. An approved, billable expense rode on the next bill
 * at the amount the worker claimed, and a supplier's invoice receipt for
 * it matched against the supplier's own approval. So the client paid a
 * number it had never seen before the bill arrived, which is exactly
 * what the week's chain of signatures exists to stop.
 *
 * ── The shape ─────────────────────────────────────────────────────────
 *
 * A leg is one sell line in the chain over the line the expense was
 * raised on: a seller billing a payer under an agreement. The bottom leg
 * is the employer's, whose payer is the firm directly above it; the top
 * leg's payer is the client. Each payer accepts on its own leg, for its
 * own rung, and no other (`ExpenseAcceptance`, one row per firm).
 *
 * The expense travels up only as far as each leg bills it. Starting from
 * the employer's leg, a leg whose agreement does not make this kind of
 * expense billable stops it there: the firm on that leg carries it as
 * its own cost, and nobody above pays for it. So the firms that accept
 * are the run of payers from the bottom up to that stop, and the topmost
 * of them accepts first — the client, where every leg bills it.
 *
 * ── Amounts ───────────────────────────────────────────────────────────
 *
 * The first firm to accept accepts up to the amount the employer
 * approved. Each firm below accepts up to what the firm above it
 * accepted, the same as hours: a firm bills only what the firm above it
 * accepted, and pays only what it accepted itself. Less than asked, or
 * sent back, carries a reason.
 *
 * Pure. `expense-acceptance-read` loads the chain; the route writes.
 */

import { amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'

/** The employer's statuses at which the firms above may accept: it has approved it. */
export const APPROVED_BY_EMPLOYER = ['APPROVED', 'INVOICED', 'PAID'] as const

/** The expense, as accepting it needs to read it. */
export interface ExpenseOnRecord {
  id: string
  /** The firm that raised it: the worker's employer. */
  companyId: string
  companyName: string
  /** The worker who incurred it. */
  personId: string
  personName: string
  /** TRAVEL · EQUIPMENT · TRAINING · RELOCATION · MEALS · OTHER */
  category: string
  /** The employer's own flag: read only where an agreement is silent. */
  billable: boolean
  status: string
  /** What the employer approved, in minor units of `currency`. */
  totalCents: number
  currency: string
  periodStart: Date
}

/** The agreement between a leg's two firms, as far as expenses go. */
export interface LegAgreement {
  id: string
  /** In `Expense.category`'s words. */
  kinds: string[]
  /** False: the agreement did not say, and the list is not read. */
  said: boolean
  clientName: string | null
  vendorName: string | null
}

/** One sell line in the chain: a seller billing a payer. */
export interface Leg {
  sellContractId: string
  sellerId: string
  sellerName: string
  payerId: string
  payerName: string
  /** The agreement this line is under: its own, its order's, or its engagement's. */
  agreement: LegAgreement | null
}

/** One firm's decision, as it stands. */
export interface AcceptanceRow {
  companyId: string
  status: 'ACCEPTED' | 'SENT_BACK'
  acceptedCents: number
  reason: string | null
  byName?: string | null
  createdAt: Date
}

const word = (category: string): string => category.toLowerCase()

/** The agreement's own name for a sentence: the two firms it is between. */
export function agreementName(leg: Leg): string {
  const client = leg.agreement?.clientName ?? leg.payerName
  const vendor = leg.agreement?.vendorName ?? leg.sellerName
  return `the agreement between ${client} and ${vendor}`
}

/**
 * Whether this leg bills this expense, and the sentence where it does not.
 *
 * Where the agreement said which kinds are billable, the list decides,
 * and the employer's own flag is not read. Where it is silent — no
 * agreement, or one that did not say — the employer's flag decides, as
 * it did before.
 */
export function legBills(e: Pick<ExpenseOnRecord, 'category' | 'billable'>, leg: Leg): { bills: boolean; says: string | null } {
  const a = leg.agreement
  if (a && a.said) {
    const listed = a.kinds.some((k) => k.toUpperCase() === e.category.toUpperCase())
    if (listed) return { bills: true, says: null }
    return {
      bills: false,
      says:
        a.kinds.length === 0
          ? `${capital(agreementName(leg))} makes no expense billable, so ${leg.payerName} does not pay for this ${word(e.category)} expense.`
          : `${capital(agreementName(leg))} does not list ${word(e.category)} expenses as billable, so ${leg.payerName} does not pay for this one.`,
    }
  }
  if (e.billable) return { bills: true, says: null }
  return {
    bills: false,
    says:
      `${leg.sellerName} recorded this ${word(e.category)} expense as its own cost, and ` +
      (a ? `${agreementName(leg)} does not say which expenses are billable.` : `no agreement between ${leg.payerName} and ${leg.sellerName} says which expenses are billable.`),
  }
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** One firm that accepts, in the order they accept. */
export interface Step {
  companyId: string
  name: string
  leg: Leg
}

export interface Chain {
  /** The firms that accept, top first. Empty where the employer's own leg does not bill it. */
  steps: Step[]
  /** The leg that stops it traveling higher, and why. Null where the client's leg bills it. */
  stopped: { leg: Leg; says: string } | null
}

/**
 * Which firms accept this expense, top first.
 *
 * `legsTopFirst` is the chain over the line the expense was raised on,
 * the client's leg first and the employer's last. A direct placement is
 * one leg.
 */
export function acceptanceChain(e: Pick<ExpenseOnRecord, 'category' | 'billable'>, legsTopFirst: readonly Leg[]): Chain {
  const run: Step[] = []
  let stopped: Chain['stopped'] = null
  for (let i = legsTopFirst.length - 1; i >= 0; i--) {
    const leg = legsTopFirst[i]
    const verdict = legBills(e, leg)
    if (!verdict.bills) {
      stopped = { leg, says: verdict.says! }
      break
    }
    run.unshift({ companyId: leg.payerId, name: leg.payerName, leg })
  }
  return { steps: run, stopped }
}

/** What this firm may accept at most: the approved amount at the top, what the firm above accepted below it. */
export function capFor(
  e: Pick<ExpenseOnRecord, 'totalCents'>,
  chain: Chain,
  acceptances: readonly AcceptanceRow[],
  companyId: string
): number | null {
  const at = chain.steps.findIndex((s) => s.companyId === companyId)
  if (at < 0) return null
  if (at === 0) return e.totalCents
  const above = acceptances.find((a) => a.companyId === chain.steps[at - 1].companyId)
  return above && above.status === 'ACCEPTED' ? above.acceptedCents : null
}

export type Decision = 'ACCEPT' | 'SEND_BACK'

export type Verdict =
  | { ok: true; row: { status: 'ACCEPTED' | 'SENT_BACK'; acceptedCents: number; reason: string | null }; capCents: number; says: string }
  | { ok: false; status: 403 | 409 | 422; code: string; says: string }

/**
 * Whether this firm, through this person, may take this decision on this
 * expense — and the row it writes where it may.
 */
export function mayDecide(i: {
  expense: ExpenseOnRecord
  legsTopFirst: readonly Leg[]
  acceptances: readonly AcceptanceRow[]
  firm: { id: string; name: string }
  personId: string
  decision: Decision
  cents?: number | null
  reason?: string | null
}): Verdict {
  const { expense: e, firm } = i
  const money = (c: number) => amount(c, e.currency)
  const whose = `${e.personName}’s ${word(e.category)} expense of ${formatDay(e.periodStart)}`

  // Nobody accepts their own. The employer's approval is its agreement to
  // reimburse its worker; accepting is what a firm does before it pays
  // somebody else, and the firm that raised it pays nobody for it.
  if (firm.id === e.companyId) {
    return {
      ok: false, status: 403, code: 'OWN_EXPENSE',
      says:
        `${whose} is ${firm.name}’s own: approving it was ${firm.name} agreeing to reimburse ${e.personName}. ` +
        `The firms above accept it before they pay it, and ${firm.name} does not accept its own.`,
    }
  }
  if (i.personId === e.personId) {
    return { ok: false, status: 403, code: 'OWN_EXPENSE', says: `Nobody accepts their own expense. Somebody else at ${firm.name} decides it.` }
  }

  const payerLeg = i.legsTopFirst.find((l) => l.payerId === firm.id)
  if (!payerLeg) {
    return { ok: false, status: 403, code: 'NOT_A_PAYER', says: `${firm.name} does not pay for ${whose}, so it has nothing to accept.` }
  }

  const chain = acceptanceChain(e, i.legsTopFirst)
  const at = chain.steps.findIndex((s) => s.companyId === firm.id)
  if (at < 0) {
    return { ok: false, status: 422, code: 'NOT_BILLABLE', says: `${chain.stopped?.says ?? `${firm.name} does not pay for this expense.`} Nothing is accepted above that.` }
  }

  if (!(APPROVED_BY_EMPLOYER as readonly string[]).includes(e.status)) {
    return {
      ok: false, status: 409, code: 'NOT_APPROVED',
      // Not the employer's name: above the employer's own customer, a
      // sub-vendor's name is the firm above it's to keep.
      says: `${whose} is ${word(e.status)}, not yet approved by ${e.personName}’s employer, so nobody above accepts it yet.`,
    }
  }

  const mine = i.acceptances.find((a) => a.companyId === firm.id)
  if (mine && mine.status === 'ACCEPTED') {
    return {
      ok: false, status: 409, code: 'ALREADY_ACCEPTED',
      says: `${firm.name} accepted ${money(mine.acceptedCents)} of ${whose} on ${formatDay(mine.createdAt)}${mine.byName ? `, by ${mine.byName}` : ''}. An acceptance stands.`,
    }
  }

  if (at > 0) {
    const above = chain.steps[at - 1]
    const theirs = i.acceptances.find((a) => a.companyId === above.companyId)
    if (!theirs) {
      return {
        ok: false, status: 409, code: 'ABOVE_FIRST',
        says: `${above.name} accepts ${whose} first, then ${firm.name}. It has not yet.`,
      }
    }
    if (theirs.status === 'SENT_BACK') {
      return {
        ok: false, status: 409, code: 'ABOVE_SENT_BACK',
        says: `${above.name} sent ${whose} back${theirs.reason ? `: ${theirs.reason}` : '.'} Nothing below it accepts it until ${above.name} does.`,
      }
    }
  }

  const cap = capFor(e, chain, i.acceptances, firm.id)!
  const reason = (i.reason ?? '').trim()
  const capSays = at === 0
    ? `${money(cap)} was approved`
    : `${chain.steps[at - 1].name} accepted ${money(cap)}`

  if (i.decision === 'SEND_BACK') {
    if (reason.length < 5) {
      return { ok: false, status: 422, code: 'REASON', says: 'Say why it is sent back. Somebody has already spent this money.' }
    }
    return {
      ok: true, capCents: cap,
      row: { status: 'SENT_BACK', acceptedCents: 0, reason },
      says: `${firm.name} sent ${whose} back: ${reason}`,
    }
  }

  const cents = i.cents == null ? cap : i.cents
  if (!Number.isInteger(cents) || cents <= 0) {
    return { ok: false, status: 422, code: 'AMOUNT', says: 'An acceptance is an amount above nothing, in cents. To refuse it, send it back with a reason.' }
  }
  if (cents > cap) {
    return {
      ok: false, status: 422, code: 'OVER',
      says: `${firm.name} can accept up to ${money(cap)} of ${whose}: ${capSays}. It cannot accept ${money(cents)}.`,
    }
  }
  if (cents < cap && reason.length < 5) {
    return {
      ok: false, status: 422, code: 'REASON',
      says: `Accepting ${money(cents)} where ${capSays} needs a reason, so the firm below can read why.`,
    }
  }
  return {
    ok: true, capCents: cap,
    row: { status: 'ACCEPTED', acceptedCents: cents, reason: cents < cap ? reason : reason || null },
    says: `${firm.name} accepted ${money(cents)} of ${whose}${cents < cap ? `, against ${money(cap)}: ${reason}` : '.'}`,
  }
}

/** Who is told once a firm has decided: the next firm down, or the employer at the bottom. */
export function nextDown(chain: Chain, companyId: string, employer: { id: string; name: string }): { companyId: string; name: string } | null {
  const at = chain.steps.findIndex((s) => s.companyId === companyId)
  if (at < 0) return null
  const below = chain.steps[at + 1]
  return below ? { companyId: below.companyId, name: below.name } : { companyId: employer.id, name: employer.name }
}

/** Who must accept next, where anybody must. Null where every firm in the chain has accepted, or one sent it back. */
export function waitingOn(chain: Chain, acceptances: readonly AcceptanceRow[]): Step | null {
  for (const s of chain.steps) {
    const a = acceptances.find((x) => x.companyId === s.companyId)
    if (!a) return s
    if (a.status === 'SENT_BACK') return null
  }
  return null
}

// ── What the paying firm itself accepted ─────────────────────────────

/** The payer's own decision on an expense, as a bill or a receipt reads it. */
export type PayersExpenseAcceptance =
  | { kind: 'ACCEPTED'; cents: number }
  | { kind: 'SENT_BACK'; reason: string | null }
  | { kind: 'NONE' }

export function payersOwn(payerId: string, acceptances: readonly AcceptanceRow[]): PayersExpenseAcceptance {
  const a = acceptances.find((x) => x.companyId === payerId)
  if (!a) return { kind: 'NONE' }
  return a.status === 'ACCEPTED' ? { kind: 'ACCEPTED', cents: a.acceptedCents } : { kind: 'SENT_BACK', reason: a.reason }
}

/**
 * Why an expense is left off a bill to this payer, or null where it goes on.
 *
 * The same reading a receipt uses, so a bill and the payer's check cannot
 * disagree about whether an expense was accepted.
 */
export function notAcceptedSays(
  e: Pick<ExpenseOnRecord, 'personName' | 'category' | 'periodStart'>,
  payerName: string,
  own: PayersExpenseAcceptance
): string | null {
  const whose = `${e.personName}’s ${word(e.category)} expense of ${formatDay(e.periodStart)}`
  if (own.kind === 'ACCEPTED') return null
  if (own.kind === 'SENT_BACK') {
    return `${whose} is not on this bill: ${payerName} sent it back${own.reason ? ` (${own.reason})` : ''}.`
  }
  return `${whose} is not on this bill: ${payerName} has not accepted it yet.`
}
