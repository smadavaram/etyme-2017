import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { SCIM_GROUP, SCIM_LIST, groupIdFor, readFilter, scimCaller, scimError, scimJson } from '@/lib/identity/scim'
import { applyGroupRole } from '@/lib/identity/provision'

/**
 * GET  /scim/v2/Groups — the groups this company mapped to a role, `filter=displayName eq "…"`
 * POST /scim/v2/Groups — a group the directory pushes; its members take the
 *                        group's role where the company mapped one (Settings →
 *                        Sign-in), never Owner. A group nobody mapped is
 *                        answered and not kept: it changes nobody's seat.
 */
export async function GET(request: NextRequest) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return who.res
  const f = readFilter(request.nextUrl.searchParams.get('filter'))
  if (f === 'unsupported') return scimError(400, 'Only displayName eq and id eq filters are supported.', 'invalidFilter')
  const rows = await prisma.directoryGroupRole.findMany({ where: { companyId: who.caller.companyId }, select: { groupId: true, groupName: true } })
  const hit = rows.filter((g) => !f || (f.attr === 'displayname' ? (g.groupName ?? '').toLowerCase() === f.value.toLowerCase() : f.attr === 'id' ? g.groupId === f.value : true))
  return scimJson({ schemas: [SCIM_LIST], totalResults: hit.length, startIndex: 1, itemsPerPage: hit.length, Resources: hit.map((g) => ({ schemas: [SCIM_GROUP], id: g.groupId, displayName: g.groupName ?? g.groupId })) })
}

export async function POST(request: NextRequest) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return who.res
  const body = (await request.json().catch(() => null)) as Record<string, any> | null
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  if (!displayName) return scimError(400, 'displayName is required.', 'invalidValue')
  const id = groupIdFor(who.caller.companyId, displayName, body?.externalId)
  await prisma.directoryGroupRole.updateMany({ where: { companyId: who.caller.companyId, groupId: id }, data: { groupName: displayName } })
  const members = Array.isArray(body?.members) ? body!.members.map((m: any) => String(m?.value ?? '')).filter(Boolean) : []
  for (const m of members) await applyGroupRole({ companyId: who.caller.companyId, externalIdentityId: m, groupId: id, joined: true, surface: 'SCIM' })
  return scimJson({ schemas: [SCIM_GROUP], id, displayName, members: members.map((value: string) => ({ value })) }, 201)
}
