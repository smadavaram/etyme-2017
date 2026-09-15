/**
 * One person, however many suppliers are selling them.
 *
 * A client with twelve vendors does not have twelve consultants called
 * Rohan Menon. They have one, and twelve different stories about him:
 * four rates, three CVs of varying age, two claims to represent him, and
 * a fourteen-month assignment here in 2024 that nobody in the building
 * remembers.
 *
 * Every one of those facts sits in a different supplier's system, and
 * none of them can see the others. Merged, they are the single most
 * useful record a contingent program can hold — and the only place it
 * can be assembled is the layer every submission passes through.
 *
 * ── What the merge is allowed to do ──────────────────────────────────
 *
 * Join rows that already point at the same Person. Nothing here guesses
 * that two people are the same: probabilistic identity matching gets
 * surfaced for a human to confirm and is never applied silently, because
 * merging two different contractors into one record is how somebody gets
 * paid the wrong rate and somebody else gets blocked on a tenure cap
 * they never earned.
 *
 * ── The rate spread is the point ─────────────────────────────────────
 *
 * $78 from one supplier and $96 from another, for the same person, in
 * the same week. No client has ever been able to see that. It is not an
 * accusation — a supplier carrying the visa sponsorship legitimately
 * costs more — but it is the conversation, and today it does not happen
 * because nobody has the two numbers side by side.
 */

import { daysOnSite, monthsOf } from '@/lib/tenure-days'

export interface Offer {
  vendorName: string
  vendorId: string
  rateCents: number | null
  submittedAt: Date
  requirementId: string
  roleTitle: string
  /** Whether it got past the screen. Null where nobody looked. */
  cleared: boolean | null
  state: 'SUBMITTED' | 'INTERVIEWING' | 'OFFERED' | 'PLACED' | 'REJECTED'
}

/**
 * One contract at this client, with the dates it actually covers.
 *
 * The dates, not a precomputed length. This carried `months` as
 * `endDate − startDate` — the whole contracted term counted as already
 * served — and the register summed one of those per rung, so a person
 * bought through a two-rung chain on a twelve-month term read as
 * twenty-four months here on the day they started. A program manager
 * reads "past your cap" in clay and calls a supplier about a person who
 * is seven months in.
 *
 * Tenure is days served, and the union of the periods rather than their
 * sum (Addendum E, lib/tenure-days). Both are the merge's job now, so
 * the register and the tenure ledger cannot drift apart.
 */
export interface Stint {
  startedAt: Date
  endedAt: Date | null
  vendorName: string
}

export interface Person {
  personId: string
  name: string
  offers: Offer[]
  /** Assignments here, through anybody. */
  stints: Stint[]
  /** On the client's do-not-submit list. */
  barred: { at: Date; reason: string | null } | null
  /** The client's tenure cap in months, where they have one. */
  capMonths: number | null
  /**
   * The first day of a contract that has not begun.
   *
   * Not a stint: a draft contract is not time on site and must never
   * reach the tenure arithmetic. It is still the truest thing on the
   * row for somebody who was awarded a role last week, and without it
   * the register said "On site here. Nothing needs you." about
   * somebody who has not walked in.
   */
  startingOn?: Date | null
}

/** The day they arrive, where they are not here yet. */
function notStartedYet(p: Person, now: Date): Date | null {
  const live = p.stints.some((s) => s.startedAt <= now && (s.endedAt == null || s.endedAt > now))
  if (live) return null
  const ahead = [
    ...p.stints.filter((s) => s.startedAt > now).map((s) => s.startedAt.getTime()),
    ...(p.startingOn && p.startingOn > now ? [p.startingOn.getTime()] : []),
  ]
  return ahead.length > 0 ? new Date(Math.min(...ahead)) : null
}

export interface Spread {
  lowCents: number
  highCents: number
  gapCents: number
  says: string | null
}

/** A stint with its length worked out, for the row's subtitle. */
export interface ServedStint extends Stint {
  /** Months actually served on this contract so far. Never its term. */
  months: number
}

