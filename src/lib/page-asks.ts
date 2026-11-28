/**
 * A question asked on a firm's public page, kept where the firm can find it.
 *
 * Record 102, item 1 (the tester's list, 2026-11-18): "A public Ask on a
 * firm's page says 'waiting for them on Etyme', and then appears nowhere in
 * the tenant." The public route wrote a notice for each of up to five seats
 * and nothing listed those notices once the greeting had shown them. A real
 * person's question was lost to view.
 *
 * So a question is one record, `PageAsk`, at the firm that was asked. It is
 * listed and searched here, taken by one seat, marked answered and closed.
 * The notices stay as the way a seat is told; this is the way it is found.
 *
 * Who reads and acts: the seats the public route tells, those that put
 * people forward (`submissions.create`, which the Owner holds as `*`). A
 * seat at another firm never reads one, and is refused in a sentence with
 * the refusal written before it is sent.
 *
 * The asker is not a person on Etyme: a name, an address to reply to and
 * the words. That is personal data, so it is kept for the firm's own seats
 * only, never listed to Etyme, and never read across firms.
 *
 * What the public route calls: `writePageAsk`, once per submission, before
 * it writes the per-seat notices (market's file, follows this one).
 *
 * Owned by etyme-architect (`lib/page-asks` in `lib/domains.ts`).
 */
import type { PrismaClient, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hasAnyPermission } from '@/lib/permissions'
import type { AccessAction } from '@/lib/access-log'

/** The name an access-log row carries for a read of the firm's questions. Regulatory adds it to `AccessAction`; until then it is named here. */
export const PAGE_ASK_ACTION = 'PAGE_ASK_VIEW' as AccessAction

/** The decision card's type, read by Today and Ask Etyme. */
export const PAGE_ASK = 'PAGE_ASK'

/** The permission that puts people forward: the seats the public route tells. */
const MAY_ANSWER = ['submissions.create'] as const

/** Whether a seat may read and act on the firm's public-page questions. The Owner holds every permission. */
export function mayAnswerPageAsks(permissions: readonly string[]): boolean {
  return hasAnyPermission(permissions, MAY_ANSWER)
}

export const NOT_YOURS_TO_READ =
  'Questions asked on a firm’s page are read by the people there who put candidates forward. Ask the Owner to give you that role.'
export const NO_SUCH_QUESTION = 'That question is not on your firm’s page.'

export type PageAskState = 'OPEN' | 'ANSWERED' | 'CLOSED'

type Db = Pick<PrismaClient, 'pageAsk' | 'context' | 'person'> | Prisma.TransactionClient

export interface PageAskInput {
  companyId: string
  asked: string
  replyTo: string
  name?: string | null
  companyName?: string | null
}

/** One submission is one record, however many seats are told. Returns its id. */
export async function writePageAsk(input: PageAskInput, db: Db = prisma): Promise<{ id: string }> {
  return (db as PrismaClient).pageAsk.create({
    data: {
      companyId: input.companyId,
      asked: input.asked.trim(),
      replyTo: input.replyTo.trim().toLowerCase(),
      name: input.name?.trim() || null,
      companyName: input.companyName?.trim() || null,
    },
    select: { id: true },
  })
}

const SELECT = {
  id: true, companyId: true, asked: true, replyTo: true, name: true, companyName: true, status: true,
  assigneePersonId: true, assignee: { select: { name: true } }, assignedAt: true, answeredAt: true,
  closedAt: true, createdAt: true,
} as const

export interface PageAskRow {
  id: string
  asked: string
  replyTo: string
  name: string | null
  companyName: string | null
  status: PageAskState
  assigneePersonId: string | null
  assigneeName: string | null
  assignedAt: string | null
  answeredAt: string | null
  closedAt: string | null
  createdAt: string
}

