/**
 * The supplier's own profile, the way a procurement network keeps it
 * (record 87, 2026-11-17): which account each customer pays, which
 * customers confirm a change, where each customer stands on it, the
 * "supplier changed" message to the customer's own system, and which
 * old bank checks the record can give to a payer.
 *
 * Pure. No database: lib/vendor-master-read reads the rows and calls these.
 * Nothing here decides who may pay. The payment gate moves onto these
 * readers in money's next slice.
 */

import { bankChange, type BankFacts } from '@/lib/money/remit-change'
import { checkedByPayer, type PayToFacts, type PayerCheck, type PayerCheckRow } from '@/lib/setup-gate-rules'

// ── 1. Which account this payer pays ─────────────────────────────────

export interface PayToCandidate {
  id: string
  companyId: string
  isDefault: boolean
  createdAt: Date
}

export interface RemitChoice {
  supplierCompanyId: string
  payerCompanyId: string
  remitToId: string
}

/** The order `payToRow` reads: the default first, then the first entered, the id breaking a tie. */
function payToOrder(a: PayToCandidate, b: PayToCandidate): number {
  return (
    Number(b.isDefault) - Number(a.isDefault) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/**
 * The account this payer pays this supplier: the one the supplier chose
 * for this payer, else its default, else the first it entered. A choice
 * made for another payer, or naming details that are not this supplier's,
 * is no choice. Null where the supplier has no details.
 */
export function payToFor<R extends PayToCandidate>(
  supplierId: string,
  payerId: string,
  rows: readonly R[],
  choices: readonly RemitChoice[],
): R | null {
  const own = rows.filter((r) => r.companyId === supplierId)
  const choice = choices.find((c) => c.supplierCompanyId === supplierId && c.payerCompanyId === payerId)
  const chosen = choice ? own.find((r) => r.id === choice.remitToId) : undefined
  if (chosen) return chosen
  return [...own].sort(payToOrder)[0] ?? null
}

// ── 2. Whether this payer confirmed that row ─────────────────────────

export interface RowWithChecks extends PayToFacts {
  bankChecks: readonly (PayerCheckRow & { payerCompanyId: string })[]
}

/**
 * Whether this payer, itself, has confirmed these details: its own
 * `BankCheck` on the row, read by `checkedByPayer`. Another payer's check
 * is never read.
 */
export function checkedFor(payerId: string, row: RowWithChecks | null): PayerCheck {
  if (!row) return checkedByPayer(null, null, payerId)
  const own = row.bankChecks.find((c) => c.payerCompanyId === payerId) ?? null
  return checkedByPayer(row, own, payerId)
}

// ── 3. Which customers confirm a change ──────────────────────────────

/** A register row as stored: `relationship` is what the other firm is to the row's owner. */
export interface RegisterLine {
  companyId: string
  otherCompanyId: string
  relationship: string
  status: string
}

/** What a supplier is to a firm that buys from it; and what a firm that pays is to the supplier. */
const BUYS_FROM_US = new Set(['CLIENT', 'PRIME', 'MSP'])
/** A register row that says the two firms trade. A prospect does not yet; a block stops it. */
const TRADING = new Set(['ACTIVE', 'DORMANT'])

/**
 * The firms that must confirm a change to this supplier's bank: those
 * that really buy from it, by both firms' records, and are on Etyme.
 *
 * A firm counts where an agreement names the supplier as vendor and it as
 * client, or where each firm's own register says so (the supplier holds
 * it as a customer, a prime or an MSP; it holds the supplier as a
 * supplier). A block on either register removes it, and a prospect never
 * counts. A firm is never tied from one side alone, so the supplier's own
 * row is not enough. A firm not on Etyme has nobody to confirm.
 */
export function customersFrom(input: {
  supplierId: string
  /** Rows from both registers that name the pair, either way round. */
  rows: readonly RegisterLine[]
  /** Agreements with the supplier as vendor. */
  agreements: readonly { vendorId: string; clientId: string }[]
  /** Firms that are on Etyme (`claimedAt` set). */
  onEtyme: ReadonlySet<string>
}): string[] {
  const { supplierId, rows } = input
  const candidates = new Set<string>()
  for (const a of input.agreements) if (a.vendorId === supplierId) candidates.add(a.clientId)
  for (const r of rows) if (r.companyId === supplierId) candidates.add(r.otherCompanyId)
  for (const r of rows) if (r.otherCompanyId === supplierId) candidates.add(r.companyId)
  const out: string[] = []
  for (const payer of candidates) {
    if (payer === supplierId || !input.onEtyme.has(payer)) continue
    const ours = rows.filter((r) => r.companyId === supplierId && r.otherCompanyId === payer && BUYS_FROM_US.has(r.relationship))
    const theirs = rows.filter((r) => r.companyId === payer && r.otherCompanyId === supplierId && r.relationship === 'SUPPLIER')
    if ([...ours, ...theirs].some((r) => r.status === 'BLOCKED')) continue
    const agreed = input.agreements.some((a) => a.vendorId === supplierId && a.clientId === payer)
    const bothSay = ours.some((r) => TRADING.has(r.status)) && theirs.some((r) => TRADING.has(r.status))
    if (agreed || bothSay) out.push(payer)
  }
  return out.sort()
}

// ── 4. Where each customer stands on a change ────────────────────────

/** Record 86: payments wait three days from the payer's confirmation. */
export const COOLING_OFF_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export interface ChangeRead extends BankFacts {
  id: string
  state: 'ENTERED' | 'DISOWNED'
}

export interface ChangeCheck extends PayerCheckRow {
  payerCompanyId: string
  bankChangeRequestId: string | null
  callbackAt: Date | null
}

export type CustomerAnswer =
  | { payerId: string; state: 'WAITING' }
  /** Confirmed with a call back. Payment waits until `payableFrom`. */
  | { payerId: string; state: 'CONFIRMED'; confirmedAt: Date; payableFrom: Date }
  /** This payer answered without confirming: the call back did not match, reached nobody, or was not recorded. */
  | { payerId: string; state: 'NOT_CONFIRMED'; outcome: 'DID_NOT_MATCH' | 'NOT_REACHED' | 'NO_CALLBACK' }
  /** An Owner of the supplier said "This was not us". */
  | { payerId: string; state: 'DISOWNED' }

/**
 * Each customer's answer to one change. A payer's check answers it only
 * where the check names this change and still reads what was entered.
 * A confirmation is a call back that confirmed; a check with no call back
 * recorded is not one (record 86, answer 6). One payer's check never
 * answers for another.
 */
export function changeAnswers(change: ChangeRead, payers: readonly string[], checks: readonly ChangeCheck[]): CustomerAnswer[] {
  return payers.map((payerId): CustomerAnswer => {
    if (change.state === 'DISOWNED') return { payerId, state: 'DISOWNED' }
    const check = checks.find((c) => c.payerCompanyId === payerId && c.bankChangeRequestId === change.id)
    if (!check || bankChange(check, change).cleared) return { payerId, state: 'WAITING' }
    if (check.callbackOutcome === 'CONFIRMED') {
      const confirmedAt = check.callbackAt ?? check.checkedAt
      return { payerId, state: 'CONFIRMED', confirmedAt, payableFrom: new Date(confirmedAt.getTime() + COOLING_OFF_DAYS * DAY_MS) }
    }
    return { payerId, state: 'NOT_CONFIRMED', outcome: check.callbackOutcome ?? 'NO_CALLBACK' }
  })
}

// ── 5. The "supplier changed" message to the customer's system ───────

export interface SupplierChangedOut {
  direction: 'OUT'
  kind: 'SUPPLIER_CHANGED'
  /** The customer's own number for the supplier. */
  vendorNumber: string
  supplierLegalName: string
  paymentMethod: string | null
  bankName: string | null
  accountName: string | null
  /** The last four digits only. */
  accountLast4: string | null
  routingLast4: string | null
  idempotencyKey: string
}

/** The last four digits of whatever is stored, so a longer value never leaves. */
export function lastFour(v: string | null | undefined): string | null {
  const digits = (v ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-4) : null
}

/**
 * The message telling this customer's system that the supplier changed,
 * or the sentence saying why none is made: the customer has not confirmed
 * the change, or has no vendor number for the supplier.
 */
export function supplierChangedMessage(input: {
  payerId: string
  change: ChangeRead & { paymentMethod?: string | null }
  answer: CustomerAnswer
  vendorNumber: string | null
  supplierLegalName: string
  /** 1 for the first message; a re-send after a fix is the next. */
  generation?: number
}): { ok: true; message: SupplierChangedOut } | { ok: false; says: string } {
  if (input.answer.payerId !== input.payerId || input.answer.state !== 'CONFIRMED') {
    return { ok: false, says: 'This change goes to your system once your company confirms it.' }
  }
  const vendorNumber = input.vendorNumber?.trim()
  if (!vendorNumber) {
    return { ok: false, says: `Add your vendor number for ${input.supplierLegalName}, then the change can go to your system.` }
  }
  const c = input.change
  return {
    ok: true,
    message: {
      direction: 'OUT',
      kind: 'SUPPLIER_CHANGED',
      vendorNumber,
      supplierLegalName: input.supplierLegalName,
      paymentMethod: c.paymentMethod ?? null,
      bankName: c.bankName ?? null,
      accountName: c.accountName ?? null,
      accountLast4: lastFour(c.accountLast4),
      routingLast4: lastFour(c.routingLast4),
      idempotencyKey: `supplier-changed:${input.payerId}:${c.id}:OUT:${input.generation ?? 1}`,
    },
  }
}

// ── 6. Old checks: which payer the record names ──────────────────────

export interface OldCheckRow {
  id: string
  companyId: string
  verifiedAt: Date | null
  verifiedByCompanyId: string | null
}

/** A supplier walk's bank item, as the paying firm's walk holds it. */
export interface WalkBankMark {
  payerCompanyId: string
  firmCompanyId: string
  state: string
  at: Date | null
}

export type OldCheckPayer =
  | { remitToId: string; supplierId: string; payerId: string; from: 'VERIFIED_BY' | 'SUPPLIER_WALK'; carried: boolean }
  | { remitToId: string; supplierId: string; payerId: null; why: 'NO_PAYER_ON_RECORD' | 'SEVERAL_WALKS' }

/**
 * Which payer made an old check that does not say, as far as the record
 * shows, and never a guess.
 *
 *   - The check names its firm (`verifiedByCompanyId`): that firm.
 *   - Else a payer's supplier walk marked the bank item held at the very
 *     moment the check was stamped (the walk writes both in one act):
 *     that payer, where exactly one did.
 *   - Else nobody can be named, and the check stays counted for nobody.
 *
 * `carried` says whether that payer already holds its own `BankCheck`.
 */
export function oldCheckPayer(row: OldCheckRow, walks: readonly WalkBankMark[], carriedFor: ReadonlySet<string>): OldCheckPayer | null {
  if (!row.verifiedAt) return null
  const base = { remitToId: row.id, supplierId: row.companyId }
  if (row.verifiedByCompanyId) {
    return { ...base, payerId: row.verifiedByCompanyId, from: 'VERIFIED_BY', carried: carriedFor.has(row.verifiedByCompanyId) }
  }
  const stamp = row.verifiedAt.getTime()
  const payers = new Set(
    walks
      .filter((w) => w.firmCompanyId === row.companyId && w.state === 'HELD' && w.at?.getTime() === stamp)
      .map((w) => w.payerCompanyId),
  )
  if (payers.size === 1) {
    const payerId = [...payers][0]
    return { ...base, payerId, from: 'SUPPLIER_WALK', carried: carriedFor.has(payerId) }
  }
  return { ...base, payerId: null, why: payers.size > 1 ? 'SEVERAL_WALKS' : 'NO_PAYER_ON_RECORD' }
}

/**
 * The one summary line of the old-checks report, said the same by the
 * hand-run script and by the staff page. `held` is K: old checks that name
 * no payer and have no payer's own `BankCheck`, so the supplier would be
 * held for every customer once the per-customer bank rule is on.
 */
export function oldChecksSummary(n: { named: number; unplaced: number; held: number }, opts: { script?: boolean } = {}): string {
  const base = `${n.named} old checks name their payer and are not carried yet; ${n.unplaced} name no payer; ${n.held} of those have no payer's own check either.`
  return opts.script ? `${base} Run again with --write to carry them.` : base
}
