import { prisma } from '@/lib/db'
import { unitsVisibleTo, accountScope, scopeNote } from '@/lib/walls'
import type { CallerContext } from '@/lib/api-context'

/**
 * Applying the wall between one client account and another.
 *
 * The rule is in walls.ts and is pure. This reads the org tree once and
 * turns it into something a query can use.
 *
 * A delivery firm runs thirty accounts. The people on one of them have no
 * business seeing who is staffed at another, at what rate, or rolling off
 * when — that is the client's data rather than the firm's, and most master
 * agreements say so explicitly. Every firm knows this and almost no
 * software enforces it, because it is invisible until a client's auditor
 * asks who can read their staffing.
 */

export interface AccountFilter {
  /** Units this caller may read, or null for the whole firm. */
  units: string[] | null
  /** Spread into a Prisma `where`. Empty when they see everything. */
  where: Record<string, unknown>
  /** Said on screen, so a smaller number is understood rather than doubted. */
  note: string | null
}

const OPEN: AccountFilter = { units: null, where: {}, note: null }

/**
 * What this caller may see of their own firm.
 *
 * Open unless the company has turned account walls on *and* this person
 * sits on a unit. Sitting on no unit is firm-wide, which is how a CFO or a
 * head of delivery keeps working after the wall goes up — and it means the
 * act that creates the wall for somebody is attaching them to their
 * account, which is a thing an administrator already does.
 */
export async function accountFilterFor(
  caller: CallerContext,
  field = 'orgUnitId'
): Promise<AccountFilter> {
  if (!caller.company?.accountWalls) return OPEN
  if (!caller.orgUnitId) return OPEN

  const units = await prisma.orgUnit.findMany({
    where: { companyId: caller.company.id },
    select: { id: true, parentId: true, name: true },
  })

  const childrenOf = new Map<string, string[]>()
  for (const u of units) {
    if (!u.parentId) continue
    childrenOf.set(u.parentId, [...(childrenOf.get(u.parentId) ?? []), u.id])
  }

  const visible = unitsVisibleTo({
    walls: true,
    unitId: caller.orgUnitId,
    childrenOf,
  })

  const mine = units.find((u) => u.id === caller.orgUnitId)

  return {
    units: visible,
    where: accountScope(visible, field),
    note: scopeNote(visible, mine?.name ?? null),
  }
}
