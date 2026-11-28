/**
 * Who owns a company, said in Ask Etyme (the screen walk on df3074094:
 * "a person asked to take a company's ownership has no Yes anywhere").
 *
 * An Owner ask (lib/owner-rules, `OwnershipRequest`) waits seven days for
 * one person's yes: the person taking over for a pass, an Owner who did
 * not ask for a removal or a move. That person reads it here first, by
 * name, as a card with Yes and Not now; the Owner who asked reads one line
 * saying it waits on the other person, never as something she owes.
 *
 * The yes goes to POST /api/settings/owners/:id, the one route that
 * answers an Owner ask on the Owners page, by email and in Teams. Not the
 * twin's approval route: this is a person's own decision about their own
 * seat and their company's ownership, nothing the twin drafted or acts on.
 * It is not an act kind in the role contract either, for the same reason;
 * the twin never touches who owns a company.
 *
 * The rows are read here, in this domain, with the rules' own
 * `decidersFor`, so who reads the card is exactly who the route lets say
 * yes. Nothing here reads another company: the asks are the reader's own
 * company's, and only those addressed to the reader or asked by them.
 */

import { prisma } from '@/lib/db'
import { formatDay } from '@/lib/format-date'
import { decidersFor, lapsed, OWNER_ROLE, type AskKind, type AskerAfter, type Seat } from '@/lib/owner-rules'
import {
  PROVE_OWNERSHIP_HREF, PROVE_OWNERSHIP_PLACE, mayBecomeOwner, proofFactsAt, proofStanding, type GateFacts,
} from '@/lib/owner-proof'
import { seatsAt } from '@/app/api/settings/owners/seats'
import { countWord } from './count-words'
import { OWNER_ASK, type QueueItem, type QueueRead, type RichLine } from './ask'

export { OWNER_ASK }
/** Where an Owner ask is read on a screen, beside the card. */
export const OWNERS_HREF = '/dashboard/settings/owners'
/** The one route that answers an ask. */
export const ownerAskUrl = (id: string) => `/api/settings/owners/${encodeURIComponent(id)}`

/** An open ask at the reader's company, as these words need it. */
export interface OwnerAsk {
  id: string
  kind: AskKind
  askedById: string
  askerName: string
  /** PASS: what the asker becomes once the yes lands. */
  askerAfter: AskerAfter | null
  subjectContextId: string
  /** DEMOTE: the role the Owner moves to. */
  toRoleName: string | null
  reason: string
  expiresAt: Date
}

/** The asks this person may say yes to: open, in date, and not their own. */
export function askedOfMe(asks: readonly OwnerAsk[], seats: readonly Seat[], personId: string, now = new Date()): OwnerAsk[] {
  return asks.filter((a) => {
    if (a.askedById === personId || lapsed(a.expiresAt, now)) return false
    const subject = seats.find((s) => s.contextId === a.subjectContextId)
    if (!subject) return false
    return decidersFor({ kind: a.kind, askedByPersonId: a.askedById, subject, seats }).some((d) => d.personId === personId)
  })
}

/** The asks this person made that still wait, in date. */
export function askedByMe(asks: readonly OwnerAsk[], personId: string, now = new Date()): OwnerAsk[] {
  return asks.filter((a) => a.askedById === personId && !lapsed(a.expiresAt, now))
}

function subjectOf(a: OwnerAsk, seats: readonly Seat[]): Seat | null {
  return seats.find((s) => s.contextId === a.subjectContextId) ?? null
}

