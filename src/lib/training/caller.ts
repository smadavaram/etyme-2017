import { prisma } from '@/lib/db'

/** The role name of the seat a caller is acting from, or null. */
export async function callerRoleName(caller: { company: { id: string } | null; context: { roleId: string | null } }): Promise<string | null> {
  if (!caller.company || !caller.context.roleId) return null
  const role = await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
  return role?.name ?? null
}
