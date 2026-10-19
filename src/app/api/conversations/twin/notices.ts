/**
 * "Since you last looked": the notices the Notifications page used to
 * list, read for Ask Etyme's greeting and marked read once it is served
 * (CLAUDE.md, "Notifications are deleted; Ask Etyme carries the
 * number", 2026-10-13). The rows are the page's own rows — this person's
 * notices, unread, the account's own sign-up and reset mail left out
 * (`bellShows`) — so nothing the page said is dropped and nothing new is
 * counted. Email and Teams still carry each notice as before; only the
 * in-app list moved.
 *
 * The one write in Ask Etyme's greeting is here, and it is the reader's
 * own: a notice shown is marked read, and only a notice shown, so a
 * notice the greeting had no room for is never lost.
 */

import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { bellShows } from '@/lib/notify/account-mail'
import { pageOf } from '@/lib/notify'
import { NOTICES_SHOWN, THREADS_SHOWN, type NoticeLine, type ThreadNote } from './ask'

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/**
 * Where a notice applies. A notice written at another of this person's
 * companies waits for that seat, because its link opens that company's
 * book; a notice tied to no company is the person's own and shows at any.
 */
function unreadWhere(caller: CallerContext) {
  return {
    personId: caller.person.id,
    status: 'UNREAD',
    ...(caller.company ? { OR: [{ companyId: caller.company.id }, { companyId: null }] } : {}),
    ...bellShows(),
  }
}

/**
 * The newest unread notices for this seat, at most NOTICES_SHOWN, and how
 * many older ones wait. A note on a conversation is not among them: the
 * greeting says those as the conversation they are on (`unreadThreads`).
 * Each comes with its body and, for a date coming due, the cycle and the
 * day, so the greeting can say who and what rather than the title.
 */
export async function unreadNotices(caller: CallerContext): Promise<{ shown: NoticeLine[]; older: number }> {
  const where = { ...unreadWhere(caller), type: { not: 'CONVERSATION' } }
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: NOTICES_SHOWN,
      select: { id: true, type: true, title: true, body: true, entityId: true, data: true },
    }),
    prisma.notification.count({ where }),
  ])
  return {
    shown: rows.map((n) => {
      const data = asRecord(n.data)
      return {
        id: n.id, title: n.title, href: pageOf(n.type, n.entityId, data),
        type: n.type, body: typeof n.body === 'string' ? n.body : null,
        cycleKind: typeof data?.kind === 'string' ? data.kind : null,
        dueOn: typeof data?.dueOn === 'string' ? data.dueOn : null,
      }
    }),
    older: Math.max(0, total - rows.length),
  }
}

/** What a thread is about, in the trade's words: "the HCM integration lead job". */
async function aboutOf(t: { topic: string; topicId: string | null; title: string | null }): Promise<string | null> {
  if (t.topic === 'REQUIREMENT' && t.topicId) {
    const r = await prisma.requirement.findUnique({ where: { id: t.topicId }, select: { title: true } })
    if (r?.title) return `the ${r.title} job`
  }
  if (t.topic === 'SUBMISSION' && t.topicId) {
    const s = await prisma.submission.findUnique({ where: { id: t.topicId }, select: { person: { select: { name: true } }, requirement: { select: { title: true } } } })
    if (s) return `${s.person.name} for the ${s.requirement.title} job`
  }
  return t.title?.trim() ? t.title.trim() : null
}

/**
 * The conversations somebody wrote on since this seat last looked: the
 * threads its unread notes are on, read from the same rows the
 * Conversations page lists (its company's own, and the ones another
 * company opened with it). One per thread, newest first, at most
 * THREADS_SHOWN named; `more` is how many others have a new message, and
 * `noticeIds` are the notes for the threads named, which the greeting
 * marks read once it has said them. Who wrote is the firm on the far end,
 * a candidate by name, or a colleague by name.
 */
export async function unreadThreads(caller: CallerContext): Promise<{ shown: ThreadNote[]; more: number; noticeIds: string[] }> {
  const notes = await prisma.notification.findMany({
    where: { ...unreadWhere(caller), type: 'CONVERSATION' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, entityId: true, data: true },
  })
  if (notes.length === 0) return { shown: [], more: 0, noticeIds: [] }
  const threadOf = (n: { entityId: string | null; data: unknown }) => {
    const d = asRecord(n.data)
    return typeof d?.conversationId === 'string' ? d.conversationId : n.entityId
  }
  const order = [...new Set(notes.map(threadOf).filter((x): x is string => !!x))]
  const me = caller.company?.id ?? null
  const threads = await prisma.conversation.findMany({
    where: { id: { in: order }, archivedAt: null, ...(me ? { OR: [{ companyId: me }, { withCompanyId: me }] } : {}) },
    select: {
      id: true, topic: true, topicId: true, title: true, companyId: true, withCompanyId: true, participants: true,
      company: { select: { name: true } }, withCompany: { select: { name: true } },
      messages: { where: { deletedAt: null, authorId: { not: caller.person.id } }, orderBy: { createdAt: 'desc' }, take: 1, select: { authorId: true } },
    },
  })
  const byId = new Map(threads.map((t) => [t.id, t]))
  const live = order.filter((id) => byId.has(id) && byId.get(id)!.messages.length > 0)
  const named = live.slice(0, THREADS_SHOWN)
  // Who wrote last, read off the seats: staff at the far firm, staff here, or neither (a candidate).
  const authors = [...new Set(named.map((id) => byId.get(id)!.messages[0].authorId))]
  const seats = authors.length
    ? await prisma.context.findMany({
        where: { personId: { in: authors }, revokedAt: null },
        select: { personId: true, companyId: true, type: true, person: { select: { name: true } } },
      })
    : []
  const shown: ThreadNote[] = []
  for (const id of named) {
    const t = byId.get(id)!
    const author = t.messages[0].authorId
    const theirs = seats.filter((s) => s.personId === author && s.type !== 'CONSULTANT')
    const participants = Array.isArray(t.participants) ? (t.participants as Array<{ personId?: string; name?: string }>) : []
    const name = seats.find((s) => s.personId === author)?.person.name ?? participants.find((p) => p.personId === author)?.name ?? 'Somebody'
    const far = me && t.companyId === me ? t.withCompanyId : t.companyId
    const farName = far === t.companyId ? t.company.name : t.withCompany?.name ?? null
    const who: Pick<ThreadNote, 'who' | 'whoKind'> = far && farName && theirs.some((s) => s.companyId === far)
      ? { who: farName, whoKind: 'FIRM' }
      : me && theirs.some((s) => s.companyId === me)
        ? { who: name, whoKind: 'COLLEAGUE' }
        : { who: name, whoKind: 'CANDIDATE' }
    shown.push({ conversationId: id, ...who, about: await aboutOf(t), href: `/dashboard/conversations?open=${id}` })
  }
  const said = new Set(named)
  return {
    shown,
    more: Math.max(0, live.length - named.length),
    noticeIds: notes.filter((n) => said.has(threadOf(n) ?? '')).map((n) => n.id),
  }
}

/**
 * Marks read exactly the notices the greeting said, and only this
 * person's, still unread. Never throws: a greeting already served is not
 * taken back because the mark failed; the notice shows once more.
 */
export async function markNoticesSeen(caller: CallerContext, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  try {
    const res = await prisma.notification.updateMany({
      where: { id: { in: [...ids] }, personId: caller.person.id, status: 'UNREAD' },
      data: { status: 'READ', readAt: new Date() },
    })
    return res.count
  } catch {
    return 0
  }
}
