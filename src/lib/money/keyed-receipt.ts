/**
 * The three-way check on a typed-in invoice receipt — one check, read by
 * every door that records, re-checks, approves or pays one.
 *
 * ── Why this file ────────────────────────────────────────────────────
 *
 * Release walk, 2026-10-18. A supplier's invoice reaches the record two
 * ways: the supplier sends it here as an `Invoice` (checked by
 * `matchInvoice` and paid only through `mayPayInvoiceReceipt`), or the
 * payer keys in what it was sent, as a `VendorBill`. The second path
 * checked at intake and nowhere after. A receipt recorded as disputed
 * was paid by the next request; the same week under a second invoice
 * number was received clean and paid; a $4,720 receipt went through a
 * $1,000 order because the clerk had not typed the order in; and paying
 * one wrote no record of who paid whom.
 *
 * So the intake, the exception queue, the payment and the payment run all
 * ask this one question now, and the gate at the bottom is the payment's
 * answer, the same shape as `payGate` on the platform side.
 *
 * ── What a typed-in receipt cannot yet carry ─────────────────────────
 *
 * It is a total and a period. It has no lines, so it cannot name an
 * expense or a milestone; it stores no hours and no rate, so at the
 * moment it is paid only its total can be held to the accepted hours;
 * and there is no row to keep a waiver's reason on, so a difference on
 * one cannot be waived — it is refused until the supplier's corrected
 * invoice is recorded instead. Each is a schema request for the architect,
 * named in KNOWN-LIMITS.md, and each refuses rather than guesses.
 */

import { prisma } from '@/lib/db'
import { decimalsFor } from '@/lib/money'
import { priceByDay, ratePeriods } from '@/lib/contract-rate'
import { payersBook } from '@/lib/money/payers-acceptance-read'
import { drawnOnOrder } from '@/lib/money/order-drawn'
import { alreadyReceived } from '@/lib/money/billed-elsewhere'
import { overBillCheck } from '@/lib/purchase-order'
import { amount } from '@/lib/money-display'
import {
  matchVendorBill, OVERRIDABLE,
  type AcceptedWork, type MatchResult, type PurchaseOrderFacts,
} from '@/lib/three-way-match'
import type { WaitingWeek } from '@/lib/money/payers-acceptance'

export interface KeyedReceipt {
  /** Null while it is being recorded. */
  id: string | null
  companyId: string
  vendorCompanyId: string
  vendorName: string
  number: string
  buyContractId: string | null
  /** The order the clerk named, if any. Where none, the buy line's own. */
  workOrderId: string | null
  periodStart: Date | null
  periodEnd: Date | null
  currency: string
  totalCents: number
  /** What the supplier's invoice states, where the clerk typed it. Never stored. */
  hours?: number | null
  rateCents?: number | null
  /** When it was recorded; an earlier receipt keeps a week over a later one. */
  createdAt?: Date | null
}

export interface KeyedCheck {
  match: MatchResult
  /** Weeks the payer has not accepted, and the sentence; null where every week is. */
  notAccepted: { says: string; waiting: WaitingWeek[] } | null
  /** A refusal nobody can wave through that the match does not carry, e.g. two currencies. */
  hard: { code: string; says: string } | null
  /** The order the receipt draws on — the clerk's, else the buy line's. */
  workOrderId: string | null
  /** The earlier receipt that already holds this work, where one does. */
  duplicate: { number: string; says: string } | null
}

/**
 * Check one typed-in receipt against the order, the weeks the payer
 * accepted and every other receipt from the same supplier on the line.
 *
 * `then` is what the reader is doing, and it decides one thing: which
 * other receipt keeps a week. Recording, every live receipt already on
 * the record does. Paying, only one recorded earlier or already paid —
 * so where two were let in before this rule, the first is paid and the
 * second is refused, never both and never neither.
 */
