import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/rolloff/:id/claim
 *
 * BUILD.md: "POST /api/rolloff/:id/claim"
 *
 * A PM or recruiter claims responsibility for handling this rolloff.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const person = await prisma.person.findUnique({
    where: { primaryEmail: session.user.email },
    select: { id: true, name: true },
  })

  if (!person) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Person not found' } },
      { status: 404 }
    )
  }

  const rolloff = await prisma.rolloffEvent.findUnique({
    where: { id },
    include: {
      assignment: {
        select: { id: true, employerCompanyId: true },
      },
    },
  })

  if (!rolloff) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Rolloff event not found' } },
      { status: 404 }
    )
  }

  if (rolloff.claimedById) {
    return NextResponse.json(
      { error: { code: 'ALREADY_CLAIMED', message: 'This rolloff has already been claimed' } },
      { status: 409 }
    )
  }

  await prisma.$transaction([
    prisma.rolloffEvent.update({
      where: { id },
      data: { claimedById: person.id },
    }),
    prisma.automationLog.create({
      data: {
        companyId: rolloff.assignment.employerCompanyId,
        action: 'ROLLOFF_CLAIMED',
        summary: `${person.name} claimed rolloff for assignment ${rolloff.assignmentId}`,
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
