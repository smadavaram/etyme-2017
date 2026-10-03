import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { seatIsLive } from '@/lib/program-seat'

/**
 * DELETE /api/program/seats/[id]   { reason? }
 *
 * The client takes the desk back.
 *
 * ── Two rules, and both of them are the point ────────────────────────
 *
 * **Only the client that granted it.** The firm sitting in the seat
 * cannot revoke it and cannot extend it — the grant is one-directional,
 * the way a badge at a reception desk is, and a program office that
 * could manage its own access to somebody else's workforce has the
 * control facing the wrong way.
 *
 * **It bites the next second.** The revocation is a timestamp, and
 * `seatIsLive` reads it on every resolution rather than on a schedule.
 * There is no grace period on a client withdrawing access to its own
 * workforce, and a control that goes on working for an hour after it is
 * switched off is worse than none, because everybody believes it worked.
 *
 * The row stays. A revoked seat is a fact somebody may have to account
 * for later — who was in the program, from when to when, and why they
 * were taken out — and deleting it would lose exactly the answer.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The program office')
  if (notStaff) return notStaff

  const { id } = await params
  const company = caller.company!

  const seat = await prisma.programSeat.findUnique({
    where: { id },
    select: {
      id: true,
      clientCompanyId: true,
      validFrom: true,
      validTo: true,
      revokedAt: true,
      officeCompany: { select: { name: true } },
      clientCompany: { select: { name: true } },
      role: { select: { name: true } },
    },
  })

  if (!seat) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such seat.' } },
      { status: 404 }
    )
  }

  if (seat.clientCompanyId !== company.id) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS_TO_REVOKE',
          message:
            `A seat is taken back by the client that granted it. ${seat.clientCompany.name} gave this ` +
            `desk, so ${seat.clientCompany.name} is who ends it.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'governance.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS_TO_GRANT',
          message:
            'Only an owner or the program manager may take a seat back, the same desk that granted it.',
        },
      },
      { status: 403 }
    )
  }

  if (!seatIsLive(seat)) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_ENDED',
          message: `${seat.officeCompany.name} is not sitting in this program any more, so there is nothing to take back.`,
        },
      },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

  await prisma.programSeat.update({
    where: { id: seat.id },
    data: {
      revokedAt: new Date(),
      revokedById: caller.person.id,
      revokeReason: reason || null,
    },
  })

  return NextResponse.json({
    data: {
      id: seat.id,
      says:
        `${seat.officeCompany.name} is out of ${seat.clientCompany.name}'s ${seat.role.name} desk as of now. ` +
        `The next thing they open here is refused.`,
    },
  })
}
