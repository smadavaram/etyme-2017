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

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { bellShows } from '@/lib/notify/account-mail'
import { pageOf } from '@/lib/notify'
import {
  NOTICES_SHOWN, THREADS_SHOWN, COMING_FREE, START_PAPERS, OUR_BENCH_HREF, START_ASKS_HREF, startAskedSays,
  type NoticeLine, type ThreadNote,
} from './ask'
import { comingFreeTitle, type ComingFreeRow } from '@/lib/twin/supplier-performers'
import { labelFor } from '@/lib/document-type'
import { partiesOf, directionFrom } from '@/lib/money/invoice-parties'

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/**
 * Where a notice applies. A notice written at another company where this
 * person holds a desk waits for that seat, because its link opens that
 * company's book. Every other notice shows here: one tied to no company,
 * one written at this seat's company, and one written at a firm where she
 * holds no desk at all.
 *
 * That last kind is most of a worker's mail. A supplier puts her forward
 * and the client books her rounds, so the notice is written at the
 * supplier or the client, firms where she holds no seat. The rule used to
 * say where a notice may show rather than where it may not, so those sat
 * unread at no seat she could ever open: Wendell Chowdhury, on
 * Glenhaven's bench, held eleven (his papers asked for by Dalebrook
 * Partners, his rounds with Quillon Software), found by the simulation's
 * handoffs station on the generated world (2026-10-22). Her own bench's
 * chase for her license follows her for the same reason (Colleen Byrne,
 * 2026-10-20): a bench seat is no firm's book.
 */
async function unreadWhere(caller: CallerContext, opts: { program?: string | null } = {}): Promise<Prisma.NotificationWhereInput> {
  // A firm seated in a client's program reads that program, the same as
  // its greeting: a notice written at its own firm's book waits for the
  // seat that reads that book (walk three, 2026-10-26: Aptiva, seated at
  // Cavanaugh Glassworks, read "Bill to raise" for its own Ruben Ortega).
  if (opts.program) {
    return {
      personId: caller.person.id,
      status: 'UNREAD',
      AND: [
        { OR: [{ companyId: null }, { companyId: opts.program }] },
        { OR: [{ entityId: null }, { NOT: { entityId: { startsWith: DIGEST_PREFIX } } }] },
      ],
      ...bellShows(),
    }
  }
  const desks = caller.company
    ? await prisma.context.findMany({
        where: { personId: caller.person.id, type: { not: 'CONSULTANT' }, revokedAt: null, companyId: { not: caller.company.id } },
        select: { companyId: true },
      }).catch(() => [] as { companyId: string | null }[])
    : []
  const elsewhere = [...new Set((desks ?? []).map((c) => c.companyId).filter((id): id is string => !!id))]
  // `notIn` passes no null, so a notice tied to no company is named on its own.
  const at: Prisma.NotificationWhereInput[] = elsewhere.length ? [{ companyId: null }, { companyId: { notIn: elsewhere } }] : []
  return {
    personId: caller.person.id,
    status: 'UNREAD',
    AND: [
      ...(at.length ? [{ OR: at }] : []),
      // The twin's Teams digest is the greeting's own list sent to Teams;
      // said again here it would be "1 bill to send" under the card for
      // that bill (found by the handoffs station, 2026-10-20).
      { OR: [{ entityId: null }, { NOT: { entityId: { startsWith: DIGEST_PREFIX } } }] },
    ],
    ...bellShows(),
  }
}

/** The marker the twin's Teams digest writes as its notice's entityId (`lib/teams/digest`). */
export const DIGEST_PREFIX = 'twin-digest:'

/**
 * The newest unread notices for this seat, at most NOTICES_SHOWN, and how
 * many older ones wait. A note on a conversation is not among them: the
 * greeting says those as the conversation they are on (`unreadThreads`).
 * Each comes with its body and, for a date coming due, the cycle and the
 * day, so the greeting can say who and what rather than the title.
 */