function rowOf(r: {
  id: string; asked: string; replyTo: string; name: string | null; companyName: string | null; status: string
  assigneePersonId: string | null; assignee: { name: string } | null; assignedAt: Date | null
  answeredAt: Date | null; closedAt: Date | null; createdAt: Date
}): PageAskRow {
  return {
    id: r.id, asked: r.asked, replyTo: r.replyTo, name: r.name, companyName: r.companyName,
    status: r.status as PageAskState,
    assigneePersonId: r.assigneePersonId, assigneeName: r.assignee?.name ?? null,
    assignedAt: r.assignedAt?.toISOString() ?? null, answeredAt: r.answeredAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
  }
}

/**
 * The firm's questions, newest first. `q` finds the words, the asker's
 * name, her company and her address, whatever the case. Always scoped to
 * the firm named: the caller passes its own company, never one from a body.
 */
export async function listPageAsks(
  companyId: string,
  opts: { status?: PageAskState | null; q?: string | null; take?: number } = {},
  db: Db = prisma
): Promise<PageAskRow[]> {
  const q = opts.q?.trim()
  const rows = await (db as PrismaClient).pageAsk.findMany({
    where: {
      companyId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(q
        ? {
            OR: [
              { asked: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
              { companyName: { contains: q, mode: 'insensitive' as const } },
              { replyTo: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: SELECT,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(opts.take ?? 100, 1), 200),
  })
  return rows.map(rowOf)
}

/** One question of this firm's, or null where it is not this firm's. */
export async function readPageAsk(id: string, companyId: string, db: Db = prisma): Promise<PageAskRow | null> {
  const r = await (db as PrismaClient).pageAsk.findFirst({ where: { id, companyId }, select: SELECT })
  return r ? rowOf(r) : null
}

/** The firm a question belongs to, whoever asks: how a refusal names whose it was. Null where there is none. */
export async function firmOfPageAsk(id: string, db: Db = prisma): Promise<string | null> {
  const r = await (db as PrismaClient).pageAsk.findUnique({ where: { id }, select: { companyId: true } })
  return r?.companyId ?? null
}

export type ActResult = { ok: true; ask: PageAskRow; says: string } | { ok: false; status: 404 | 409 | 422; says: string }

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

/**
 * Take a question, or hand it to somebody who may answer it. A seat takes
 * an unassigned one for itself; moving one somebody holds names the new
 * holder, who must hold a live seat here that puts people forward.
 */
export async function assignPageAsk(
  id: string,
  companyId: string,
  actorPersonId: string,
  assigneePersonId: string | null = null,
  db: Db = prisma,
  now: Date = new Date()
): Promise<ActResult> {
  const client = db as PrismaClient
  const ask = await readPageAsk(id, companyId, db)
  if (!ask) return { ok: false, status: 404, says: NO_SUCH_QUESTION }
  if (ask.status === 'CLOSED') return { ok: false, status: 409, says: 'That question is closed. Nothing more to assign.' }

  const to = assigneePersonId ?? actorPersonId
  const explicit = assigneePersonId != null && assigneePersonId !== actorPersonId
  if (ask.assigneePersonId && ask.assigneePersonId !== actorPersonId && !explicit) {
    return {
      ok: false, status: 409,
      says: `${firstName(ask.assigneeName ?? 'Somebody')} already has this question. Name who should have it instead if it is moving.`,
    }
  }
  if (explicit) {
    const seat = await client.context.findFirst({
      where: {
        personId: to, companyId, revokedAt: null, suspendedAt: null,
        role: { permissions: { hasSome: ['submissions.create', '*'] } },
      },
      select: { id: true },
    })
    if (!seat) return { ok: false, status: 422, says: 'That person does not hold a role here that puts candidates forward, so the question cannot go to them.' }
  }
  // Taking an unassigned question is one conditional write, so two seats pressing at once leave one holder.
  const took = ask.assigneePersonId
    ? await client.pageAsk.updateMany({ where: { id, companyId, status: { not: 'CLOSED' } }, data: { assigneePersonId: to, assignedAt: now } })
    : await client.pageAsk.updateMany({ where: { id, companyId, assigneePersonId: null, status: { not: 'CLOSED' } }, data: { assigneePersonId: to, assignedAt: now } })
  if (took.count === 0) {
    return { ok: false, status: 409, says: 'Somebody took that question a moment ago. Open the list to see who has it.' }
  }
  const after = (await readPageAsk(id, companyId, db))!
  return { ok: true, ask: after, says: to === actorPersonId ? 'Yours now. Reply to the address on it.' : `Given to ${after.assigneeName ?? 'them'}.` }
}

/** The question was answered, by mail or by phone, outside Etyme. Whoever marks it holds it if nobody did. */
export async function markPageAskAnswered(
  id: string, companyId: string, actorPersonId: string, db: Db = prisma, now: Date = new Date()
): Promise<ActResult> {
  const client = db as PrismaClient
  const ask = await readPageAsk(id, companyId, db)
  if (!ask) return { ok: false, status: 404, says: NO_SUCH_QUESTION }
  if (ask.status === 'CLOSED') return { ok: false, status: 409, says: 'That question is closed.' }
  if (ask.status === 'ANSWERED') return { ok: true, ask, says: 'Already marked answered.' }
  await client.pageAsk.updateMany({
    where: { id, companyId, status: 'OPEN' },
    data: {
      status: 'ANSWERED', answeredAt: now,
      ...(ask.assigneePersonId ? {} : { assigneePersonId: actorPersonId, assignedAt: now }),
    },
  })
  return { ok: true, ask: (await readPageAsk(id, companyId, db))!, says: 'Marked answered.' }
}

/** Nothing more to do with it: spam, a duplicate, or finished. Records who closed it. */
export async function closePageAsk(
  id: string, companyId: string, actorPersonId: string, db: Db = prisma, now: Date = new Date()
): Promise<ActResult> {
  const client = db as PrismaClient
  const ask = await readPageAsk(id, companyId, db)
  if (!ask) return { ok: false, status: 404, says: NO_SUCH_QUESTION }
  if (ask.status === 'CLOSED') return { ok: true, ask, says: 'Already closed.' }
  await client.pageAsk.updateMany({
    where: { id, companyId, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED', closedAt: now, closedById: actorPersonId },
  })
  return { ok: true, ask: (await readPageAsk(id, companyId, db))!, says: 'Closed.' }
}

// ── The decision card ──────────────────────────────────────────────────

/** A question's first words, for a card: up to eight words, never more than 70 characters. */
export function firstWords(asked: string): string {
  const flat = asked.replace(/\s+/g, ' ').trim()
  const words = flat.split(' ')
  let out = words.slice(0, 8).join(' ')
  if (out.length > 70) out = out.slice(0, 70).replace(/\s+\S*$/, '')
  return out.length < flat.length ? `${out}…` : out
}

/** Who asked, as the card says it: her name, else her address. */
export function askerOf(a: { name: string | null; replyTo: string }): string {
  return a.name?.trim() || a.replyTo
}

export const PAGE_ASKS_HREF = '/dashboard/page-asks'

/**
 * The cards for GET /api/decisions: one for each open question nobody has
 * taken, for each seat that may answer it. Taken, answered and closed
 * questions are not cards: the list shows them.
 *
 * The card is the repo's shape (type, title, subtitle, urgency, entityType,
 * entityId, actionUrl, createdAt), with `acts` naming what each button does
 * and the one route it goes through. "Not now" is leaving it: no route.
 * A read that fails adds nothing rather than a guess.
 */
export async function pageAskDecisions(
  caller: { permissions: readonly string[]; company: { id: string } | null },
  db: Db = prisma
) {
  if (!caller.company || !mayAnswerPageAsks(caller.permissions)) return []
  const rows = await (db as PrismaClient).pageAsk
    .findMany({
      where: { companyId: caller.company.id, status: 'OPEN', assigneePersonId: null },
      select: { id: true, asked: true, replyTo: true, name: true, companyName: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    .catch(() => [])
  return rows.map((a) => ({
    type: PAGE_ASK,
    title: `${askerOf(a)} asked on your page: ${firstWords(a.asked)}`,
    subtitle: [a.companyName, a.replyTo !== askerOf(a) ? a.replyTo : null].filter(Boolean).join(' · ') || 'Nobody has taken it yet.',
    reason: 'A question from your public page waits for somebody to take it.',
    named: { whose: askerOf(a), what: 'question', whats: 'questions' },
    urgency: 'MEDIUM' as const,
    entityType: 'PageAsk',
    entityId: a.id,
    dueDate: null,
    amount: null,
    actionUrl: `${PAGE_ASKS_HREF}?open=${a.id}`,
    /** The one route the acts go through: POST { act }. */
    answerUrl: `/api/page-asks/${a.id}`,
    acts: [
      { act: 'assign', label: 'Assign to me' },
      { act: 'answered', label: 'Answered' },
      { act: 'not_now', label: 'Not now', route: false },
    ],
    createdAt: a.createdAt.toISOString(),
  }))
}

// ── The backfill ───────────────────────────────────────────────────────

/** What a stored notice says of the question, as far as its words allow. Null where it is not one this reads. */
export function pageAskFromNotice(n: {
  title: string
  body: string
  data: unknown
  companyId: string | null
  createdAt: Date
}): (PageAskInput & { createdAt: Date }) | null {
  const d = (n.data ?? {}) as { replyTo?: unknown }
  const marker = '\n\nWrite back to '
  const cut = n.body.lastIndexOf(marker)
  if (!n.companyId || cut <= 0) return null
  const asked = n.body.slice(0, cut).trim()
  const tail = n.body.slice(cut + marker.length)
  const fromBody = tail.match(/^(\S+?)\.\s/)?.[1] ?? ''
  const replyTo = typeof d.replyTo === 'string' && d.replyTo.includes('@') ? d.replyTo : fromBody
  if (!asked || !replyTo.includes('@')) return null
  // The notice's title says who asked in one of three ways (`firmAskNotice`); a name that cannot be read is left empty, never guessed.
  const who = n.title.split(' asked from your page')[0]
  let name: string | null = null
  let companyName: string | null = null
  if (who !== n.title && who !== replyTo) {
    const at = who.match(/^(.+?) at (.+)$/)
    if (at) {
      companyName = at[2]
      name = at[1] === 'Somebody' ? null : at[1]
    } else {
      name = who
    }
  }
  return { companyId: n.companyId, asked, replyTo, name, companyName, createdAt: n.createdAt }
}

export interface BackfillCounts {
  /** Stored first notices found (one per question; the copies to other seats are not counted). */
  found: number
  /** Already a record: left alone. */
  already: number
  /** Written now, or what a dry run would write. */
  made: number
  /** Notices that could not be read as a question: named, never dropped silently. */
  unreadable: string[]
}

/**
 * One record for each stored question, none twice. Idempotent on
 * `sourceNotificationId`: a second run finds every one and makes none.
 * A dry run (the default) counts and writes nothing. Every record made
 * is OPEN: nothing recorded that anybody answered it, so it is listed for
 * the firm to close.
 */
export async function backfillPageAsks(db: PrismaClient, opts: { write?: boolean } = {}): Promise<BackfillCounts> {
  const notices = await db.notification.findMany({
    where: { data: { path: ['pageAsk'], equals: 'FIRST' } },
    select: { id: true, title: true, body: true, data: true, companyId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const have = new Set(
    (await db.pageAsk.findMany({ where: { sourceNotificationId: { in: notices.map((n) => n.id) } }, select: { sourceNotificationId: true } }))
      .map((r) => r.sourceNotificationId)
  )
  const out: BackfillCounts = { found: notices.length, already: 0, made: 0, unreadable: [] }
  for (const n of notices) {
    if (have.has(n.id)) { out.already++; continue }
    const read = pageAskFromNotice(n)
    if (!read) { out.unreadable.push(n.id); continue }
    if (opts.write) {
      const firm = await db.company.findUnique({ where: { id: read.companyId }, select: { id: true } })
      if (!firm) { out.unreadable.push(n.id); continue }
      await db.pageAsk.create({
        data: {
          companyId: read.companyId, asked: read.asked, replyTo: read.replyTo.toLowerCase(),
          name: read.name, companyName: read.companyName, createdAt: read.createdAt, sourceNotificationId: n.id,
        },
        select: { id: true },
      })
    }
    out.made++
  }
  return out
}
