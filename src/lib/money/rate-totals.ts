/**
 * The bill rates of the running lines, added — one total per currency.
 *
 * The Sell tab's "Active bill rates" added every running line's rate
 * into one dollar figure, so a firm billing one line in rupees and one in
 * dollars read ₹8,000 + $142 as "$8,142". Rupees and dollars are never
 * added. One total per currency, largest first.
 *
 * And a total over part of the book is not the book's total: where any
 * running line's rate is withheld from this reader, or was never set,
 * there is no total at all and the sentence says why.
 */

export interface RateRow {
  /** Cents per hour, or null where there is none or it is withheld. */
  rate: number | null
  currency: string
  withheld: boolean
}

export interface RateTotals {
  /** One entry per currency, cents per hour, largest first. Empty where refused. */
  byCurrency: Array<{ currency: string; cents: number }>
  lines: number
  /** Why there is no total, where there is not. */
  refusedBecause: string | null
}

export function activeRateTotals(rows: RateRow[]): RateTotals {
  if (rows.length === 0) return { byCurrency: [], lines: 0, refusedBecause: null }
  const withheld = rows.filter((r) => r.withheld).length
  if (withheld > 0) {
    return {
      byCurrency: [], lines: rows.length,
      refusedBecause: `${withheld} of ${rows.length} running line${rows.length === 1 ? '' : 's'} ${withheld === 1 ? 'bills' : 'bill'} at a rate this desk does not read, so there is no total.`,
    }
  }
  const unset = rows.filter((r) => r.rate == null).length
  if (unset > 0) {
    return {
      byCurrency: [], lines: rows.length,
      refusedBecause: `${unset} of ${rows.length} running line${rows.length === 1 ? '' : 's'} ${unset === 1 ? 'has' : 'have'} no bill rate set, so there is no total.`,
    }
  }
  const sums = new Map<string, number>()
  for (const r of rows) sums.set(r.currency, (sums.get(r.currency) ?? 0) + (r.rate as number))
  return {
    byCurrency: [...sums.entries()]
      .map(([currency, cents]) => ({ currency, cents }))
      .sort((a, b) => b.cents - a.cents || a.currency.localeCompare(b.currency)),
    lines: rows.length,
    refusedBecause: null,
  }
}
