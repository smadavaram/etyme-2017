import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { prisma } from '@/lib/db'

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
 * Returns conversations scoped to the caller's company, with the latest
 * message preview and participant list.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const topic = url.searchParams.get('topic')
  const topicId = url.searchParams.get('topicId')
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10)))

  const where: any = {
    archivedAt: null,
  }

  if (caller.company) {
    where.companyId = caller.company.id
  }

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
      conversations: conversations.map((c) => ({
        id: c.id,
        topic: c.topic,
        topicId: c.topicId,
        title: c.title,
        participants: c.participants,
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
      })),
    },
  })
}

/**
 * POST /api/conversations
 *
 * Create a new conversation thread. Typically auto-created when a requirement,
 * contract, or submission is created — but can be created manually for direct
 * messages.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { topic = 'GENERAL', topicId, title, participants, initialMessage } = body

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const validTopics = ['GENERAL', 'REQUIREMENT', 'CONTRACT', 'SUBMISSION', 'DOCUMENT', 'INVOICE', 'EXPENSE', 'DIRECT']
  if (!validTopics.includes(topic.toUpperCase())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `topic must be one of: ${validTopics.join(', ')}` } },
      { status: 422 }
    )
  }

  // For entity-linked topics, check if a conversation already exists
  if (topicId && topic !== 'GENERAL' && topic !== 'DIRECT') {
    const existing = await prisma.conversation.findUnique({
      where: {
        companyId_topic_topicId: {
          companyId: caller.company.id,
          topic: topic.toUpperCase(),
          topicId,
        },
      },
    })
    if (existing) {
      return NextResponse.json({
        data: { conversation: { id: existing.id, existing: true } },
      })
    }
  }

  // Build participant list — always include the creator
  const participantList = Array.isArray(participants)
    ? participants
    : [{ personId: caller.person.id, name: caller.person.name, joinedAt: new Date().toISOString() }]

  // Ensure creator is in the list
  if (!participantList.some((p: any) => p.personId === caller.person.id)) {
    participantList.unshift({
      personId: caller.person.id,
      name: caller.person.name,
      joinedAt: new Date().toISOString(),
    })
  }

  const conversation = await prisma.conversation.create({
    data: {
      companyId: caller.company.id,
      topic: topic.toUpperCase(),
      topicId: topicId ?? null,
      title: title ?? null,
      participants: participantList,
    },
  })

  // Create initial message if provided
  if (initialMessage) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorId: caller.person.id,
        body: initialMessage,
        type: 'TEXT',
      },
    })
  }

  return NextResponse.json(
    { data: { conversation: { id: conversation.id, existing: false } } },
    { status: 201 }
  )
}
