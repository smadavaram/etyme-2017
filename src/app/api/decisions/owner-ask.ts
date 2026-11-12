/**
 * An ask about a company's Owners, as a row of the one decisions queue.
 *
 * A pass of ownership, or an Owner's removal or move, waits seven days on
 * one person's yes (lib/owner-rules). The person it waits on read it in
 * Ask Etyme and on Settings → Owners, and Today did not list it, so the
 * number on the mark and Today's list disagreed by one while it waited.
 * Now GET /api/decisions carries one row per ask addressed to the caller,
 * read by `asksAddressedTo` in lib/owner-asks (the reader the Owners route
 * reads), and Ask Etyme adds no row the queue already carries.
 *
 * Pure: the words from the ask the reader read, nothing fetched here.
 */
import type { AddressedAsk } from '@/lib/owner-asks'
import { ASK_DAYS, type AskerAfter } from '@/lib/owner-rules'
import { askTitle, afterYesSays, whyYouSays, OWNER_ASK, type OwnerAsk } from '@/app/api/conversations/twin/owner-asks'

export { OWNER_ASK }

/** Two days or less before it lapses, it is urgent. */
const URGENT_MS = 2 * 86_400_000

/** What the reader of `asksAddressedTo` does not carry, read once for the asks it returned. */
export interface AskFacts {
  askedById: string
  askerAfter: AskerAfter | null
  subjectContextId: string
  toRoleName: string | null
}

/**
 * The ask as a row of GET /api/decisions, in the words Ask Etyme's own
 * card says (`askTitle`, `afterYesSays`, `whyYouSays`), so the chat and
 * Today draw one card one way: "Camille Ostrander asks you to take over
 * as Owner of Tapin", "After your yes you are an Owner and Camille
 * Ostrander stays an Owner."
 */
export function ownerAskRow(a: AddressedAsk, facts: AskFacts, me: string, now: Date = new Date()) {
  const lapses = new Date(a.expiresAt)
  const ask: OwnerAsk = {
    id: a.id, kind: a.kind, askedById: facts.askedById, askerName: a.askedBy, askerAfter: facts.askerAfter,
    subjectContextId: facts.subjectContextId, toRoleName: facts.toRoleName, reason: a.reason, expiresAt: lapses,
  }
  // Who the ask is about, as the words read it: the reader, or another Owner by name.
  const subject = { name: a.subject, personId: a.youAreSubject ? me : `not:${me}` }
  return {
    type: OWNER_ASK,
    title: askTitle(ask, subject, me, a.companyName),
    subtitle: afterYesSays(ask, subject, me, a.companyName),
    reason: whyYouSays(ask),
    named: { whose: a.askedBy, what: 'Owner ask', whats: 'Owner asks' },
    urgency: lapses.getTime() - now.getTime() <= URGENT_MS ? 'HIGH' : 'MEDIUM',
    entityType: 'OwnershipRequest',
    entityId: a.id,
    dueDate: a.expiresAt,
    amount: null,
    actionUrl: '/dashboard/settings/owners',
    /** The one route the answer goes through: POST { decision: 'yes' | 'no' }. */
    answerUrl: a.answerUrl,
    createdAt: new Date(lapses.getTime() - ASK_DAYS * 86_400_000).toISOString(),
  }
}
