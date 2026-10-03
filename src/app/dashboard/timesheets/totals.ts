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
  /**
   * This reader has signed it. In a chain a week the client signed stays
   * SUBMITTED until the supplier below accepts it, so status alone left
   * every week Northbend signed out of Northbend's own total.
   */
  youSigned?: boolean
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
  rate: { cents: number | null }
  overtime?: { billableCents: number | null } | null
  signature?: { waitingOnYou: boolean; youSigned: boolean } | null
}): TotalsRow {
  return {
    periodStart: t.periodStart,
    totalHours: t.totalHours,
    status: t.status,
    flag: t.flag,
    waitingOnYou: t.signature ? t.signature.waitingOnYou : t.status === 'SUBMITTED' && !!t.mayApprove,
    valueCents: t.overtime ? t.overtime.billableCents : t.rate.cents == null ? null : t.totalHours * t.rate.cents,
    youSigned: t.signature?.youSigned ?? false,
  }
}

export interface Totals {
  hours: number
  hoursSays: string
  flagged: number
  flaggedSays: string
  approvedValueCents: number
  approvedSays: string
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
  const signedOnly = approved.filter((r) => r.status !== 'APPROVED').length
  const counted =
    signedOnly === 0 ? 'approved'
    : signedOnly === approved.length ? 'signed by you'
    : 'approved or signed by you'
  const priced = approved.filter((r) => r.valueCents != null)
  const approvedValueCents = priced.reduce((s, r) => s + (r.valueCents ?? 0), 0)
  const unpriced = approved.length - priced.length
  const approvedFirst = approved.reduce<string | null>(
    (m, r) => (m == null || r.periodStart < m ? r.periodStart : m),
    null
  )

  return {
    hours,
    hoursSays: span(rows.length, earliest),
    flagged: flaggedRows.length,
    flaggedSays:
      flaggedRows.length === 0
        ? 'no week on this list is flagged'
        : flaggedWaiting > 0
          ? `${flaggedWaiting} waiting on you`
          : 'none waiting on you',
    approvedValueCents,
    approvedSays:
      approved.length === 0
        ? 'no approved or signed weeks on this list'
        : `${opts.payBasis ? 'your pay for' : 'billable, from'} ${weeks(approved.length)} ${counted}` +
          (approvedFirst ? ` since ${day(approvedFirst)}` : '') +
          (unpriced > 0 ? `; ${unpriced} more with no rate on file` : ''),
  }
}
