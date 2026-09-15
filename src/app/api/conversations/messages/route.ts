import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { canRead, type Participant } from '@/lib/threads'
import { tellThread } from '@/lib/thread-notices'

/**
 * Who may read a thread: both companies on it, and nobody else. A
 * consultant on a bench sees only the threads they are in.
 *
 * Returns the row, or a refusal. The refusal is a 404 rather than a 403:
 * a thread that is not yours is not yours to know exists.
 */
async function open(request: NextRequest, conversationId: string) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { ok: false as const, error }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      company: { select: { id: true, name: true } },
      withCompany: { select: { id: true, name: true } },
    },
  })

  const participants: Participant[] = Array.isArray(conversation?.participants)
    ? (conversation!.participants as unknown as Participant[])
    : []
  const inIt = participants.some((p) => p.personId === caller.person.id)

  if (
    !conversation ||
    !canRead(conversation, caller.company?.id) ||
    (isConsultantSeat(caller) && !inIt)
  ) {
    return {
      ok: false as const,
      error: NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'That conversation is not here.' } },
        { status: 404 }
      ),
    }
  }
  return { ok: true as const, caller, conversation, participants }
}

/**
 * GET /api/conversations/messages?conversationId=xxx
 *
 * Returns messages for a conversation. Paginated, newest first.
 *
 * LEGACY_RULES.md §7.2: Message types:
 *   TEXT · SYSTEM · RATE_CONFIRMATION · INTERVIEW · DOCUMENT_REQUEST
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const opened = await open(request, conversationId)
  if (!opened.ok) return opened.error
  const { conversation, participants } = opened

  const where: any = { conversationId, deletedAt: null }
  if (before) where.createdAt = { lt: new Date(before) }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Resolve author names from conversation participants and Person table
  const participantMap = new Map<string, string>()
  const participantFirm = new Map<string, string | null>()
  for (const p of participants) {
    if (p.personId && p.name) participantMap.set(p.personId, p.name)
    participantFirm.set(p.personId, p.companyId ?? null)
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
    for (const p of persons) participantMap.set(p.id, p.name)
  }

  // Which firm each author writes for, so a thread across a deal can say
  // "Dana at Nike" and "Ravi at Pinnacle" without the reader guessing.
  const firmName = (companyId: string | null | undefined) =>
    companyId === conversation.company.id
      ? conversation.company.name
      : companyId && companyId === conversation.withCompany?.id
        ? conversation.withCompany.name
        : null

  return NextResponse.json({
    data: {
      thread: {
        id: conversation.id,
        title: conversation.title,
        topic: conversation.topic,
        topicId: conversation.topicId,
        company: conversation.company,
        withCompany: conversation.withCompany,
      },
      messages: messages.reverse().map((m) => ({
        id: m.id,
        authorId: m.authorId,
        authorName: m.authorId === 'SYSTEM' ? 'System' : (participantMap.get(m.authorId) ?? null),
        authorCompany: m.authorId === 'SYSTEM' ? null : firmName(participantFirm.get(m.authorId)),
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
 * Write on a thread. Either company on it may; the writer joins the
 * thread by writing, and everybody else on it — or, for a first note
 * across, the other firm's staff — is told (lib/threads, `whoHears`).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}))
  const { conversationId, body: messageBody, type = 'TEXT', metadata } = body

  if (!conversationId || typeof messageBody !== 'string' || !messageBody.trim()) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'conversationId and body are required' } },
      { status: 422 }
    )
  }

  const opened = await open(request, conversationId)
  if (!opened.ok) return opened.error
  const { caller, conversation } = opened

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        authorId: caller.person.id,
        body: messageBody.trim(),
        type: String(type).toUpperCase(),
        metadata: metadata ?? null,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ])

  if (caller.company) {
    void tellThread({
      conversationId: conversation.id,
      author: {
        personId: caller.person.id,
        name: caller.person.name,
        companyId: caller.company.id,
        companyName: caller.company.name,
      },
      body: message.body,
    })
  }

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