export async function unreadNotices(caller: CallerContext, opts: { program?: string | null } = {}): Promise<{ shown: NoticeLine[]; older: number }> {
  const where = { ...(await unreadWhere(caller, opts)), type: { not: 'CONVERSATION' } }
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: NOTICES_SHOWN,
      select: { id: true, type: true, title: true, body: true, entityId: true, data: true, createdAt: true },
    }),
    prisma.notification.count({ where }),
  ])
  const twin = await twinActNotices(rows).catch(() => new Map<string, Pick<NoticeLine, 'title' | 'href' | 'act' | 'linkText'>>())
  // Etyme's own question, answered since it was asked: the notice is
  // marked read with the rest and never said, because "Ask Etyme is asking
  // you to decide" about a bill already sent is a question nobody can
  // answer (handoffs station, 2026-10-20).
  const asked = [...new Set(rows.map((n) => asRecord(n.data)?.twinApprovalId).filter((x): x is string => typeof x === 'string'))]
  const settled = asked.length
    ? new Set((await prisma.twinApproval.findMany({ where: { id: { in: asked }, decision: { not: 'PENDING' } }, select: { id: true } })).map((a) => a.id))
    : new Set<string>()
  const named = await mismatchTitles(rows, caller.company?.id ?? null)
  return {
    shown: rows.map((n) => {
      const data = asRecord(n.data)
      const approval = typeof data?.twinApprovalId === 'string' ? data.twinApprovalId : null
      const acted = twin.get(n.id)
      return {
        id: n.id, title: named.get(n.id) ?? n.title, href: pageOf(n.type, n.entityId, data),
        // What Ask Etyme did alone, in its own words, over the notice's own.
        ...(acted ? { title: acted.title, href: acted.href } : {}),
        ...(acted?.act ? { act: acted.act } : {}),
        ...(acted?.linkText ? { linkText: acted.linkText } : {}),
        type: n.type, body: typeof n.body === 'string' ? n.body : null,
        cycleKind: typeof data?.kind === 'string' ? data.kind : null,
        dueOn: typeof data?.dueOn === 'string' ? data.dueOn : null,
        entityId: n.entityId,
        ...(approval && settled.has(approval) ? { settled: true } : {}),
      }
    }),
    older: Math.max(0, total - rows.length),
  }
}

/** How near the ledger's entry a notice must be written to be the notice of that act. */
const SAME_ACT_MS = 60 * 60 * 1000

function comingRows(v: unknown): ComingFreeRow[] {
  return Array.isArray(v)
    ? v.filter((r): r is ComingFreeRow => !!r && typeof r === 'object' && typeof (r as ComingFreeRow).name === 'string' && typeof (r as ComingFreeRow).days === 'number')
    : []
}

/**
 * What Ask Etyme did alone at a firm that sells people, said in its own
 * words (2026-10-29, "Tapin gets agents"):
 *
 *   who is coming free   the performer's notice, re-titled from the ledger
 *                        entry it follows with `comingFreeTitle` (the
 *                        stored title is cut at 120 characters), opening
 *                        Our bench
 *   start papers asked   HR's notice from the clearance ask, where Ask
 *                        Etyme made that ask: who was asked for what, for
 *                        which start, the person's name opening the asks
 *
 * A notice is read once, so each is said once: when it appears. Nothing
 * here is a decision, so none of it is in the count on the mark. A
 * notice whose entry cannot be found keeps its own title.
 */
