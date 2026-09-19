/**
 * The client's picture is what it buys, not how its suppliers staff it.
 *
 * In a chain — Nike buys Helena from Computer Systems, who buys her from
 * CloudEPA — every rung is a sell contract at this end client. Counting
 * each rung made one person three contractors, a sub-supplier a
 * supplier, and put a rate the client has no business seeing on the
 * client's own page. Per person, keep the rungs whose buyer is not
 * itself a seller of that person here: the top of the chain, the
 * contract the client actually pays.
 */
export interface Rung {
  id: string
  personId: string
  companyId: string
  clientCompanyId: string
}

export function chainTop<T extends Rung>(all: T[]): T[] {
  const byPerson = new Map<string, T[]>()
  for (const c of all) byPerson.set(c.personId, [...(byPerson.get(c.personId) ?? []), c])
  const keep = new Set<string>()
  for (const rungs of byPerson.values()) {
    const sellers = new Set(rungs.map((c) => c.companyId))
    for (const c of rungs) if (!sellers.has(c.clientCompanyId)) keep.add(c.id)
  }
  return all.filter((c) => keep.has(c.id))
}

/**
 * The rung of one person's chain that this client actually pays.
 *
 * `chainTop` answers the question for a whole list. This answers it for
 * one row: given the contract a timesheet hangs off — which in a chain
 * is the bottom rung, where the employer is — walk up to the contract
 * the client is billed on.
 *
 * Walking is not the same as filtering. A person can be on two separate
 * placements at the same client, through two different suppliers, and
 * both are tops; asking "which top" of the pair is meaningless. Asking
 * "what is above this particular rung" is not: the buyer of one rung is
 * the seller of the next.
 *
 * Returns null rather than a guess where the paper is ambiguous — two
 * contracts above the same rung with overlapping dates is a chain
 * nobody can read, and a rate picked out of it is a number nobody can
 * stand behind. The caller shows a blank and says why.
 */
export interface DatedRung extends Rung {
  startDate: Date
  endDate: Date | null
}

export function payerRung<T extends DatedRung>(from: T, all: T[]): T | null {
  const mine = all.filter((c) => c.personId === from.personId)
  const seen = new Set<string>([from.id])
  let current: T = from

  for (;;) {
    const above = mine.filter((c) => c.companyId === current.clientCompanyId && !seen.has(c.id))
    if (above.length === 0) return current

    const overlapping = above.filter((c) => overlaps(c, from))
    const next = pickOne(above.length === 1 ? above : overlapping)
    // Two legs above this one covering the same days, or none that cover
    // them at all. Either way there is no single contract to price at.
    if (!next) return null

    seen.add(next.id)
    current = next
  }
}

function pickOne<T>(candidates: T[]): T | null {
  return candidates.length === 1 ? candidates[0] : null
}

function overlaps(a: DatedRung, b: DatedRung): boolean {
  const aEnd = a.endDate?.getTime() ?? Number.POSITIVE_INFINITY
  const bEnd = b.endDate?.getTime() ?? Number.POSITIVE_INFINITY
  return a.startDate.getTime() <= bEnd && b.startDate.getTime() <= aEnd
}

/**
 * One row per placement, priced only where this client is the payer.
 *
 * The client's org page asked the site the work happens at — every rung
 * of every chain at Nike's buildings — and put `billRate` on each. So
 * Helena stood there twice, once at the $145 Nike pays and once at the
 * $118 its supplier pays, and the headcount, the spend and the rate
 * spread were all computed over both.
 *
 * Two separate wrongs, so two separate answers. `chainTop` says which
 * rows are placements rather than rungs of one; the party test says
 * which of those this client may be told a price for. They are not the
 * same question: a chain whose top rung is not in the list handed in —
 * a draft, an ended leg, a rung bought by somebody else — still has a
 * person standing on the site, and dropping them would understate a
 * headcount that is a governance number. They are counted and left
 * unpriced, and the screen says how many.
 */
export function asPayer<T extends Rung & { billRate: number }>(
  all: T[],
  clientCompanyId: string
): { contract: T; rateCents: number | null }[] {
  return chainTop(all).map((contract) => ({
    contract,
    rateCents: contract.clientCompanyId === clientCompanyId ? contract.billRate : null,
  }))
}

/**
 * The median hourly rate this client itself pays for any of these skills.
 *
 * The benchmark a hiring manager is shown when they raise a role — "what
 * you already pay for these skills" — was a median over every rung
 * standing at the client's sites. In a chain that blends the prime's
 * cost into the client's own prices and pulls the benchmark down by the
 * whole of somebody else's margin, which is both a wrong number on the
 * screen and a margin the client must not be able to compute.
 *
 * A client's own price is the rung it is billed on: `clientCompanyId`.
 * Null rather than zero where it has never bought the skill — there is
 * no figure, and a zero would read as free.
 */
export function ownPriceMedian(
  rungs: { clientCompanyId: string; billRate: number; skills: string[] }[],
  clientCompanyId: string,
  skills: string[]
): number | null {
  if (skills.length === 0) return null
  const wanted = new Set(skills.map((s) => s.toLowerCase()))

  const rates = rungs
    .filter((r) => r.clientCompanyId === clientCompanyId)
    .filter((r) => r.skills.some((s) => wanted.has(s.toLowerCase())))
    .map((r) => r.billRate)
    .sort((a, b) => a - b)

  if (rates.length === 0) return null
  const mid = Math.floor(rates.length / 2)
  return rates.length % 2 === 0
    ? Math.round((rates[mid - 1] + rates[mid]) / 2)
    : rates[mid]
}

