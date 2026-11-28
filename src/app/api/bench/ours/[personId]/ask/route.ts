import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { tellThread } from '@/lib/thread-notices'
import type { Participant } from '@/lib/threads'
import { threadTopicId } from '@/lib/internal-moves'
import { seatFacts, refuse, trail, standingRelease, employs, nameOf } from '../../facts'

/**
 * POST /api/bench/ours/:personId/ask   { message }
 *
 * "Ask about Felix": a thread inside the firm with the manager releasing
 * him. A company's own thread, with no other company on it — the rule in
 * lib/threads that a conversation among your own people is the firm's
 * and no supplier or client reads it. One thread per person per firm, so
 * two managers asking about the same engineer read one conversation
 * rather than competing in two.
 *
 * The releasing manager is put on the thread by name and told; whoever
 * asks joins it by writing. Later notes go through the ordinary messages
 * door, which tells everybody on the thread.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)

  const { personId } = await params
  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say what you want to ask.' } }, { status: 422 })
  }

  if (!(await employs(companyId, personId))) {
    return refuse('NOT_FOUND', 'That person is not on your bench.', 404)
  }
  const name = await nameOf(personId)
  const release = await standingRelease(companyId, personId)
  if (!release) {
    await trail(caller, personId, 'RELEASING_SOON_VIEW', 'Asked about somebody nobody is releasing.', false)
    return refuse('NOBODY_RELEASING', `Nobody is releasing ${name}; they are between projects. Reserve them for your position instead.`, 409)
  }
  if (release.releasedById === caller.person.id) {
    return refuse('OWN_PERSON', `You are releasing ${name}. The thread is where other managers ask you.`, 409)
  }
  const releaser = await prisma.person.findUnique({ where: { id: release.releasedById }, select: { id: true, name: true } })

  const topicId = threadTopicId(personId)
  const now = new Date().toISOString()
  const me: Participant = { personId: caller.person.id, name: caller.person.name, companyId, joinedAt: now }
  const them: Participant | null = releaser ? { personId: releaser.id, name: releaser.name, companyId, joinedAt: now } : null

  let thread = await prisma.conversation.findFirst({
    where: { companyId, withCompanyId: null, topic: 'GENERAL', topicId },
    select: { id: true, participants: true },
  })
  let opened = false
  if (!thread) {
    thread = await prisma.conversation.create({
      data: {
        companyId, topic: 'GENERAL', topicId,
        title: `${name} · Our bench`,
        participants: [me, ...(them ? [them] : [])] as unknown as object,
      },
      select: { id: true, participants: true },
    })
    opened = true
  } else if (them) {
    // The releasing manager may have changed since the thread was opened.
    const list = Array.isArray(thread.participants) ? (thread.participants as unknown as Participant[]) : []
    if (!list.some((p) => p.personId === them.personId)) {
      await prisma.conversation.update({ where: { id: thread.id }, data: { participants: [...list, them] as unknown as object } })
    }
  }

  await prisma.message.create({ data: { conversationId: thread.id, authorId: caller.person.id, body: message, type: 'TEXT' } })
  const { heard } = await tellThread({
    conversationId: thread.id,
    author: { personId: caller.person.id, name: caller.person.name, companyId, companyName: caller.company!.name },
    body: message,
  })
  await trail(caller, personId, 'RELEASING_SOON_VIEW', `Asked ${releaser?.name ?? 'the releasing manager'} about them on Our bench.`)

  return NextResponse.json(
    { data: { conversationId: thread.id, topic: 'GENERAL', topicId, opened, heard } },
    { status: opened ? 201 : 200 }
  )
}
