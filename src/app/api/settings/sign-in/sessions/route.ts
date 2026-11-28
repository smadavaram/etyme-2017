import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { companyPolicy, endSessions } from '@/lib/identity/read'

/**
 * POST /api/settings/sign-in/sessions — { personId? }
 *
 * "Sign out everywhere" (founder, 2026-11-11): every live session the
 * person holds ends on its next request, on every device. With no
 * personId, the caller's own. An Owner or an Admin may end the sessions of
 * somebody seated at their company; an Admin never ends an Owner's. The row
 * (SESSIONS_ENDED) commits with the change.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const by = realPersonId(caller)
  if (!by) {
    return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot end somebody\'s sessions. A person has to decide this.' } }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const target = typeof body.personId === 'string' && body.personId.trim() ? body.personId.trim() : by
  const companyId = caller.company?.id ?? null
  const effective = companyId ? (await companyPolicy(companyId)).effective : 'OPEN'

  if (target === by) {
    await endSessions({ personId: by, actorPersonId: by, companyId, policy: effective, surface: 'WEB', says: `${caller.person.name} signed out everywhere.` })
    return NextResponse.json({ data: { says: 'You are signed out on every device. Sign in again to carry on.' } })
  }

  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Ending somebody else\'s sessions is done from a company seat.' } }, { status: 403 })
  }
  const mine = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (mine?.name !== 'Owner' && mine?.name !== 'Admin') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Only an Owner or an Admin at ${caller.company.name} ends somebody else's sessions.` } }, { status: 403 })
  }
  const theirs = await prisma.context.findFirst({
    where: { personId: target, companyId: caller.company.id, revokedAt: null },
    select: { person: { select: { name: true } }, role: { select: { name: true } } },
  })
  if (!theirs) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Nobody by that id holds a seat at ${caller.company.name}.` } }, { status: 404 })
  }
  if (theirs.role?.name === 'Owner' && mine.name !== 'Owner') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `${theirs.person.name} is an Owner. Only another Owner ends an Owner's sessions.` } }, { status: 403 })
  }

  await endSessions({
    personId: target, actorPersonId: by, companyId: caller.company.id, policy: effective, surface: 'WEB',
    says: `${caller.person.name} (${mine.name}) signed ${theirs.person.name} out everywhere.`,
  })
  return NextResponse.json({ data: { says: `${theirs.person.name} is signed out on every device, on their next click.` } })
}
