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

/**
 * The ledger's month: the average Gregorian month, 365.25 / 12 days.
 * A time limit written in months is enforced in days, and this is the
 * one place that says how many.
 */
export const DAYS_PER_MONTH = 30.44

/**
 * The day count a limit of `months` is enforced at. Governance and the
 * tenure ledger block or flag when the days on site reach this; it is
 * the one formula for it, rather than one copy per route. It is the
 * formula every copy already used, so the block does not move.
 */
export function daysFor(months: number): number {
  return Math.round(months * DAYS_PER_MONTH)
}

// Days in each month of a common year, January first.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * The fewest days any run of `months` consecutive calendar months can
 * hold. One is 28 (a February); six is 181 (January to June); twelve is
 * 365; twenty-four is 730. A run of 48 months or more cannot dodge a
 * leap day.
 */
export function fewestDaysIn(months: number): number {
  if (!(months > 0)) return 0
  const years = Math.floor(months / 12)
  const rest = months % 12
  let shortest = 0
  if (rest > 0) {
    shortest = Infinity
    for (let from = 0; from < 12; from++) {
      let d = 0
      for (let k = 0; k < rest; k++) d += MONTH_DAYS[(from + k) % 12]
      if (d < shortest) shortest = d
    }
  }
  return years * 365 + shortest + Math.floor(months / 48)
}

/**
 * Whole months served. Never rounded up. Decided by the founder,
 * 2026-09-29.
 *
 * `n` months are served once the days on site reach the fewest days any
 * `n` consecutive calendar months can hold. So a span of exactly `n`
 * calendar months — any start day, any year — reads as `n`: January to
 * July is six, two years is twenty-four, a February is one. And a count
 * of days no run of `n` calendar months could fit in never reads as `n`.
 *
 * This used to be `Math.round(days / 30.44)`, which counted a month as
 * served once half of it was. Sixteen days on site read as "1 months
 * here", and — the part that matters — 533 days read as 18 months:
 * "past the limit" on the person's page, the census and the register a
 * fortnight before an eighteen-month limit, which governance enforces
 * at `daysFor(18)` = 548 days, actually blocks.
 *
 * What is left, said so it is a choice: the limit is enforced in the
 * ledger's 30.44-day months and this counts calendar months, so a
 * screen can reach "18 months" up to three days before the block does
 * (546 against 548). Closing that means stating the limit in calendar
 * months too, which is a change to a BLOCK rather than to a label, and
 * is not made here.
 */
export function monthsOf(days: number): number {
  if (!(days > 0)) return 0
  let n = Math.max(0, Math.floor(days / DAYS_PER_MONTH) - 1)
  while (n > 0 && fewestDaysIn(n) > days) n--
  while (fewestDaysIn(n + 1) <= days) n++
  return n
}

/** Where somebody stands against a time limit, in numbers and in words. */
export interface AgainstLimit {
  /**
   * Days on site as a share of the limit's days, rounded down, and never
   * capped. Past the limit it reads past a hundred — 740 days against an
   * eighteen-month limit of 548 is 135%, not 100%.
   */
  percent: number
  /** How wide to draw the bar: the percentage, stopped at a full bar. */
  barPercent: number
  /** The days the limit is enforced at — `daysFor(capMonths)`. */
  limitDays: number
  /** True once the days on site have reached the limit. */
  over: boolean
  /** Days past the limit; zero inside it. */
  overByDays: number
  /**
   * "over the limit by 6 months", "over the limit by 12 days", or null
   * inside it. Whole months only, never rounded up, by the same rule as
   * months served.
   */
  overBy: string | null
}

/**
 * Where a person's days on site stand against a time limit in months.
 *
 * Found by a tester on 2026-09-30: Kwame Mensah served 740 days against
 * an eighteen-month limit and the ledger said "100%", because the page
 * stopped the percentage at a hundred to draw the bar. That hid the one
 * fact the page exists for — the limit was passed, by six months. The
 * bar may stop at full; the number may not.
 *
 * Counted in days against `daysFor`, the same days the block counts, so
 * the percentage and the status chip beside it can never disagree.
 */
