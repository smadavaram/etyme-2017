import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * Who may open Settings → Sign-in: the company's Owners read and set it,
 * its Admins read it (founder, 2026-11-11: an Admin is IT and people, below
 * the Owner, and how the company signs in is the Owner's). Shared by the
 * screen's routes so the rule is written once.
 */
export async function signInSeat(request: NextRequest, mustSet: boolean) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'How people sign in is a company setting. Open it from a company seat.' } }, { status: 403 }) }
  }
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  const roleName = role?.name ?? null
  if (roleName !== 'Owner' && roleName !== 'Admin') {
    return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: `How ${caller.company.name}'s people sign in is read by its Owners and Admins.` } }, { status: 403 }) }
  }
  if (mustSet && roleName !== 'Owner') {
    return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: `Only an Owner of ${caller.company.name} changes how its people sign in. An Admin may read it.` } }, { status: 403 }) }
  }
  const by = realPersonId(caller)
  if (mustSet && !by) {
    return { error: NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot change how people sign in. An Owner has to decide this.' } }, { status: 403 }) }
  }
  return { caller, company: caller.company, roleName, by: by ?? caller.person.id }
}

export type SignInSeat = Exclude<Awaited<ReturnType<typeof signInSeat>>, { error: NextResponse }>
