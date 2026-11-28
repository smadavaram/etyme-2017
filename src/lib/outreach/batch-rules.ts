/**
 * An outreach batch's rules (record 117, step 4; record 116). Pure.
 *
 * One batch is one task and one yes. The plan is one letter, sent again
 * at most twice, five working days apart (a proposal), to each of N
 * contacts. The letter says who sends it and where, why the reader got it,
 * and how to stop it; it carries no tracking and no html. A follow-up is
 * never sent to a contact who unsubscribed, said they are interested, or
 * whose address bounced.
 */

import { hello, paragraphs } from '@/lib/notify/letters'
import { UNSUBSCRIBE_PLACEHOLDER } from '@/lib/agents/dormant-outreach-rules'
import { addWorkingDays } from '@/lib/agents/checklist-rules'
import type { TaskPlan } from '@/lib/agents/tasks'
import { AUDIENCES, type Audience } from './audience-rules'
import { OFFER_KINDS, draftOffer, hotListWordsRefusal, type OfferKind } from './offer-rules'

export const OUTREACH_BATCH_AGENT = 'outreach-batch'
export const OUTREACH_BATCH_KIND = 'OUTREACH_BATCH'
export const OUTREACH_BATCH_TEMPLATE = 'outreach-batch'
/**
 * Basic outreach is core (record 135): an update letter to a candidate and a
 * letter to one contact have their own templates, so the Outreach switch,
 * which holds only the letters that sell, never reads them as selling.
 */
export const CANDIDATE_UPDATE_TEMPLATE = 'candidate-update'
export const DIRECT_LETTER_TEMPLATE = 'direct-letter'
export const OUTREACH_LETTER_TYPE = 'OutreachLetter'
export const OUTREACH_BATCH_RULE = 'outreach-batch-v1'

/** PROPOSED, AWAITING THE OWNER: how many times a letter may be sent again. */
export const FOLLOW_UPS = 2
/** PROPOSED, AWAITING THE OWNER: working days between a letter and its follow-up. */
export const DAYS_APART = 5

export const INTERESTED_PLACEHOLDER = '(the I’m interested link goes here when the letter is sent)'

export function batchPlan(recipients: number): TaskPlan {
  return {
    messages: [{ template: OUTREACH_BATCH_TEMPLATE, label: 'Offer letter' }],
    retries: FOLLOW_UPS, daysApart: DAYS_APART, recipients, letterRecordType: OUTREACH_LETTER_TYPE,
    closesWhen: 'every letter has gone, been answered or been stopped',
  }
}

/** Why a batch cannot be drafted at all, in a sentence naming the fix; null where it can. Pure. */
export function batchBlock(i: { postal: string | null; base: string }): { block: 'NO_POSTAL' | 'NO_LINK'; says: string } | null {
  if (!i.postal) return { block: 'NO_POSTAL', says: 'The firm has no postal address on record, and every letter must carry one. Add it in Settings: /dashboard/settings/setup/addresses' }
  if (!i.base) return { block: 'NO_LINK', says: 'Etyme has no public web address on this deployment, so a letter could not carry its unsubscribe link. Nothing was drafted.' }
  return null
}

export interface LetterInput {
  firm: string
  postal: string
  recipientName: string
  companyName: string
  subject: string
  body: string
  /** Null on the card, where a placeholder stands for the link. */
  unsubscribeUrl: string | null
  interestedUrl: string | null
  /** The firm's own public page; null where it has none. */
  storefrontUrl: string | null
  /** 1 for the letter; 2 and 3 for the follow-ups, which say they are one. */
  attempt?: number
  /** A letter to one contact the firm chose to write to: it sells nothing, so it carries no "I'm interested" link. */
  direct?: boolean
}

/** The letter: plain text, the person's words in the middle, the honest parts around them. Pure. */
export function buildLetter(i: LetterInput): { subject: string; text: string } {
  return {
    subject: (i.attempt ?? 1) > 1 ? `Following up: ${i.subject}` : i.subject,
    text: paragraphs(
      hello(i.recipientName),
      (i.attempt ?? 1) > 1 ? `A short follow-up to the letter ${i.firm} sent you earlier, in case it was missed.` : null,
      i.direct
        ? `${i.firm} is writing to you directly. It has your name in its own records as a contact at ${i.companyName}.`
        : `You are getting this because ${i.firm} has your name in its own records as a contact at ${i.companyName}.`,
      i.body.trim(),
      i.direct ? null : `If this is of interest, tell us here: ${i.interestedUrl ?? INTERESTED_PLACEHOLDER}`,
      i.storefrontUrl ? `More about ${i.firm}: ${i.storefrontUrl}` : null,
      `${i.firm}\n${i.postal}`,
      `Do not want letters like this from ${i.firm}? Unsubscribe here, no sign-in needed: ${i.unsubscribeUrl ?? UNSUBSCRIBE_PLACEHOLDER}\nThis stops letters like this only. Messages about work already agreed, such as timesheets and bills, still reach you.`,
    ),
  }
}