export function againstLimit(days: number, capMonths: number): AgainstLimit {
  const limitDays = daysFor(capMonths)
  const served = days > 0 ? days : 0
  const percent = limitDays > 0 ? Math.floor((served / limitDays) * 100) : 0
  const overByDays = Math.max(0, served - limitDays)
  const over = limitDays > 0 && served >= limitDays
  let overBy: string | null = null
  if (overByDays > 0) {
    const months = monthsOf(overByDays)
    overBy = months >= 1
      ? `over the limit by ${months} month${months === 1 ? '' : 's'}`
      : `over the limit by ${overByDays} day${overByDays === 1 ? '' : 's'}`
  } else if (over) {
    overBy = 'at the limit'
  }
  return { percent, barPercent: Math.min(100, percent), limitDays, over, overByDays, overBy }
}

// ── The day the limit is reached, and the contracts that run past it ──

/**
 * The day a person's days on site reach a time limit, if the contracts
 * on the record carry them that far.
 *
 * Found by a tester on 2026-10-03: Lucía Fernández, 426 days into an
 * eighteen-month limit at Northbend Athletic, had a Pinnacle Resourcing
 * contract booked to Sep 3, 2027 — about seven months past the day she
 * reaches the limit — and the ledger gave no date and no warning. The
 * ledger counted time served, which is right for the percentage and the
 * block, and asked nothing about the paper already signed ahead of her.
 *
 * Counted the same way as `daysOnSite` — the union of the periods, so a
 * chain's two rungs are one stretch and a gap between two suppliers is
 * not tenure — but over the contracts' booked ends rather than stopped
 * at today. A contract with no end runs on. The answer is the day on
 * which `daysOnSite` first reads `daysFor(capMonths)`, the same count the
 * block uses, so this date and the block cannot disagree.
 *
 * Null where the contracts on the record end first. That is not "never";
 * it is "not on the paper that exists", and the screen says so rather
 * than inventing a date from a contract nobody has signed.
 *
 * The caller passes an ended contract with its end at or before today,
 * because an early termination that left the booked end in the future
 * is not somebody still on site.
 */
export function limitReachedOn(periods: Period[], capMonths: number): Date | null {
  const limitDays = daysFor(capMonths)
  if (!(limitDays > 0)) return null
  const spans = periods
    .map((p) => ({ from: p.startDate.getTime(), to: p.endDate ? p.endDate.getTime() : Infinity }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from)

  const merged: { from: number; to: number }[] = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s.from <= last.to) {
      if (s.to > last.to) last.to = s.to
    } else {
      merged.push({ ...s })
    }
  }

  // `daysOnSite` rounds a part-day up, so the count reads the limit for
  // the whole of the day on which the limit-th day is served — the
  // first moment past (limit − 1) whole days. That day is the answer;
  // a day later would be a day after the block already fires.
  const threshold = (limitDays - 1) * DAY
  let total = 0
  for (const s of merged) {
    const length = s.to - s.from
    if (total + length > threshold) return new Date(s.from + (threshold - total))
    total += length
  }
  return null
}

/** A contract as the overrun check needs it. */
export interface BookedContract {
  id: string
  /** The firm the reader may name for it — never a withheld sub-vendor's name. */
  firm: string
  endDate: Date | null
  /** True while the contract is running or paused, so it can still put days on. */
  live: boolean
}

/** A live contract whose booked end runs past the day the limit is reached. */
export interface RunsPast {
  contractId: string
  firm: string
  endDate: Date | null
  /** Days from the limit to the booked end. Null for a contract with no end. */
  daysPast: number | null
}

/**
 * Every live contract booked past the day the limit is reached.
 *
 * Only live ones: an ended contract cannot carry anybody past anything.
 * A live contract with no end date runs past any limit by construction,
 * and is named as such rather than left out because there is no number.
 */
export function contractsPastLimit(contracts: BookedContract[], reachedOn: Date | null): RunsPast[] {
  if (!reachedOn) return []
  const at = reachedOn.getTime()
  const out: RunsPast[] = []
  for (const c of contracts) {
    if (!c.live) continue
    if (c.endDate == null) {
      out.push({ contractId: c.id, firm: c.firm, endDate: null, daysPast: null })
      continue
    }
    const past = c.endDate.getTime() - at
    if (past > 0) out.push({ contractId: c.id, firm: c.firm, endDate: c.endDate, daysPast: Math.ceil(past / DAY) })
  }
  return out
}
