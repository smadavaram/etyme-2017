import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'
import { askTheDesk, hasPermission } from '@/lib/permissions'
import { recordRefusal } from '@/lib/access-log'
import { prisma } from '@/lib/db'
import type { Writer } from '@/lib/team-structure/write'

/**
 * The one door Settings → Team structure goes through: the Owner and the
 * Admin (a seat holding settings.manage) at their own company, and
 * nobody else (founder, 2026-11-09). A refusal is said in a sentence
 * naming who does it, and the refused read of the company's people and
 * contractors is written to the access log before the refusal goes out
 * (recordRefusal, awaited: a serverless host may stop the function the
 * moment the 403 leaves).
 *
 * The access log has no action of its own for the tree yet, so a read of
 * it is filed as CONTRACT_VIEW, a company reading its own book, with the
 * reason saying it was the team structure. A name of its own is
 * regulatory's to add (lib/access-log).
 */

type Seated = CallerContext & { company: NonNullable<CallerContext['company']> }

/** The caller, at a company, or the sentence that says they are not seated at one. */
export async function treeCaller(request: NextRequest): Promise<{ caller: Seated; error: null } | { caller: null; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return { caller: null, error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'A team structure belongs to a company, and you are not seated at one.' } }, { status: 403 }) }
  }
  return { caller: caller as Seated, error: null }
}

/**
 * The refusal for a seat that does not set the company up, written to the
 * access log before it is sent. Each route asks
 * `if (!hasPermission(caller.permissions, 'settings.manage'))` itself, so
 * the menu's claim is read off the route (sidebar-nav.test.ts).
 */
export async function refusedTree(caller: Seated, doing: string): Promise<NextResponse> {
  const personId = realPersonId(caller)
  const says = (await whoSetsUp(caller.company.id, doing, caller.company.name)) ?? askTheDesk({ doing, needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name })
  await recordRefusal([{ companyId: caller.company.id }], {
    actorPersonId: personId ?? undefined,
    actorCompanyId: caller.company.id,
    action: 'CONTRACT_VIEW',
    reason: `Refused: ${doing} on the team structure of ${caller.company.name}, which is the Owner's and the Admin's.`,
  })
  return NextResponse.json({ error: { code: 'FORBIDDEN', message: says } }, { status: 403 })
}

/**
 * "Changing the team structure at Corvane Packaging is done by Graham
 * Ellery, Owner." A name, then the role (walk 10), for the seats that hold
 * settings.manage here; null where nobody does, and the role words stand.
 */
async function whoSetsUp(companyId: string, doing: string, companyName: string): Promise<string | null> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, role: { isNot: null } },
    select: { person: { select: { name: true } }, role: { select: { name: true, permissions: true } } },
    orderBy: { grantedAt: 'asc' },
    take: 200,
  })
  const who = seats.filter((s) => hasPermission(s.role?.permissions ?? [], 'settings.manage')).slice(0, 3).map((s) => `${s.person.name}, ${s.role!.name}`)
  if (!who.length) return null
  return `${doing} at ${companyName} is done by ${who.length === 1 ? who[0] : `${who.slice(0, -1).join('; ')} or ${who[who.length - 1]}`}. Ask them to do it, or to give you that role.`
}

/** Who is writing, for lib/team-structure/write; null for a service seat, which never draws the tree. */
export async function writerFor(caller: Seated): Promise<Writer | null> {
  const personId = realPersonId(caller)
  if (!personId) return null
  const company = await prisma.company.findUnique({ where: { id: caller.company.id }, select: { accountWalls: true } })
  return { companyId: caller.company.id, companyName: caller.company.name, accountWalls: Boolean(company?.accountWalls), personId, personName: caller.person.name }
}

export function refuse(says: string, status = 422, field?: string | null) {
  return NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'VALIDATION', message: says, ...(field ? { field } : {}) } }, { status })
}