/**
 * Who a client's "ask for them" goes to.
 *
 * `chainTop` says which rung the client pays, and `lib/chain-names` says
 * whose name it may read off that rung. This is the same rule read a
 * third way, for a channel rather than a row: **an ask goes to the rung
 * the client pays, and never to a firm below it.**
 *
 * The reason is the NDA between a prime and its sub, read in the
 * direction people forget. It stops the sub going round the prime to
 * reach the client; read the other way it stops the client going round
 * the prime to reach the sub. "Ask for them" went to whoever held the
 * consultant's bench listing, which on a chain is the firm at the
 * bottom — so a button on the client's own page named the prime's
 * sub-vendor and opened a direct thread with it. One press gave away the
 * supplier list and the channel at once.
 *
 * Disclosure does not widen this. `MasterAgreement.disclosesSubVendors`
 * is a term about reading a name; it is not a contract between the
 * client and the sub, and no term on somebody else's paper creates one.
 * A client that may read the name still asks through the prime, because
 * the prime is the party with the deal and reaching its own supplier is
 * its job. Nothing in this function reads the disclosure term at all,
 * which is the point.
 *
 * ── What counts as a firm the client may ask ─────────────────────────
 *
 * Two kinds, and both are the client's own counterparty:
 *
 *   - a rung of this person's chain that the client itself is billed on
 *     — the firm it pays; and
 *   - a firm that has put this person in front of the client already.
 *     A submission is an answer to the client's own requirement from a
 *     supplier it invited, so that firm is a party to the client's
 *     process even before anybody is placed. Excluding it would mean a
 *     hiring manager could not ask again for a candidate the same firm
 *     sent him last month, which is the ordinary case.
 *
 * A bench holder that is neither is a firm this client has no deal with,
 * and the caller refuses rather than guessing at a channel.
 */
export interface AskFacts {
  /** Every rung of this one person's chains standing at this client. */
  rungs: Rung[]
  /** Firms holding a granted bench listing for them, anywhere. */
  benchHolderIds: string[]
  /** Firms that have put them in front of this client, newest first. */
  submitterIds: string[]
  clientCompanyId: string
}

export type AskReason =
  /** The bench holder is itself a firm the client deals with. */
  | 'YOUR_OWN_SUPPLIER'
  /** The bench holder sits below; the rung the client pays is asked. */
  | 'THROUGH_THE_PRIME'
  /** No bench route; the firm the client is billed on for them is asked. */
  | 'THE_RUNG_YOU_PAY'
  /** Nobody is placed; whoever put them forward here is asked. */
  | 'PUT_THEM_FORWARD'
  /** The client has no supplier for this person at all. */
  | 'NO_SUPPLIER_OF_YOUR_OWN'

export interface AskRoute {
  /** The firms to write to. Empty where the client has no deal for them. */
  toCompanyIds: string[]
  reason: AskReason
  /** True where the firm asked is not the firm holding the listing. */
  throughAPrime: boolean
}

/**
 * The rung above this one, walking toward the client.
 *
 * Null where none is on file or where two claim the place — the refusal
 * `payerRung` and `chain-names` both make, for the same reason: a chain
 * nobody can read must not be guessed at, and a guess here would open a
 * thread with the wrong firm.
 */
function above<T extends Rung>(rung: T, all: T[]): T | null {
  const parents = all.filter(
    (c) => c.personId === rung.personId && c.companyId === rung.clientCompanyId && c.id !== rung.id
  )
  return parents.length === 1 ? parents[0] : null
}

/** Every firm this client pays that sits above the given firm's rungs. */
function primesAbove(companyId: string, rungs: Rung[], clientCompanyId: string): string[] {
  const out = new Set<string>()
  for (const start of rungs.filter((r) => r.companyId === companyId)) {
    const seen = new Set<string>([start.id])
    let current: Rung | null = start
    while (current && current.clientCompanyId !== clientCompanyId) {
      const parent: Rung | null = above(current, rungs)
      if (!parent || seen.has(parent.id)) { current = null; break }
      seen.add(parent.id)
      current = parent
    }
    if (current) out.add(current.companyId)
  }
  return [...out]
}

export function askGoesTo(facts: AskFacts): AskRoute {
  const { rungs, benchHolderIds, submitterIds, clientCompanyId } = facts
  const paysTheseFirms = rungs.filter((r) => r.clientCompanyId === clientCompanyId).map((r) => r.companyId)
  const dealsWith = new Set<string>([...paysTheseFirms, ...submitterIds])

  // The bench holder first, because a listing is what makes a submission
  // possible at all — but only ever as a firm the client may reach, or
  // as the bottom of a chain whose top it pays.
  const to: string[] = []
  let throughAPrime = false
  for (const holder of benchHolderIds) {
    if (dealsWith.has(holder)) {
      if (!to.includes(holder)) to.push(holder)
      continue
    }
    for (const prime of primesAbove(holder, rungs, clientCompanyId)) {
      throughAPrime = true
      if (!to.includes(prime)) to.push(prime)
    }
  }
  if (to.length > 0) {
    return { toCompanyIds: to, reason: throughAPrime ? 'THROUGH_THE_PRIME' : 'YOUR_OWN_SUPPLIER', throughAPrime }
  }

  // No listing this client can reach. The firm it is billed on for this
  // person is still its own counterparty, and can go and find them.
  const paid = [...new Set(paysTheseFirms)]
  if (paid.length > 0) return { toCompanyIds: paid, reason: 'THE_RUNG_YOU_PAY', throughAPrime: false }

  // Nobody placed. Whoever last put them in front of this client.
  if (submitterIds.length > 0) return { toCompanyIds: [submitterIds[0]], reason: 'PUT_THEM_FORWARD', throughAPrime: false }

  return { toCompanyIds: [], reason: 'NO_SUPPLIER_OF_YOUR_OWN', throughAPrime: false }
}
