import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { companyPolicy } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { signInSeat, type SignInSeat } from '../gate'

/**
 * POST   /api/settings/sign-in/groups — { groupId, groupName?, roleId } a directory group seats people in a role
 * DELETE /api/settings/sign-in/groups?id=… — the row removed
 *
 * The Owner sets it; GROUP_ROLE_MAPPED is written with each change. A
 * group never maps to Owner: Owner is never given by a directory.
 */
export async function POST(request: NextRequest) {
  const s = await signInSeat(request, true)
  if ('error' in s && s.error) return s.error
  const { company, by, caller } = s as SignInSeat
  const body = await request.json().catch(() => ({}))
  const groupId = typeof body.groupId === 'string' ? body.groupId.trim().slice(0, 200) : ''
  if (!groupId) return NextResponse.json({ error: { code: 'VALIDATION', field: 'groupId', message: 'Enter the group’s id in your directory.' } }, { status: 422 })
  const role = typeof body.roleId === 'string' ? await prisma.role.findFirst({ where: { id: body.roleId, companyId: company.id }, select: { id: true, name: true } }) : null
  if (!role) return NextResponse.json({ error: { code: 'VALIDATION', field: 'roleId', message: 'Choose the role people in this group hold.' } }, { status: 422 })
  if (role.name === 'Owner') return NextResponse.json({ error: { code: 'VALIDATION', field: 'roleId', message: 'A directory group never makes anybody an Owner. Choose another role.' } }, { status: 422 })
  const groupName = typeof body.groupName === 'string' && body.groupName.trim() ? body.groupName.trim().slice(0, 200) : null
  const provider = await prisma.identityProvider.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const policy = (await companyPolicy(company.id)).effective
  await prisma.$transaction(async (tx) => {
    await tx.directoryGroupRole.upsert({
      where: { companyId_groupId: { companyId: company.id, groupId } },
      create: { companyId: company.id, identityProviderId: provider?.id ?? null, groupId, groupName, roleId: role.id, setById: by },
      update: { groupName, roleId: role.id, setById: by, setAt: new Date() },
    })
    await recordIdentityEvent({ event: 'GROUP_ROLE_MAPPED', companyId: company.id, actorPersonId: by, subject: { companyId: company.id }, policy, surface: 'WEB', says: `${caller.person.name} mapped the directory group ${groupName ?? groupId} to ${role.name} at ${company.name}.` }, tx)
  })
  return NextResponse.json({ data: { says: `People in ${groupName ?? groupId} are seated as ${role.name}.` } })
}

export async function DELETE(request: NextRequest) {
  const s = await signInSeat(request, true)
  if ('error' in s && s.error) return s.error
  const { company, by, caller } = s as SignInSeat
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const row = await prisma.directoryGroupRole.findFirst({ where: { id, companyId: company.id }, select: { id: true, groupId: true, groupName: true, role: { select: { name: true } } } })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such group row at this company.' } }, { status: 404 })
  const policy = (await companyPolicy(company.id)).effective
  await prisma.$transaction(async (tx) => {
    await tx.directoryGroupRole.delete({ where: { id: row.id } })
    await recordIdentityEvent({ event: 'GROUP_ROLE_MAPPED', companyId: company.id, actorPersonId: by, subject: { companyId: company.id }, policy, surface: 'WEB', says: `${caller.person.name} removed the directory group ${row.groupName ?? row.groupId} (${row.role.name}) at ${company.name}; people already seated keep their role.` }, tx)
  })
  return NextResponse.json({ data: { says: 'Removed. People already seated keep their role.' } })
}
