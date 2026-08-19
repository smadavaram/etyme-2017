import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { clientOf, endHoldsForSubmission } from '@/lib/holds'
import { notify } from '@/lib/notify'

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
      requirement: { select: { id: true, title: true, companyId: true, endClientCompanyId: true } },
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
      data: {
        status,
        // Stamped the moment a decision lands, and only for the statuses
        // that are decisions. Moving to INTERVIEWING is progress, not an
        // answer, and counting it would flatter every slow buyer.
        ...(['PLACED', 'REJECTED', 'NOT_SELECTED', 'WITHDRAWN'].includes(status)
          ? { decidedAt: new Date() }
          : {}),
      },
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

  // Give the hold back the moment this vendor stops trying.
  //
  // A hold is permission to be representing somebody, not a parking space.
  // Somebody rejected on Monday should be free to be put forward by another
  // agency on Monday, rather than sitting out the rest of the month because
  // the vendor who lost still holds them.
  const freed = await endHoldsForSubmission({
    personId: submission.personId,
    companyId: submission.fromCompany.id,
    clientCompanyId: clientOf(submission.requirement),
    submissionStatus: status,
  })

  if (freed) {
    void notify({
      personId: submission.personId,
      type: 'SUBMISSION',
      title: `${submission.fromCompany.name} no longer holds you here`,
      body: `${freed} Another agency can put you forward to this client again.`,
      entityId: id,
      data: { submissionId: id },
    })
  }

  return NextResponse.json({
    data: {
      id,
      status,
      holdReleased: freed,
      message: `Submission ${status.toLowerCase()}`,
    },
  })
}
