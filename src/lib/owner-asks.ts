/**
 * The Owner asks a person may answer, read from the record.
 *
 * Screen walk on df3074094: the person asked to take ownership, and the
 * second Owner asked to agree to a removal, could say yes on no screen,
 * because Settings → Owners answered only Owners and Admins. This is the
 * one reader of "what waits on this person's yes", and it is read by
 * three doors that must not disagree: GET /api/settings/owners for a
 * reader who is neither Owner nor Admin, the page over it, and the yes
 * card in Ask Etyme (conversation's).
 *
 * It answers only asks addressed to the person (they are among
 * `decidersFor`), pending and not lapsed, at the one company named. It
 * says nothing else about who owns the company.
 */
import { prisma } from '@/lib/db'
import { formatDay } from '@/lib/format-date'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import {
  decidersFor, lapsed, askSaysTo, addresseeBecomes, addresseeCanThen,
  type AskKind, type AskerAfter, type Seat,
} from '@/lib/owner-rules'

/** Every live-or-paused seat at the company, in the shape lib/owner-rules reads. */
export async function seatsAt(companyId: string): Promise<Seat[]> {
  const rows = await prisma.context.findMany({
    where: { companyId, revokedAt: null, type: 'EMPLOYEE', ...NOT_THE_SAMPLE_SEAT },
    select: {
      id: true, personId: true, suspendedAt: true, expiresAt: true,
      person: { select: { name: true, primaryEmail: true } },
      role: { select: { name: true } },
    },
    orderBy: { grantedAt: 'asc' },
  })
  const now = Date.now()
  return rows.map((r) => ({
    contextId: r.id,
    personId: r.personId,
    name: r.person.name || r.person.primaryEmail,
    roleName: r.role?.name ?? null,
    live: !r.suspendedAt && (!r.expiresAt || r.expiresAt.getTime() > now),
  }))
}

/** One ask, as the person who may answer it reads it. */
export interface AddressedAsk {
  id: string
  kind: AskKind
  companyId: string
  companyName: string
  /** Who asked. */
  askedBy: string
  /** The seat the ask is about. */
  subject: string
  /** The reader is that seat (taking over, or the Owner removed or moved). */
  youAreSubject: boolean
  reason: string
  /** What the reader becomes ("Owner", a role, "No longer at …"), or null where nothing changes for them. */
  becomes: string | null
  /** What the reader can then do, one sentence. */
  canThen: string
  /** The card's sentence, to this reader. */
  says: string
  /** "Nov 19, 2026": the day it lapses unanswered. */
  waitsUntil: string
  expiresAt: string
  /** The one door the answer goes through: POST with { decision: 'yes' | 'no' }. */
  answerUrl: string
  /** The screen that shows it. */
  href: string
}

/**
 * The asks at `companyId` waiting on `personId`'s yes. Empty when none,
 * and when the person holds no seat there.
 */
export async function asksAddressedTo(personId: string, companyId: string): Promise<AddressedAsk[]> {
  const [company, asks] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.ownershipRequest.findMany({
      where: { companyId, state: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, kind: true, askerAfter: true, reason: true, expiresAt: true, askedById: true,
        askedBy: { select: { name: true } },
        subjectContextId: true,
        toRole: { select: { name: true } },
      },
    }),
  ])
  if (!company || asks.length === 0) return []
  const seats = await seatsAt(companyId)
  const now = new Date()
  const out: AddressedAsk[] = []
  for (const a of asks) {
    if (lapsed(a.expiresAt, now) || a.askedById === personId) continue
    const subject = seats.find((s) => s.contextId === a.subjectContextId)
    if (!subject) continue
    const deciders = decidersFor({ kind: a.kind, askedByPersonId: a.askedById, subject, seats })
    if (!deciders.some((d) => d.personId === personId)) continue
    const words = {
      kind: a.kind, askerName: a.askedBy.name, subjectName: subject.name, companyName: company.name,
      after: (a.askerAfter ?? null) as AskerAfter | null, toRoleName: a.toRole?.name ?? null, reason: a.reason,
      deciderNames: deciders.map((d) => d.name), youAreSubject: subject.personId === personId,
    }
    out.push({
      id: a.id,
      kind: a.kind,
      companyId,
      companyName: company.name,
      askedBy: a.askedBy.name,
      subject: subject.name,
      youAreSubject: words.youAreSubject,
      reason: a.reason,
      becomes: addresseeBecomes(words),
      canThen: addresseeCanThen(words),
      says: askSaysTo('ADDRESSEE', words),
      waitsUntil: formatDay(a.expiresAt),
      expiresAt: a.expiresAt.toISOString(),
      answerUrl: `/api/settings/owners/${a.id}`,
      href: '/dashboard/settings/owners',
    })
  }
  return out
}
