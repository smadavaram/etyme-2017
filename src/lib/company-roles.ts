import { prisma } from '@/lib/db'
import { rolesFor, RENAMED_ROLES, GRANTED_SINCE, REVOKED_SINCE, ADMIN_ROLE, isNarrowedAdmin } from '@/lib/company-defaults'
import type { CompanyKind } from '@prisma/client'
import { PERMISSIONS, type Permission } from '@/lib/permissions'

/**
 * What a role can do, against the whole catalog (founder, 2026-11-12).
 *
 * The Roles list printed the length of a role's stored list, so the Owner
 * read 34, the Admin 33, Member 0 and Give access offered 35, and none of
 * them said against what. One answer now: a role holding `*` holds the
 * whole catalog; any other holds its own list filtered to the catalog, in
 * the catalog's order, so a name dropped from the catalog is not counted.
 *
 * For display and counting only. What a role may do is still decided by
 * `hasPermission` on the stored list, which this never changes.
 */
export function roleCanDo(role: { permissions: readonly string[] }): {
  everything: boolean
  list: Permission[]
  count: number
  /** The size of the catalog: the same number for every kind of company. */
  of: number
  /** "Everything (34)", "5 of 34" or "none yet". */
  words: string
} {
  const of = PERMISSIONS.length
  const held = new Set(role.permissions)
  const list = held.has('*') ? [...PERMISSIONS] : PERMISSIONS.filter((p) => held.has(p))
  const everything = list.length === of
  const words = everything ? `Everything (${of})` : list.length === 0 ? 'none yet' : `${list.length} of ${of}`
  return { everything, list, count: list.length, of, words }
}

/**
 * A company formed last month has the roles that existed last month.
 * When a role is added to the defaults, or renamed into the trade's
 * words, every company of that kind should have it the next time
 * somebody opens Users & permissions — without a migration and without
 * a seat left on a duplicate. Rename first, then add what is missing;
 * never touch a role somebody at the company wrote themselves.
 */
export async function ensureDefaultRoles(
  companyId: string,
  kind: string
): Promise<{ added: string[]; renamed: string[]; granted: string[]; revoked: string[] }> {
  const renamed: string[] = []
  for (const [was, now] of Object.entries(RENAMED_ROLES)) {
    const clash = await prisma.role.findFirst({ where: { companyId, name: now }, select: { id: true } })
    if (clash) continue
    const r = await prisma.role.updateMany({ where: { companyId, name: was }, data: { name: now } })
    if (r.count > 0) renamed.push(`${was} → ${now}`)
  }
  const have = new Set((await prisma.role.findMany({ where: { companyId }, select: { name: true } })).map((r) => r.name))
  const added: string[] = []
  for (const seed of rolesFor(kind as CompanyKind)) {
    if (have.has(seed.name)) continue
    await prisma.role.create({ data: { companyId, name: seed.name, permissions: seed.permissions, isDefault: false } })
    added.push(seed.name)
  }
  // A permission the defaults grew after this company was formed.
  //
  // Additive only: a permission is added where the role lacks it and
  // nothing is ever taken away, so an admin who narrowed a role keeps
  // their narrowing. The alternative — syncing a role back onto the seed —
  // would quietly undo a deliberate decision every time somebody opened
  // the access screen.
  const granted: string[] = []
  for (const grant of GRANTED_SINCE) {
    if (!grant.kinds.includes(kind as CompanyKind)) continue
    const role = await prisma.role.findFirst({
      where: { companyId, name: grant.role },
      select: { id: true, permissions: true },
    })
    if (!role) continue
    // A narrowed Admin (2026-11-12) holds no money or contract act, by the
    // Owner's choice or the company's start; no default grant widens it.
    if (grant.role === ADMIN_ROLE && isNarrowedAdmin(role.permissions)) continue
    const missing = grant.permissions.filter((p) => !role.permissions.includes(p))
    if (missing.length === 0) continue
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: [...role.permissions, ...missing] },
    })
    granted.push(`${grant.role} → ${missing.join(', ')}`)
  }

  // A permission a shipped role should never have held. Taken away only
  // from the untouched seed: a role whose permissions are exactly what it
  // shipped with. An admin's own edit is never undone.
  const revoked: string[] = []
  for (const fix of REVOKED_SINCE) {
    const roles = await prisma.role.findMany({
      where: { companyId, name: fix.role },
      select: { id: true, permissions: true },
    })
    for (const role of roles) {
      const same = role.permissions.length === fix.was.length && fix.was.every((p) => role.permissions.includes(p))
      if (!same) continue
      await prisma.role.update({ where: { id: role.id }, data: { permissions: [...fix.now] } })
      revoked.push(`${fix.role} → ${fix.now.length ? fix.now.join(', ') : 'no permissions'}`)
    }
  }

  return { added, renamed, granted, revoked }
}
