/**
 * Two things another party is waiting on a firm for, read for Ask
 * Etyme's greeting and counted on its mark (the Tapin walk, 2026-10-29).
 *
 *   a link request   another firm already on Etyme asked to link with
 *                    this one (`TradeLinkRequest`, 2026-10-27). It is a
 *                    decision, so it is a card: "Tapin asks to link as
 *                    your sub-vendor", Yes and Not now, and Yes goes
 *                    through the one route that answers it,
 *                    POST /api/trade-links/:id, the same one Companies
 *                    presses. Brightmoor's owner read "Nothing needs you
 *                    today" while Tapin waited.
 *
 *   a join ask       somebody asked from the firm's public page to join
 *                    its bench, and no email can leave this deployment, so
 *                    the letter that asks for their yes never went. The
 *                    page tells them the firm "has your address and will
 *                    be in touch"; this is the firm being told so, by name,
 *                    with the address to write to, until they answer.
 *                    Where email can leave, the letter went and the firm
 *                    owes nothing, so nothing is said.
 *
 * Both are rows of the one queue the greeting names and the mark counts
 * (`withFirmAsks`), so the number and the sentence stay one read. Neither
 * is in GET /api/decisions yet; Today and the decisions page are demand's
 * to bring up to it.
 *
 * Who is shown what: a link request only to a seat that may answer it
 * (`vendors.manage`, the route's own gate); a join ask only to a seat
 * that looks after the firm's people (`consultants.write`). Nothing here
 * reads another firm's book: the asker's name and what it asks to be.
 */

import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { mirrorOf, wordFor } from '@/lib/trade-link'
import type { Relationship } from '@/lib/counterparty'
import { LINK_REQUEST, JOIN_ASK, type QueueItem, type QueueRead } from './ask'

export { LINK_REQUEST, JOIN_ASK }

/** Where a link request is answered on a screen, beside the card. */
export const COMPANIES_HREF = '/dashboard/companies'
/** Where a firm's people waiting on a yes are listed. */
export const BENCH_HREF = '/dashboard/bench'

/** How far back a join ask is still said: a month, then it is the bench page's. */
export const JOIN_ASK_DAYS = 30
/** At most this many of each, newest first. */
export const FIRM_ASKS_SHOWN = 5

export interface LinkAsk {
  id: string
  /** The firm that asked, as it is named. */
  fromName: string
  fromKind: string
  /** What the reader is to the asker, in the register's words (CLIENT · SUPPLIER · PRIME · MSP). */
  relationship: string
  askedBy: string | null
  askedOn: string
}

export interface JoinAsk {
  listingId: string
  name: string
  email: string | null
  askedOn: string
}

/** "Tapin asks to link as your sub-vendor": the asker, and what it would be on the reader's own register. */
export function linkAskTitle(a: Pick<LinkAsk, 'fromName' | 'fromKind' | 'relationship'>, readerKind: string): string {
  const theirs = wordFor(mirrorOf(a.relationship as Relationship, a.fromKind), readerKind)
  return `${a.fromName} asks to link as your ${theirs}`
}

/** What yes does, said before it is pressed. */
export function linkAskFact(a: Pick<LinkAsk, 'askedBy' | 'fromName'>): string {
  const who = a.askedBy ? `${a.askedBy} at ${a.fromName} asked.` : `${a.fromName} asked.`
  return `${who} Say yes and each of you can name the other on agreements and orders. Nothing is recorded until you do.`
}

/** "Asha Rao asked to join your bench from your page." */
export function joinAskTitle(a: Pick<JoinAsk, 'name'>): string {
  return `${a.name} asked to join your bench from your page`
}

/** No email can leave, so the firm writes to them itself. */
export function joinAskFact(a: Pick<JoinAsk, 'email'>): string {
  return a.email
    ? `No email can leave Etyme here, so the letter asking for their yes did not go. Write to them at ${a.email}; the page told them you will be in touch.`
    : 'No email can leave Etyme here, so the letter asking for their yes did not go. The page told them you will be in touch.'
}