export async function checkKeyedReceipt(r: KeyedReceipt, then: 'record' | 'pay'): Promise<KeyedCheck> {
  const currency = r.currency.toUpperCase()
  let accepted: AcceptedWork | null = null
  let expectedCents: number | null = null
  let notAccepted: KeyedCheck['notAccepted'] = null
  let weeks: { personName: string | null; days: Record<string, number> | null; periodStart: string; periodEnd: string }[] = []
  let hard: KeyedCheck['hard'] = null

  const buy = r.buyContractId
    ? await prisma.buyContract.findUnique({ where: { id: r.buyContractId }, select: { workOrderId: true } })
    : null

  // ── What we accepted, and what it comes to ─────────────────────────
  //
  // The paying firm's own signature on each week (lib/money/payers-
  // acceptance), each accepted day at the rate in force that day.
  if (r.buyContractId && r.periodStart && r.periodEnd) {
    const book = await payersBook({ buyContractId: r.buyContractId, periodStart: r.periodStart, periodEnd: r.periodEnd, then })
    if (book && book.waiting.length > 0) notAccepted = { says: book.notAccepted, waiting: book.waiting }
    const ours = book?.accepted ?? null
    if (ours) {
      const candidate = await prisma.buyContractCandidate.findFirst({
        where: { buyContractId: r.buyContractId },
        select: { payRate: true, payCurrency: true },
      })
      const periods = ratePeriods(
        await prisma.rateHistory.findMany({
          where: { contractType: 'BUY', contractId: r.buyContractId },
          select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
        })
      )
      const priced = candidate
        ? ours.weeks.map((w) =>
            priceByDay({
              contractRateCents: candidate.payRate,
              periods,
              days: w.days,
              hours: w.hours,
              periodStart: w.periodStart,
              periodEnd: w.periodEnd,
            })
          )
        : []
      const rates = new Set(priced.flatMap((p) => p.days.map((d) => d.rateCents)))
      const firstRate = priced.find((p) => p.days.length > 0)?.firstRateCents ?? null
      accepted = {
        hours: ours.hours,
        // One rate where the period had one. Where a change fell inside
        // it, the rate on the first day stands for the rate check and the
        // amount below is priced by day.
        contractRateCents: (rates.size === 1 ? [...rates][0] : firstRate) ?? candidate?.payRate ?? ours.firstRateCents,
        firstDay: ours.firstDay,
        lastDay: ours.lastDay,
        count: ours.count,
      }
      if (candidate && candidate.payCurrency.toUpperCase() === currency) {
        // Rounded once per rate across the whole period.
        const byRate = new Map<number, number>()
        for (const p of priced) for (const d of p.days) byRate.set(d.rateCents, (byRate.get(d.rateCents) ?? 0) + d.hours)
        expectedCents = [...byRate.entries()].reduce((n, [rate, h]) => n + Math.round(h * rate), 0)
      }
      weeks = ours.weeks.map((w) => ({
        personName: w.personName ?? null,
        days: w.days,
        periodStart: w.periodStart.toISOString().slice(0, 10),
        periodEnd: w.periodEnd.toISOString().slice(0, 10),
      }))
    }
  }

  // ── The order: the clerk's, else the line's own ───────────────────
  //
  // The walk's $4,720 receipt against a $1,000 order went through because
  // the order was only checked where somebody typed it in. A buy line on
  // an order draws on that order whether or not anybody says so.
  const workOrderId = r.workOrderId ?? buy?.workOrderId ?? null
  let po: PurchaseOrderFacts | null = null
  if (workOrderId) {
    const order = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true, number: true, status: true, amount: true, currency: true,
        startDate: true, endDate: true, issuedById: true,
      },
    })
    if (order && order.issuedById === r.companyId) {
      const drawn = await drawnOnOrder(order, { vendorBillId: r.id })
      const facts = {
        id: order.id,
        number: order.number,
        status: order.status,
        amountCents: Math.round(parseFloat(order.amount.toString()) * 10 ** decimalsFor(order.currency)),
        consumedCents: drawn.cents,
        startDate: order.startDate,
        endDate: order.endDate,
      }
      const ceiling = overBillCheck(
        { billCents: r.totalCents, billCurrency: currency, periodStart: r.periodStart, periodEnd: r.periodEnd, po: { ...facts, currency: order.currency } },
        new Date()
      )
      const currencyRefusal = ceiling.problems.find((p) => !p.overridable)
      if (currencyRefusal) {
        hard = { code: currencyRefusal.code, says: currencyRefusal.says }
      } else if (drawn.foreign.length > 0) {
        // Never added across currencies, and never guessed past.
        hard = {
          code: 'PO_CURRENCY',
          says:
            `Order ${order.number} already has ${drawn.foreign.join(', ')} drawn on it in another currency, so what ` +
            `is left on it cannot be said and this invoice is not checked against it on a guess.`,
        }
      } else {
        po = facts
      }
    }
  }

  // ── The same work, already received ────────────────────────────────
  let duplicate: KeyedCheck['duplicate'] = null
  if (r.buyContractId && r.periodStart && r.periodEnd && weeks.length > 0) {
    const others = await prisma.vendorBill.findMany({
      where: {
        companyId: r.companyId,
        vendorCompanyId: r.vendorCompanyId,
        buyContractId: r.buyContractId,
        status: { not: 'CANCELLED' },
        periodStart: { lte: r.periodEnd },
        periodEnd: { gte: r.periodStart },
        ...(r.id ? { id: { not: r.id } } : {}),
      },
      select: { number: true, periodStart: true, periodEnd: true, receivedAt: true, createdAt: true, paidCents: true },
      orderBy: { createdAt: 'asc' },
    })
    const keeping = then === 'record'
      ? others
      : others.filter((o) => o.paidCents > 0 || (r.createdAt != null && o.createdAt < r.createdAt))
    duplicate = alreadyReceived(
      { periodStart: r.periodStart.toISOString().slice(0, 10), periodEnd: r.periodEnd.toISOString().slice(0, 10) },
      weeks,
      keeping.flatMap((o) =>
        o.periodStart && o.periodEnd
          ? [{
              number: o.number,
              vendorName: r.vendorName,
              periodStart: o.periodStart.toISOString().slice(0, 10),
              periodEnd: o.periodEnd.toISOString().slice(0, 10),
              receivedAt: o.receivedAt.toISOString(),
            }]
          : []
      )
    )
  }

  const match = matchVendorBill({
    bill: {
      id: r.id ?? 'pending',
      number: r.number,
      totalCents: r.totalCents,
      currency,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      hours: r.hours ?? null,
      rateCents: r.rateCents ?? null,
      duplicateOfBillId: duplicate ? duplicate.number : null,
      duplicateSays: duplicate?.says ?? null,
    },
    accepted,
    po,
    poRequired: false,
    notAccepted: notAccepted?.says ?? null,
    expectedCents,
  })

  return { match, notAccepted, hard, workOrderId, duplicate }
}

