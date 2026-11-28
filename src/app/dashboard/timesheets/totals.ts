/**
 * What the tiles above the timesheet list add up, and a label that says so.
 *
 * A client tester read "1750 — this period" and "$188,392 — billable" on
 * 2026-09-30 and checked them against the API: both were every week on
 * record since February, forty-four of them. The arithmetic was right and
 * the label was not, which is the worse way round — nobody audits a
 * number that looks like this week's. And "Anomalies 0 — none detected"
 * sat above three rows carrying a warning, because the tile counted one
 * column and the warning read another.
 *
 * So each tile counts the rows the list shows, and its label says which:
 * how many weeks, since when, and whether the list is cut. The flagged
 * tile counts exactly the rows that carry the warning mark.
 *
 * Beside the page rather than under `src/lib`, because a new file there
 * needs an owner in `lib/domains.ts`; no database, no clock.
 */

import { compact } from '@/lib/money-display'
import { decimalsFor } from '@/lib/money'

export interface TotalsRow {
  periodStart: string
  totalHours: number
  status: string
  /** The warning the row carries, or null — the ⚠ on the list. */
  flag: string | null
  /** Whether this reader still has to sign it. */
  waitingOnYou: boolean
  /** What the row is worth at this reader's rate; null where it cannot be priced. */
  valueCents: number | null
  /** The currency the rate, and so the value, is in; dollars where the row does not say. */
  currency?: string
  /**
   * The rate is on file and withheld from this reader. A withheld figure
   * is not a missing one, and is never added in as zero (round six,
   * problem 4).
   */
  withheld?: boolean
  /**
   * This reader has signed it. In a chain a week the client signed stays
   * SUBMITTED until the supplier below accepts it, so status alone left
   * every week Northbend signed out of Northbend's own total.
   */
  youSigned?: boolean
  /**
   * The reader pays this week's rate rather than bills it: a prime's row
   * for a week bought from its sub-vendor. What a firm bills and what it
   * pays are never added into one figure.
   */
  buys?: boolean
}

/**
 * One row of the timesheet list, as the tiles read it. The page and the
 * tests both build rows through this, so a test of the total is a test
 * of the page's own mapping.
 */
export function totalsRowOf(t: {
  periodStart: string
  totalHours: number
  status: string
  flag: string | null
  mayApprove?: boolean
  rate: { cents: number | null; currency?: string | null; withheld?: boolean; buys?: boolean }
  overtime?: { billableCents: number | null } | null
  signature?: { waitingOnYou: boolean; youSigned: boolean } | null
  /**
   * What the payer on the reader's line accepted, where it is not every
   * hour filed (walk 8): the row reads those hours and is valued on them,
   * so the tiles add up what the rows say, never the hours filed.
   */
  accepted?: { hours: number } | null
}): TotalsRow {
  const hours = t.accepted?.hours ?? t.totalHours
  return {
    periodStart: t.periodStart,
    totalHours: hours,
    status: t.status,
    flag: t.flag,
    waitingOnYou: t.signature ? t.signature.waitingOnYou : t.status === 'SUBMITTED' && !!t.mayApprove,
    valueCents: t.overtime ? t.overtime.billableCents : t.rate.cents == null ? null : hours * t.rate.cents,
    currency: (t.rate.currency || 'USD').toUpperCase(),
    withheld: t.rate.withheld === true,
    youSigned: t.signature?.youSigned ?? false,
    buys: t.rate.buys === true,
  }
}

