import { prisma } from '@/lib/db'
import { rolesFor, RENAMED_ROLES } from '@/lib/company-defaults'
import type { CompanyKind } from '@prisma/client'

/**
 * A company formed last month has the roles that existed last month.
 * When a role is added to the defaults, or renamed into the trade's
 * words, every company of that kind should have it the next time
 * somebody opens Users & permissions — without a migration and without
 * a seat left on a duplicate. Rename first, then add what is missing;
 * never touch a role somebody at the company wrote themselves.
 */
export async function ensureDefaultRoles(companyId: string, kind: string): Promise<{ added: string[]; renamed: string[] }> {
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
  return { added, renamed }
}
