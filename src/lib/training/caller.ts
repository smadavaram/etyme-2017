import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logBulkAccess, recordRefusal } from '@/lib/access-log'

/** The role name of the seat a caller is acting from, or null. */
export async function callerRoleName(caller: { company: { id: string } | null; context: { roleId: string | null } }): Promise<string | null> {
  if (!caller.company || !caller.context.roleId) return null
  const role = await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
  return role?.name ?? null
}

/**
 * Reading trainees is reading people on the firm's books, so it asks what
 * the bench list asks: `consultants.read`. A seat without it is refused in
 * a sentence, and the refusal's row is written before the answer goes out.
 */
export async function traineeReadRefusal(
  caller: { person: { id: string }; company: { id: string; name: string } | null; permissions: Parameters<typeof hasPermission>[0] },
  path: string
): Promise<NextResponse | null> {
  if (hasPermission(caller.permissions, 'consultants.read')) return null
  await recordRefusal([{ companyId: caller.company!.id }], {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company!.id,
    action: 'TALENT_VIEW_ANON',
    reason: `Refused the people on a course (${path}): the seat does not read consultants.`,
  })
  return NextResponse.json(
    { error: { code: 'FORBIDDEN', message: `Reading who is on a course is for whoever reads the bench at ${caller.company!.name}.` } },
    { status: 403 }
  )
}

/** A successful read of trainees: one row per person other than the reader. */
export function logTraineeReads(
  caller: { person: { id: string }; company: { id: string } | null },
  personIds: string[],
  where: string
): void {
  logBulkAccess([...new Set(personIds)].filter((id) => id !== caller.person.id), {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'TALENT_VIEW_ANON',
    reason: `Read on Training: ${where}`,
  })
}
