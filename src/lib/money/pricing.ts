/**
 * What an edition costs (records 126 and 127). Pure: no database, no clock
 * of its own, no payment. A charge here is a figure on a statement, never
 * money moved: Etyme never moves money.
 *
 * Every figure is integer cents, in dollars, and is never rounded for
 * display: 15 Starter contractors are $299.85 a month, $3,598.20 a year in
 * usage, $4,598.20 all in. Nothing is charged per agent action until the
 * per-tier rates are approved, so usage is null, never zero.
 */

export type PricedEdition = 'USER' | 'STARTER' | 'ENTERPRISE'

/** The locked figures (record 127). The only place a price is written down. */
export const PRICES = {
  starterUnitCents: 1999, // per active contractor per month
  starterFloorCents: 19900, // a month, on the contractor charge only
  starterPlatformFeeCents: 100000, // a year, always on top, never counted toward the floor
  enterpriseUnitCents: 2000, // per active contractor per month
  enterprisePlatformFeeCents: 1200000, // a year
  trialDays: 60,
  /** "About 15%" off usage, in basis points, for a year paid ahead. Usage only. */
  prepaidUsageDiscountBp: 1500,
} as const

/** The sentence the rate card and the statement print where usage would be priced. */
export const USAGE_SAYS = 'Metered per action; rates published before metered billing begins.'

export interface EditionCharge {
  edition: PricedEdition
  contractors: number
  /** The per-contractor charge for one month, floor applied. */
  monthlyCents: number
  /** Twelve months of that charge. */
  yearlyContractorCents: number
  /** The annual platform fee, on top. */
  platformFeeCents: number
  /** Contractor charge for a year plus the fee. Usage is not in it. */
  yearAllInCents: number
  /** True where the Starter floor, not the headcount, set the month. */
  floorApplied: boolean
}

/** Null where the headcount is not a count of people: a figure nobody can stand behind. */
export function editionCharge(edition: PricedEdition, contractors: number): EditionCharge | null {
  if (!Number.isInteger(contractors) || contractors < 0) return null
  if (edition === 'USER') {
    return { edition, contractors, monthlyCents: 0, yearlyContractorCents: 0, platformFeeCents: 0, yearAllInCents: 0, floorApplied: false }
  }
  if (edition === 'ENTERPRISE') {
    const monthlyCents = PRICES.enterpriseUnitCents * contractors
    const yearlyContractorCents = monthlyCents * 12
    return {
      edition, contractors, monthlyCents, yearlyContractorCents,
      platformFeeCents: PRICES.enterprisePlatformFeeCents,
      yearAllInCents: yearlyContractorCents + PRICES.enterprisePlatformFeeCents,
      floorApplied: false,
    }
  }
  const raw = PRICES.starterUnitCents * contractors
  const floorApplied = raw < PRICES.starterFloorCents
  const monthlyCents = floorApplied ? PRICES.starterFloorCents : raw
  const yearlyContractorCents = monthlyCents * 12
  return {
    edition, contractors, monthlyCents, yearlyContractorCents,
    platformFeeCents: PRICES.starterPlatformFeeCents,
    yearAllInCents: yearlyContractorCents + PRICES.starterPlatformFeeCents,
    floorApplied,
  }
}

/**
 * A year of usage after the prepay discount. The discount is on usage only,
 * never on the contractor charge or the fee. Null where usage is not priced
 * yet (it is not, until the rates are approved).
 */
export function usageAfterPrepay(usageCents: number | null, prepaid: boolean): number | null {
  if (usageCents == null) return null
  if (!prepaid) return usageCents
  return usageCents - Math.round((usageCents * PRICES.prepaidUsageDiscountBp) / 10000)
}

/**
 * The own-business test (record 126): placements where the tenant is the
 * supplier of record, plus invoices it issued. Above zero, it pays; being a
 * user inside another tenant's record never counts.
 */
export function runsOwnBusiness(placementsAsSupplier: number, invoicesIssued: number): boolean {
  return placementsAsSupplier + invoicesIssued > 0
}

export type TrialState =
  | { state: 'FREE_USER' } // edition USER: never on a clock
  | { state: 'EXEMPT' } // the internal proving tenants (record 126)
  | { state: 'NO_CLOCK' } // paying edition, not activated
  | { state: 'TRIAL'; day: number; daysLeft: number }
  | { state: 'PAID'; paidThrough: Date }
  | { state: 'UNPAID'; day: number } // day 61 or later, nothing paid: read-only

const DAY = 86_400_000
const utcDay = (d: Date) => Math.floor(d.getTime() / DAY)

/**
 * Day N of 60, and what day 61 means. The activation day is day 1 (UTC
 * days). Day 61 is activatedAt + 60 days. Paid through a later instant
 * lifts it; a trial day needs no payment. A tenant that reads UNPAID is
 * read-only; the rule that blocks writes is one switch elsewhere.
 */
export function trialOf(t: {
  edition: PricedEdition
  activatedAt: Date | null
  paidThrough: Date | null
  billingExempt: boolean
  now: Date
}): TrialState {
  if (t.billingExempt) return { state: 'EXEMPT' }
  if (t.edition === 'USER') return { state: 'FREE_USER' }
  if (!t.activatedAt) return { state: 'NO_CLOCK' }
  const day = utcDay(t.now) - utcDay(t.activatedAt) + 1
  if (day < 1) return { state: 'NO_CLOCK' } // activation in the future: no clock yet
  if (day <= PRICES.trialDays) return { state: 'TRIAL', day, daysLeft: PRICES.trialDays - day }
  if (t.paidThrough && t.paidThrough.getTime() > t.now.getTime()) return { state: 'PAID', paidThrough: t.paidThrough }
  return { state: 'UNPAID', day }
}

/** Whether the clock says read-only. Read access always stays. */
export const isReadOnly = (s: TrialState): boolean => s.state === 'UNPAID'
