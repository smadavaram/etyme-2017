import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { negotiation, mayMove, messageFor, type Event, type Move } from '@/lib/rate-negotiation'

/**
 * GET  /api/me/submissions/:id/rate — where the rate has got to
 * POST /api/me/submissions/:id/rate — the candidate's move
 *
 * The rate on a submission is set by the vendor, and the person it
 * concerns has had no move at all. They consent to being put forward
 * and then the number attached to them is somebody else's decision.
 *
 * The whole negotiation lives in the conversation on that submission —
 * `Conversation.topic = 'SUBMISSION'`, messages of type
 * `RATE_CONFIRMATION` with the figure in metadata. No new columns, and
 * nothing to keep in step with a summary stored elsewhere.
 *
 * Body: { move: 'OFFER' | 'ACCEPT' | 'DECLINE', cents?: number }
 */

async function load(submissionId: string, personId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true, personId: true, rate: true, status: true, fromCompanyId: true,
      requirement: { select: { title: true } },
      fromCompany: { select: { id: true, name: true } },
    },
  })
  if (!submission) return { error: 'NOT_FOUND' as const }
  if (submission.personId !== personId) return { error: 'FORBIDDEN' as const }

  const thread = await prisma.conversation.findFirst({
    where: { topic: 'SUBMISSION', topicId: submissionId, companyId: submission.fromCompanyId },
    select: { id: true },
  })

  const messages = thread
    ? await prisma.message.findMany({
        where: { conversationId: thread.id, type: 'RATE_CONFIRMATION', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { authorId: true, metadata: true, createdAt: true },
      })
    : []

  // The vendor's original rate is the opening offer, whether or not
  // anybody wrote it into the thread. Ignoring it would show a
  // consultant "no rate proposed" next to a submission that plainly has
  // one.
  const events: Event[] = []
  if (submission.rate > 0) {
    events.push({ at: new Date(0), by: 'VENDOR', move: 'OFFER', cents: submission.rate })
  }
  for (const m of messages) {
    const meta = (m.metadata ?? {}) as any
    const move = String(meta.move ?? '') as Move
    if (move !== 'OFFER' && move !== 'ACCEPT' && move !== 'DECLINE') continue
    events.push({
      at: m.createdAt,
      by: m.authorId === personId ? 'CANDIDATE' : 'VENDOR',
      move,
      cents: typeof meta.cents === 'number' ? meta.cents : null,
    })
  }

  return { submission, threadId: thread?.id ?? null, state: negotiation(events) }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(_req)
  if (error) return error
  const { id } = await params

  const r = await load(id, caller.person.id)
  if ('error' in r) {
    return NextResponse.json(
      { error: { code: r.error, message: r.error === 'NOT_FOUND' ? 'No such submission.' : 'That submission is not yours.' } },
      { status: r.error === 'NOT_FOUND' ? 404 : 403 }
    )
  }

  return NextResponse.json({
    data: {
      submissionId: id,
      role: r.submission.requirement.title,
      withCompany: r.submission.fromCompany.name,
      stage: r.state.stage,
      liveCents: r.state.liveCents,
      offeredBy: r.state.offeredBy,
      awaiting: r.state.awaiting,
      mayCounter: r.state.mayCounter('CANDIDATE'),
      says: r.state.says,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const move = String(body.move ?? '').toUpperCase() as Move

  if (move !== 'OFFER' && move !== 'ACCEPT' && move !== 'DECLINE') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'move must be OFFER, ACCEPT or DECLINE', field: 'move' } },
      { status: 422 }
    )
  }

  const cents = move === 'OFFER' ? Number(body.cents) : null
  if (move === 'OFFER' && (!Number.isFinite(cents) || cents === null || cents <= 0)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A counter needs a rate, in cents per hour.', field: 'cents' } },
      { status: 422 }
    )
  }

  const r = await load(id, caller.person.id)
  if ('error' in r) {
    return NextResponse.json(
      { error: { code: r.error, message: r.error === 'NOT_FOUND' ? 'No such submission.' : 'That submission is not yours.' } },
      { status: r.error === 'NOT_FOUND' ? 404 : 403 }
    )
  }

  const allowed = mayMove(r.state, 'CANDIDATE', move)
  if (!allowed.ok) {
    return NextResponse.json({ error: { code: 'INVALID_STATE', message: allowed.reason } }, { status: 409 })
  }

  // The thread is the record, so it has to exist before there is one.
  const threadId =
    r.threadId ??
    (
      await prisma.conversation.create({
        data: {
          companyId: r.submission.fromCompanyId,
          topic: 'SUBMISSION',
          topicId: id,
          title: `Rate — ${r.submission.requirement.title}`,
          participants: [{ personId: caller.person.id, name: caller.person.name, joinedAt: new Date().toISOString() }],
        },
        select: { id: true },
      })
    ).id

  const event: Event = { at: new Date(), by: 'CANDIDATE', move, cents }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: threadId,
        authorId: caller.person.id,
        type: 'RATE_CONFIRMATION',
        body: messageFor(event, caller.person.name),
        // The figure lives here, and nothing is ever demoted or
        // rewritten — the negotiation stays readable the first time
        // somebody disputes what was agreed.
        metadata: { move, cents },
      },
    }),
    prisma.notification.create({
      data: {
        personId: caller.person.id,
        companyId: r.submission.fromCompanyId,
        type: 'SUBMISSION',
        title: messageFor(event, caller.person.name),
        body: `On ${r.submission.requirement.title}.`,
        entityId: id,
        channel: 'IN_APP',
        status: 'UNREAD',
      },
    }),
  ])

  const after = await load(id, caller.person.id)
  const state = 'error' in after ? r.state : after.state

  return NextResponse.json({
    data: { submissionId: id, stage: state.stage, liveCents: state.liveCents, says: state.says },
  })
}
