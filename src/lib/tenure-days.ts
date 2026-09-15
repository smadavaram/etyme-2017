/**
 * How long a person has been on site, in days.
 *
 * Addendum E: tenure accrues to the person at the client, across every
 * supplier. Twelve months through one firm and then twelve through
 * another is twenty-four months of exposure — that is the number nobody
 * else can compute, and the reason the ledger exists.
 *
 * But a chain is not two suppliers in sequence. When a client buys from
 * a prime who buys from a bench vendor, there are two sell contracts for
 * the same person, the same site and the same days — one per rung — and
 * summing them said a person three firms deep had been on site three
 * times as long as they had. A cap of eighteen months then blocked
 * somebody at six.
 *
 * So the days are the union of the periods, not their sum. Two contracts
 * covering the same week are one week on site. Two contracts a year
 * apart are two periods, and the gap between them is not tenure.
 *
 * And it is time served, not time booked. A contract that runs to next
 * spring has not put anybody on site next spring yet; counting it did,
 * so a person two hundred days into a year read as twelve months and
 * tripped a cap they were nowhere near. What the contract will add up
 * to is the horizon's question (lib/governance-horizon), asked
 * separately and answered as a forecast.
 */

export interface Period {
  startDate: Date
  /** Null: still running, counted to `now`. */
  endDate: Date | null
}

const DAY = 86_400_000

/** Whole days on site across all the periods, overlaps counted once. */
export function daysOnSite(periods: Period[], now: Date = new Date()): number {
  const today = now.getTime()
  const spans = periods
    .map((p) => ({ from: p.startDate.getTime(), to: Math.min((p.endDate ?? now).getTime(), today) }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from)

  let total = 0
  let open: { from: number; to: number } | null = null
  for (const s of spans) {
    if (open && s.from <= open.to) {
      // Same person, same site, overlapping paper. One stretch.
      if (s.to > open.to) open.to = s.to
      continue
    }
    if (open) total += open.to - open.from
    open = { ...s }
  }
  if (open) total += open.to - open.from
  return Math.ceil(total / DAY)
}

/** Days into months the way the ledger has always rounded them. */
export function monthsOf(days: number): number {
  return Math.round(days / 30.44)
}
