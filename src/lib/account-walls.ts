import { prisma } from '@/lib/db'
import { unitsVisibleTo, accountScope, scopeNote } from '@/lib/walls'
import { descendants } from '@/lib/org-tree'
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

// ── The units a seat reaches ──────────────────────────────────────────

/**
 * The business units a program-office seat may read, or null for "all".
 *
 * A client may narrow a seat to one business unit, and the whole point
 * of that narrowing is that the office cannot read the rest of the
 * program. Narrowing is a read filter and never a permission: the desk
 * holds the same permissions everywhere and reaches fewer rows.
 *
 * The unit and everything under it, because a unit is a tree and a seat
 * at Technology that could not read R&D 1 would be a seat at nothing.
 *
 * ── A twin, named rather than left to be discovered ──────────────────
 *
 * `unitsReachedBy` in `lib/resolve-client-company` is the same six lines,
 * written by etyme-demand in the same hour for the demand routes. Two
 * helpers answering one question is the shape that produces a wall in
 * one screen and none in the next, so they collapse into one — the
 * architect's call which file it lives in, since that file is demand's
 * and this one is regulatory's. Until then both read the same tree the
 * same way and are covered by the same sentences in
 * `__integration__/seat-compliance.test.ts`.
 */
export async function seatUnits(
  seat: { orgUnitId: string | null; clientCompany: { id: string } } | null
): Promise<string[] | null> {
  if (!seat || !seat.orgUnitId) return null
  const units = await prisma.orgUnit.findMany({
    where: { companyId: seat.clientCompany.id },
    select: { id: true, parentId: true },
  })
  return [seat.orgUnitId, ...descendants(units, seat.orgUnitId)]
}
