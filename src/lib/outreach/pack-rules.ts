/**
 * A campaign pack's rules (records 112, 116, 135). Pure.
 *
 * A pack is the only thing a detected push ever leaves in. It declares one
 * saved segment and the kinds of content it may carry, and one person's yes
 * releases that pack and nothing else. A push joins an approved pack only
 * where its segment and its kind both match what the pack declared; any
 * other push waits as a card and sends nothing. A pack's letters keep the
 * rules of every outreach letter: who sends it and where, how to stop it,
 * two follow-ups at most, bounces left alone.
 */

import type { TaskPlan } from '@/lib/agents/tasks'
import { CANDIDATE_UPDATE_TEMPLATE, DAYS_APART, FOLLOW_UPS, OUTREACH_BATCH_TEMPLATE, OUTREACH_LETTER_TYPE } from './batch-rules'
import { CONTENT_KINDS, CONTENT_LABELS, type ContentKind } from './match-rules'
import type { SegmentRole } from './segment-rules'

export const OUTREACH_PACK_KIND = 'OUTREACH_PACK'
/** What a pack's task carries in its payload, so the walker and the page know whose letters these are. */
export const PACK_SIDE = 'PACK'
/** PROPOSED, AWAITING THE OWNER: the most letters one pack's yes releases. More is a new pack and a new yes. */
export const PACK_LETTER_CAP = 50

export type PackState = 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'CLOSED'

export interface PackAsk { name: string; segmentId: string; contentKinds: ContentKind[] }

/** What a person asked for as a pack, or the field and sentence that is missing. Pure. */
export function readPackAsk(raw: unknown): { ok: true; ask: PackAsk } | { ok: false; field: string; says: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return { ok: false, field: 'name', says: 'Give the pack a name.' }
  if (name.length > 80) return { ok: false, field: 'name', says: 'Keep the name under 80 characters.' }
  if (typeof b.segmentId !== 'string' || !b.segmentId) return { ok: false, field: 'segmentId', says: 'Choose the segment the pack writes to.' }
  const kinds = Array.isArray(b.contentKinds) ? [...new Set(b.contentKinds)] : []
  if (kinds.length === 0) return { ok: false, field: 'contentKinds', says: 'Choose what the pack may carry: a course, a team offer, outcome proof.' }
  if (!kinds.every((k): k is ContentKind => CONTENT_KINDS.includes(k as ContentKind))) return { ok: false, field: 'contentKinds', says: 'A pack carries a course, a team offer or outcome proof, and nothing else.' }
  return { ok: true, ask: { name, segmentId: b.segmentId, contentKinds: kinds } }
}

/** Why a push cannot join this pack, in a sentence; null where it fits. Never joins a pack that was not approved. Pure. */
export function packFits(pack: { state: string; segmentId: string; contentKinds: readonly string[] }, push: { segmentId: string; contentKind: string }): string | null {
  if (pack.state !== 'APPROVED') return 'The pack has not been approved, so nothing joins it.'
  if (pack.segmentId !== push.segmentId) return 'The push is for a different segment than the pack declared.'
  if (!pack.contentKinds.includes(push.contentKind)) return `The pack does not carry ${CONTENT_LABELS[push.contentKind as ContentKind]?.toLowerCase() ?? 'that kind of content'}.`
  return null
}

/** A candidate's letter is the update letter, never sent again; a company's is the outreach letter with its follow-ups. */
export const packSideOf = (role: SegmentRole): 'CANDIDATE' | 'CONTACT' => (role === 'CANDIDATE' ? 'CANDIDATE' : 'CONTACT')

/** The plan the one yes approves: the letters, their follow-ups, and the most it may send. Pure. */
export function packPlan(role: SegmentRole, cap: number = PACK_LETTER_CAP): TaskPlan {
  const candidate = packSideOf(role) === 'CANDIDATE'
  return {
    messages: [candidate ? { template: CANDIDATE_UPDATE_TEMPLATE, label: 'Update letter' } : { template: OUTREACH_BATCH_TEMPLATE, label: 'Offer letter' }],
    retries: candidate ? 0 : FOLLOW_UPS, daysApart: candidate ? 1 : DAYS_APART, recipients: cap, letterRecordType: OUTREACH_LETTER_TYPE,
    closesWhen: 'the Owner closes the pack, or every letter it may send has gone, been answered or been stopped',
  }
}

/** The card that asks for the one yes. Names the segment, the content, the cap, and what stays true of every letter. Pure. */
export function packCard(i: { name: string; segmentWords: string; contentKinds: readonly ContentKind[]; role: SegmentRole; cap: number }): { question: string; detail: string } {
  const kinds = i.contentKinds.map((k) => CONTENT_LABELS[k].toLowerCase()).join(', ')
  const again = packSideOf(i.role) === 'CANDIDATE' ? 'Each person gets one letter and is not written to again.' : `A letter may be sent again up to ${FOLLOW_UPS} times, ${DAYS_APART} working days apart.`
  return {
    question: `Outreach: approve the pack "${i.name}"? Letters go only inside it, and only if you say yes.`,
    detail: `Who: ${i.segmentWords}\nWhat it may carry: ${kinds}.\nThe most it sends: ${i.cap} letters. More is a new pack and asks you again.\n${again}\nEvery letter says who sends it and where, and carries a link that stops letters like it. Anyone who has stopped, or whose address bounced, is left alone.\nEtyme drafts each letter from your own record as something happens. You see each one in the pack before it goes. Anything that does not fit this pack waits for you and sends nothing.`,
  }
}

/** The card for a detected push no approved pack covers. It sends nothing; it says what to approve. Pure. */
export function waitingCard(i: { reason: string; contentLabel: string; segmentWords: string }): { question: string; detail: string } {
  return {
    question: `Outreach: ${i.reason} Approve a pack for it?`,
    detail: `${i.reason}\nA letter is drafted: ${i.contentLabel.toLowerCase()}, for ${i.segmentWords}\nNo approved pack covers that segment and that kind, so nothing is sent. Open Companies, Outreach and propose a pack that does; the letter joins it once you say yes to the pack. Saying yes here only tells Etyme you have seen it.`,
  }
}