// ── What a person asks for ───────────────────────────────────────────

export interface BatchAsk { audience: Audience; contactKind: string | null; offerKind: OfferKind; offer: Record<string, unknown>; subject: string; body: string }

/** A subject that says what the letter is: not empty, not a pretend reply or forward, not shouting. */
export function subjectRefusal(subject: string): string | null {
  const s = subject.trim()
  if (!s) return 'Give the letter a subject that says what it offers.'
  if (s.length > 120) return 'Keep the subject under 120 characters.'
  if (/^(re|fwd?)\s*:/i.test(s)) return 'A subject cannot start with Re: or Fwd:. It would pretend to be part of a conversation that did not happen.'
  return null
}

export function bodyRefusal(body: string): string | null {
  const b = body.trim()
  if (!b) return 'Write what the letter offers.'
  if (b.length > 4000) return 'Keep the letter under 4,000 characters.'
  if (/https?:\/\/|www\./i.test(b)) return 'Take the web address out of the letter. Etyme adds the links, and every one goes to your own page.'
  return null
}

/** What the create route asks for, or the field and the sentence that is missing. Pure. */
export function readBatchAsk(raw: unknown): { ok: true; ask: BatchAsk } | { ok: false; field: string; says: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!AUDIENCES.includes(b.audience as Audience)) return { ok: false, field: 'audience', says: 'Choose who the letter goes to.' }
  if (!OFFER_KINDS.includes(b.offerKind as OfferKind)) return { ok: false, field: 'offerKind', says: 'Choose what the letter offers.' }
  const drafted = draftOffer('x', b.offerKind as string, b.offer)
  if (!drafted.ok) return { ok: false, field: drafted.field, says: drafted.says }
  const subject = typeof b.subject === 'string' ? b.subject : ''
  const subjectSays = subjectRefusal(subject)
  if (subjectSays) return { ok: false, field: 'subject', says: subjectSays }
  const body = typeof b.body === 'string' ? b.body : ''
  const bodySays = bodyRefusal(body)
  if (bodySays) return { ok: false, field: 'body', says: bodySays }
  // The words that go out are checked, not only the lines they were drafted from.
  if (b.offerKind === 'HOT_LIST') {
    const s = hotListWordsRefusal(subject)
    if (s) return { ok: false, field: 'subject', says: s }
    const t = hotListWordsRefusal(body)
    if (t) return { ok: false, field: 'body', says: t }
  }
  const kind = typeof b.contactKind === 'string' && b.contactKind.trim() ? b.contactKind.trim() : null
  return { ok: true, ask: { audience: b.audience as Audience, contactKind: kind, offerKind: b.offerKind as OfferKind, offer: b.offer as Record<string, unknown>, subject: subject.trim(), body: body.trim() } }
}

// ── A letter's life ──────────────────────────────────────────────────

export interface LetterState { state: string; attempt: number; nextDueAt: Date | null }
export type StopReason = 'INTERESTED' | 'UNSUBSCRIBED' | 'BOUNCED' | 'NOT_SENT'

/** What the letter is owed now: its first, a follow-up, or nothing. Pure. */
export function letterDue(l: LetterState, now: Date): 'LETTER' | 'FOLLOW_UP' | null {
  if (l.state === 'READY' && l.attempt === 0) return 'LETTER'
  if (l.state === 'SENT' && l.attempt >= 1 && l.attempt <= FOLLOW_UPS && l.nextDueAt && l.nextDueAt.getTime() <= now.getTime()) return 'FOLLOW_UP'
  return null
}

/** Whether a letter has more to do: not stopped, and not at its last follow-up. Pure. */
export const letterOpen = (l: LetterState): boolean => l.state === 'READY' || (l.state === 'SENT' && l.attempt <= FOLLOW_UPS)

