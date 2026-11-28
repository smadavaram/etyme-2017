/**
 * Matching a payment that came in to the bill it pays (record 112, chain 5).
 *
 * Pure: no database. Every amount is integer minor units in its own
 * currency. Two currencies are never compared or converted: a payment in
 * another currency than its bill is a finding of its own, with both
 * figures said, and nothing is worked out between them.
 *
 * A match is exact: the same minor units in the same currency. Nothing
 * here rounds, allows a tolerance or decides what to do about a
 * difference. A difference is said, with both figures, and a person decides.
 */

import { money } from '@/lib/order'

export interface PaymentFact { id: string; minor: number; currency: string; reference?: string | null }
export interface BillFact { id: string; number: string; minor: number; currency: string }
export interface OpenBill extends BillFact { /** What is still owed on it, in its own currency. */ owedMinor: number }

export type BillVerdict =
  | { kind: 'MATCHED'; paidMinor: number }
  | { kind: 'SHORT'; paidMinor: number; owedMinor: number }
  | { kind: 'OVER'; paidMinor: number; owedMinor: number }
  | { kind: 'CURRENCY'; payment: PaymentFact }

/**
 * What the payments recorded against one bill say about it. Payments in
 * the bill's own currency are added together and compared with its total;
 * each payment in another currency is a finding by itself and is added to
 * nothing. Pure.
 */
export function judgeBill(bill: BillFact, payments: readonly PaymentFact[]): BillVerdict[] {
  const out: BillVerdict[] = []
  for (const p of payments) if (p.currency !== bill.currency) out.push({ kind: 'CURRENCY', payment: p })
  const same = payments.filter((p) => p.currency === bill.currency)
  if (same.length === 0) return out
  const paid = same.reduce((n, p) => n + p.minor, 0)
  if (paid === bill.minor) out.push({ kind: 'MATCHED', paidMinor: paid })
  else if (paid < bill.minor) out.push({ kind: 'SHORT', paidMinor: paid, owedMinor: bill.minor })
  else out.push({ kind: 'OVER', paidMinor: paid, owedMinor: bill.minor })
  return out
}

export type UnplacedVerdict =
  | { kind: 'MATCHED'; bill: OpenBill }
  | { kind: 'NO_BILL' }
  | { kind: 'MANY_BILLS'; bills: OpenBill[] }
  | { kind: 'CURRENCY'; bill: OpenBill }

/**
 * A payment nobody placed, read against the bills still owed. Exactly one
 * bill owed that very amount in that very currency is a match. None is no
 * bill; two or more cannot be told apart, so a person places it. A bill
 * owed the same number in another currency is a currency finding, never a
 * match. Pure.
 */
export function judgeUnplaced(payment: PaymentFact, open: readonly OpenBill[]): UnplacedVerdict {
  const exact = open.filter((b) => b.currency === payment.currency && b.owedMinor === payment.minor)
  if (exact.length === 1) return { kind: 'MATCHED', bill: exact[0] }
  if (exact.length > 1) return { kind: 'MANY_BILLS', bills: exact }
  const other = open.filter((b) => b.currency !== payment.currency && b.owedMinor === payment.minor)
  if (other.length >= 1) return { kind: 'CURRENCY', bill: other[0] }
  return { kind: 'NO_BILL' }
}

export interface DriftFact {
  lineRateCents: number
  lineCurrency: string
  contractRateCents: number
  contractCurrency: string
  /** The contract has approved rate amendments: what the rate was on a day is not judged here. */
  hasAmendments: boolean
}

/**
 * Whether a bill's rate differs from its contract line's. Null where it
 * does not, where the two are in different currencies (never compared), or
 * where the contract has amendments (the rate on the day is not worked out
 * a second time here). Pure.
 */
export function driftOf(f: DriftFact): { lineRateCents: number; contractRateCents: number; currency: string } | null {
  if (f.hasAmendments || f.lineCurrency !== f.contractCurrency) return null
  if (!Number.isSafeInteger(f.lineRateCents) || !Number.isSafeInteger(f.contractRateCents) || f.contractRateCents <= 0) return null
  if (f.lineRateCents === f.contractRateCents) return null
  return { lineRateCents: f.lineRateCents, contractRateCents: f.contractRateCents, currency: f.lineCurrency }
}

// ── The words a decision card carries ───────────────────────────────

export interface Finding { question: string; proof: string }

const ref = (p: PaymentFact) => (p.reference?.trim() ? ` (reference ${p.reference.trim()})` : '')

export function shortPayWords(bill: BillFact, v: { paidMinor: number; owedMinor: number }): Finding {
  const gap = v.owedMinor - v.paidMinor
  return {
    question: `Bill ${bill.number} was paid ${money(v.paidMinor, bill.currency)} of ${money(v.owedMinor, bill.currency)}. Accept the short pay?`,
    proof: `Bill ${bill.number} is ${money(v.owedMinor, bill.currency)}. The payments recorded against it add up to ${money(v.paidMinor, bill.currency)}, which is ${money(gap, bill.currency)} short. The agent moved nothing and sent nothing.`,
  }
}

export function overPayWords(bill: BillFact, v: { paidMinor: number; owedMinor: number }): Finding {
  const extra = v.paidMinor - v.owedMinor
  return {
    question: `Bill ${bill.number} was paid ${money(v.paidMinor, bill.currency)} against ${money(v.owedMinor, bill.currency)}. Keep the extra on account?`,
    proof: `Bill ${bill.number} is ${money(v.owedMinor, bill.currency)}. The payments recorded against it add up to ${money(v.paidMinor, bill.currency)}, which is ${money(extra, bill.currency)} more. The agent moved nothing and sent nothing.`,
  }
}

export function currencyWords(bill: { number: string; currency: string; minor: number }, p: PaymentFact): Finding {
  return {
    question: `A payment of ${money(p.minor, p.currency)} came in against bill ${bill.number}, which is in ${bill.currency}. Place it by hand?`,
    proof: `The payment is ${money(p.minor, p.currency)}${ref(p)} and bill ${bill.number} is ${money(bill.minor, bill.currency)}. They are in different currencies, so nothing was compared or converted, and the agent moved nothing.`,
  }
}

export function noBillWords(p: PaymentFact): Finding {
  return {
    question: `A payment of ${money(p.minor, p.currency)} matches no bill. Place it by hand?`,
    proof: `The payment is ${money(p.minor, p.currency)}${ref(p)}. No bill that is still owed is for exactly that amount in that currency. The agent moved nothing and sent nothing.`,
  }
}

export function manyBillsWords(p: PaymentFact, bills: readonly BillFact[]): Finding {
  return {
    question: `A payment of ${money(p.minor, p.currency)} fits more than one bill. Which bill is it for?`,
    proof: `The payment is ${money(p.minor, p.currency)}${ref(p)}. It fits exactly: ${bills.map((b) => `bill ${b.number}`).join(', ')}. The agent will not choose between them and moved nothing.`,
  }
}

export function driftWords(bill: { number: string }, who: string, d: { lineRateCents: number; contractRateCents: number; currency: string }): Finding {
  return {
    question: `Bill ${bill.number} charges ${who} ${money(d.lineRateCents, d.currency)} an hour and the contract says ${money(d.contractRateCents, d.currency)}. Is the bill wrong?`,
    proof: `The line on bill ${bill.number} for ${who} is ${money(d.lineRateCents, d.currency)} an hour. The contract line says ${money(d.contractRateCents, d.currency)} an hour. The agent changed nothing.`,
  }
}