// ── The payer's gate on a typed-in receipt ────────────────────────────

export type KeyedRefusalCode = 'INVALID_STATE' | 'MATCH_FAILED' | 'NOT_CHECKED'

export type KeyedGate =
  | { ok: true }
  | { ok: false; code: KeyedRefusalCode; says: string }

/**
 * May this typed-in receipt be paid now. No database.
 *
 * Its order: the document's own state, then a refusal the match does not
 * carry, then the check as it stands now. Payment is strict, the same as
 * on the platform side: the accepted hours at the agreed rate, inside the
 * order, received once. The twin's tolerance is not read here.
 *
 * A receipt recorded as disputed is judged on the check run now, not on
 * the word it was stored with: a week accepted since, or an order topped
 * up, is a difference that has gone, and one still there is refused. A
 * difference somebody could waive on a platform invoice is refused here
 * too, in a sentence that says so, because a typed-in receipt has nowhere
 * yet to keep the reason.
 */
/** The refusal the receipt's own state decides, or null. No database. */
export function keyedStateRefusal(
  bill: { number: string; status: string; totalCents: number; paidCents: number },
  vendorName: string,
): KeyedGate | null {
  if (bill.status === 'CANCELLED') {
    return { ok: false, code: 'INVALID_STATE', says: `${vendorName}’s invoice ${bill.number} is cancelled, so it is not paid.` }
  }
  if (bill.status === 'PAID' || bill.totalCents - bill.paidCents <= 0) {
    return { ok: false, code: 'INVALID_STATE', says: `${vendorName}’s invoice ${bill.number} is already paid in full.` }
  }
  return null
}

