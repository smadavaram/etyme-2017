import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayEndHold, holdStands } from '@/lib/internal-moves'
import { seatFacts, refuse, trail, tellStep, nameOf } from '../../facts'

/**
 * DELETE /api/bench/ours/holds/:id   { reason? }
 *
 * A hold is released by whoever holds it, or by the manager releasing the
 * person — never by a third manager who wants them, who asks instead.
 * The person goes back on Our bench for anybody, and HR and the person
 * are told.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const hold = await prisma.projectHold.findUnique({ where: { id }, include: { release: { select: { releasedById: true } } } })
  if (!hold || hold.companyId !== caller.company!.id) return refuse('NOT_FOUND', 'That hold is not here.', 404)
  const name = await nameOf(hold.personId)
  if (!holdStands(hold, new Date())) {
    return refuse('NOT_LIVE', `That hold on ${name} has already ended.`, 409)
  }
  if (!mayEndHold({ callerId: caller.person.id, heldById: hold.heldById, releaserId: hold.release?.releasedById ?? null })) {
    const by = await nameOf(hold.heldById)
    await trail(caller, hold.personId, 'RELEASING_SOON_VIEW', 'Refused: released a hold that was not theirs.', false)
    return refuse('NOT_YOURS', `${by} holds ${name}. Only ${by}, or the manager releasing ${name}, lets the hold go. Ask ${by} on the thread.`)
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
  await prisma.projectHold.update({
    where: { id },
    data: { live: null, endedAt: new Date(), endedById: caller.person.id, endedHow: 'RELEASED', endReason: reason },
  })
  const told = await tellStep({
    caller,
    companyId: hold.companyId,
    personId: hold.personId,
    step: 'HOLD_ENDED',
    entityId: hold.id,
    facts: { personName: name, firmName: caller.company!.name, actorName: caller.person.name, forTitle: hold.forTitle, endedHow: 'RELEASED' },
  })
  await prisma.automationLog.create({
    data: {
      companyId: hold.companyId,
      action: 'PROJECT_HOLD_RELEASED',
      summary: `${caller.person.name} released the hold on ${name} for ${hold.forTitle}.`,
      reason: reason ?? (caller.person.id === hold.heldById ? 'The manager holding them let them go.' : 'The manager releasing them ended the hold.'),
      payload: { holdId: hold.id, personId: hold.personId, hrTold: told.hr, personTold: told.personTold } as object,
      reversible: false,
    },
  })
  return NextResponse.json({ data: { holdId: id, released: true } })
}
