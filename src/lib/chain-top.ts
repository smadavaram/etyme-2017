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