export interface Totals {
  hours: number
  hoursSays: string
  flagged: number
  flaggedSays: string
  /**
   * Null where every approved week's rate is withheld from this reader:
   * there is no figure to show, and $0 would be a false one. Null too where
   * the weeks are in more than one currency, which no single figure can
   * say; `approvedValue` then says each currency's own.
   */
  approvedValueCents: number | null
  /** The approved value per currency, in the order the rows arrived; null where every rate is withheld. Never summed across currencies. */
  approvedValue: { minor: number; currency: string }[] | null
  approvedSays: string
  /**
   * What this reader pays for the weeks it buys (a prime's weeks from its
   * sub-vendor), per currency, said beside the billable figure and never
   * added into it. Null where the list holds no week this reader pays
   * beside weeks it bills (walk 8 on Computer Systems: "Approved value
   * $36,160" left eight weeks it pays out and said nothing of their value).
   */
  paidValue: { minor: number; currency: string }[] | null
  paidSays: string | null
}

/** "Feb 23, 2026" — read in UTC, because a period start is a date and not a moment. */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function weeks(n: number): string {
  return `${n} ${n === 1 ? 'week' : 'weeks'}`
}

/**
 * What the rows add up to, said truthfully.
 *
 * `onServer` is how many weeks matched in all; where the list holds
 * fewer, the label says it is the first page and not the whole.
 */
export function listTotals(rows: TotalsRow[], opts: { onServer: number; payBasis: boolean }): Totals {
  const earliest = rows.reduce<string | null>(
    (m, r) => (m == null || r.periodStart < m ? r.periodStart : m),
    null
  )
  const cut = opts.onServer > rows.length
  const span = (n: number, first: string | null) =>
    n === 0
      ? 'no weeks on this list'
      : `${cut ? `the ${weeks(n)} shown of ${opts.onServer}` : `${n === 1 ? 'the one week' : `all ${weeks(n)}`} on this list`}` +
        (first ? `, since ${day(first)}` : '')

  const hours = Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 100) / 100

  const flaggedRows = rows.filter((r) => r.flag != null)
  const flaggedWaiting = flaggedRows.filter((r) => r.waitingOnYou).length

  // Approved by every firm, or signed by this reader and waiting on the
  // firm below: either way it is work this reader has said yes to.
  const approved = rows.filter((r) => r.status === 'APPROVED' || r.youSigned === true)
  // What a firm bills and what it pays are two figures, never one sum: a
  // prime's list holds weeks it bills its client for beside weeks it buys
  // from its sub-vendor (the second Tapin walk). The figure is what it
  // bills; where every week is one it pays, it is what it pays; the weeks
  // left out are said by count.
  const paid = approved.filter((r) => r.buys === true)
  const billed = approved.filter((r) => r.buys !== true)
  const onlyPays = billed.length === 0 && paid.length > 0
  const valued = onlyPays ? paid : billed
  const leftOut = onlyPays ? 0 : paid.length
  const signedOnly = valued.filter((r) => r.status !== 'APPROVED').length
  const counted =
    signedOnly === 0 ? 'approved'
    : signedOnly === valued.length ? 'signed by you'
    : 'approved or signed by you'
  const priced = valued.filter((r) => r.valueCents != null)
  const byCurrency = new Map<string, number>()
  for (const r of priced) {
    const c = r.currency ?? 'USD'
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + (r.valueCents ?? 0))
  }
  const approvedValue = [...byCurrency.entries()].map(([currency, minor]) => ({ minor, currency }))
  const approvedValueCents = approvedValue.length <= 1 ? (approvedValue[0]?.minor ?? 0) : null
  const withheld = valued.filter((r) => r.valueCents == null && r.withheld === true).length
  const unpriced = valued.length - priced.length - withheld
  const allWithheld = valued.length > 0 && priced.length === 0 && withheld === valued.length
  const approvedFirst = valued.reduce<string | null>(
    (m, r) => (m == null || r.periodStart < m ? r.periodStart : m),
    null
  )
  const lead = opts.payBasis ? 'your pay for' : onlyPays ? 'what you pay for' : 'billable, from'
  const notInIt = leftOut > 0 ? `; ${weeks(leftOut)} you pay for ${leftOut === 1 ? 'is' : 'are'} not in this figure` : ''

  // The weeks this reader pays for, valued apart, where they sit beside
  // weeks it bills. A withheld rate stays out of the figure and is counted.
  const paidPriced = leftOut > 0 ? paid.filter((r) => r.valueCents != null) : []
  const paidBy = new Map<string, number>()
  for (const r of paidPriced) {
    const c = r.currency ?? 'USD'
    paidBy.set(c, (paidBy.get(c) ?? 0) + (r.valueCents ?? 0))
  }
  const paidUnpriced = leftOut - paidPriced.length
  return {
    paidValue: leftOut > 0 && paidPriced.length > 0 ? [...paidBy.entries()].map(([currency, minor]) => ({ minor, currency })) : null,
    paidSays: leftOut > 0
      ? `what you pay for ${weeks(leftOut)} you buy` + (paidUnpriced > 0 ? `; ${paidUnpriced} with no rate you may read` : '') +
        '; never added into the billable figure'
      : null,
    hours,
    hoursSays: span(rows.length, earliest),
    flagged: flaggedRows.length,
    flaggedSays:
      flaggedRows.length === 0
        ? 'no week on this list is flagged'
        : flaggedWaiting > 0
          ? `${flaggedWaiting} waiting on you`
          : 'none waiting on you',
    approvedValueCents: allWithheld ? null : approvedValueCents,
    approvedValue: allWithheld ? null : approvedValue,
    approvedSays:
      approved.length === 0
        ? 'no approved or signed weeks on this list'
        : allWithheld
          ? `${weeks(valued.length)} ${counted}` +
            (approvedFirst ? ` since ${day(approvedFirst)}` : '') +
            '; their value is read by the billing team' + notInIt
          : `${lead} ${weeks(valued.length)} ${counted}` +
            (approvedFirst ? ` since ${day(approvedFirst)}` : '') +
            (withheld > 0 ? `; ${withheld} more whose rate is read by the billing team` : '') +
            (unpriced > 0 ? `; ${unpriced} more with no rate on file` : '') +
            notInIt,
  }
}

