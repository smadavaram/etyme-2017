/**
 * Over what a seat reads what placements make (founder, 2026-11-08: "Owner
 * should control who should see what … by team hierarchy or individual
 * role or company as well").
 *
 * `permissionScope` (lib/permission-grants) answers, for one permission,
 * COMPANY · UNIT · PERSON · NONE. Profitability opens on `margin.read` or
 * `pnl.read`, so its reach is the wider of the two, and the reach decides
 * which of the firm's sell lines the page is read over, at the query:
 *
 *   COMPANY  every line the firm sells, as before
 *   UNIT     the lines charged to (`orgUnitId`) or delivered by
 *            (`deliveryUnitId`) a granted team or any team under it
 *   PERSON   the lines that are the reader's own book: the line the reader
 *            works on, a line they earn a commission on (a sales commission
 *            on the sell line, a recruiting one on the buy line behind it),
 *            and a line whose person they put forward (the submission's
 *            submitter, for the line's job and person)
 *   NONE     nothing, refused before anything is read
 *
 * The units are the reader's own company's tree, so a team grant never
 * reaches another firm's line, and a client's cost center on a supplier's
 * line is not in the supplier's tree. Nothing here widens: a reach the
 * record cannot answer reads as fewer lines, never more.
 */

import { prisma } from '@/lib/db'
import { permissionScope, type ScopedCaller, type ScopeAnswer, type Scope } from '@/lib/permission-grants'

/** The permissions Profitability opens on. */
export const MARGIN_PERMISSIONS = ['margin.read', 'pnl.read'] as const

const RANK: Record<Scope, number> = { NONE: 0, PERSON: 1, UNIT: 2, COMPANY: 3 }

/** The wider of two answers; two team answers reach both teams. Pure. */
export function widest(a: ScopeAnswer, b: ScopeAnswer): ScopeAnswer {
  if (a.scope === 'UNIT' && b.scope === 'UNIT') {
    return { has: true, scope: 'UNIT', unitIds: [...new Set([...a.unitIds, ...b.unitIds])] }
  }
  return RANK[a.scope] >= RANK[b.scope] ? a : b
}

export interface MarginReach extends ScopeAnswer {
  /** The granted teams by name, for the sentence; empty unless UNIT. */
  unitNames: string[]
}

/** The reader's reach over what placements make: the wider of margin.read and pnl.read. */
export async function marginReachFor(caller: ScopedCaller): Promise<MarginReach> {
  const [m, p] = await Promise.all(MARGIN_PERMISSIONS.map((perm) => permissionScope(caller, perm)))
  const reach = widest(m, p)
  if (reach.scope !== 'UNIT' || !caller.company) return { ...reach, unitNames: [] }
  // Only the units at the top of what was granted are named: "the Dayton
  // team", not every team under it.
  const units = await prisma.orgUnit.findMany({
    where: { companyId: caller.company.id, id: { in: reach.unitIds } },
    select: { id: true, name: true, parentId: true },
  }).catch(() => [] as { id: string; name: string; parentId: string | null }[])
  const inside = new Set(units.map((u) => u.id))
  return { ...reach, unitNames: units.filter((u) => !u.parentId || !inside.has(u.parentId)).map((u) => u.name).sort() }
}

/** "the Dayton team", "the Dayton and Belfast teams". Pure. */
export function teamsSay(names: readonly string[]): string {
  if (names.length === 0) return 'your team'
  if (names.length === 1) return `the ${names[0]} team`
  return `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} teams`
}

/**
 * What the page says about whose figures these are, or null for the firm's.
 * Pure. Said beside every narrowed answer so a narrowed book never reads as
 * the firm's (the own-lines rule: a confident total about a book the reader
 * cannot see is a plausible wrong number).
 */
export function reachSays(reach: Pick<MarginReach, 'scope' | 'unitNames'>, companyName: string): string | null {
  if (reach.scope === 'UNIT') {
    return `You read margin for ${teamsSay(reach.unitNames)} and every team under it. The Owner reads ${companyName}’s whole book.`
  }
  if (reach.scope === 'PERSON') {
    return `You read margin on your own placements only: the ones you work, sold or recruited. The Owner reads ${companyName}’s whole book.`
  }
  return null
}

/**
 * The sell lines a reach opens at this firm, or null for every line (no
 * narrowing). One query per kind of tie; never throws past the caller, and
 * a failed read is no lines rather than all of them.
 */
export async function sellLinesInReach(companyId: string, reach: Pick<ScopeAnswer, 'scope' | 'unitIds'>, personId: string): Promise<string[] | null> {
  if (reach.scope === 'COMPANY') return null
  if (reach.scope === 'NONE') return []
  try {
    if (reach.scope === 'UNIT') {
      if (reach.unitIds.length === 0) return []
      const rows = await prisma.sellContract.findMany({
        where: { companyId, OR: [{ orgUnitId: { in: reach.unitIds } }, { deliveryUnitId: { in: reach.unitIds } }] },
        select: { id: true },
        take: 5000,
      })
      return rows.map((r) => r.id)
    }
    // PERSON: the reader's own book.
    const [worked, sold, recruited, submitted] = await Promise.all([
      prisma.sellContract.findMany({ where: { companyId, personId }, select: { id: true }, take: 5000 }),
      prisma.contractCommission.findMany({ where: { companyId, earnedById: personId, sellContractId: { not: null } }, select: { sellContractId: true } }),
      prisma.contractCommission.findMany({ where: { companyId, earnedById: personId, buyContractId: { not: null } }, select: { buyContractId: true } }),
      prisma.submission.findMany({ where: { submittedById: personId }, select: { requirementId: true, personId: true }, take: 5000 }),
    ])
    const ids = new Set<string>(worked.map((r) => r.id))
    for (const r of sold) if (r.sellContractId) ids.add(r.sellContractId)
    const buyIds = recruited.map((r) => r.buyContractId).filter((x): x is string => !!x)
    if (buyIds.length) {
      const links = await prisma.contractLink.findMany({
        where: { buyContractId: { in: buyIds }, sellContract: { companyId } },
        select: { sellContractId: true },
      })
      for (const l of links) ids.add(l.sellContractId)
    }
    if (submitted.length) {
      const lines = await prisma.sellContract.findMany({
        where: { companyId, OR: submitted.map((s) => ({ requirementId: s.requirementId, personId: s.personId })) },
        select: { id: true },
        take: 5000,
      })
      for (const l of lines) ids.add(l.id)
    }
    return [...ids]
  } catch {
    return []
  }
}