export interface Merged {
  personId: string
  name: string
  /** How many suppliers are selling this person right now. */
  vendors: number
  /** Everybody who has ever represented them here. */
  vendorNames: string[]
  /** Only those with a submission still in play. */
  sellingNames: string[]
  spread: Spread | null
  /** Months worked here, across every supplier. */
  monthsHere: number
  /** Months left before the client's cap, where there is one. */
  headroomMonths: number | null
  barred: boolean
  /** Where they are today, in one word. */
  state: 'PLACED' | 'OFFERED' | 'INTERVIEWING' | 'SUBMITTED' | 'REJECTED' | 'BARRED'
  roles: string[]
  offers: Offer[]
  stints: ServedStint[]
  /** The sentence a program manager reads. */
  says: string
  /** What this record cannot account for. */
  unknowns: string[]
  /**
   * Another row on this same register that might be this same human under
   * a different Person record — two different emails, two different
   * suppliers, nothing here ever joined them.
   *
   * This is the duplication one supplier submitting the same personId
   * twice never causes — `merge()` already collapses that. This is the
   * other kind: two *different* personIds that are, offline, one person,
   * which is exactly the case identity-resolution.ts exists to surface
   * and never to merge silently. Populated by the API route, not here —
   * finding it means comparing every row against every other row, which
   * needs the whole register at once, not one Person at a time.
   */
  possibleDuplicate?: { personId: string; name: string; confidence: string; says: string } | null
}

/** Order of how far along somebody is. Highest wins on a merged record. */
const RANK: Record<Offer['state'], number> = {
  PLACED: 5,
  OFFERED: 4,
  INTERVIEWING: 3,
  SUBMITTED: 2,
  REJECTED: 1,
}

/**
 * A gap worth mentioning.
 *
 * A dollar or two between suppliers is margin, and flagging it would
 * train people to ignore the flag. Ten per cent is a conversation.
 */
export const WORTH_MENTIONING = 0.1

/**
 * Still in play — a supplier is actually selling them right now.
 *
 * PLACED is not: that submission did its job and ended in an
 * engagement. Counting it made a person with two consecutive
 * placements, fourteen months apart through two agencies, read as two
 * agencies competing over them today — and put a 2025 rate beside a
 * 2026 one and called the difference a spread. The founder read that
 * row and asked what on earth was happening, which is the right
 * question to ask of a screen saying two contradictory things at once.
 */
const OPEN: readonly Offer['state'][] = ['SUBMITTED', 'INTERVIEWING', 'OFFERED']
const isOpen = (o: Offer) => OPEN.includes(o.state)

export function merge(p: Person, now: Date): Merged {
  const live = p.offers.filter((o) => o.state !== 'REJECTED')
  const selling = p.offers.filter(isOpen)

  // Keyed on the id, not the name. Two suppliers can be called Apex
  // Staffing, and collapsing them by name would show one firm where
  // there are two — which on this screen means hiding a duplicate
  // submission rather than surfacing it.
  const byId = new Map<string, string>()
  for (const o of p.offers) if (!byId.has(o.vendorId)) byId.set(o.vendorId, o.vendorName)
  // Everybody who has ever represented them, for the row's subtitle: a
  // client wants the whole list, including the firm that placed them
  // two years ago.
  const vendorNames = [...byId.values()]

  // And, separately, whoever is selling them today. Only these two are
  // a competition, and only their prices are comparable — two rates
  // from different years are a progression, which is a healthy thing
  // and not something to flag.
  const sellingById = new Map<string, string>()
  for (const o of selling) if (!sellingById.has(o.vendorId)) sellingById.set(o.vendorId, o.vendorName)
  const sellingNames = [...sellingById.values()]

  const rates = selling.map((o) => o.rateCents).filter((r): r is number => r != null)
  const spread = rateSpread(rates, sellingNames.length)

  // Days on site, overlaps counted once, and only days that have
  // happened. The same two functions the tenure ledger calls, on the
  // same contracts, so the two screens cannot disagree about a person.
  const periods = p.stints.map((s) => ({ startDate: s.startedAt, endDate: s.endedAt }))
  const monthsHere = monthsOf(daysOnSite(periods, now))
  const headroom = p.capMonths == null ? null : p.capMonths - monthsHere

  const furthest = p.offers.reduce<Offer['state']>(
    (best, o) => (RANK[o.state] > RANK[best] ? o.state : best),
    'REJECTED'
  )

  const state: Merged['state'] = p.barred ? 'BARRED' : furthest
  // Awarded, papers in progress, first day next week. The row said "On
  // site here. Nothing needs you." about somebody who has not walked in
  // — the tenure page beside it said "has not started".
  const starts = notStartedYet(p, now)

  const unknowns: string[] = []
  const unpriced = p.offers.filter((o) => o.rateCents == null).length
  if (unpriced > 0) {
    unknowns.push(
      `${unpriced} of the ${p.offers.length} submissions arrived without a rate.`
    )
  }
  const unscreened = p.offers.filter((o) => o.cleared === null).length
  if (unscreened > 0) {
    unknowns.push(`${unscreened} have never been screened.`)
  }
  if (p.capMonths == null && monthsHere > 0) {
    unknowns.push('No tenure cap set, so there is nothing to measure the time against.')
  }

  return {
    personId: p.personId,
    name: p.name,
    vendors: sellingNames.length,
    vendorNames,
    sellingNames,
    spread,
    monthsHere,
    headroomMonths: headroom,
    barred: p.barred != null,
    state,
    roles: [...new Set(p.offers.map((o) => o.roleTitle))],
    offers: [...p.offers].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()),
    stints: p.stints.map((s) => ({
      ...s,
      months: monthsOf(daysOnSite([{ startDate: s.startedAt, endDate: s.endedAt }], now)),
    })),
    says: sentence(p, monthsHere, headroom, sellingNames, spread, state, starts),
    unknowns,
  }
}

