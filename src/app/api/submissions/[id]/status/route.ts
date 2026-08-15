import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * PATCH /api/submissions/:id/status
 *
 * Transitions a submission's status.
 * Body: { status: "SHORTLISTED" | "PLACED" | "REJECTED" | "WITHDRAWN" }
 *
 * Valid transitions:
 *   SUBMITTED   → SHORTLISTED, REJECTED, WITHDRAWN
 *   SHORTLISTED → PLACED, REJECTED, WITHDRAWN
 *   PLACED      → (terminal — no further transitions)
 *   REJECTED    → (terminal)
 *   WITHDRAWN   → (terminal)
 *
 * CLAUDE.md: SubmissionKind is computed from ownership, never accepted from client.
 * This only changes the status, never the kind.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params
  const body = await request.json()
  const { status } = body

  const validStatuses = ['SHORTLISTED', 'PLACED', 'REJECTED', 'WITHDRAWN']
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `status must be one of: ${validStatuses.join(', ')}`, field: 'status' } },
      { status: 422 }
    )
  }

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      requirement: { select: { id: true, title: true } },
      fromCompany: { select: { id: true, name: true } },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
      { status: 404 }
    )
  }

  // Check valid transitions
  const transitions: Record<string, string[]> = {
    SUBMITTED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
    SHORTLISTED: ['PLACED', 'REJECTED', 'WITHDRAWN'],
  }

  const allowed = transitions[submission.status]
  if (!allowed || !allowed.includes(status)) {
    return NextResponse.json(
      { error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${submission.status} to ${status}` } },
      { status: 409 }
    )
  }

  await prisma.$transaction([
    prisma.submission.update({
      where: { id },
      data: { status },
    }),
    prisma.automationLog.create({
      data: {
        companyId: submission.fromCompany.id,
        action: 'SUBMISSION_STATUS_CHANGED',
        summary: `${submission.person.name} submission for "${submission.requirement.title}" changed from ${submission.status} to ${status}`,
        reason: `Status changed via UI`,
        payload: {
          submissionId: id,
          personId: submission.personId,
          requirementId: submission.requirementId,
          from: submission.status,
          to: status,
        },
        reversible: status !== 'PLACED', // Placement is not easily reversible
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id,
      status,
      message: `Submission ${status.toLowerCase()}`,
    },
  })
}