/** The asks as rows of the queue, in the shape GET /api/decisions writes its own. */
export function firmAskItems(links: readonly LinkAsk[], joins: readonly JoinAsk[], readerKind: string): QueueItem[] {
  return [
    ...links.map((a): QueueItem => ({
      type: LINK_REQUEST, entityType: 'TradeLinkRequest', entityId: a.id,
      title: linkAskTitle(a, readerKind), subtitle: linkAskFact(a), whose: a.fromName, actionUrl: COMPANIES_HREF,
    })),
    ...joins.map((a): QueueItem => ({
      type: JOIN_ASK, entityType: 'BenchListing', entityId: a.listingId,
      title: joinAskTitle(a), subtitle: joinAskFact(a), whose: a.name, actionUrl: BENCH_HREF,
    })),
  ]
}

/**
 * The queue with the firm's asks in it, counted. A row the queue already
 * carries (the day demand adds it to GET /api/decisions) is not added
 * twice. A queue that could not be read stays unread: the asks alone,
 * read as everything a seat owes, would be the plausible wrong number.
 * The queue's own sentence is dropped where a row is added, so the
 * headline names the asks too.
 */
export function withFirmAsks(q: QueueRead | null, asks: readonly QueueItem[]): QueueRead | null {
  if (!q || asks.length === 0) return q
  const has = new Set(q.items.map((d) => `${d.type}:${d.entityId}`))
  const fresh = asks.filter((a) => !has.has(`${a.type}:${a.entityId}`))
  if (fresh.length === 0) return q
  return { total: q.total + fresh.length, items: [...fresh, ...q.items] }
}

interface Reader {
  company: { id: string; kind: string } | null
  permissions: readonly string[]
}

/** The open link requests made of this firm, where this seat may answer them. */
export async function linkAsksFor(caller: Reader): Promise<LinkAsk[]> {
  if (!caller.company || !hasPermission(caller.permissions as string[], 'vendors.manage')) return []
  const rows = await prisma.tradeLinkRequest.findMany({
    where: { toCompanyId: caller.company.id, answeredAt: null },
    orderBy: { createdAt: 'desc' },
    take: FIRM_ASKS_SHOWN,
    select: {
      id: true, relationship: true, createdAt: true,
      fromCompany: { select: { name: true, kind: true } },
      askedBy: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, fromName: r.fromCompany.name, fromKind: r.fromCompany.kind, relationship: r.relationship,
    askedBy: r.askedBy?.name ?? null, askedOn: r.createdAt.toISOString().slice(0, 10),
  }))
}

/**
 * The people who asked from this firm's public page in the last month and
 * have not answered, where no letter could leave. Read off the ask's own
 * log row (`fromPublicPage`, written by the bench's one ask) and the
 * listing it made, still INVITED.
 */
export async function joinAsksFor(caller: Reader, letterCanLeave: boolean, now = new Date()): Promise<JoinAsk[]> {
  if (letterCanLeave || !caller.company || !hasPermission(caller.permissions as string[], 'consultants.write')) return []
  const logs = await prisma.automationLog.findMany({
    where: {
      companyId: caller.company.id, action: 'BENCH_LISTING_REQUESTED',
      at: { gte: new Date(now.getTime() - JOIN_ASK_DAYS * 86_400_000) },
      payload: { path: ['fromPublicPage'], equals: true },
    },
    orderBy: { at: 'desc' },
    take: 50,
    select: { at: true, payload: true },
  })
  const asked = new Map<string, Date>()
  for (const l of logs) {
    const id = (l.payload as { listingId?: unknown } | null)?.listingId
    if (typeof id === 'string' && !asked.has(id)) asked.set(id, l.at)
  }
  if (asked.size === 0) return []
  const listings = await prisma.benchListing.findMany({
    where: { id: { in: [...asked.keys()] }, companyId: caller.company.id, state: 'INVITED', revokedAt: null },
    select: { id: true, consultant: { select: { person: { select: { name: true, primaryEmail: true } } } } },
  })
  return listings
    .map((l) => ({
      listingId: l.id, name: l.consultant.person.name, email: l.consultant.person.primaryEmail ?? null,
      askedOn: asked.get(l.id)!.toISOString().slice(0, 10),
    }))
    .sort((a, b) => b.askedOn.localeCompare(a.askedOn))
    .slice(0, FIRM_ASKS_SHOWN)
}
