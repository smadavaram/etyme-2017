/**
 * Who at the buyer may raise a purchase order, said in the refusal a
 * supplier reads when it tries to record an order its buyer is on Etyme
 * to raise itself.
 *
 * The sentence in `lib/off-system` named "their MSP or AP clerk", which
 * is a client's program. A prime supplier has neither: Tapin, recording
 * Brightmoor Staffing's order to it, was told to ask two roles Brightmoor
 * does not have (the Tapin walk, 2026-10-29). So the roles are read off
 * the buyer's own roles — the ones holding the permission the order
 * route asks for (`invoices.issue`) — and named in the buyer's own words:
 * Owner, Admin, Contract Manager, Finance at a supplier; whatever the
 * client named its seats at a client. Nothing is guessed: where the
 * buyer has no role that may, the sentence says to ask the firm.
 *
 * Pure: no database. The route passes the buyer's roles.
 */

export interface BuyerRole {
  name: string
  permissions: readonly string[]
}

export const RAISES_AN_ORDER = 'invoices.issue'

/** The buyer's roles that may raise an order, the all-access ones first, each name once. */
export function rolesThatRaiseOrders(roles: readonly BuyerRole[]): string[] {
  const may = roles.filter((r) => r.permissions.includes('*') || r.permissions.includes(RAISES_AN_ORDER))
  const ordered = [...may].sort((a, b) => {
    const aw = a.permissions.includes('*') ? 0 : 1
    const bw = b.permissions.includes('*') ? 0 : 1
    return aw - bw
  })
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of ordered) {
    const n = r.name.trim()
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    names.push(n)
  }
  return names
}

function orList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} or ${names[1]}`
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/**
 * The refusal, once: the order is the buyer's to raise, who there may,
 * and where it appears when they do.
 */
export function orderIsTheirsSays(a: { buyerName: string; roles: readonly BuyerRole[] }): string {
  const who = rolesThatRaiseOrders(a.roles)
  const ask = who.length
    ? `Ask ${a.buyerName}'s ${orList(who)} to raise it.`
    : `Ask ${a.buyerName} to raise it.`
  return (
    `${a.buyerName} is on Etyme, so this purchase order is theirs to raise. ${ask} ` +
    `It will appear here against your contracts.`
  )
}
