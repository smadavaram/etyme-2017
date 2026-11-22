import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { roleWords } from '@/lib/access-grant'
import { LedgerRefusal } from '@/lib/record-ledger'
import { recordRefusal, type AccessSubject } from '@/lib/access-log'
import { BENCH_SEAT_REFUSED_LOOP, CANNOT_READ_LOOP, CANNOT_RUN_LOOP, mayRunLoop } from '@/lib/money-loop'

/**
 * The one door for the money loop (record 107, Flow B). The caller check
 * first; then a firm and a working seat (a place on the bench reads
 * nothing). Each handler then asks for its permission by name: a seat
 * that reads payroll reads, a seat that runs payroll writes. So an Account
 * Manager, a recruiter and HR never read a chain's amounts. Every refusal
 * here is logged before it is sent.
 */
export interface LoopSeat {
  caller: CallerContext
  companyId: string
  companyName: string
  personId: string
  heldAs: string
  mayRun: boolean
  entities: { id: string; name: string }[]
}

export function refused(status: number, message: string, field?: string) {
  return NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION', message, ...(field ? { field } : {}) } }, { status })
}

export async function loopSeat(request: NextRequest): Promise<{ seat: LoopSeat; error: null } | { seat: null; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { seat: null, error }
  if (!caller.company) return { seat: null, error: refused(403, 'This page is a firm’s, and you are not signed in at one.') }
  if (caller.isService) return { seat: null, error: refused(403, 'This page is read by a person with a seat, not by a key.') }
  const companyId = caller.company.id
  if (caller.context.type === 'CONSULTANT') {
    await recordRefusal([{ companyId }], { actorPersonId: caller.person.id, actorCompanyId: companyId, action: 'PAYROLL_VIEW', reason: `Refused the money loop to a bench seat (${request.nextUrl.pathname}).` })
    return { seat: null, error: refused(403, BENCH_SEAT_REFUSED_LOOP) }
  }
  const [role, entities] = await Promise.all([
    caller.context.roleId ? prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null,
    prisma.legalEntity.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  return {
    seat: { caller, companyId, companyName: caller.company.name, personId: caller.person.id, heldAs: roleWords(role?.name ?? null), mayRun: mayRunLoop(caller.permissions), entities },
    error: null,
  }
}

/**
 * The refusal of a seat that does not read payroll, or reads it and does
 * not run it: logged first, then the sentence. Each handler asks for its
 * own permission by name, so the menu's claim can be read off the route.
 */
export async function refuseLoop(seat: LoopSeat, request: NextRequest, lacks: 'read' | 'run'): Promise<NextResponse> {
  await recordRefusal([{ companyId: seat.companyId }], {
    actorPersonId: seat.personId, actorCompanyId: seat.companyId, action: 'PAYROLL_VIEW',
    reason: `Refused ${lacks === 'read' ? 'the money loop to a seat that does not read payroll' : 'a move on the money loop to a seat that does not run payroll'} (${request.nextUrl.pathname}).`,
  })
  return refused(403, lacks === 'read' ? CANNOT_READ_LOOP : CANNOT_RUN_LOOP)
}

/** A chain's or the ledger's refusal as the sentence it is; anything else is thrown on. */
export function refusalOf(e: unknown): NextResponse {
  if (e instanceof LedgerRefusal) return refused(422, e.message)
  throw e
}

/** A refused read of another firm's chain or contract, logged before the refusal is sent. */
export async function logRefusal(seat: LoopSeat, subject: AccessSubject, reason: string) {
  await recordRefusal([subject], { actorPersonId: seat.personId, actorCompanyId: seat.companyId, action: 'PAYROLL_VIEW', reason })
}

export const stampOf = (seat: LoopSeat, actingEntityId: string | null) => ({ companyId: seat.companyId, personId: seat.personId, heldAs: seat.heldAs, actingEntityId })
