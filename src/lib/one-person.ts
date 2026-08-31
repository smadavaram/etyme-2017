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
 * useful record a contingent programme can hold — and the only place it
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

export interface Stint {
  months: number
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
}

export interface Spread {
  lowCents: number
  highCents: number
  gapCents: number
  says: string | null
}

export interface Merged {
  personId: string
  name: string
  /** How many suppliers are selling this person right now. */
  vendors: number
  vendorNames: string[]
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
  stints: Stint[]
  /** The sentence a programme manager reads. */
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

export function merge(p: Person, now: Date): Merged {
  const live = p.offers.filter((o) => o.state !== 'REJECTED')

  // Keyed on the id, not the name. Two suppliers can be called Apex
  // Staffing, and collapsing them by name would show one firm where
  // there are two — which on this screen means hiding a duplicate
  // submission rather than surfacing it.
  const byId = new Map<string, string>()
  for (const o of p.offers) if (!byId.has(o.vendorId)) byId.set(o.vendorId, o.vendorName)
  const vendorNames = [...byId.values()]

  const rates = p.offers.map((o) => o.rateCents).filter((r): r is number => r != null)
  const spread = rateSpread(rates, vendorNames.length)

  const monthsHere = p.stints.reduce((n, s) => n + s.months, 0)
  const headroom = p.capMonths == null ? null : p.capMonths - monthsHere

  const furthest = p.offers.reduce<Offer['state']>(
    (best, o) => (RANK[o.state] > RANK[best] ? o.state : best),
    'REJECTED'
  )

  const state: Merged['state'] = p.barred ? 'BARRED' : furthest

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
    vendors: new Set(live.map((o) => o.vendorId)).size,
    vendorNames,
    spread,
    monthsHere,
    headroomMonths: headroom,
    barred: p.barred != null,
    state,
    roles: [...new Set(p.offers.map((o) => o.roleTitle))],
    offers: [...p.offers].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()),
    stints: p.stints,
    says: sentence(p, monthsHere, headroom, vendorNames, spread, state),
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
  state: Merged['state']
): string {
  if (state === 'BARRED') {
    return p.barred?.reason
      ? `On your do-not-submit list: ${p.barred.reason}`
      : 'On your do-not-submit list.'
  }

  const bits: string[] = []

  if (vendorNames.length > 1) {
    bits.push(`${vendorNames.length} suppliers are selling them`)
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

  if (bits.length === 0) {
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
export function summarise(rows: Merged[]): string {
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