/**
 * The two numbers side by side.
 *
 * Null where there is nothing to compare — one supplier, or one price.
 * Saying "no spread" about a single submission would be noise on every
 * row of a register that is mostly single submissions.
 */
export function rateSpread(rates: number[], vendors: number): Spread | null {
  if (rates.length < 2 || vendors < 2) return null

  const low = Math.min(...rates)
  const high = Math.max(...rates)
  const gap = high - low

  return {
    lowCents: low,
    highCents: high,
    gapCents: gap,
    says:
      gap / low >= WORTH_MENTIONING
        ? `${money(low)} from one supplier, ${money(high)} from another — ${money(gap)} apart.`
        : null,
  }
}

function sentence(
  p: Person,
  monthsHere: number,
  headroom: number | null,
  vendorNames: string[],
  spread: Spread | null,
  state: Merged['state'],
  starts: Date | null
): string {
  if (state === 'BARRED') {
    return p.barred?.reason
      ? `On your do-not-submit list: ${p.barred.reason}`
      : 'On your do-not-submit list.'
  }

  const bits: string[] = []

  if (vendorNames.length > 1) {
    bits.push(`${vendorNames.length} suppliers are selling them right now`)
  }

  // Ordered so the thing that stops a hire comes before the thing that
  // starts a negotiation.
  if (headroom != null && headroom <= 0) {
    bits.push(`${monthsHere} months here already — past your cap`)
  } else if (monthsHere > 0) {
    bits.push(
      headroom != null
        ? `${monthsHere} months here, ${headroom} left before your cap`
        : `${monthsHere} months here already`
    )
  }

  if (spread?.says) bits.push(spread.says.replace(/\.$/, ''))

  if (starts) {
    bits.push(
      `Starts ${starts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
    )
  }

  if (bits.length === 0) {
    if (state === 'PLACED') return 'On site here. Nothing needs you.'
    return vendorNames.length === 1
      ? `Put forward by ${vendorNames[0]}.`
      : 'Nothing unusual on this one.'
  }

  return bits.join('. ') + '.'
}

/**
 * The register, worst first.
 *
 * "Worst" meaning most in need of a person looking: barred, then past
 * the cap, then the ones several suppliers are competing over. A
 * register sorted by name is a phone book.
 */
export function order(rows: Merged[]): Merged[] {
  return [...rows].sort((a, b) => {
    const score = (m: Merged) =>
      (m.barred ? 1000 : 0) +
      (m.headroomMonths != null && m.headroomMonths <= 0 ? 500 : 0) +
      (m.spread?.says ? 100 : 0) +
      m.vendors * 10

    const d = score(b) - score(a)
    return d !== 0 ? d : a.name.localeCompare(b.name)
  })
}

/** The line above the register. */
export function summarize(rows: Merged[]): string {
  if (rows.length === 0) return 'Nobody has been put in front of you yet.'

  const shared = rows.filter((r) => r.vendors > 1).length
  const spreads = rows.filter((r) => r.spread?.says).length

  if (shared === 0) {
    return `${rows.length} ${rows.length === 1 ? 'person' : 'people'}, each from one supplier.`
  }

  return (
    `${rows.length} people. ${shared} ${shared === 1 ? 'is' : 'are'} being sold by more than one supplier` +
    (spreads > 0 ? `, and ${spreads} at prices worth asking about.` : '.')
  )
}

function money(cents: number): string {
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}
