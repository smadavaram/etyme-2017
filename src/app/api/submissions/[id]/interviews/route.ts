import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import {
  headline, stillValid, shapeRow as shape, rowToInterview as asInterview, type Slot,
} from '@/lib/interviews'
import { tell } from '@/lib/interview-notices'

/**
 * GET  /api/submissions/:id/interviews — the rounds so far
 * POST /api/submissions/:id/interviews — ask for one
 *
 * Both sides read this route. The client sees what they proposed; the
 * supplier sees what they have been asked to confirm. Same rows, and the
 * scoping is the whole security boundary: either party to the
 * submission, and nobody else.
 */

/** Decided, one way or the other. Nothing more is proposed on these. */
const CLOSED = ['PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']

function party(companyId: string, sub: { toCompanyId: string | null; fromCompanyId: string }) {
  if (sub.toCompanyId === companyId) return 'CLIENT' as const
  if (sub.fromCompanyId === companyId) return 'VENDOR' as const
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Interviews')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id

  const submission = await prisma.submission.findFirst({
    where: { id, OR: [{ toCompanyId: companyId }, { fromCompanyId: companyId }] },
    select: {
      id: true, toCompanyId: true, fromCompanyId: true,
      person: { select: { name: true } },
      fromCompany: { select: { name: true } },
      toCompany: { select: { name: true } },
      interviews: { orderBy: { round: 'asc' } },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No submission by that id.' } },
      { status: 404 }
    )
  }

  const now = new Date()
  const names = {
    vendor: submission.fromCompany.name,
    client: submission.toCompany?.name ?? 'the client',
    consultant: submission.person.name,
  }

  return NextResponse.json({
    data: {
      you: party(companyId, submission),
      names,
      rounds: submission.interviews.map((row) => ({
        ...shape(row),
        says: headline(asInterview(row), now, names, caller.person.timezone),
      })),
    },
  })
}

/**
 * POST — ask for an interview.
 *
 * Only the side that received the submission may ask for one. A supplier
 * booking an interview into their client's diary is not a thing that
 * happens, and building it would be building the wrong product.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Interviews')
  if (notStaff) return notStaff

  // Asking for a round is for whoever is hiring — the permission that
  // raises a requisition. Nike's AP clerk is a party to the programme
  // and saw the button; a clerk booking interviews is not a thing that
  // happens, and the refusal says who does.
  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_HIRING',
          message:
            `Setting up an interview is for whoever is hiring at ${caller.company!.name} — ` +
            'a hiring or programme manager.',
        },
      },
      { status: 403 }
    )
  }

  const { id } = await params
  const companyId = caller.company!.id
  const now = new Date()

  const submission = await prisma.submission.findFirst({
    where: { id, toCompanyId: companyId },
    select: {
      id: true, fromCompanyId: true, toCompanyId: true, screenState: true, status: true,
      person: { select: { name: true } },
      interviews: { select: { round: true, state: true, outcome: true } },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No submission by that id.' } },
      { status: 404 }
    )
  }

  // Nobody gets another round once they are out of the running. The
  // list still shows them, and without this the button on a rejected
  // row books a meeting the client has already decided against.
  if (CLOSED.includes(submission.status)) {
    return NextResponse.json(
      {
        error: {
          code: 'SUBMISSION_CLOSED',
          message: `${submission.person.name} is no longer in the running here.`,
        },
      },
      { status: 409 }
    )
  }

  // One round at a time. Two open rounds is two panels asking the same
  // supplier for the same person's time, and neither knows about the
  // other. A round that was called off or missed is not ahead of
  // anybody, so it does not hold the next one up.
  const open = submission.interviews.filter(
    (i) => !i.outcome && (i.state === 'PROPOSED' || i.state === 'CONFIRMED')
  )

  if (open.length > 0) {
    const ahead = Math.max(...open.map((i) => i.round))
    return NextResponse.json(
      {
        error: {
          code: 'ROUND_STILL_OPEN',
          message: `Round ${ahead} is still ahead of you. Record how it went before proposing the next.`,
        },
      },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))

  const slots: Slot[] = (Array.isArray(body?.slots) ? body.slots : [])
    .map((s: any) => ({ start: new Date(s.start), end: new Date(s.end) }))
    .filter((s: Slot) => !isNaN(s.start.getTime()) && !isNaN(s.end.getTime()))

  // A proposal with no future slots is a message, not a booking, and
  // confirming one later produces a meeting nobody attends.
  const usable = slots.filter((s) => stillValid(s, now))

  if (usable.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_SLOTS',
          message:
            slots.length === 0
              ? 'Offer at least one time. Nobody can confirm an interview with no time on it.'
              : 'Every time you offered has already passed.',
          field: 'slots',
        },
      },
      { status: 422 }
    )
  }

  const round = Math.max(0, ...submission.interviews.map((i) => i.round)) + 1

  const created = await prisma.interview.create({
    data: {
      submissionId: submission.id,
      companyId,
      vendorId: submission.fromCompanyId,
      round,
      stage: typeof body?.stage === 'string' ? body.stage : 'TECHNICAL',
      mode: ['PHONE', 'VIDEO', 'ONSITE'].includes(body?.mode) ? body.mode : 'VIDEO',
      proposedSlots: usable.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
      durationMins: Number.isFinite(Number(body?.durationMins)) ? Number(body.durationMins) : 60,
      location: typeof body?.location === 'string' ? body.location : null,
      requestedById: caller.person.id,
      interviewers: Array.isArray(body?.interviewers) ? body.interviewers : [],
      // The side that asked has said yes by asking. Making them confirm
      // their own proposal is a click that teaches people to click.
      clientConfirmedAt: now,
    },
  })

  // Asking for an interview is the client saying this one is live. The
  // status lifecycle has named INTERVIEW since the list was written and
  // nothing ever set it, so every candidate being interviewed still read
  // as "awaiting review" to the supplier watching the same row.
  if (submission.status === 'SUBMITTED' || submission.status === 'SHORTLISTED') {
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: 'INTERVIEW' },
    })
  }

  // The supplier and the consultant have to hear about it, on whichever
  // channel is theirs. Fire-and-forget: a slow bell must not hold up the
  // booking that rang it.
  void tell('PROPOSED', created.id)

  return NextResponse.json({
    data: {
      ...shape(created),
      says:
        `Round ${round} proposed for ${submission.person.name}. ` +
        `Waiting on the supplier and the consultant.`,
    },
  })
}
