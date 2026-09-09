/**
 * Where a piece of work sits in a company, and who that makes responsible.
 *
 * A large client is not one team. Indirect procurement and HR sit across
 * everything; Apps, Security, Infrastructure, SaaS and two R&D groups
 * each have their own money and their own lead. `OrgUnit` has carried a
 * `parentId` from the first commit, so the shape was always expressible:
 *
 *     Technology                     ← a rule here should catch all of it
 *       ├── Apps
 *       ├── Security
 *       ├── Infrastructure
 *       └── R&D
 *             ├── R&D 1             ← a requisition raised here
 *             └── R&D 2
 *
 * What was missing is that nothing walked it. Approval rules matched a
 * requisition's org unit exactly, so a rule on Technology never caught
 * work raised in R&D 1 — you had to copy the same rule onto every leaf
 * and remember to copy it again whenever a team was added. A hierarchy
 * nothing traverses is a list with extra columns.
 */

export interface Unit {
  id: string
  parentId: string | null
}

/**
 * A unit and everything above it, nearest first.
 *
 * The set a rule may be attached to and still be responsible for work
 * raised here. Company-wide rules are separate and are not in this list —
 * they apply to everything and need no tree to say so.
 *
 * Cycles are impossible in a tree and happen anyway once somebody drags a
 * parent under its own child in an admin screen, so the walk is bounded
 * and stops rather than hanging a request.
 */
export function ancestry(units: readonly Unit[], startId: string | null): string[] {
  if (!startId) return []
  const byId = new Map(units.map((u) => [u.id, u]))
  const chain: string[] = []
  let at: string | null = startId

  while (at && chain.length < 32) {
    if (chain.includes(at)) break
    chain.push(at)
    at = byId.get(at)?.parentId ?? null
  }
  return chain
}

/**
 * Everything at or below a unit.
 *
 * The other direction, for the question a team lead asks: what is
 * happening anywhere under me. Rules never use this — responsibility
 * travels up, not down.
 */
export function descendants(units: readonly Unit[], rootId: string): string[] {
  const children = new Map<string, string[]>()
  for (const u of units) {
    if (!u.parentId) continue
    children.set(u.parentId, [...(children.get(u.parentId) ?? []), u.id])
  }

  const found: string[] = []
  const queue = [rootId]
  while (queue.length > 0 && found.length < 512) {
    const id = queue.shift()!
    if (found.includes(id)) continue
    found.push(id)
    queue.push(...(children.get(id) ?? []))
  }
  return found
}