/**
 * The rate column's heading: the word every row shares, or "Rate" where
 * a firm's list holds weeks it bills beside weeks it pays, and each cell
 * then says its own (`rateWordFor` on the server).
 */
export function rateColumnLabel(labels: readonly string[]): { label: string; perRow: boolean } {
  const words = [...new Set(labels.filter(Boolean))]
  if (words.length === 0) return { label: 'Bill rate', perRow: false }
  if (words.length === 1) return { label: words[0], perRow: false }
  return { label: 'Rate', perRow: true }
}

/**
 * The approved value tile, in each currency's own money: "$4,000",
 * "₹320,000" for rupees, "$4,000 and ₫17,000,000" for two, and
 * null (the tile's dash) where every rate is withheld. Whole units, as
 * the tile always rounded.
 */
export function approvedValueSays(t: Pick<Totals, 'approvedValue'>): string | null {
  return moneySays(t.approvedValue)
}

/** The weeks this reader pays for, in each currency's own money; null where there are none. */
export function paidValueSays(t: Pick<Totals, 'paidValue'>): string | null {
  return t.paidValue == null ? null : moneySays(t.paidValue)
}

function moneySays(v: { minor: number; currency: string }[] | null): string | null {
  if (v == null) return null
  if (v.length === 0) return compact(0, 'USD')
  const parts = v.map((v) => compact(roundWhole(v.minor, v.currency), v.currency))
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function roundWhole(minor: number, currency: string): number {
  const per = 10 ** decimalsFor(currency)
  return Math.round(minor / per) * per
}

/**
 * A money cell in the export: whole units with the currency's own
 * decimals ("130.00" for dollars, "170000" for dong), never minor units
 * divided by a hundred. The export carries the currency in its own column.
 */
export function exportMoney(minor: number | null, currency: string | null | undefined): string {
  if (minor == null) return ''
  const c = (currency || 'USD').toUpperCase()
  const d = decimalsFor(c)
  return (minor / 10 ** d).toFixed(d)
}
