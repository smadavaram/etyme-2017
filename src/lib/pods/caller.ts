import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { logBulkAccess, recordRefusal } from '@/lib/access-log'

type Caller = { person: { id: string }; company: { id: string; name: string } | null; permissions: Parameters<typeof hasPermission>[0] }

/**
 * Project teams are job-side work, so reading them asks `requirements.read`
 * and changing them asks `requirements.write`. A seat without it is refused
 * in a sentence, and the refusal's row is written before the answer goes out.
 */
async function refuse(caller: Caller, path: string, verb: 'read' | 'change', says: string): Promise<NextResponse> {
  await recordRefusal([{ companyId: caller.company!.id }], {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company!.id,
    action: 'TALENT_VIEW_ANON',
    reason: `Refused ${verb === 'read' ? 'a read' : 'a change'} of project teams (${path}): the seat does not hold the permission.`,
  })
  return NextResponse.json({ error: { code: 'FORBIDDEN', message: says } }, { status: 403 })
}

export async function podReadRefusal(caller: Caller, path: string): Promise<NextResponse | null> {
  if (hasPermission(caller.permissions, 'requirements.read')) return null
  return refuse(caller, path, 'read', `Reading project teams is for whoever reads jobs at ${caller.company!.name}.`)
}

export async function podWriteRefusal(caller: Caller, path: string): Promise<NextResponse | null> {
  if (hasPermission(caller.permissions, 'requirements.write')) return null
  return refuse(caller, path, 'change', `Building a project team is for whoever writes jobs at ${caller.company!.name}.`)
}

/** A successful read of members: one row per person other than the reader. */
export function logPodReads(caller: { person: { id: string }; company: { id: string } | null }, personIds: string[], where: string): void {
  logBulkAccess([...new Set(personIds)].filter((id) => id !== caller.person.id), {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'TALENT_VIEW_ANON',
    reason: `Read on Project teams: ${where}`,
  })
}