/** The row a letter becomes once the mail door has answered. Pure. */
export function settleLetter(l: LetterState, outcome: string, now: Date): { state: string; attempt: number; nextDueAt: Date | null; stoppedReason: StopReason | null } {
  if (outcome === 'SENT') {
    const attempt = l.attempt + 1
    return { state: 'SENT', attempt, nextDueAt: attempt <= FOLLOW_UPS ? addWorkingDays(now, DAYS_APART, [0, 6], new Set()) : null, stoppedReason: null }
  }
  if (outcome === 'FAILED_DELIVERY') return { state: 'STOPPED', attempt: l.attempt, nextDueAt: null, stoppedReason: 'BOUNCED' }
  return { state: 'STOPPED', attempt: l.attempt, nextDueAt: null, stoppedReason: 'NOT_SENT' }
}

/** Why a letter must not go now, where it must not. Pure. */
export function stopFor(_l: LetterState, f: { optedOut: boolean; interested: boolean; bounced: boolean; reachable: boolean }): StopReason | null {
  if (f.optedOut) return 'UNSUBSCRIBED'
  if (f.interested) return 'INTERESTED'
  if (f.bounced) return 'BOUNCED'
  if (!f.reachable) return 'NOT_SENT'
  return null
}

/** How many of the letters due go today and how many wait for the next run. Pure. */
export function sendsNow(due: number, left: number | null): { now: number; later: number } {
  const now = left === null ? due : Math.min(due, Math.max(0, left))
  return { now, later: due - now }
}

// ── What the person reads ────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The card that asks for the one yes: the question, and the letter with who gets it and who is held. Pure. */
export function batchCard(i: {
  firm: string; audienceLabel: string; subject: string; letter: string
  to: readonly { name: string; email: string; companyName: string }[]
  held: readonly { companyName: string; says: string }[]
}): { question: string; detail: string } {
  const people = i.to.map((t) => `${t.name} <${t.email}> at ${t.companyName}`).join('\n')
  const held = i.held.length ? `\n\nHeld, not written to (${i.held.length})\n${i.held.map((h) => h.says).join('\n')}` : ''
  return {
    question: `Outreach: send "${i.subject}" to ${plural(i.to.length, 'company', 'companies')}? Etyme drafted the letter and sends it only if you say yes.`,
    detail: `${i.audienceLabel}. Subject: ${i.subject}\n\n${i.letter}\n\nWho gets it (${i.to.length})\n${people}${held}\n\nThe 180 days between letters to one company, and the 5 working days before a letter is sent again, are proposals.`,
  }
}

export interface Counts { contacts: number; sent: number; interested: number; unsubscribed: number; bounced: number; waiting: number }

/** The batch page's numbers: sent and bounced from the mail sent, interested and unsubscribed from the letters. No open rate exists. Pure. */
export function countsOf(i: {
  letters: readonly { id: string; state: string; interestedAt: Date | null; optedOut: boolean }[]
  sends: readonly { recordId: string | null; outcome: string }[]
}): Counts {
  const sentIds = new Set(i.sends.filter((s) => s.outcome === 'SENT' && s.recordId).map((s) => s.recordId!))
  const bouncedIds = new Set(i.sends.filter((s) => s.outcome === 'FAILED_DELIVERY' && s.recordId).map((s) => s.recordId!))
  return {
    contacts: i.letters.length,
    sent: i.letters.filter((l) => sentIds.has(l.id)).length,
    interested: i.letters.filter((l) => l.interestedAt !== null).length,
    unsubscribed: i.letters.filter((l) => l.optedOut).length,
    bounced: i.letters.filter((l) => bouncedIds.has(l.id)).length,
    waiting: i.letters.filter((l) => l.state === 'READY').length,
  }
}

/** Where one contact's letter stands, in the words a person reads on the batch page. Pure. */
export function letterWords(l: LetterState & { stoppedReason: string | null; interestedAt: Date | null; optedOut: boolean; bounced: boolean }): string {
  if (l.interestedAt) return 'Interested. A lead is open and no more letters go.'
  if (l.optedOut) return 'Unsubscribed. No more letters go.'
  if (l.bounced) return 'Bounced. No more letters go until a new address is recorded.'
  if (l.state === 'STOPPED') return 'Not sent. The contact could not be written to when its turn came.'
  if (l.state === 'READY') return 'Waiting to go. It sends on the next run.'
  if (letterOpen(l) && l.nextDueAt) return `Sent ${l.attempt === 1 ? 'once' : `${l.attempt} times`}. The next goes on or after ${l.nextDueAt.toISOString().slice(0, 10)} unless they answer.`
  return `Sent ${l.attempt === 1 ? 'once' : `${l.attempt} times`}. No more follow-ups.`
}
