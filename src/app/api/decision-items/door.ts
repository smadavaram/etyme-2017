import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { roleWords } from '@/lib/access-grant'
import { LedgerRefusal } from '@/lib/record-ledger'
import { recordRefusal, type AccessSubject } from '@/lib/access-log'
import { OWNER_ROLE, ADMIN_ROLE } from '@/lib/owner-rules'

/**
 * The one door for the decision queue, agent control, the record view and
 * the home setting (record 107, Flow A). The caller check first; then a
 * firm, a real person, the role she holds (copied onto every ledger row
 * as she holds it now) and the firm's own legal entities.
 *
 * Only a working seat at the firm opens it. The caller check already
 * refuses a revoked, paused or date-ended seat; a bench (CONSULTANT) seat
 * is refused here, logged first, because the queue is the firm's data.
 */
export interface QueueSeat {
  caller: CallerContext
  companyId: string
  personId: string
  roleName: string | null
  heldAs: string
  /** The firm's Owner or an Admin: reads every proof and the firm's whole ledger. */
  ownerOrAdmin: boolean
  entities: { id: string; name: string }[]
}

export const BENCH_SEAT_REFUSED = 'The decision queue is read by the people who work at this firm. Your seat here is a place on its bench, so it does not open the queue.'

export function refused(status: number, message: string, field?: string) {
  return NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION', message, ...(field ? { field } : {}) } }, { status })
}

export async function queueSeat(request: NextRequest): Promise<{ seat: QueueSeat; error: null } | { seat: null; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { seat: null, error }
  if (!caller.company) return { seat: null, error: refused(403, 'The decision queue is a firm’s, and you are not signed in at one.') }
  if (caller.isService) return { seat: null, error: refused(403, 'The decision queue is read by a person with a seat, not by a key.') }
  const companyId = caller.company.id
  if (caller.context.type === 'CONSULTANT') {
    await recordRefusal([{ companyId }], { actorPersonId: caller.person.id, actorCompanyId: companyId, action: 'CONTRACT_VIEW', reason: `Refused the decision queue to a bench seat (${request.nextUrl.pathname}).` })
    return { seat: null, error: refused(403, BENCH_SEAT_REFUSED) }
  }
  const [role, entities] = await Promise.all([
    caller.context.roleId ? prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null,
    prisma.legalEntity.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  const roleName = role?.name ?? null
  return { seat: { caller, companyId, personId: caller.person.id, roleName, heldAs: roleWords(roleName), ownerOrAdmin: roleName === OWNER_ROLE || roleName === ADMIN_ROLE, entities }, error: null }
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
