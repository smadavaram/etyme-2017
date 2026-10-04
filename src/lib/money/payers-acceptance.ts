/**
 * What the firm paying a supplier's invoice has itself accepted.
 *
 * The founder, 2026-09-28 (CLAUDE.md, "The signed week travels down the
 * chain, and each rung accepts it in turn"): the client signs first, then
 * each firm down the chain accepts what it pays, the employer last. **No
 * rung pays on a week it has not accepted.** So when a firm matches a
 * supplier's invoice, the receipt is that firm's own signature on the
 * week — and nobody else's.
 *
 * ── What it was ───────────────────────────────────────────────────────
 *
 * The invoice-receipt match (`app/api/ap/bills`) read only
 * EMPLOYER_ACCEPTANCE, whoever wrote it, on timesheets filed against a
 * contract linked to the buy contract being billed. In Northbend ←
 * Computer Systems ← Techpeple (Helena Marsh) that is wrong twice:
 *
 *   1. The hours are filed once, on Techpeple's contract at the bottom.
 *      Computer Systems' buy contract is linked to Computer Systems' own
 *      sell contract, which carries no hours at all, so the match found
 *      nothing to stand behind Techpeple's invoice however many firms had
 *      signed. The edge to the hours is `supplierSellContractId`, and the
 *      match never followed it.
 *   2. Even where it found a week, the acceptance it read was the
 *      employer's — Techpeple accepting what it pays Helena — standing in
 *      for Computer Systems accepting what it pays Techpeple. The
 *      supplier's own acceptance was the receipt for the supplier's own
 *      invoice. Computer Systems' PASS_THROUGH, the one signature that is
 *      its own, was never read.
 *
 * ── Which of the payer's signatures ──────────────────────────────────
 *
 * The one its position on the week calls for (`roleOf`): EMPLOYER_ACCEPTANCE
 * where the hours are filed on its own contract (a supplier that is not on
 * the platform, whose person's hours the payer carries itself);
 * PASS_THROUGH where they sit on a supplier's contract below it;
 * CLIENT_APPROVAL where the payer is the end client itself. Exactly one per
 * week, so a firm that somehow stands on a week twice is never counted
 * twice.
 *
 * Pure. The route finds the weeks; this says which acceptance on each is
 * the payer's, and how many of its hours the buy contract being billed
 * pays for.
 */

import { roleOf } from '@/lib/work-chain'
import { fractionFor, daysFor, type Link, type Days } from '@/lib/contract-links'

export type AcceptanceRole = 'CLIENT_APPROVAL' | 'PASS_THROUGH' | 'EMPLOYER_ACCEPTANCE'

/** One week, as matching a supplier's invoice needs to read it. */
export interface PayableWeek {
  id: string
  /** Whose week it is, for the sentence that refuses an invoice over it. */
  personName?: string | null
  periodStart: Date
  periodEnd: Date
  days: Days | null
  /** The contract the hours are filed on — the employer's, at the bottom. */
  sellContract: {
    companyId: string
    clientCompanyId: string
    endClientCompanyId: string | null
    /** That contract's own buy links, for a week the payer carries itself. */
    buyLinks: Link[]
  }
  /** Every live signature on the week. Only the payer's is read. */
  assertions: { companyId: string; role: string; hours: unknown; rateCents: number }[]
}

/** Which of the payer's signatures counts on this week. */
export function payersRole(
  payerCompanyId: string,
  week: { sellContract: Pick<PayableWeek['sellContract'], 'companyId' | 'clientCompanyId' | 'endClientCompanyId'> }
): AcceptanceRole {
  return (
    roleOf({
      companyId: payerCompanyId,
      employerCompanyId: week.sellContract.companyId,
      endClientCompanyId: week.sellContract.endClientCompanyId,
      clientCompanyId: week.sellContract.clientCompanyId,
    }) ?? 'PASS_THROUGH'
  )
}

/**
 * The payer's own acceptance on one week, or null where it has not
 * accepted it. Another firm's signature — the supplier's, the client's —
 * is never returned in its place.
 */
export function payersAcceptanceOn(
  payerCompanyId: string,
  week: PayableWeek
): PayableWeek['assertions'][number] | null {
  const role = payersRole(payerCompanyId, week)
  return week.assertions.find((a) => a.companyId === payerCompanyId && a.role === role) ?? null
}

/** What the payer accepted across the billed period, for the three-way match. */
export interface PayersAcceptance {
  hours: number
  count: number
  firstDay: Date
  lastDay: Date
  /** The rate on the first acceptance, for where the buy contract names none. */
  firstRateCents: number
  /** Weeks in the period the payer has not accepted yet. Never counted. */
  waiting: number
  /**
   * Each accepted week: the days the buy contract pays for and the hours
   * accepted on them, so a reader can price each day at the rate in force
   * that day rather than the whole period at one rate.
   */
  weeks: Array<{ periodStart: Date; periodEnd: Date; days: Days | null; hours: number }>
}

/**
 * The hours the payer accepted, over the weeks found for one buy contract.
 *
 * `payerLinks` are the links of the payer's own sell contract to its buy
 * contracts: on a week filed on a supplier's contract below, they say
 * which days the buy contract being billed was in force, the way a week
 * the payer carries itself is divided by that contract's own links. Where
 * the payer has no link at all on record, every hour on the supplier's
 * contract is the buy contract's — `supplierSellContractId` names that
 * contract and no other, so there is nothing to divide between.
 *
 * Null where the payer has accepted nothing in the period. A week it has
 * not accepted adds no hours and no count — it is reported in `waiting`
 * so the reader can say so, and never priced from somebody else's
 * signature.
 */
