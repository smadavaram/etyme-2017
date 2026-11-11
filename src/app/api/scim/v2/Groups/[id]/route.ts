import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { SCIM_GROUP, groupPatch, scimCaller, scimError, scimJson } from '@/lib/identity/scim'
import { applyGroupRole } from '@/lib/identity/provision'

/**
 * GET   /scim/v2/Groups/:id — a mapped group
 * PATCH /scim/v2/Groups/:id — members added take the group's role; members
 *                              removed who hold it go back to Member. Never
 *                              an Owner's seat, never to Owner.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return who.res
  const g = await prisma.directoryGroupRole.findUnique({ where: { companyId_groupId: { companyId: who.caller.companyId, groupId: params.id } }, select: { groupId: true, groupName: true } })
  if (!g) return scimError(404, 'No group by that id is mapped to a role at this company.')
  return scimJson({ schemas: [SCIM_GROUP], id: g.groupId, displayName: g.groupName ?? g.groupId })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return who.res
  const p = groupPatch(await request.json().catch(() => null))
  if (p === 'unsupported') return scimError(400, 'A PatchOp with Operations is required.', 'invalidSyntax')
  if (p.displayName) await prisma.directoryGroupRole.updateMany({ where: { companyId: who.caller.companyId, groupId: params.id }, data: { groupName: p.displayName } })
  for (const m of p.add) await applyGroupRole({ companyId: who.caller.companyId, externalIdentityId: m, groupId: params.id, joined: true, surface: 'SCIM' })
  for (const m of p.remove) await applyGroupRole({ companyId: who.caller.companyId, externalIdentityId: m, groupId: params.id, joined: false, surface: 'SCIM' })
  return scimJson(null, 204)
}
