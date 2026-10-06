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

// ── One contract's days, served and booked ────────────────────────────

/**
 * Days served on one contract, counted the way the block counts them:
 * from its start to its end or today, whichever is first.
 *
 * Found by a tester on 2026-10-03: the time-on-site page's contract table
 * counted each contract to its booked end, so Lucía Fernández's Pinnacle
 * Resourcing contract read 365 days a month after it began. A day booked
 * is not a day on site.
 */
export function daysServed(contract: Period, now: Date = new Date()): number {
  return daysOnSite([contract], now)
}

/**
 * Days booked on one contract, start to booked end, for reading beside
 * the days served. Null where the contract has no end, because an open
 * contract has no booked length to state.
 */
export function daysBooked(contract: Period): number | null {
  if (!contract.endDate) return null
  return Math.max(0, Math.ceil((contract.endDate.getTime() - contract.startDate.getTime()) / DAY))
}

// ── Where somebody stands against the client's rules ──────────────────

/**
 * One contract that put the person on this client's site, from any
 * supplier, at any rung.
 */
export interface SiteLine {
  startDate: Date
  endDate: Date | null
  /** True while the line is running or paused — anything but ENDED. */
  live: boolean
}

/** The client's two rules, as its governance policy states them. */
export interface LimitRules {
  /** The time limit in months; null where the client set none. */
  capMonths: number | null
  /** Days away the client requires before somebody comes back; null where it set none. */
  breakDays: number | null
}

/**
 * The one reading of a person against a client's time limit and break.
 *
 *  UNDER          nothing stands in the way
 *  APPROACHING    on the days the limit counts, three quarters of the way or more
 *  PAST_ON_SITE   past the limit and still on site
 *  IN_BREAK       away, and the break the client requires is still running
 *  BREAK_SERVED   away for at least the break: eligible, and counting starts again
 *  PAST_NO_RETURN past the limit, away, and the client set no break — so nothing resets the count
 */
export type StandingState =
  | 'UNDER'
  | 'APPROACHING'
  | 'PAST_ON_SITE'
  | 'IN_BREAK'
  | 'BREAK_SERVED'
  | 'PAST_NO_RETURN'

export interface Standing {
  state: StandingState
  /** Every day ever served at this client — the record, never reset. */
  daysOnSite: number
  /** The days the limit counts: since the last break served, or every day where none was. */
  countedDays: number
  /**
   * The first instant the limit counts from; null where it counts from
   * the first day. A line that starts before it has been reset away.
   */
  countsFrom: Date | null
  /** The days the limit is enforced at; null with no limit. */
  limitDays: number | null
  /** True once the counted days reach the limit. */
  pastLimit: boolean
  /** On site today: a live line that has begun and not passed its end. */
  onSiteNow: boolean
  /** On site: where the current stretch ends on the paper; null where a line has no end. */
  stretchEnd: Date | null
  /** Away: their last day on site; null where they have never been. */
  lastDay: Date | null
  /** Away, with a break rule: the day the break ends. */
  breakEndsOn: Date | null
  /** The day they may be put forward again; null where there is no such day on the record. */
  eligibleOn: Date | null
}

/**
 * Where a person stands against a client's time limit and break, read
 * once, for every door that asks: the submission, the award, the
 * activation, the extension and the ledger. Before this, each door
 * carried its own copy and two of them disagreed — the award refused for
 * ever anybody once past the limit while the ledger called them
 * eligible, and the break was counted from a rung that had ended while
 * another rung was still running.
 *
 * Three rules, and the reasons:
 *
 * 1. **A served break resets the count.** Addendum E's break in service
 *    is what ends the exposure; that is what it is for. So the days the
 *    limit counts are the days since the last gap at least as long as
 *    the break — between two stretches, or between the last stretch and
 *    today. It resets whether or not the person had reached the limit:
 *    a reset that only came to somebody who had gone past would make
 *    going past the way to earn a fresh limit. The days on site, every
 *    one, stay on the record (`daysOnSite`); only the count against the
 *    limit starts again.
 *
 * 2. **A break starts only when no line is live.** In a chain the client
 *    buys from a prime who buys from a sub; one rung can end and be
 *    replaced while the person never leaves. A paused line is still a
 *    line. So the break runs from the last day the person was on site
 *    under any live line, and somebody on site today is in no break.
 *
 * 3. **Past the limit with no break rule is refused, with no day.** The
 *    client set a limit and nothing that resets it, so the count never
 *    comes down. Reading that as eligible — what the ledger used to say —
 *    would let somebody past a BLOCK walk back in by leaving for a day,
 *    which is permitting silently. The sentence says what would give a
 *    day: a break rule.
 *
 * Pure. The caller reads the lines and passes `now`.
 */
