import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasAnyPermission } from '@/lib/permissions'
import { ENDING_SOON_READERS, notYoursToRead } from '@/lib/releasing-soon'
import { isConsultantSeat } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { mayWorkRolloff } from '@/lib/releasing-soon'

/**
 * POST /api/rolloff/:id/claim
 *
 * BUILD.md: "POST /api/rolloff/:id/claim"
 *
 * A PM or recruiter claims responsibility for handling this rolloff.
 *
 * Only the firm whose contract it is may (`mayWorkRolloff`). This route
 * asked who was signed in and never where they sat, so any account —
 * a client, a worker, another supplier — could claim any firm's rolloff.
 * Found 2026-10-03, when a client's Ending soon offered the button.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // The desks that read the board work it. A worker's seat holding only
  // the reads of his own work does not claim, tick off or resolve a
  // colleague's offboarding (sign-up walk round five, the own-work seat).
  if (!hasAnyPermission(caller.permissions, ENDING_SOON_READERS)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: notYoursToRead('Who is rolling off', caller.company?.name) } },
      { status: 403 }
    )
  }

  const { id } = await params

  const rolloff = await prisma.rolloffEvent.findUnique({
    where: { id },
    include: {
      sellContract: {
        select: { id: true, companyId: true, company: { select: { name: true } } },
      },
    },
  })

  if (!rolloff) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Rolloff event not found' } },
      { status: 404 }
    )
  }

  const may = mayWorkRolloff(
    { companyId: caller.company?.id ?? null, isConsultantSeat: isConsultantSeat(caller) },
    { companyId: rolloff.sellContract.companyId, companyName: rolloff.sellContract.company.name }
  )
  if (!may.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: may.says } },
      { status: 403 }
    )
  }

  if (rolloff.claimedById) {
    return NextResponse.json(
      { error: { code: 'ALREADY_CLAIMED', message: 'This rolloff has already been claimed' } },
      { status: 409 }
    )
  }

  const person = caller.person

  await prisma.$transaction([
    prisma.rolloffEvent.update({
      where: { id },
      data: { claimedById: person.id },
    }),
    prisma.automationLog.create({
      data: {
        companyId: rolloff.sellContract.companyId,
        action: 'ROLLOFF_CLAIMED',
        summary: `${person.name} claimed rolloff for sell contract ${rolloff.sellContractId}`,
        reason: `Manual claim via rolloff console`,
        payload: { rolloffId: id, claimedBy: person.id },
        reversible: true,
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id,
      claimedById: person.id,
      message: `Rolloff claimed by ${person.name}`,
    },
  })
}
