import { NextRequest, NextResponse } from 'next/server'
import { secondCheckDoor, refused } from '../door'
import { resetSecondCheck, resettableSeats } from '@/lib/identity/second-check'
import { OWNER_ROLE, onlyAnOwner } from '@/lib/owner-rules'
import { seatsAt } from '@/lib/owner-asks'
import { ownResetSays } from '@/lib/identity/second-check-rules'

/**
 * GET  /api/settings/second-check/reset
 *      For an Owner: the people at the company whose second check she may
 *      reset, by name and role only, never what anybody holds. For anybody:
 *      who resets her own (`own`), in a sentence.
 * POST /api/settings/second-check/reset { personId, proof }
 *      An Owner resets a colleague's second check after her own check,
 *      spent on resetting that person (record 86, answer 5). Nobody resets
 *      their own; an Admin never resets anybody's. Every Owner and the
 *      person are told, and the reset, or its refusal, is written to the
 *      security log.
 */

export async function GET(request: NextRequest) {
  const door = await secondCheckDoor(request)
  if (door.error) return door.error
  const me = door.ok
  const company = me.caller.company
  if (!company) {
    return NextResponse.json({ data: { company: null, mayReset: false, people: [], own: 'Your second check is reset by an Owner at a company where you hold a seat. Write to support@etyme.com.' } })
  }
  const seats = await seatsAt(company.id)
  const mine = seats.find((s) => s.contextId === me.caller.context.id) ?? seats.find((s) => s.personId === me.personId)
  const isOwner = mine?.roleName === OWNER_ROLE && mine.live
  return NextResponse.json({
    data: {
      company: company.name,
      mayReset: isOwner,
      people: isOwner ? await resettableSeats(company.id, me.personId) : [],
      notOwner: isOwner ? null : onlyAnOwner('resets a colleague’s second check'),
      own: ownResetSays(seats, { personId: me.personId }, company.name),
    },
  })
}

export async function POST(request: NextRequest) {
  const door = await secondCheckDoor(request)
  if (door.error) return door.error
  const me = door.ok
  const company = me.caller.company
  if (!company) return refused('A second check is reset from a seat at the company, by one of its Owners.', 403, 'NO_COMPANY')
  const body = await request.json().catch(() => ({}))
  const r = await resetSecondCheck({
    actorPersonId: me.personId, actorContextId: me.caller.context.id, actorName: me.name,
    companyId: company.id, companyName: company.name,
    subjectPersonId: body.personId, proof: body.proof,
  })
  if (!r.ok) {
    return refused(r.says, r.status, r.code, r.code === 'SECOND_CHECK' ? { act: 'second_check.reset', subjectId: String(body.personId ?? '') } : {})
  }
  return NextResponse.json({ data: { says: r.says } })
}