/** "Ana Ruiz", "Ana Ruiz or Ben Ho", "Ana Ruiz, Ben Ho or Chen Li". */
function either(names: readonly string[]): string {
  if (names.length === 0) return 'another Owner'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/**
 * The ask as the person who may say yes reads it: who asks, what, and at
 * which company, in one sentence. "Camille Ostrander asks you to become an
 * Owner of Northbend Athletic." (or "to take over as Owner" where she steps down).
 */
export function askTitle(a: OwnerAsk, subject: Pick<Seat, 'name' | 'personId'>, me: string, company: string): string {
  const you = subject.personId === me
  if (a.kind === 'PASS') {
    // "Take over" only where the asker steps down; an add leaves her an Owner.
    const stepsDown = a.askerAfter === 'ADMIN' || a.askerAfter === 'LEAVE'
    return stepsDown
      ? `${a.askerName} asks you to take over as Owner of ${company}`
      : `${a.askerName} asks you to become an Owner of ${company}`
  }
  if (a.kind === 'REMOVE') {
    return you
      ? `${a.askerName} asks to remove you as an Owner of ${company}`
      : `${a.askerName} asks to remove ${subject.name} as an Owner of ${company}`
  }
  const to = a.toRoleName ?? 'another role'
  return you
    ? `${a.askerName} asks to move you from Owner to ${to} at ${company}`
    : `${a.askerName} asks to move ${subject.name} from Owner to ${to} at ${company}`
}

/**
 * What the yes does, from the ask's own fields, said before it is
 * pressed. The record keeps no pronouns, so the asker is named again.
 * "After your yes you are an Owner and Camille Ostrander stays an Owner."
 */
export function afterYesSays(a: OwnerAsk, subject: Pick<Seat, 'name' | 'personId'>, me: string, company: string): string {
  const you = subject.personId === me
  if (a.kind === 'PASS') {
    const asker = a.askerAfter === 'ADMIN' ? `${a.askerName} becomes an Admin`
      : a.askerAfter === 'LEAVE' ? `${a.askerName} leaves ${company}`
        : `${a.askerName} stays an Owner`
    return `After your yes you are an Owner and ${asker}.`
  }
  if (a.kind === 'REMOVE') {
    return you
      ? `After your yes your seat at ${company} ends. Everything you did stays under your name.`
      : `After your yes ${subject.name}’s seat at ${company} ends. Everything ${subject.name} did stays under that name.`
  }
  const to = a.toRoleName ?? 'another role'
  return you ? `After your yes you are ${withArticle(to)} and no longer an Owner.` : `After your yes ${subject.name} is ${withArticle(to)} and no longer an Owner.`
}

function withArticle(role: string): string {
  return /^[AEIOU]/i.test(role) ? `an ${role}` : `a ${role}`
}

/**
 * Why this reader is asked, the reason in the asker's words, and when it
 * lapses: the card's "why", one tap away.
 */
export function whyYouSays(a: OwnerAsk): string {
  const why = a.kind === 'PASS'
    ? 'Only the person taking over says yes, so nobody becomes an Owner by surprise.'
    : 'An Owner is removed or moved only on the yes of an Owner who did not ask. Nobody decides their own ask.'
  const reason = a.reason.trim() ? ` ${a.askerName}’s reason: “${a.reason.trim().replace(/[.\s]*$/, '')}.”` : ''
  return `${why}${reason} It waits until ${formatDay(a.expiresAt)}; with no answer it lapses and nothing changes.`
}

/** The asks addressed to this reader as rows of the one queue, first. */
export function ownerAskItems(asks: readonly OwnerAsk[], seats: readonly Seat[], me: string, company: string): QueueItem[] {
  const out: QueueItem[] = []
  for (const a of asks) {
    const subject = subjectOf(a, seats)
    if (!subject) continue
    out.push({
      type: OWNER_ASK, entityType: 'OwnershipRequest', entityId: a.id,
      title: askTitle(a, subject, me, company),
      subtitle: afterYesSays(a, subject, me, company),
      reason: whyYouSays(a),
      whose: a.askerName,
      dueDate: a.expiresAt.toISOString(),
      actionUrl: OWNERS_HREF,
    })
  }
  return out
}

/**
 * The queue with the reader's Owner asks in it, first and counted, so the
 * mark and the headline stay one read. A queue that could not be read
 * stays unread (the asks alone, read as all a seat owes, would be the
 * plausible wrong number); the greeting still names the ask on its own
 * line. A row the queue already carries (the day demand adds Owner asks
 * to GET /api/decisions) is not added twice.
 */
export function withOwnerAsks(q: QueueRead | null, asks: readonly QueueItem[]): QueueRead | null {
  if (!q || asks.length === 0) return q
  const has = new Set(q.items.map((d) => `${d.type}:${d.entityId}`))
  const fresh = asks.filter((a) => !has.has(`${a.type}:${a.entityId}`))
  if (fresh.length === 0) return q
  return { total: q.total + fresh.length, items: [...fresh, ...q.items] }
}

/**
 * The greeting's lead where an Owner ask is addressed to this reader: the
 * first ask in full, in the trade's words, and how many more wait. Its
 * card, with Yes and Not now, is in the queue under the headline.
 * "Camille Ostrander asks you to become an Owner of Northbend Athletic.
 * After your yes you are an Owner and Camille Ostrander stays an Owner."
 */
export function ownerAskLead(items: readonly QueueItem[]): RichLine | null {
  const asks = items.filter((d) => d.type === OWNER_ASK)
  if (asks.length === 0) return null
  const first = asks[0]
  const more = asks.length - 1
  const tail = more > 0 ? ` ${more === 1 ? 'One more Owner ask waits' : `${countWord(more)} more Owner asks wait`} for you below.` : ''
  return { says: `${first.title}. ${first.subtitle ?? ''}${tail} Answer below, or on Owners.`.replace(/\s+/g, ' ').trim(), links: [{ text: 'Owners', href: OWNERS_HREF }] }
}

/** The headline where the only things a seat owes are Owner asks: "One thing needs you, below." */
export function ownerAsksHeadline(n: number): string {
  return n === 1 ? 'One thing needs you: the Owner ask below.' : `${countWord(n)} things need you: the Owner asks below.`
}

/**
 * The asker's one line: her ask waits on the other person. Said as a fact,
 * never counted and never a card, because she owes nothing on it. One line
 * however many asks she made.
 */
export function waitingOnOthersSays(mine: readonly OwnerAsk[], seats: readonly Seat[], me: string, company: string): RichLine | null {
  const lines: string[] = []
  for (const a of mine) {
    const subject = subjectOf(a, seats)
    if (!subject) continue
    if (a.kind === 'PASS') {
      lines.push(`your ask that ${subject.name} take over as Owner waits on ${subject.name}’s yes`)
      continue
    }
    const deciders = decidersFor({ kind: a.kind, askedByPersonId: a.askedById, subject, seats })
      .filter((d) => d.personId !== me).map((d) => (d.personId === subject.personId ? subject.name : d.name))
    const what = a.kind === 'REMOVE' ? `to remove ${subject.name} as an Owner` : `to move ${subject.name} from Owner to ${a.toRoleName ?? 'another role'}`
    lines.push(`your ask ${what} waits on the yes of ${either(deciders)}`)
  }
  if (lines.length === 0) return null
  const first = lines[0][0].toUpperCase() + lines[0].slice(1)
  const rest = lines.slice(1)
  const says = `${[first, ...rest].join('; ')}. Nothing at ${company} changes until then, and it lapses after seven days with no answer.`
  return { says, links: [{ text: 'Owners', href: OWNERS_HREF }] }
}

/**
 * The "Become Owner" offer, one line with its link, for an Admin whose two
 * proofs both stand and whom the rules let become the Owner now
 * (`mayBecomeOwner` in lib/owner-proof). Null for everybody else: an
 * Owner already, a company formed before the proof rule, a company that
 * already has a verified Owner, or a proof still to come (the setup line
 * says what is left).
 */
export function becomeOwnerSays(input: Parameters<typeof mayBecomeOwner>[0]): RichLine | null {
  if (input.seatRole === OWNER_ROLE) return null
  const v = mayBecomeOwner(input)
  if (!v.ok || !v.reseat) return null
  return {
    says: `Both your proofs stand, so you can become ${input.companyName}’s Owner. Press Become Owner under ${PROVE_OWNERSHIP_PLACE}.`,
    links: [{ text: PROVE_OWNERSHIP_PLACE, href: PROVE_OWNERSHIP_HREF }],
  }
}

// ── The reads ─────────────────────────────────────────────────────────

export interface OwnerAskRead {
  /** Addressed to the reader, as queue rows. */
  items: QueueItem[]
  /** The asker's waiting line, or null. */
  waiting: RichLine | null
}

export const NO_OWNER_ASKS: OwnerAskRead = { items: [], waiting: null }

/** The open asks at a company, newest first. */
async function openAsksAt(companyId: string): Promise<OwnerAsk[]> {
  const rows = await prisma.ownershipRequest.findMany({
    where: { companyId, state: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, kind: true, askedById: true, askerAfter: true, subjectContextId: true, reason: true, expiresAt: true,
      askedBy: { select: { name: true, primaryEmail: true } },
      toRole: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, kind: r.kind as AskKind, askedById: r.askedById,
    askerName: r.askedBy.name || r.askedBy.primaryEmail || 'An Owner',
    askerAfter: (r.askerAfter ?? null) as AskerAfter | null,
    subjectContextId: r.subjectContextId, toRoleName: r.toRole?.name ?? null, reason: r.reason, expiresAt: r.expiresAt,
  }))
}

/**
 * The reader's Owner asks at its own company: those it may say yes to, and
 * the line for those it made. Read for a person's own seat only; a seat in
 * another company's program reads that program and is not asked here.
 */
export async function ownerAsksFor(reader: { personId: string; company: { id: string; name: string } }): Promise<OwnerAskRead> {
  const asks = await openAsksAt(reader.company.id)
  if (asks.length === 0) return NO_OWNER_ASKS
  const seats = await seatsAt(reader.company.id)
  const now = new Date()
  return {
    items: ownerAskItems(askedOfMe(asks, seats, reader.personId, now), seats, reader.personId, reader.company.name),
    waiting: waitingOnOthersSays(askedByMe(asks, reader.personId, now), seats, reader.personId, reader.company.name),
  }
}

/** The Become Owner line for this person at this company, or null. Never throws. */
export async function becomeOwnerLineFor(reader: { personId: string; contextId: string; company: { id: string; name: string } }): Promise<RichLine | null> {
  try {
    const [company, seats] = await Promise.all([
      prisma.company.findUnique({ where: { id: reader.company.id }, select: { ownerProofRequiredAt: true, ownerVerifiedAt: true } }),
      seatsAt(reader.company.id),
    ])
    if (!company) return null
    const gate: GateFacts = company
    // Only where the rule applies and nobody has proved it yet: no read of the proofs otherwise.
    if (gate.ownerProofRequiredAt === null || gate.ownerVerifiedAt !== null) return null
    const me = seats.find((s) => s.contextId === reader.contextId) ?? seats.find((s) => s.personId === reader.personId)
    if (!me || me.roleName === OWNER_ROLE) return null
    const standing = proofStanding(await proofFactsAt(reader.company.id, reader.personId))
    return becomeOwnerSays({
      gate, standing, seatRole: me.roleName, seatLive: me.live,
      liveOwners: seats.filter((s) => s.roleName === OWNER_ROLE && s.live).length, companyName: reader.company.name,
    })
  } catch {
    return null
  }
}
