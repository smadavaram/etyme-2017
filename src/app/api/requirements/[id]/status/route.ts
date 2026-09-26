import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * PATCH /api/requirements/:id/status
 *
 * Transitions a requirement's status through its lifecycle.
 *
 * Valid transitions:
 *   DRAFT → OPEN        (publish for distribution)
 *   OPEN  → FILLED      (placement made)
 *   OPEN  → CLOSED      (cancelled or expired)
 *   FILLED → CLOSED     (archival)
 *
 * Also supports:
 *   CLOSED → OPEN       (reopen)
 *   FILLED → OPEN       (reopen if placement fell through)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { status, reason } = body

  const validStatuses = ['DRAFT', 'OPEN', 'FILLED', 'CLOSED']
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `status must be one of: ${validStatuses.join(', ')}` } },
      { status: 422 }
    )
  }

  const requirement = await prisma.requirement.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, companyId: true },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requirement not found' } },
      { status: 404 }
    )
  }

  // Validate transition
  const transitions: Record<string, string[]> = {
    DRAFT: ['OPEN'],
    OPEN: ['FILLED', 'CLOSED'],
    FILLED: ['CLOSED', 'OPEN'],
    CLOSED: ['OPEN'],
  }

  const allowed = transitions[requirement.status]
  if (!allowed || !allowed.includes(status)) {
    return NextResponse.json(
      { error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${requirement.status} to ${status}` } },
      { status: 409 }
    )
  }

  // If transitioning to FILLED, expire any pending invitations
  const updates: any[] = [
    prisma.requirement.update({
      where: { id },
      data: { status },
    }),
  ]

  if (status === 'FILLED' || status === 'CLOSED') {
    updates.push(
      prisma.requirementInvitation.updateMany({
        where: { requirementId: id, status: 'SENT' },
        data: { status: 'EXPIRED' },
      })
    )
  }

  updates.push(
    prisma.automationLog.create({
      data: {
        companyId: requirement.companyId,
        action: 'REQUIREMENT_STATUS_CHANGED',
        summary: `"${requirement.title}" status changed from ${requirement.status} to ${status}`,
        reason: reason ?? `Status changed by ${caller.person.name}`,
        payload: {
          requirementId: id,
          from: requirement.status,
          to: status,
        },
        reversible: status !== 'FILLED',
      },
    })
  )

  await prisma.$transaction(updates)

  return NextResponse.json({
    data: {
      id,
      status,
      previousStatus: requirement.status,
      message: `Requirement ${status.toLowerCase()}`,
    },
  })
}
