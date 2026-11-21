import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { roleWords } from '@/lib/access-grant'
import { LedgerRefusal } from '@/lib/record-ledger'
import { recordRefusal, type AccessSubject } from '@/lib/access-log'

/**
 * The one door for the decision queue, agent control, the record view and
 * the home setting (record 107, Flow A). The caller check first; then a
 * firm, a real person, the role she holds (copied onto every ledger row
 * as she holds it now) and the firm's own legal entities.
 */
export interface QueueSeat {
  caller: CallerContext
  companyId: string
  personId: string
  roleName: string | null
  heldAs: string
  entities: { id: string; name: string }[]
}

export function refused(status: number, message: string, field?: string) {
  return NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION', message, ...(field ? { field } : {}) } }, { status })
}

export async function queueSeat(request: NextRequest): Promise<{ seat: QueueSeat; error: null } | { seat: null; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { seat: null, error }
  if (!caller.company) return { seat: null, error: refused(403, 'The decision queue is a firm’s, and you are not signed in at one.') }
  if (caller.isService) return { seat: null, error: refused(403, 'The decision queue is read by a person with a seat, not by a key.') }
  const companyId = caller.company.id
  const [role, entities] = await Promise.all([
    caller.context.roleId ? prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null,
    prisma.legalEntity.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  const roleName = role?.name ?? null
  return { seat: { caller, companyId, personId: caller.person.id, roleName, heldAs: roleWords(roleName), entities }, error: null }
}

/** A ledger or decision refusal as the sentence it is; anything else is thrown on. */
export function refusalOf(e: unknown): NextResponse {
  if (e instanceof LedgerRefusal) return refused(422, e.message)
  throw e
}

/** A refused read, logged before the refusal is sent (lib/access-log, recordRefusal). */
export async function logRefusal(seat: QueueSeat, subject: AccessSubject, reason: string, action: 'CONTRACT_VIEW' | 'PROFILE_VIEW' = 'CONTRACT_VIEW') {
  await recordRefusal([subject], { actorPersonId: seat.personId, actorCompanyId: seat.companyId, action, reason })
}
