import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { whoMayOpen, sideOf, type TopicFacts, type Participant } from '@/lib/threads'
import { tellThread } from '@/lib/thread-notices'

/**
 * GET /api/conversations
 *
 * BUILD.md §6.1: "2017 auto-created a thread per job, per contract and
 * per document request. It is the connective tissue and its absence will
 * be felt immediately."
 *
 * LEGACY_RULES.md §7.1: Ten topic types. Consolidated to:
 *   GENERAL · REQUIREMENT · CONTRACT · SUBMISSION · DOCUMENT · INVOICE · EXPENSE · DIRECT
 *
 * Two kinds of thread come back, and the row says which:
 *
 *   - a company's own — `withCompany` null; its people only
 *   - one across a deal — opened by the demand side with one supplier
 *     (`withCompany`), read from both sides and nowhere else
 *
 * `side` says which end of an across-thread the reader is on: OPENED
 * (they started it) or ANSWERS (they were written to). The rule for who
 * may open one is lib/threads and is enforced in POST below.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const topic = url.searchParams.get('topic')
  const topicId = url.searchParams.get('topicId')
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10)))

  const me = caller.company?.id ?? null
  const where: any = { archivedAt: null }

  // Mine, and the ones somebody opened with me.
  if (me) where.OR = [{ companyId: me }, { withCompanyId: me }]

  if (topic) where.topic = topic.toUpperCase()
  if (topicId) where.topicId = topicId

  // A consultant is in some of the agency's threads and in none of the
  // rest. Participants live in a JSON column, so the narrowing happens in
  // code — the row count on one company's threads is small, and a wrong
  // JSON path predicate that silently matches nothing is worse than a
  // filter you can read.
  const onlyMine = isConsultantSeat(caller)

  const conversations = (await prisma.conversation.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      withCompany: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        where: { deletedAt: null },
      },
      _count: {
        select: { messages: { where: { deletedAt: null } } },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })).filter((c) => {
    if (!onlyMine) return true
    const people = Array.isArray(c.participants) ? (c.participants as any[]) : []
    return people.some((p) => p?.personId === caller.person.id)
  })

  return NextResponse.json({
    data: {
      conversations: conversations.map((c) => {
        const side = sideOf(c, me)
        return {
          id: c.id,
          topic: c.topic,
          topicId: c.topicId,
          title: c.title,
          participants: c.participants,
          withCompany: c.withCompany,
          side,
          /** The firm on the far end, from where the reader sits. Null on a company's own thread. */
          otherCompany: side === 'OPENED' ? c.withCompany : side === 'ANSWERS' ? c.company : null,
          messageCount: c._count.messages,
          lastMessage: c.messages[0]
            ? {
                id: c.messages[0].id,
                authorId: c.messages[0].authorId,
                body: c.messages[0].body.slice(0, 120),
                type: c.messages[0].type,
                createdAt: c.messages[0].createdAt.toISOString(),
              }
            : null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        }
      }),
    },
  })
}

const VALID_TOPICS = ['GENERAL', 'REQUIREMENT', 'CONTRACT', 'SUBMISSION', 'DOCUMENT', 'INVOICE', 'EXPENSE', 'DIRECT']

/** The facts the rule needs about a role or a candidate, from the row itself. */
async function loadFacts(topic: string, topicId: string): Promise<TopicFacts | null> {
  if (topic === 'REQUIREMENT') {
    const r = await prisma.requirement.findUnique({
      where: { id: topicId },
      select: {
        id: true, title: true, companyId: true, payerCompanyId: true, clearedSupplierIds: true,
        invitations: { select: { toCompanyId: true } },
        submissions: { select: { fromCompanyId: true } },
      },
    })
    if (!r) return null
    return {
      kind: 'REQUIREMENT',
      id: r.id,
      title: r.title,
      demandCompanyId: r.payerCompanyId ?? r.companyId,
      supplierIds: [
        ...new Set([
          ...r.invitations.map((i) => i.toCompanyId),
          ...r.submissions.map((s) => s.fromCompanyId),
          ...(r.clearedSupplierIds ?? []),
        ]),
      ],
    }
  }
  if (topic === 'SUBMISSION') {
    const s = await prisma.submission.findUnique({
      where: { id: topicId },
      select: {
        id: true, toCompanyId: true, fromCompanyId: true,
        fromCompany: { select: { name: true } },
        person: { select: { name: true } },
        requirement: { select: { title: true } },
      },
    })
    if (!s) return null
    return {
      kind: 'SUBMISSION',
      id: s.id,
      roleTitle: s.requirement.title,
      candidateName: s.person.name,
      toCompanyId: s.toCompanyId,
      fromCompanyId: s.fromCompanyId,
      fromCompanyName: s.fromCompany.name,
    }
  }
  return null
}