async function twinActNotices(
  rows: ReadonlyArray<{ id: string; type: string; title: string; entityId: string | null; data: unknown; createdAt: Date }>,
): Promise<Map<string, Pick<NoticeLine, 'title' | 'href' | 'act' | 'linkText'>>> {
  const out = new Map<string, Pick<NoticeLine, 'title' | 'href' | 'act' | 'linkText'>>()
  const near = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) <= SAME_ACT_MS

  const free = rows.filter((n) => asRecord(n.data)?.twinAction === COMING_FREE && n.entityId)
  if (free.length) {
    const entries = await prisma.twinAction.findMany({
      where: { action: COMING_FREE, outcome: 'PERFORMED', companyId: { in: [...new Set(free.map((n) => n.entityId!))] } },
      orderBy: { ts: 'desc' },
      take: 20,
      select: { companyId: true, ts: true, payload: true },
    })
    for (const n of free) {
      const e = entries.find((x) => x.companyId === n.entityId && near(x.ts, n.createdAt))
      const p = asRecord(e?.payload)
      out.set(n.id, {
        title: p ? comingFreeTitle(comingRows(p.comingFree), comingRows(p.idle)) : n.title,
        href: OUR_BENCH_HREF,
        act: COMING_FREE,
      })
    }
  }

  const contracts = rows.filter((n) => n.type === 'CONTRACT' && n.entityId)
  if (contracts.length) {
    const ids = [...new Set(contracts.map((n) => n.entityId!))]
    const [asks, lines] = await Promise.all([
      prisma.twinAction.findMany({
        where: { action: START_PAPERS, outcome: 'PERFORMED', entityType: 'SellContract', entityId: { in: ids } },
        orderBy: { ts: 'desc' },
        take: 50,
        select: { entityId: true, ts: true, payload: true },
      }),
      prisma.sellContract.findMany({
        where: { id: { in: ids } },
        select: { id: true, person: { select: { name: true } }, requirement: { select: { title: true } }, clientCompany: { select: { name: true } } },
      }),
    ])
    for (const n of contracts) {
      const e = asks.find((a) => a.entityId === n.entityId && near(a.ts, n.createdAt))
      const line = lines.find((l) => l.id === n.entityId)
      if (!e || !line) continue
      const p = asRecord(e.payload) ?? {}
      const keys = Array.isArray(p.asks) ? p.asks.filter((k): k is string => typeof k === 'string') : []
      const personName = typeof p.personName === 'string' && p.personName ? p.personName : line.person.name
      out.set(n.id, {
        title: startAskedSays({ personName, papers: keys.map((k) => labelFor(k)), jobTitle: line.requirement?.title ?? null, clientName: line.clientCompany?.name ?? null }).replace(/\.$/, ''),
        href: START_ASKS_HREF,
        act: START_PAPERS,
        linkText: personName,
      })
    }
  }
  return out
}

/** The twin's mismatch notice, as the nightly run titles it (lib/twin/performers, flagMismatch). */
export const MISMATCH_TITLE = 'An invoice receipt does not match what was accepted'

/** "PR-2026-0442 from Pinnacle Resourcing does not match what was accepted." */
export function mismatchSays(number: string, supplier: string | null): string {
  return `${number}${supplier ? ` from ${supplier}` : ''} does not match what was accepted`
}

/**
 * The mismatch notice says which receipt and whose (walk three,
 * 2026-10-26): its title names neither, so the receipt it is about is
 * read and named here. A receipt that cannot be read keeps the title.
 */
async function mismatchTitles(
  rows: ReadonlyArray<{ id: string; title: string; entityId: string | null; data: unknown }>,
  companyId: string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const flagged = rows.filter((n) => n.title === MISMATCH_TITLE && n.entityId)
  if (flagged.length === 0) return out
  const ids = [...new Set(flagged.map((n) => n.entityId!))]
  try {
    const [invoices, keyed] = await Promise.all([
      prisma.invoice.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, number: true,
          engagement: { select: { msa: { select: { vendorId: true, clientId: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } } } },
          workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
        },
      }),
      prisma.vendorBill.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, vendorCompany: { select: { name: true } } } }),
    ])
    const said = new Map<string, string>()
    for (const i of invoices) {
      const parties = partiesOf({ agreement: i.engagement?.msa ?? null, order: i.workOrder ?? null })
      // The supplier is the firm that billed the reader; a receipt the reader is not paying keeps its title.
      if (companyId && directionFrom(parties, companyId) !== 'PAYABLE') continue
      said.set(i.id, mismatchSays(i.number, parties.vendor?.name ?? null))
    }
    for (const b of keyed) said.set(b.id, mismatchSays(b.number, b.vendorCompany?.name ?? null))
    for (const n of flagged) {
      const t = said.get(n.entityId!)
      if (t) out.set(n.id, t)
    }
  } catch {
    // The title as it was written; never a guess.
  }
  return out
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
    where: { ...(await unreadWhere(caller)), type: 'CONVERSATION' },
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
