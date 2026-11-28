import { prisma } from '@/lib/db'
import {
  effectivePermissions,
  grantedPermissions,
  scopeFrom,
  holdsGrantRight,
  type GrantRow,
  type ScopeAnswer,
  type Seat,
} from './rules'

export * from './rules'

/**
 * The grants that may reach one seat: at its company, unrevoked, held by
 * its role or by the seat itself. One query.
 *
 * Never throws. A read that fails, including on a database the
 * `PermissionGrant` table has not reached yet, answers no grants: the seat
 * then holds exactly its role, which is the product as it was before
 * grants and the safe direction to be wrong in.
 */
export async function grantsForSeat(seat: Seat): Promise<GrantRow[]> {
  if (!seat.companyId) return []
  try {
    return (await prisma.permissionGrant.findMany({
      where: {
        companyId: seat.companyId,
        revokedAt: null,
        OR: [...(seat.roleId ? [{ roleId: seat.roleId }] : []), { contextId: seat.contextId }],
      },
      select: { id: true, companyId: true, permission: true, roleId: true, contextId: true, scope: true, orgUnitId: true, revokedAt: true },
    })) as GrantRow[]
  } catch {
    return []
  }
}

/** The role's permissions and the grants that reach the seat, for the one caller check. */
export async function seatPermissions(
  seat: Seat,
  rolePermissions: readonly string[]
): Promise<{ permissions: string[]; granted: string[]; grantRight: boolean }> {
  const grants = await grantsForSeat(seat)
  return {
    permissions: effectivePermissions(rolePermissions, seat, grants),
    granted: grantedPermissions(rolePermissions, seat, grants),
    grantRight: holdsGrantRight(seat, grants),
  }
}

/** What a caller needs to be asked about: the shape `getCallerContext` returns. */
export interface ScopedCaller {
  context: { id: string; companyId: string | null; roleId: string | null }
  company: { id: string } | null
  /** The role's own permissions; absent, `permissions` is read as the role's. */
  rolePermissions?: readonly string[]
  permissions: readonly string[]
}

/**
 * Over what does this caller hold this permission? (founder, 2026-11-08.)
 *
 *   { has, scope: 'COMPANY' | 'UNIT' | 'PERSON' | 'NONE', unitIds }
 *
 * `has` is the answer `hasPermission(caller.permissions, permission)`
 * gives. COMPANY reads the firm's book; UNIT reads only rows charged to or
 * delivered by `unitIds` (each granted unit and every unit under it);
 * PERSON reads only the caller's own; NONE reads nothing. A reader narrows
 * its query by this, never only its screen. A seat held in another
 * company's program, a machine and the sample seat read their role only.
 */
export async function permissionScope(caller: ScopedCaller, permission: string): Promise<ScopeAnswer> {
  const companyId = caller.company?.id ?? null
  const seat: Seat = { companyId, roleId: caller.context.roleId, contextId: caller.context.id }
  const rolePermissions = caller.rolePermissions ?? caller.permissions
  if (!companyId) return { has: false, scope: 'NONE', unitIds: [] }
  if (rolePermissions.includes('*') || rolePermissions.includes(permission)) {
    return { has: true, scope: 'COMPANY', unitIds: [] }
  }
  const grants = (await grantsForSeat(seat)).filter((g) => g.permission === permission)
  if (!grants.length) return { has: false, scope: 'NONE', unitIds: [] }
  const units = grants.some((g) => g.scope === 'UNIT')
    ? await prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, parentId: true } }).catch(() => [])
    : []
  return scopeFrom({ rolePermissions, seat, grants, units }, permission)
}
