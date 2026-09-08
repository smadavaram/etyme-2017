import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/me/interviews/:id/respond
 *
 * The candidate answering an interview, which is half of what an
 * interview is.
 *
 * `/api/me/pipeline` shipped showing proposed slots with no way to
 * reply to them — a screen that tells somebody three times they are
 * wanted and gives them no button. The 2017 build had
 * `accept_interview`, and the state this needs already exists:
 * `Interview.state` runs PROPOSED · CONFIRMED · CANCELLED · DONE ·
 * NO_SHOW, so confirming is a value that was always there.
 *
 * Body: { action: 'ACCEPT' | 'DECLINE', slot?: string, reason?: string }
 *
 * Only their own interview, and only one that is still asking. A
 * cancelled or finished interview is not a thing to answer, and saying
 * so is better than moving it somewhere nobody expects.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '').toUpperCase()

  if (action !== 'ACCEPT' && action !== 'DECLINE') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'action must be ACCEPT or DECLINE', field: 'action' } },
      { status: 422 }
    )
  }

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      submission: { select: { personId: true, requirement: { select: { title: true } } } },
      company: { select: { id: true, name: true } },
    },
  })

  if (!interview) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such interview.' } }, { status: 404 })
  }

  // Theirs, and nobody else's. An interview is arranged about one
  // person and only that person may answer it.
  if (interview.submission.personId !== caller.person.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This interview is not yours to answer.' } },
      { status: 403 }
    )
  }

  if (interview.state !== 'PROPOSED') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_STATE',
          message:
            interview.state === 'CONFIRMED'
              ? 'You have already accepted this one.'
              : `This interview is ${interview.state.toLowerCase()} and is not waiting on you.`,
        },
      },
      { status: 409 }
    )
  }

  const now = new Date()

  // A slot they picked, where they picked one. The slots are proposed
  // as a list precisely so somebody can choose, and recording which is
  // the whole point of asking.
  const slots = Array.isArray(interview.proposedSlots) ? (interview.proposedSlots as any[]) : []
  const chosen = body.slot ? String(body.slot) : null
  if (action === 'ACCEPT' && chosen && slots.length > 0) {
    const offered = slots.map((s) => String(typeof s === 'string' ? s : s?.at ?? s?.start ?? ''))
    if (!offered.includes(chosen)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'That is not one of the times you were offered.', field: 'slot' } },
        { status: 422 }
      )
    }
  }

  await prisma.$transaction([
    prisma.interview.update({
      where: { id },
      data: { state: action === 'ACCEPT' ? 'CONFIRMED' : 'CANCELLED' },
    }),
    // The vendor hears about it from the person, in their own words
    // where they gave any. Somebody declining an interview and nobody
    // noticing for three days is how a client stops taking a vendor's
    // calls.
    prisma.notification.create({
      data: {
        personId: caller.person.id,
        companyId: interview.company.id,
        type: 'INTERVIEW',
        title:
          action === 'ACCEPT'
            ? `${caller.person.name} accepted the interview`
            : `${caller.person.name} cannot make the interview`,
        body:
          action === 'ACCEPT'
            ? `For ${interview.submission.requirement.title}` + (chosen ? `, at ${chosen}.` : '.')
            : `For ${interview.submission.requirement.title}.` +
              (body.reason ? ` They said: ${String(body.reason).slice(0, 300)}` : ''),
        entityId: id,
        channel: 'IN_APP',
        status: 'UNREAD',
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: interview.company.id,
        action: action === 'ACCEPT' ? 'INTERVIEW_ACCEPTED' : 'INTERVIEW_DECLINED',
        summary: `${caller.person.name} ${action === 'ACCEPT' ? 'accepted' : 'declined'} round ${interview.round} for ${interview.submission.requirement.title}`,
        reason: `The candidate answered it themselves${chosen ? `, choosing ${chosen}` : ''}.`,
        payload: { interviewId: id, action, slot: chosen },
        // Their own answer. Somebody else undoing it would be the
        // vendor deciding when the candidate is free.
        reversible: false,
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id,
      state: action === 'ACCEPT' ? 'CONFIRMED' : 'CANCELLED',
      slot: chosen,
      says:
        action === 'ACCEPT'
          ? `Confirmed${chosen ? ` for ${chosen}` : ''}. ${interview.company.name} has been told.`
          : `Declined. ${interview.company.name} has been told, and it will not count against you.`,
    },
  })
}
