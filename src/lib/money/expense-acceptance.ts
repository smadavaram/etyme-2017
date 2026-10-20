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

/**
 * Whether the bill on this sell line carries this expense, and the
 * sentence where it does not.
 *
 * The expense travels up the chain only as far as each leg bills it
 * (`acceptanceChain`), so a firm above the employer bills it only where
 * every leg from the employer's up to its own does. On the employer's
 * own line this is exactly `legBills` on that leg.
 *
 * Said to the firm billing, in names it already trades with: a stop on
 * its own leg or on its own supplier's is that leg's sentence; a stop
 * further down names only its own supplier, because a sub-vendor's name
 * is the firm above it's to keep.
 */
export function billsOnLeg(
  e: Pick<ExpenseOnRecord, 'category' | 'billable'>,
  legsTopFirst: readonly Leg[],
  sellContractId: string
): { bills: boolean; says: string | null } {
  const leg = legsTopFirst.find((l) => l.sellContractId === sellContractId)
  if (!leg) return { bills: false, says: null }
  const chain = acceptanceChain(e, legsTopFirst)
  if (chain.steps.some((s) => s.leg.sellContractId === sellContractId)) return { bills: true, says: null }
  const stop = chain.stopped!
  if (stop.leg.sellContractId === sellContractId || stop.leg.payerId === leg.sellerId) return { bills: false, says: stop.says }
  const supplier = legsTopFirst.find((l) => l.payerId === leg.sellerId)
  return {
    bills: false,
    says: `${supplier?.sellerName ?? `${leg.sellerName}’s supplier`} does not bill it to ${leg.sellerName}, so ${leg.payerName} does not pay for it.`,
  }
}

/**
 * Whether the firm paying a supplier's invoice pays for this expense, and
 * the sentence where it does not: the receipt form and the typed-in check
 * ask this, so they agree with the bill the supplier generates.
 *
 * The verdict is `billsOnLeg` on the supplier's own line, the bill's own
 * question, so an expense a leg further down does not bill is not paid for
 * here either, whatever the supplier's own agreement says. Only the
 * sentence differs, because it is read by the payer, not the biller: a
 * stop on the supplier's own leg is that leg's sentence, which names the
 * two of them; a stop further down names nobody below the supplier,
 * because a sub-vendor's name is the supplier's to keep.
 *
 * Where the expense's chain does not run through the supplier's line — an
 * expense on the payer's own line, or a supplier not on Etyme — there is no
 * chain to read, and the supplier's leg decides, or the employer's flag.
 */
