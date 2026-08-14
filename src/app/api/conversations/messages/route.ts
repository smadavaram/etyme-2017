import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/conversations/messages?conversationId=xxx
 *
 * Returns messages for a conversation. Paginated, newest first.
 *
 * LEGACY_RULES.md §7.2: Message types:
 *   TEXT · SYSTEM · RATE_CONFIRMATION · INTERVIEW · DOCUMENT_REQUEST
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const conversationId = url.searchParams.get('conversationId')
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
  const before = url.searchParams.get('before') // cursor: createdAt ISO string

  if (!conversationId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'conversationId is required' } },
      { status: 422 }
    )
  }

  // Verify conversation belongs to caller's company
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      companyId: caller.company?.id,
    },
  })

  if (!conversation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Conversation not found' } },
      { status: 404 }
    )
  }

  const where: any = {
    conversationId,
    deletedAt: null,
  }

  if (before) {
    where.createdAt = { lt: new Date(before) }
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Resolve author names from conversation participants and Person table
  const participants = (conversation.participants as any[]) ?? []
  const participantMap = new Map<string, string>()
  for (const p of participants) {
    if (p.personId && p.name) participantMap.set(p.personId, p.name)
  }

  // Look up any authors not in the participant list
  const unknownAuthorIds = messages
    .map((m) => m.authorId)
    .filter((id) => id !== 'SYSTEM' && !participantMap.has(id))

  if (unknownAuthorIds.length > 0) {
    const persons = await prisma.person.findMany({
      where: { id: { in: [...new Set(unknownAuthorIds)] } },
      select: { id: true, name: true },
    })
    for (const p of persons) {
      participantMap.set(p.id, p.name)
    }
  }

  return NextResponse.json({
    data: {
      messages: messages.reverse().map((m) => ({
        id: m.id,
        authorId: m.authorId,
        authorName: m.authorId === 'SYSTEM' ? 'System' : (participantMap.get(m.authorId) ?? null),
        body: m.body,
        type: m.type,
        metadata: m.metadata,
        editedAt: m.editedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore: messages.length === limit,
    },
  })
}

/**
 * POST /api/conversations/messages
 *
 * Send a message to a conversation. Updates the conversation's updatedAt
 * for sorting.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { conversationId, body: messageBody, type = 'TEXT', metadata } = body

  if (!conversationId || !messageBody) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'conversationId and body are required' } },
      { status: 422 }
    )
  }

  // Verify conversation belongs to caller's company
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      companyId: caller.company?.id,
    },
  })

  if (!conversation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Conversation not found' } },
      { status: 404 }
    )
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        authorId: caller.person.id,
        body: messageBody,
        type: type.toUpperCase(),
        metadata: metadata ?? null,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ])

  return NextResponse.json(
    {
      data: {
        message: {
          id: message.id,
          authorId: message.authorId,
          body: message.body,
          type: message.type,
          createdAt: message.createdAt.toISOString(),
        },
      },
    },
    { status: 201 }
  )
}