/**
 * POST /api/conversations
 *
 *   { topic, topicId?, title?, initialMessage?, withCompanyId?, participantIds? }
 *
 * Two things this makes.
 *
 * A company's own thread — no `withCompanyId`. Notes among its own
 * people on a role, a contract, anything. Create-or-get: one per topic
 * per company, and the route hands back the existing one so two people
 * typing at once do not make two.
 *
 * A thread across a deal — `withCompanyId` names the other firm. Only
 * the demand side may open one, only about a role or a candidate, and
 * only with a firm that is on that deal. The rule and its sentences are
 * lib/threads; a supplier trying to start one is told to submit instead.
 *
 * `participantIds`, where given, must hold a live seat at the caller's
 * company — this used to take any list of names and ids and write it
 * down as read, which is a way to put words in a stranger's mouth.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { topicId, title, initialMessage, withCompanyId, participantIds } = body
  const topic = String(body.topic ?? 'GENERAL').toUpperCase()

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'A conversation belongs to a company. Join one first.' } },
      { status: 403 }
    )
  }

  if (!VALID_TOPICS.includes(topic)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `topic must be one of: ${VALID_TOPICS.join(', ')}` } },
      { status: 422 }
    )
  }

  const me = { id: caller.company.id, name: caller.company.name }
  const now = new Date().toISOString()
  const opener: Participant = { personId: caller.person.id, name: caller.person.name, companyId: me.id, joinedAt: now }

  // ── Across a deal ────────────────────────────────────────────────────
  if (typeof withCompanyId === 'string' && withCompanyId) {
    if (isConsultantSeat(caller)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Speaking for a company to another company is for its staff.' } },
        { status: 403 }
      )
    }
    if ((topic !== 'REQUIREMENT' && topic !== 'SUBMISSION') || typeof topicId !== 'string' || !topicId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'A conversation with another company is about a role or a candidate. Open it from there.',
          },
        },
        { status: 422 }
      )
    }

    const [facts, other] = await Promise.all([
      loadFacts(topic, topicId),
      prisma.company.findUnique({ where: { id: withCompanyId }, select: { id: true, name: true } }),
    ])
    if (!facts) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'That role or candidate is not here any more.' } },
        { status: 404 }
      )
    }
    if (!other) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That company is not here.' } }, { status: 404 })
    }

    const verdict = whoMayOpen(facts, me, other)
    if (!verdict.ok) {
      return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 403 })
    }

    // Create-or-get on the four-part key. The unique index catches the
    // race; the second reader gets the first one's thread.
    let thread = await prisma.conversation.findFirst({
      where: { companyId: me.id, withCompanyId: other.id, topic, topicId },
      select: { id: true },
    })
    let existing = true
    if (!thread) {
      try {
        thread = await prisma.conversation.create({
          data: {
            companyId: me.id,
            withCompanyId: other.id,
            topic,
            topicId,
            title: verdict.title,
            participants: [opener] as unknown as object,
          },
          select: { id: true },
        })
        existing = false
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e
        thread = await prisma.conversation.findFirstOrThrow({
          where: { companyId: me.id, withCompanyId: other.id, topic, topicId },
          select: { id: true },
        })
      }
    }

    if (typeof initialMessage === 'string' && initialMessage.trim()) {
      await prisma.message.create({
        data: { conversationId: thread.id, authorId: caller.person.id, body: initialMessage.trim(), type: 'TEXT' },
      })
      void tellThread({
        conversationId: thread.id,
        author: { personId: caller.person.id, name: caller.person.name, companyId: me.id, companyName: me.name },
        body: initialMessage.trim(),
      })
    }

    return NextResponse.json(
      { data: { conversation: { id: thread.id, existing, withCompany: other, title: verdict.title } } },
      { status: existing ? 200 : 201 }
    )
  }

  // ── The company's own ────────────────────────────────────────────────
  if (topicId && topic !== 'GENERAL' && topic !== 'DIRECT') {
    const found = await prisma.conversation.findFirst({
      where: { companyId: me.id, withCompanyId: null, topic, topicId },
      select: { id: true },
    })
    if (found) {
      return NextResponse.json({ data: { conversation: { id: found.id, existing: true } } })
    }
  }

  // Whoever was asked in, if they actually sit here. Names come from the
  // seat, never from the request.
  const askedIds: string[] = Array.isArray(participantIds)
    ? participantIds.filter((x: unknown) => typeof x === 'string')
    : Array.isArray(body.participants)
      ? body.participants.map((p: any) => p?.personId).filter((x: unknown) => typeof x === 'string')
      : []
  const seated = askedIds.length
    ? await prisma.context.findMany({
        where: { companyId: me.id, revokedAt: null, personId: { in: askedIds } },
        select: { person: { select: { id: true, name: true } } },
      })
    : []
  const participantList: Participant[] = [opener]
  for (const s of seated) {
    if (!participantList.some((p) => p.personId === s.person.id)) {
      participantList.push({ personId: s.person.id, name: s.person.name, companyId: me.id, joinedAt: now })
    }
  }

  const conversation = await prisma.conversation.create({
    data: {
      companyId: me.id,
      topic,
      topicId: typeof topicId === 'string' ? topicId : null,
      title: typeof title === 'string' && title.trim() ? title.trim() : null,
      participants: participantList as unknown as object,
    },
  })

  if (typeof initialMessage === 'string' && initialMessage.trim()) {
    await prisma.message.create({
      data: { conversationId: conversation.id, authorId: caller.person.id, body: initialMessage.trim(), type: 'TEXT' },
    })
    void tellThread({
      conversationId: conversation.id,
      author: { personId: caller.person.id, name: caller.person.name, companyId: me.id, companyName: me.name },
      body: initialMessage.trim(),
    })
  }

  return NextResponse.json(
    { data: { conversation: { id: conversation.id, existing: false } } },
    { status: 201 }
  )
}
