import { NextRequest, NextResponse } from 'next/server'
import { checkOutcome } from '@/lib/outcomes'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { clientOf, endHoldsForSubmission } from '@/lib/holds'
import { notify } from '@/lib/notify'
import { placeByAward } from '@/lib/award'

/**
 * PATCH /api/submissions/:id/status
 *
 * Transitions a submission's status.
 * Body: { status: "SHORTLISTED" | "REJECTED" | "WITHDRAWN" }
 *
 * Valid transitions:
 *   SUBMITTED   → SHORTLISTED, REJECTED, WITHDRAWN
 *   SHORTLISTED → REJECTED, WITHDRAWN
 *   INTERVIEW   → REJECTED, WITHDRAWN
 *   OFFERED     → REJECTED, WITHDRAWN
 *   PLACED      → written only by POST /api/submissions/:id/award, which
 *                 writes the contract with it; asked for here it is
 *                 refused with a sentence pointing there
 *   REJECTED    → (terminal)
 *   WITHDRAWN   → (terminal)
 *
 * CLAUDE.md: SubmissionKind is computed from ownership, never accepted from client.
 * This only changes the status, never the kind.
 *
 * Two parties may move it and no others: the supplier that put the person
 * forward, and the client deciding. The route asked only whether somebody
 * was signed in, so any account could place or reject anybody's candidate
 * on anybody's role — and PLACED is the status that writes contracts and
 * starts the billing.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { status } = body
  const rejectReason: string | null = typeof body.reason === 'string' ? body.reason : null
  const rejectNote: string | null = typeof body.note === 'string' ? body.note.trim() || null : null

  // PLACED is let through this gate only to be refused below in a
  // sentence that names the award, rather than as a bare validation error.
  const validStatuses = ['SHORTLISTED', 'REJECTED', 'WITHDRAWN']
  if (!status || (!validStatuses.includes(status) && status !== 'PLACED')) {
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
      toCompany: { select: { id: true, name: true } },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
      { status: 404 }
    )
  }

  // Two parties are on this submission: the supplier that sent the person
  // and the client deciding. Nobody else may move it.
  const clientCompanyId = clientOf(submission.requirement)
  const isSupplier = caller.company?.id === submission.fromCompany.id
  const isClient = caller.company?.id === clientCompanyId
  if (!isSupplier && !isClient) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Only the supplier that submitted this candidate or the client deciding may change it',
        },
      },
      { status: 403 }
    )
  }

  // PLACED is not a status anybody sets. It is what the award writes, in
  // the same transaction as the contract, the order and the billing
  // dates. This route used to flip it as a bare word from SHORTLISTED,
  // INTERVIEW or OFFERED and write nothing behind it, so the candidate a
  // client had just offered read "Placed" and had no contract, no
  // timesheet and no invoice. Refused for both sides, in a sentence that
  // names the award: the buyer is pointed at Place, the supplier is told
  // who presses it. Routing it through the award from here instead would
  // mean a second caller of a route that needs a rate and a start date
  // this body does not carry.
  if (status === 'PLACED') {
    const buyer = submission.requirement.companyId === caller.company?.id || isClient
    return NextResponse.json(
      {
        error: {
          code: 'PLACE_BY_AWARD',
          message: placeByAward(submission.person.name, buyer, submission.toCompany.name),
          award: `/api/submissions/${id}/award`,
        },
      },
      { status: 409 }
    )
  }

  // Check valid transitions
  const transitions: Record<string, string[]> = {
    SUBMITTED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
    SHORTLISTED: ['REJECTED', 'WITHDRAWN'],
    // Somebody who is being interviewed, or who has an offer out, is
    // still somebody who can be passed over or pulled — hiring them is
    // the award's, above. Leaving
    // these two out meant that the moment a client booked a round the
    // candidate could no longer be rejected from this screen at all —
    // and a rejection that cannot be recorded is a reason nobody gets.
    INTERVIEW: ['REJECTED', 'WITHDRAWN'],
    OFFERED: ['REJECTED', 'WITHDRAWN'],
  }

  // A rejection with no reason is a state change with no information in
  // it. "Rejected" tells a recruiter to try again; "rejected on rate,
  // third time this month at this client" tells them to stop bidding at
  // that number — and twelve months of these is the only asset here that
  // cannot be rebuilt by somebody else in a quarter.
  if (status === 'REJECTED' || status === 'WITHDRAWN') {
    const verdict = checkOutcome({ reason: rejectReason, note: rejectNote })
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'NEEDS_REASON', message: verdict.reason, field: 'reason' } },
        { status: 422 }
      )
    }
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
        ...(rejectReason
          ? { rejectReason, rejectNote, rejectedAt: new Date() }
          : {}),
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: submission.fromCompany.id,
        action: 'SUBMISSION_STATUS_CHANGED',
        summary: `${submission.person.name} submission for "${submission.requirement.title}" changed from ${submission.status} to ${status}`,
        reason: `Changed by ${caller.person.name} at ${caller.company?.name ?? 'an unnamed company'}`,
        payload: {
          submissionId: id,
          personId: submission.personId,
          requirementId: submission.requirementId,
          from: submission.status,
          to: status,
        },
        // Nothing this route writes is final: PLACED is the award's.
        reversible: true,
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
    clientCompanyId,
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