export function standingAgainstLimit(lines: SiteLine[], rules: LimitRules, now: Date = new Date()): Standing {
  const today = now.getTime()
  const breakDays = rules.breakDays != null && rules.breakDays > 0 ? rules.breakDays : null
  const capMonths = rules.capMonths != null && rules.capMonths > 0 ? rules.capMonths : null
  const breakMs = breakDays != null ? breakDays * DAY : null

  // Served: a live line runs to its booked end (daysOnSite stops it at
  // today); an ended one stops at its end or today, whichever is first,
  // because an early termination left the booked end in the future.
  const served: Period[] = lines.map((l) => ({
    startDate: l.startDate,
    endDate: l.live ? l.endDate : new Date(Math.min((l.endDate ?? now).getTime(), today)),
  }))

  const onSiteNow = lines.some(
    (l) => l.live && l.startDate.getTime() <= today && (l.endDate == null || l.endDate.getTime() > today)
  )
  const begun = lines.filter((l) => l.live && l.startDate.getTime() <= today)
  const stretchEnd: Date | null = onSiteNow && !begun.some((l) => l.endDate == null)
    ? new Date(Math.max(...begun.map((l) => l.endDate!.getTime())))
    : null

  // The stretches actually served, to today.
  const spans = served
    .map((p) => ({ from: p.startDate.getTime(), to: Math.min((p.endDate ?? now).getTime(), today) }))
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

  const lastDay = !onSiteNow && merged.length ? new Date(merged[merged.length - 1].to) : null
  const breakEndsOn = lastDay && breakMs != null ? new Date(lastDay.getTime() + breakMs) : null
  const breakServedNow = breakEndsOn != null && breakEndsOn.getTime() <= today

  // Where the count starts: after the last gap at least as long as the break.
  let countsFrom: Date | null = null
  if (breakMs != null) {
    for (let i = 1; i < merged.length; i++) {
      if (merged[i].from - merged[i - 1].to >= breakMs) countsFrom = new Date(merged[i].from)
    }
    if (breakServedNow) countsFrom = now
  }

  const counted = countsFrom
    ? served.filter((p) => p.startDate.getTime() >= countsFrom!.getTime())
    : served
  const countedDays = daysOnSite(counted, now)
  const limitDays = capMonths != null ? daysFor(capMonths) : null
  const pastLimit = limitDays != null && countedDays >= limitDays
  const approaching = limitDays != null && countedDays >= 0.75 * limitDays

  let state: StandingState
  let eligibleOn: Date | null = null
  if (onSiteNow) {
    if (pastLimit) {
      state = 'PAST_ON_SITE'
      eligibleOn = breakMs != null && stretchEnd ? new Date(stretchEnd.getTime() + breakMs) : null
    } else {
      state = approaching ? 'APPROACHING' : 'UNDER'
    }
  } else if (breakEndsOn && !breakServedNow) {
    state = 'IN_BREAK'
    eligibleOn = breakEndsOn
  } else if (breakServedNow) {
    state = 'BREAK_SERVED'
  } else if (pastLimit) {
    state = 'PAST_NO_RETURN'
  } else {
    state = approaching ? 'APPROACHING' : 'UNDER'
  }

  return {
    state,
    daysOnSite: daysOnSite(served, now),
    countedDays,
    countsFrom,
    limitDays,
    pastLimit,
    onSiteNow,
    stretchEnd,
    lastDay,
    breakEndsOn,
    eligibleOn,
  }
}

/**
 * The lines the limit still counts, for a question about the future —
 * the day the limit falls, or whether a job runs past it. A line that
 * began before the last served break has been reset away.
 */
export function linesCounted<T extends { startDate: Date }>(lines: T[], standing: Pick<Standing, 'countsFrom'>): T[] {
  const from = standing.countsFrom
  return from ? lines.filter((l) => l.startDate.getTime() >= from.getTime()) : lines
}

/** The ledger's status word for a standing. The wire values do not move. */
export type LedgerStatus = 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE'

/**
 * A standing as the ledger's status. Past the limit with no break rule
 * reads BREAK_REQUIRED — past the limit, not clear to return — with no
 * eligible date, never ELIGIBLE.
 */
export function ledgerStatus(s: Standing): LedgerStatus {
  switch (s.state) {
    case 'PAST_ON_SITE':
    case 'PAST_NO_RETURN':
      return 'BREAK_REQUIRED'
    case 'IN_BREAK':
      return 'IN_BREAK'
    case 'BREAK_SERVED':
      return 'ELIGIBLE'
    case 'APPROACHING':
      return 'WARNING'
    default:
      return 'OK'
  }
}