export function payersAcceptance(i: {
  payerCompanyId: string
  buyContractId: string
  weeks: PayableWeek[]
  payerLinks: Link[]
}): PayersAcceptance | null {
  let hours = 0
  let count = 0
  let waiting = 0
  let first: Date | null = null
  let last: Date | null = null
  let firstRateCents = 0
  const accepted: PayersAcceptance['weeks'] = []

  for (const w of i.weeks) {
    const mine = payersAcceptanceOn(i.payerCompanyId, w)
    if (!mine) {
      waiting++
      continue
    }
    const share = shareOf(i, w)
    hours += Number(mine.hours) * share
    accepted.push({
      periodStart: w.periodStart,
      periodEnd: w.periodEnd,
      days: w.days ? daysOf(i, w) : null,
      hours: Number(mine.hours) * share,
    })
    if (count === 0) firstRateCents = mine.rateCents
    count++
    if (!first || w.periodStart < first) first = w.periodStart
    if (!last || w.periodEnd > last) last = w.periodEnd
  }

  if (count === 0 || !first || !last) return null
  return { hours, count, firstDay: first, lastDay: last, firstRateCents, waiting, weeks: accepted }
}

/**
 * How much of one week the buy contract being billed pays for: the whole
 * of it, or the days that contract was in force where a week spans two.
 */
function shareOf(
  i: { payerCompanyId: string; buyContractId: string; payerLinks: Link[] },
  w: PayableWeek
): number {
  const days = w.days ?? {}
  if (w.sellContract.companyId === i.payerCompanyId) {
    return fractionFor(i.buyContractId, w.sellContract.buyLinks, days)
  }
  return i.payerLinks.some((l) => l.buyContractId === i.buyContractId)
    ? fractionFor(i.buyContractId, i.payerLinks, days)
    : 1
}

/** The days of one week the buy contract being billed pays for. */
function daysOf(
  i: { payerCompanyId: string; buyContractId: string; payerLinks: Link[] },
  w: PayableWeek
): Days {
  const days = w.days ?? {}
  if (w.sellContract.companyId === i.payerCompanyId) {
    return daysFor(i.buyContractId, w.sellContract.buyLinks, days)
  }
  return i.payerLinks.some((l) => l.buyContractId === i.buyContractId)
    ? daysFor(i.buyContractId, i.payerLinks, days)
    : days
}

// ── A week the payer has not accepted blocks the invoice over it ──────
//
// The founder, 2026-09-28 (CLAUDE.md, "What each rung may bill, and
// when", rule 3): a week the paying firm has not accepted blocks the
// invoice receipt that includes it. No "approve anyway with a reason":
// accept the week first. Addendum E's warn-and-proceed does not apply,
// because paying for hours nobody accepted is what the check exists to
// stop.
//
// It used to be counted in `waiting` and nothing read it, so an invoice
// covering one accepted week and one unaccepted one failed only the
// quantity check — which is waivable — and a clerk could record why and
// pay for the week nobody here had accepted.

/** One week inside an invoice that the firm paying it has not accepted. */
export interface WaitingWeek {
  id: string
  periodStart: Date
  personName: string | null
}

/**
 * Every week inside the invoiced period that the payer has not accepted
 * and that the buy contract being billed pays some part of. A week the
 * contract was not in force for at all is not this invoice's business.
 */
export function weeksAwaitingPayer(i: {
  payerCompanyId: string
  buyContractId: string
  weeks: PayableWeek[]
  payerLinks: Link[]
}): WaitingWeek[] {
  return i.weeks
    .filter((w) => !payersAcceptanceOn(i.payerCompanyId, w) && shareOf(i, w) > 0)
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((w) => ({ id: w.id, periodStart: w.periodStart, personName: w.personName ?? null }))
}

/** "September 14" — the way the rest of the product says a week. */
export function weekWord(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function listed(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The refusal, as a sentence naming the week and who must accept it:
 * "Computer Systems has not accepted Helena Marsh's week of September 14.
 * Accept it first, then record this invoice."
 *
 * `then` is what the reader was trying to do — record the invoice at
 * intake, or pay one already recorded.
 */
export function notAcceptedSays(
  payerName: string,
  waiting: readonly WaitingWeek[],
  then: 'record' | 'pay'
): string {
  if (waiting.length === 0) return ''
  const byPerson = new Map<string, Date[]>()
  for (const w of waiting) {
    const who = w.personName ?? ''
    byPerson.set(who, [...(byPerson.get(who) ?? []), w.periodStart])
  }
  const phrases = [...byPerson.entries()].map(([who, starts]) => {
    const whose = who ? `${who}\u2019s` : 'the'
    return `${whose} ${starts.length === 1 ? 'week' : 'weeks'} of ${listed(starts.map(weekWord))}`
  })
  const it = waiting.length === 1 ? 'it' : 'them'
  return (
    `${payerName} has not accepted ${listed(phrases)}. ` +
    `Accept ${it} first, then ${then} this invoice.`
  )
}
