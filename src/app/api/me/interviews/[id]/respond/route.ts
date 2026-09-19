import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { stateAfterConfirming, rowToInterview } from '@/lib/interviews'
import { tell } from '@/lib/interview-notices'
import { momentFor } from '@/lib/when'

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
      vendor: { select: { id: true, name: true } },
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
    // Offered is not the same as still possible. The page strikes a
    // passed time out; a direct call could still book yesterday.
    if (new Date(chosen).getTime() <= now.getTime()) {
      return NextResponse.json(
        {
          error: {
            code: 'SLOT_PASSED',
            message: 'That time has already passed. Pick another, or say you cannot make any of them.',
            field: 'slot',
          },
        },
        { status: 422 }
      )
    }
  }

  const reason = typeof body.reason === 'string' ? String(body.reason).slice(0, 300).trim() : ''

  // Their own word, recorded as their own word.
  //
  // Not a flat CONFIRMED: there are three diaries and the supplier may
  // not have said yes yet. Writing CONFIRMED here would put a meeting in
  // a calendar that one party has not agreed to, and make the no-show
  // record — the point of all this — a liar.
  const accepting = action === 'ACCEPT'
  const when = chosen ? new Date(chosen) : interview.scheduledAt
  const data: any = accepting
    ? {
        consultantConfirmedAt: now,
        consultantConfirmedVia: 'SELF',
        ...(chosen ? { scheduledAt: new Date(chosen) } : {}),
      }
    : { state: 'CANCELLED', cancelledAt: now, cancelledReason: reason || 'The candidate cannot make it.' }

  if (accepting) {
    data.state = stateAfterConfirming(rowToInterview({ ...interview, ...data }))
  }

  const [saved] = await prisma.$transaction([
    prisma.interview.update({ where: { id }, data }),
    prisma.automationLog.create({
      data: {
        companyId: interview.company.id,
        action: accepting ? 'INTERVIEW_ACCEPTED' : 'INTERVIEW_DECLINED',
        summary: `${caller.person.name} ${accepting ? 'accepted' : 'declined'} round ${interview.round} for ${interview.submission.requirement.title}`,
        reason: `The candidate answered it themselves${chosen ? `, choosing ${chosen}` : ''}.`,
        payload: { interviewId: id, action, slot: chosen },
        // Their own answer. Somebody else undoing it would be the
        // vendor deciding when the candidate is free.
        reversible: false,
      },
    }),
  ])

  // The client who asked and the supplier who put them forward both
  // hear it. This route used to address the notice to the candidate —
  // the candidate telling themselves — so nobody who needed to know
  // found out.
  void tell(accepting ? 'ANSWERED_YES' : 'ANSWERED_NO', id, {
    when: accepting ? when : null,
    reason: reason || null,
  })

  const booked = saved.state === 'CONFIRMED'
  const said = when ? momentFor(when, caller.person.timezone) : null

  return NextResponse.json({
    data: {
      id,
      state: saved.state,
      slot: chosen,
      says: !accepting
        ? `Declined. ${interview.company.name} and ${interview.vendor.name} have been told, and it will not count against you.`
        : booked
          ? `You are down for ${said}. ${interview.company.name} and ${interview.vendor.name} have it too.`
          : `Your yes is recorded${said ? ` for ${said}` : ''}. ${interview.vendor.name} still has to confirm before it is in all three diaries — they have been told.`,
    },
  })
}
