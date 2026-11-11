import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { EI_SELECT, isOff, scimCaller, scimError, scimJson, userPatch, userResource } from '@/lib/identity/scim'
import { deprovision, reprovision } from '@/lib/identity/provision'

/**
 * GET    /scim/v2/Users/:id — one person
 * PATCH  /scim/v2/Users/:id — `active` off pauses the seat, ends every session, writes USER_DEPROVISIONED; on restores it
 * PUT    /scim/v2/Users/:id — the same, from the whole resource
 * DELETE /scim/v2/Users/:id — deprovision
 *
 * An Owner follows the Owner rules: the last Owner is never removed, and no
 * Owner's seat is removed by a directory (lib/identity/provision); the
 * answer says so in the SCIM error.
 */
const base = () => `${appUrl()}/scim/v2`

async function one(request: NextRequest, id: string) {
  const who = await scimCaller(request.headers.get('authorization'))
  if (!who.ok) return { res: who.res }
  const ei = await prisma.externalIdentity.findFirst({ where: { id, companyId: who.caller.companyId, issuer: who.caller.provider.issuer }, select: EI_SELECT })
  if (!ei) return { res: scimError(404, 'No such user at this company.') }
  return { who: who.caller, ei }
}

async function setActive(eiId: string, wasOn: boolean, on: boolean, why: string) {
  if (on === wasOn) return null
  const r = on ? await reprovision({ externalIdentityId: eiId, surface: 'SCIM' }) : await deprovision({ externalIdentityId: eiId, surface: 'SCIM', why })
  return r.ok ? null : scimError(r.status, r.says, r.status === 409 ? 'mutability' : undefined)
}

async function changeEmail(eiId: string, userName: string | undefined) {
  if (!userName || !userName.includes('@')) return
  await prisma.externalIdentity.update({ where: { id: eiId }, data: { email: userName.trim().toLowerCase() } })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await one(request, params.id)
  if ('res' in r) return r.res
  return scimJson(userResource(r.ei, base()))
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await one(request, params.id)
  if ('res' in r) return r.res
  const p = userPatch(await request.json().catch(() => null))
  if (p === 'unsupported') return scimError(400, 'A PatchOp with Operations is required.', 'invalidSyntax')
  await changeEmail(r.ei.id, p.userName)
  if (p.active !== undefined) {
    const err = await setActive(r.ei.id, !r.ei.disabledAt, p.active, 'turned off in the directory')
    if (err) return err
  }
  const ei = await prisma.externalIdentity.findUniqueOrThrow({ where: { id: r.ei.id }, select: EI_SELECT })
  return scimJson(userResource(ei, base()))
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await one(request, params.id)
  if ('res' in r) return r.res
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  await changeEmail(r.ei.id, typeof body?.userName === 'string' ? body.userName : undefined)
  if (body && 'active' in body) {
    const err = await setActive(r.ei.id, !r.ei.disabledAt, !isOff(body.active), 'turned off in the directory')
    if (err) return err
  }
  const ei = await prisma.externalIdentity.findUniqueOrThrow({ where: { id: r.ei.id }, select: EI_SELECT })
  return scimJson(userResource(ei, base()))
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await one(request, params.id)
  if ('res' in r) return r.res
  if (!r.ei.disabledAt) {
    const d = await deprovision({ externalIdentityId: r.ei.id, surface: 'SCIM', why: 'deleted in the directory' })
    if (!d.ok) return scimError(d.status, d.says, d.status === 409 ? 'mutability' : undefined)
  }
  return scimJson(null, 204)
}