export function billsToPayer(
  e: Pick<ExpenseOnRecord, 'category' | 'billable'>,
  legsTopFirst: readonly Leg[],
  supplierSellContractId: string | null | undefined,
  supplierLeg: Leg | null
): { bills: boolean; says: string | null } {
  const leg = supplierSellContractId ? legsTopFirst.find((l) => l.sellContractId === supplierSellContractId) : undefined
  if (!leg) return supplierLeg ? legBills(e, supplierLeg) : { bills: e.billable, says: null }
  const verdict = billsOnLeg(e, legsTopFirst, leg.sellContractId)
  if (verdict.bills) return verdict
  const own = legBills(e, leg)
  if (!own.bills) return own
  return {
    bills: false,
    says: `The firm that supplies ${leg.sellerName} does not bill it for this ${word(e.category)} expense, so ${leg.payerName} does not pay for it.`,
  }
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

/**
 * Whether every firm that pays for this expense has accepted it, with
 * `decided` standing in for whatever that firm had before.
 *
 * The worker is told once, at this moment (simulation, 2026-10-20: one
 * worker read "An expense of yours was accepted" twice, once per firm in
 * the chain). The firms are told as each accepts; the worker hears the
 * outcome, not each step.
 */
export function fullyAccepted(chain: Chain, acceptances: readonly AcceptanceRow[], decided?: AcceptanceRow | null): boolean {
  if (chain.steps.length === 0) return false
  const rows = decided ? [...acceptances.filter((a) => a.companyId !== decided.companyId), decided] : acceptances
  return chain.steps.every((s) => rows.some((a) => a.companyId === s.companyId && a.status === 'ACCEPTED'))
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

// ── One row on the expenses page, as one firm reads it ──────────────

/**
 * Where an expense stands, for the firm reading it.
 *
 * - OWN          the reader raised it and has not approved it yet
 * - YOURS        the reader pays for it, and it is the reader's turn to accept
 * - WAITING      a firm above the reader has not accepted yet
 * - ACCEPTED     every firm the reader can see has accepted
 * - SENT_BACK    a firm the reader can see sent it back
 * - NOT_BILLABLE the agreement the reader pays under does not bill this kind
 */
export type RowState = 'OWN' | 'YOURS' | 'WAITING' | 'ACCEPTED' | 'SENT_BACK' | 'NOT_BILLABLE'

export interface ExpenseRow {
  /** False: the reader has no business seeing this expense, and the list leaves it off. */
  visible: boolean
  state: RowState
  /**
   * Whether this expense is billed to the reader (a payer) or by the
   * reader upward (the employer), under the agreement each pair signed.
   * Never the employer's own flag where an agreement said.
   */
  billable: boolean
  /** "Approved by Techpeple · accepted by Northbend Athletic $412.50 · waiting on you". Null before the employer approves. */
  line: string | null
  /** What the reader may accept now, in minor units; null where it may not. */
  upToCents: number | null
  /** Why it is not billed to the reader, or why it goes no higher than the reader. */
  notBillableSays: string | null
  /**
   * The one firm on the row: whom the employer bills for it, or whom a
   * payer is billed by — its own supplier, never a firm below that.
   */
  counterparty: { name: string; role: 'CLIENT' | 'SUPPLIER' } | null
}

const HIDDEN: ExpenseRow = {
  visible: false, state: 'WAITING', billable: false, line: null, upToCents: null, notBillableSays: null, counterparty: null,
}

/**
 * The expenses page's row for one firm.
 *
 * Who sees it: the employer that raised it, always; a firm that pays for
 * it, once the employer has approved it; and the firm whose own
 * agreement is the one that leaves this kind out, so it can read why it
 * is not billed to it. A supplier's own cost under an agreement that did
 * not say stays with the supplier, as it always did.
 *
 * What it names: the firms at and above the reader, and the reader's own
 * supplier. The employer is named only where it is the reader or the
 * reader's own supplier; further down it is "the employer", and a firm
 * below the reader's own supplier is not on the line at all — a
 * sub-vendor's name is the firm above it's to keep.
 */
export function rowFor(i: {
  expense: ExpenseOnRecord
  legsTopFirst: readonly Leg[]
  acceptances: readonly AcceptanceRow[]
  reader: { id: string; name: string }
  /** The person reading, so a worker is never offered their own expense to accept. */
  personId: string
  /**
   * The bills this expense is on at the reader's own rung — the reader's
   * own bill of it upward and its own supplier's bill of it to the
   * reader — from `rungBilled`. Absent: the row says nothing about bills.
   */
  billed?: RungBilled
}): ExpenseRow {
  const { expense: e, legsTopFirst: legs, acceptances, reader } = i
  const own = e.companyId === reader.id
  const chain = acceptanceChain(e, legs)
  const approved = (APPROVED_BY_EMPLOYER as readonly string[]).includes(e.status)
  const at = chain.steps.findIndex((s) => s.companyId === reader.id)
  const paysLeg = legs.find((l) => l.payerId === reader.id) ?? null
  const bottom = legs[legs.length - 1] ?? null
  const stopsAtReader = !!chain.stopped && chain.stopped.leg.payerId === reader.id

  if (!own) {
    if (!approved || !paysLeg) return HIDDEN
    if (at < 0 && !(stopsAtReader && chain.stopped!.leg.agreement?.said)) return HIDDEN
  }

  const counterparty: ExpenseRow['counterparty'] = own
    ? bottom ? { name: bottom.payerName, role: 'CLIENT' } : null
    : { name: paysLeg!.sellerName, role: 'SUPPLIER' }

  if (own && !approved) {
    return {
      visible: true, state: 'OWN', billable: chain.steps.length > 0, line: null, upToCents: null,
      notBillableSays: chain.stopped?.says ?? null, counterparty,
    }
  }

  const money = (c: number) => amount(c, e.currency)
  const employer = own ? 'you' : paysLeg!.sellerId === e.companyId ? e.companyName : 'the employer'
  const parts = [`Approved by ${employer}`]

  if (at < 0 && !own) {
    // The reader's own agreement leaves this kind out.
    return {
      visible: true, state: 'NOT_BILLABLE', billable: false, line: parts.join(' · '), upToCents: null,
      notBillableSays: chain.stopped!.says, counterparty,
    }
  }

  // The employer reads every firm above it; a payer reads down to its own supplier.
  const last = own ? chain.steps.length - 1 : Math.min(at + 1, chain.steps.length - 1)
  let state: RowState = 'ACCEPTED'
  for (let k = 0; k <= last; k++) {
    const s = chain.steps[k]
    const who = s.companyId === reader.id ? 'you' : s.name
    const d = acceptances.find((a) => a.companyId === s.companyId)
    if (!d) {
      parts.push(`waiting on ${who}`)
      if (state === 'ACCEPTED') state = s.companyId === reader.id ? 'YOURS' : k < at || own ? 'WAITING' : 'ACCEPTED'
      break
    }
    if (d.status === 'SENT_BACK') {
      parts.push(`sent back by ${who}${d.reason ? `: ${d.reason}` : ''}`)
      if (k <= at || own) state = 'SENT_BACK'
      break
    }
    parts.push(`accepted by ${who} ${money(d.acceptedCents)}`)
  }

  let upToCents: number | null = null
  if (!own) {
    const may = mayDecide({
      expense: e, legsTopFirst: legs, acceptances, firm: reader, personId: i.personId, decision: 'ACCEPT',
    })
    if (may.ok) upToCents = may.capCents
    // Its own turn, whatever the line read: the rules are `mayDecide`'s.
    if (may.ok && state !== 'SENT_BACK') state = 'YOURS'
  }

  // The reader's own rung's bills, and no other's: what it billed upward,
  // and what its own supplier billed it. A bill between two firms below
  // the reader is not the reader's to read (`rungBilled`).
  if (i.billed) parts.push(...billedWords(i.billed))

  // Where the reader is the last firm it travels to, it carries the cost:
  // the agreement above it says why, in the words it already uses.
  const goesNoHigher = chain.stopped && (own ? true : chain.stopped.leg.sellerId === reader.id)
  return {
    visible: true, state, billable: own ? chain.steps.length > 0 : true, line: parts.join(' · '), upToCents,
    notBillableSays: goesNoHigher ? chain.stopped!.says : null, counterparty,
  }
}

/**
 * Why the employer may not reject an approved expense, or null where it may.
 *
 * Once a firm above has accepted an expense it is on that firm's books
 * and on the bill to it; the employer taking its approval back would
 * leave a bill for money nobody approved. A send-back above does not
 * stop it: that firm has said it will not pay, and the employer may then
 * say it will not either.
 *
 * Names the firm that accepted. Every firm that accepts is above the
 * employer, and the employer reads the chain above it.
 */
export function rejectRefusal(
  e: Pick<ExpenseOnRecord, 'personName' | 'category' | 'periodStart' | 'currency'>,
  accepted: readonly { companyName: string; acceptedCents: number; createdAt: Date }[]
): string | null {
  const first = [...accepted].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
  if (!first) return null
  return (
    `${e.personName}’s ${word(e.category)} expense of ${formatDay(e.periodStart)} cannot be rejected, because ` +
    `${first.companyName} accepted ${amount(first.acceptedCents, e.currency)} of it on ${formatDay(first.createdAt)}.`
  )
}


// ── Billed and paid, per rung ────────────────────────────────────────

/**
 * One bill line an expense is on, as the reader's rung reads it.
 *
 * Read only where the reader is the seller or the payer on the line's
 * contract: the query is scoped that way and `rungBilled` checks again.
 */
export interface ExpenseBillLine {
  /** The firm that issued the bill: the seller on the line's contract. */
  sellerId: string
  /** The firm it is addressed to: the customer on the line's contract. */
  payerId: string
  payerName: string
  /** The bill's own number and status. */
  number: string
  status: string
}

/** A bill as one rung reads it: not sent yet, sent, or paid in full. */
export type BillState = 'DRAFT' | 'BILLED' | 'PAID'

export interface RungBilled {
  /** The reader's own bill of the expense to the firm above it. */
  byReader: { to: string; number: string; state: BillState } | null
  /** Its own supplier's bill of the expense to the reader. Never a draft: a draft has not been sent. */
  toReader: { number: string; state: Exclude<BillState, 'DRAFT'> } | null
}

/** A bill that holds nothing: withdrawn, cancelled or void. */
const DEAD = ['VOID', 'CANCELLED']

const stateOf = (status: string): BillState => (status === 'DRAFT' ? 'DRAFT' : status === 'PAID' ? 'PAID' : 'BILLED')

/**
 * Where an expense stands on the bills of one rung.
 *
 * Coordinator's decision, 2026-10-19 (reversible by the founder in a
 * sentence): `Expense.invoiceId` and its status INVOICED and PAID are the
 * employer's rung only — the employer's own bill of the expense to the
 * firm directly above it. Every rung above reads billed and paid from its
 * own lines. So a client never reads an expense as invoiced because a
 * sub-vendor two rungs down billed the firm in the middle, and the firm
 * in the middle reads its own bill upward and its supplier's bill to it,
 * and nothing between two firms below it.
 */
export function rungBilled(readerId: string, lines: readonly ExpenseBillLine[]): RungBilled {
  const live = lines.filter((l) => !DEAD.includes(l.status))
  const mine = live.find((l) => l.sellerId === readerId) ?? null
  const theirs = live.find((l) => l.payerId === readerId && l.status !== 'DRAFT') ?? null
  return {
    byReader: mine ? { to: mine.payerName, number: mine.number, state: stateOf(mine.status) } : null,
    toReader: theirs ? { number: theirs.number, state: stateOf(theirs.status) as Exclude<BillState, 'DRAFT'> } : null,
  }
}

/** The words a row adds for its own rung's bills. */
export function billedWords(b: RungBilled): string[] {
  const out: string[] = []
  if (b.toReader) out.push(`billed to you on ${b.toReader.number}${b.toReader.state === 'PAID' ? ', paid' : ''}`)
  if (b.byReader) {
    out.push(
      b.byReader.state === 'DRAFT'
        ? `on draft bill ${b.byReader.number} to ${b.byReader.to}, not sent`
        : `billed to ${b.byReader.to} on ${b.byReader.number}${b.byReader.state === 'PAID' ? ', paid' : ''}`
    )
  }
  return out
}

/**
 * The expense's status as a firm above the employer reads it: INVOICED
 * once the reader has sent its own bill of it upward, PAID once that bill
 * is paid in full; until it has — and always for the client at the top,
 * which bills it to nobody — the same of its own supplier's bill to it.
 * APPROVED where neither bill exists. Never the employer's own column,
 * which is the employer's rung.
 */
export function rungStatus(b: RungBilled): 'APPROVED' | 'INVOICED' | 'PAID' {
  const s = b.byReader && b.byReader.state !== 'DRAFT' ? b.byReader.state : b.toReader?.state ?? null
  return s === 'PAID' ? 'PAID' : s === 'BILLED' ? 'INVOICED' : 'APPROVED'
}
