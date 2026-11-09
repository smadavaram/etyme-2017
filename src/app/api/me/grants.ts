import { prisma } from '@/lib/db'
import {
  grantsForSeat,
  grantedPermissions,
  effectivePermissions,
  menuPermissions,
  holdsGrantRight,
  reaches,
  labelOf,
  GRANT_RIGHT,
  type GrantRow,
  type Seat,
} from '@/lib/permission-grants'

/**
 * What the Owner gave one of the person's own seats beyond its role, for
 * `/api/me` (founder, 2026-11-08: "Owner should control who should see
 * what, … by team hierarchy or individual role or company as well").
 *
 * `permissions` is the list the one caller check asks `hasPermission`
 * over, so the screen and the route cannot disagree about a button; the
 * reach of each grant is said beside it, because a grant for one team
 * opens the door and the reader behind it reads only that team.
 */
export interface SeatGrant {
  permission: string
  /** "read what placements make". */
  label: string
  scope: 'COMPANY' | 'UNIT' | 'PERSON'
  /** The team, for a team grant. */
  unit: { id: string; name: string } | null
  /** "for the whole company", "for the Dayton team and every team under it", "for your own work". */
  reachSays: string
}

export interface SeatGrantFacts {
  permissions: string[]
  /** What the menu may draw: `permissions` and every team or own-work grant of a page that reads by team. */
  menuPermissions: string[]
  granted: string[]
  grants: SeatGrant[]
  mayGiveAccess: boolean
}

/** The words for one grant's reach. Pure. */
export function reachWords(scope: SeatGrant['scope'], unitName: string | null): string {
  if (scope === 'UNIT') return `for the ${unitName ?? 'one'} team and every team under it`
  if (scope === 'PERSON') return 'for your own work'
  return 'for the whole company'
}

/**
 * The grant facts for one seat, from its rows. Pure: only grants that
 * reach this seat at its own company, and only permissions the role does
 * not already hold across the company are listed as granted.
 */
export function grantFactsFrom(
  seat: Seat,
  rolePermissions: readonly string[],
  rows: readonly GrantRow[],
  unitNames: ReadonlyMap<string, string>
): SeatGrantFacts {
  const live = rows.filter((g) => reaches(g, seat))
  const grants: SeatGrant[] = live
    .filter((g) => g.permission !== GRANT_RIGHT)
    .map((g) => {
      const scope = g.scope as SeatGrant['scope']
      const unitName = g.orgUnitId ? unitNames.get(g.orgUnitId) ?? null : null
      return {
        permission: g.permission,
        label: labelOf(g.permission),
        scope,
        unit: scope === 'UNIT' && g.orgUnitId ? { id: g.orgUnitId, name: unitName ?? '' } : null,
        reachSays: reachWords(scope, unitName),
      }
    })
  return {
    permissions: effectivePermissions(rolePermissions, seat, live),
    // What the menu may draw: the permissions above and every team or own-work
    // grant of a page that reads by team (architect, f2e76ac45), so a seat whose
    // only reach is a team grant of jobs is offered Jobs.
    menuPermissions: menuPermissions(rolePermissions, seat, live),
    granted: grantedPermissions(rolePermissions, seat, live),
    grants,
    mayGiveAccess: holdsGrantRight(seat, live),
  }
}

/** The grant facts for one of the person's own seats. Never throws. */
export async function seatGrantFacts(seat: Seat, rolePermissions: readonly string[]): Promise<SeatGrantFacts> {
  const rows = await grantsForSeat(seat)
  const unitIds = [...new Set(rows.map((g) => g.orgUnitId).filter((x): x is string => !!x))]
  const units = unitIds.length && seat.companyId
    ? await prisma.orgUnit
        .findMany({ where: { companyId: seat.companyId, id: { in: unitIds } }, select: { id: true, name: true } })
        .catch(() => [] as { id: string; name: string }[])
    : []
  return grantFactsFrom(seat, rolePermissions, rows, new Map(units.map((u) => [u.id, u.name])))
}
