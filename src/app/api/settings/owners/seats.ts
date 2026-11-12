/**
 * The reads the Owners routes share: every seat at the company in the
 * shape lib/owner-rules wants, and the caller's own seat.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import type { Seat } from '@/lib/owner-rules'
import type { NextRequest } from 'next/server'

export async function seatsAt(companyId: string): Promise<Seat[]> {
  const rows = await prisma.context.findMany({
    where: { companyId, revokedAt: null, type: 'EMPLOYEE', ...NOT_THE_SAMPLE_SEAT },
    select: {
      id: true, personId: true, suspendedAt: true, expiresAt: true,
      person: { select: { name: true, primaryEmail: true } },
      role: { select: { name: true } },
    },
    orderBy: { grantedAt: 'asc' },
  })
  const now = Date.now()
  return rows.map((r) => ({
    contextId: r.id,
    personId: r.personId,
    name: r.person.name || r.person.primaryEmail,
    roleName: r.role?.name ?? null,
    live: !r.suspendedAt && (!r.expiresAt || r.expiresAt.getTime() > now),
  }))
}

export type OwnersCaller = {
  caller: Awaited<ReturnType<typeof getCallerContext>>['caller']
  company: { id: string; name: string; kind: string }
  personId: string
  seats: Seat[]
  me: Seat
}

/**
 * A company seat held by a person (not an integration), with every seat at
 * the company read once. Owners and Admins read the Owners screen; the
 * rules then say who may do what.
 */
export async function ownersDoor(request: NextRequest): Promise<{ ok: OwnersCaller; error?: undefined } | { ok?: undefined; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Who owns a company is read from a seat at that company.' } }, { status: 403 }) }
  }
  const personId = realPersonId(caller)
  if (!personId) {
    return { error: NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot act on who owns a company. A person does.' } }, { status: 403 }) }
  }
  const seats = await seatsAt(caller.company.id)
  const me = seats.find((s) => s.contextId === caller.context.id) ?? seats.find((s) => s.personId === personId)
  if (!me) {
    return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: `You hold no seat at ${caller.company.name}.` } }, { status: 403 }) }
  }
  return { ok: { caller, company: { id: caller.company.id, name: caller.company.name, kind: caller.company.kind }, personId, seats, me } }
}

export function refused(message: string, status = 422, code = 'REFUSED') {
  return NextResponse.json({ error: { code, message } }, { status })
}
