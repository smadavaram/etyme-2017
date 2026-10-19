/**
 * Telling people a note was written on a thread.
 *
 * The decision of who hears is lib/threads (`whoHears`) and is tested
 * there. This is the part that touches the database: it finds the other
 * company's staff for a first note across, writes the author onto the
 * thread, and rings the bell. Fire-and-forget from the route, like every
 * other notice in the building.
 */

import { prisma } from '@/lib/db'
import { notifyBulk } from '@/lib/notify'
import { messageNotice, whoAtTheFirmHears, whoHears, withAuthor, type Participant } from '@/lib/threads'

/**
 * Staff at a company, most senior seat first, for a note that has nobody
 * there to land on yet. Who among them hears is `whoAtTheFirmHears` in
 * lib/threads: on the side written to, only the desks that work the
 * thread's topic; on the side that opened it, any seat with a desk
 * (`hearsForTheFirm`). A colleague with no desk is told nothing.
 */
async function staffAt(
  companyId: string,
  rule: { topic: string | null; answers: boolean },
): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, NOT: { roleId: null }, type: { not: 'CONSULTANT' } },
    orderBy: { grantedAt: 'asc' },
    take: 200,
    select: { personId: true, role: { select: { permissions: true } } },
  })
  return whoAtTheFirmHears(
    seats.map((s) => ({ personId: s.personId, permissions: (s.role?.permissions as string[] | undefined) ?? [] })),
    rule,
  )
}

export async function tellThread(input: {
  conversationId: string
  author: { personId: string; name: string; companyId: string; companyName: string }
  body: string
}): Promise<{ heard: string[] }> {
  const thread = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, companyId: true, withCompanyId: true, topic: true, title: true, participants: true },
  })
  if (!thread) return { heard: [] }

  const participants = Array.isArray(thread.participants) ? (thread.participants as unknown as Participant[]) : []

  const otherCompanyId =
    thread.companyId === input.author.companyId ? thread.withCompanyId : thread.companyId
  const otherSideStaffIds = otherCompanyId
    ? await staffAt(otherCompanyId, {
        topic: thread.topic,
        answers: otherCompanyId === thread.withCompanyId,
      })
    : []

  const heard = whoHears({
    authorId: input.author.personId,
    authorCompanyId: input.author.companyId,
    participants,
    otherSideStaffIds,
  })

  // The author joins the thread by writing on it.
  const joined = withAuthor(participants, {
    personId: input.author.personId,
    name: input.author.name,
    companyId: input.author.companyId,
  })
  if (joined !== participants) {
    await prisma.conversation.update({
      where: { id: thread.id },
      data: { participants: joined as unknown as object },
    })
  }

  if (heard.length > 0) {
    const notice = messageNotice({
      author: { name: input.author.name, companyName: input.author.companyName },
      threadTitle: thread.title,
      body: input.body,
    })
    await notifyBulk(
      heard.map((personId) => ({
        personId,
        type: 'CONVERSATION' as const,
        title: notice.title,
        body: notice.body,
        // The thread itself: the bell opens it directly.
        entityId: thread.id,
        data: { conversationId: thread.id, href: `/dashboard/conversations?open=${thread.id}` },
      }))
    )
  }

  return { heard }
}
