/**
 * What the bench costs, added up once per currency.
 *
 * Every person's burn is in their own pay line's currency (the candidate
 * line on the buy contract carries `payCurrency` beside `payRate`). Two
 * currencies are never added and never ranked against each other: a firm
 * paying some people in dollars and some in rupees reads one total per
 * currency, side by side, and the people are ordered by cost inside their
 * own currency only.
 *
 * Pure arithmetic, no database: read by GET /api/bench/burn and by the
 * Bench page through the route's answer.
 */

export interface BurnRow {
  currency: string
  tier: string
  /** Minor units per working day. */
  dailyCents: number
  /** Minor units since the bench started. */
  toDateCents: number
}

export interface BurnTotal {
  currency: string
  count: number
  dailyCents: number
  /** A five-day week. */
  weeklyCents: number
  /** Twenty-two working days. */
  monthlyCents: number
  toDateCents: number
  retained: { count: number; dailyCents: number }
  marketing: { count: number; dailyCents: number }
}

export const WORKING_DAYS_A_WEEK = 5
export const WORKING_DAYS_A_MONTH = 22

const norm = (c: string | null | undefined) => (c || 'USD').toUpperCase()

/**
 * One total per currency. The currency carrying the most people comes
 * first, then the rest alphabetically, so the order does not reshuffle
 * between two reads of the same bench.
 */
export function burnTotals(rows: ReadonlyArray<BurnRow>): BurnTotal[] {
  const by = new Map<string, BurnTotal>()
  for (const r of rows) {
    const ccy = norm(r.currency)
    const t =
      by.get(ccy) ??
      {
        currency: ccy,
        count: 0,
        dailyCents: 0,
        weeklyCents: 0,
        monthlyCents: 0,
        toDateCents: 0,
        retained: { count: 0, dailyCents: 0 },
        marketing: { count: 0, dailyCents: 0 },
      }
    t.count += 1
    t.dailyCents += r.dailyCents
    t.weeklyCents += r.dailyCents * WORKING_DAYS_A_WEEK
    t.monthlyCents += r.dailyCents * WORKING_DAYS_A_MONTH
    t.toDateCents += r.toDateCents
    if (r.tier === 'RETAINED') {
      t.retained.count += 1
      t.retained.dailyCents += r.dailyCents
    } else if (r.tier === 'MARKETING') {
      t.marketing.count += 1
      t.marketing.dailyCents += r.dailyCents
    }
    by.set(ccy, t)
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency))
}

/**
 * The people, most costly first, inside their own currency: every row of
 * the leading currency, then the next. Never a dong amount ranked above a
 * dollar amount because its number is bigger.
 */
export function byCostWithinCurrency<T extends BurnRow>(rows: ReadonlyArray<T>): T[] {
  const order = burnTotals(rows).map((t) => t.currency)
  return [...rows].sort(
    (a, b) =>
      order.indexOf(norm(a.currency)) - order.indexOf(norm(b.currency)) || b.dailyCents - a.dailyCents
  )
}
