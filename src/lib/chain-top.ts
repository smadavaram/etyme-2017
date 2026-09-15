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