export function keyedPayGate(
  bill: { number: string; status: string; totalCents: number; paidCents: number; currency: string },
  vendorName: string,
  check: Pick<KeyedCheck, 'match' | 'hard'> | null,
): KeyedGate {
  const byState = keyedStateRefusal(bill, vendorName)
  if (byState) return byState
  if (!check) {
    return {
      ok: false, code: 'NOT_CHECKED',
      says: `${vendorName}’s invoice ${bill.number} could not be checked against its order and its weeks, so it cannot be paid on the check’s say-so.`,
    }
  }
  if (check.hard) {
    return { ok: false, code: 'MATCH_FAILED', says: check.hard.says }
  }
  const failed = check.match.checks.filter((c) => c.outcome === 'FAIL')
  if (failed.length === 0) return { ok: true }
  const waivable = failed.every((c) => OVERRIDABLE[c.code])
  const first = failed.find((c) => !OVERRIDABLE[c.code]) ?? failed[0]
  return {
    ok: false,
    code: 'MATCH_FAILED',
    says:
      `${vendorName}’s invoice ${bill.number} for ${amount(bill.totalCents, bill.currency)} does not pass the check now: ` +
      `${first.reason.replace(/[.\s]+$/, '')}. ` +
      (waivable
        ? `An invoice receipt typed in here has nowhere yet to keep a reason for paying a difference, so it is not paid. Ask ${vendorName} for a corrected invoice.`
        : `Nobody can wave this through.`),
  }
}

/** The bill as the gate reads it. */
export const KEYED_SELECT = {
  id: true, companyId: true, vendorCompanyId: true, number: true, buyContractId: true, workOrderId: true,
  periodStart: true, periodEnd: true, currency: true, totalCents: true, paidCents: true, status: true,
  receivedAt: true, createdAt: true,
  vendorCompany: { select: { name: true } },
} as const

/**
 * May the payer pay this typed-in receipt now — for a caller that holds
 * only the id: the payment, a payment run, and the twin's approval.
 * Writes nothing.
 */
export async function mayPayKeyedReceipt(
  vendorBillId: string,
): Promise<(KeyedGate & { check: KeyedCheck | null }) | null> {
  const b = await prisma.vendorBill.findUnique({ where: { id: vendorBillId }, select: KEYED_SELECT })
  if (!b) return null
  const byState = keyedStateRefusal(b, b.vendorCompany.name)
  if (byState) return { ...byState, check: null }
  const check = await checkKeyedReceipt(asKeyed(b), 'pay')
  return { ...keyedPayGate(b, b.vendorCompany.name, check), check }
}

export function asKeyed(b: {
  id: string; companyId: string; vendorCompanyId: string; number: string; buyContractId: string | null
  workOrderId: string | null; periodStart: Date | null; periodEnd: Date | null; currency: string
  totalCents: number; createdAt: Date; vendorCompany: { name: string }
}): KeyedReceipt {
  return {
    id: b.id,
    companyId: b.companyId,
    vendorCompanyId: b.vendorCompanyId,
    vendorName: b.vendorCompany.name,
    number: b.number,
    buyContractId: b.buyContractId,
    workOrderId: b.workOrderId,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    currency: b.currency,
    totalCents: b.totalCents,
    createdAt: b.createdAt,
  }
}
