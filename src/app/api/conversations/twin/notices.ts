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
import { NOTICES_SHOWN, type NoticeLine } from './ask'

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

/** The newest unread notices for this seat, at most NOTICES_SHOWN, and how many older ones wait. */
export async function unreadNotices(caller: CallerContext): Promise<{ shown: NoticeLine[]; older: number }> {
  const where = unreadWhere(caller)
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: NOTICES_SHOWN,
      select: { id: true, type: true, title: true, entityId: true, data: true },
    }),
    prisma.notification.count({ where }),
  ])
  return {
    shown: rows.map((n) => ({ id: n.id, title: n.title, href: pageOf(n.type, n.entityId, asRecord(n.data)) })),
    older: Math.max(0, total - rows.length),
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
