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
