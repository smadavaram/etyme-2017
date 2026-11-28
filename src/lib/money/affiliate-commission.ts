/**
 * What an affiliate earns (records 127 and 129). Pure: no database, no
 * clock, no payment. Every figure is integer cents.
 *
 * An affiliate only refers. It earns a share of the subscription a tenant
 * actually paid: the charge per contractor plus the platform fee, nothing
 * else. Usage and consulting have no input here. Nothing in this file, or
 * in the affiliate files beside it, reads a sell line, a buy line, a margin
 * or a placement; `__tests__/invariants/affiliate-isolation.test.ts`
 * fails the build if one ever does.
 *
 * The rate: 40% (4000 basis points) for months 1 to 12 counted from the
 * tenant's activation, 20% from month 13 for as long as it pays. A receipt
 * is rated by the month its period STARTS in, so a year's platform fee paid
 * at activation is a month-1 receipt and the next year's is month 13.
 * Rounded down to the cent: never more than the rate says.
 */

export const AFFILIATE_TERMS = { firstYearBp: 4000, afterBp: 2000, firstYearMonths: 12 } as const

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/** Whole months added to a date in UTC; a 31st lands on the last day of a shorter month. */
function addMonthsUtc(d: Date, n: number): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
}

/** Which month since activation a date falls in (the day of activation starts month 1), or null before it. */
export function monthFromActivation(activatedAt: Date, on: Date): number | null {
  if (on.getTime() < activatedAt.getTime()) return null
  let m = (on.getUTCFullYear() - activatedAt.getUTCFullYear()) * 12 + (on.getUTCMonth() - activatedAt.getUTCMonth()) + 1
  while (m > 1 && addMonthsUtc(activatedAt, m - 1).getTime() > on.getTime()) m--
  while (addMonthsUtc(activatedAt, m).getTime() <= on.getTime()) m++
  return m
}

export function rateBpFor(month: number): number {
  return month <= AFFILIATE_TERMS.firstYearMonths ? AFFILIATE_TERMS.firstYearBp : AFFILIATE_TERMS.afterBp
}

export type Accrual =
  | { ok: true; basisCents: number; rateBp: number; commissionCents: number; monthFromActivation: number }
  | { ok: false; says: string }

/** The commission one paid receipt earns. Only the two subscription figures are read. */
export function accrualOf(i: { activatedAt: Date; periodStart: Date; contractorCents: number; platformFeeCents: number }): Accrual {
  if (!isCents(i.contractorCents) || !isCents(i.platformFeeCents)) {
    return { ok: false, says: 'A subscription receipt is whole cents and never negative; no commission is worked out on anything else.' }
  }
  const month = monthFromActivation(i.activatedAt, i.periodStart)
  if (month === null) return { ok: false, says: 'This period starts before the tenant was activated, so no commission is worked out on it.' }
  const basisCents = i.contractorCents + i.platformFeeCents
  const rateBp = rateBpFor(month)
  return { ok: true, basisCents, rateBp, commissionCents: Math.floor((basisCents * rateBp) / 10000), monthFromActivation: month }
}

export type Clawback = { ok: true; clawbackCents: number } | { ok: false; says: string }

/**
 * What a refund or chargeback takes back: the same share of what the
 * receipt paid as the share of the receipt reversed. Reversing the whole
 * receipt, in one part or many, takes back exactly what it paid.
 */
export function clawbackOf(i: {
  earnedCents: number
  receiptBasisCents: number
  reversedBasisBeforeCents: number
  clawedBeforeCents: number
  reversalBasisCents: number
}): Clawback {
  const { earnedCents, receiptBasisCents, reversedBasisBeforeCents, clawedBeforeCents, reversalBasisCents } = i
  for (const n of [earnedCents, receiptBasisCents, reversedBasisBeforeCents, clawedBeforeCents, reversalBasisCents]) {
    if (!isCents(n)) return { ok: false, says: 'A reversal is whole cents and never negative.' }
  }
  const cumulative = reversedBasisBeforeCents + reversalBasisCents
  if (cumulative > receiptBasisCents) return { ok: false, says: 'A reversal cannot be larger than what the receipt held, less what was already reversed.' }
  if (earnedCents === 0 || receiptBasisCents === 0) return { ok: true, clawbackCents: 0 }
  const target = Number((BigInt(earnedCents) * BigInt(cumulative)) / BigInt(receiptBasisCents))
  return { ok: true, clawbackCents: Math.max(0, target - clawedBeforeCents) }
}

/** YYYY-MM of a day, in UTC. */
export function statementMonthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface StatementFigures {
  earnedCents: number
  clawedBackCents: number
  carriedInCents: number
  netCents: number
  entryCount: number
}

/**
 * One affiliate's month from its ledger entries (signed: a clawback is
 * negative). A negative net is carried into the next month; Etyme never
 * collects from an affiliate, it takes the amount off the next payout.
 */
export function buildStatement(i: { carriedInCents: number; entries: { commissionCents: number }[] }): StatementFigures {
  let earned = 0
  let clawed = 0
  for (const e of i.entries) {
    if (e.commissionCents >= 0) earned += e.commissionCents
    else clawed += -e.commissionCents
  }
  return { earnedCents: earned, clawedBackCents: clawed, carriedInCents: i.carriedInCents, netCents: i.carriedInCents + earned - clawed, entryCount: i.entries.length }
}

/** An affiliate never earns on a tenant it owns or holds a seat at. */
export function selfReferral(i: { affiliateOwnCompanyId: string | null; affiliateSeatCompanyIds: string[]; tenantCompanyId: string }): boolean {
  return i.affiliateOwnCompanyId === i.tenantCompanyId || i.affiliateSeatCompanyIds.includes(i.tenantCompanyId)
}
