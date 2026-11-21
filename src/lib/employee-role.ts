import type { Prisma } from '@prisma/client'

/**
 * The role a firm's own W2 employee holds: their own work and their own
 * week, nothing else. The seeded integrators' engineers hold the same
 * two reads. Found by name, made once per firm, never a default role, so
 * `ensureDefaultRoles` leaves it alone.
 *
 * One reader for both doors that seat an employee: the W2 import and
 * Add consultant's "Our own W-2 employee" (decisions 102, item 2).
 */
export async function employeeRole(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const found = await tx.role.findFirst({ where: { companyId, name: 'Employee' }, select: { id: true } })
  if (found) return found.id
  return (await tx.role.create({
    data: { companyId, name: 'Employee', isDefault: false, permissions: ['assignments.read', 'timesheets.read'] },
    select: { id: true },
  })).id
}
