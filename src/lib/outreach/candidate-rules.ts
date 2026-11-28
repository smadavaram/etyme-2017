/**
 * Update letters to candidates (record 117, the lead's ruling of 2026-11-27). Pure.
 *
 * A candidate gets an update letter from a firm only while she has a standing
 * yes to updates on her own record (`saidYesToUpdates`), and only from a firm
 * that keeps her. A yes to be put forward is not this yes. One letter goes to
 * each, never sent again, and carries a link that ends updates from every
 * firm with no sign-in. Whoever cannot be written to is held, with the
 * sentence that says why. The firm reads names only: never an address, and
 * never a name of somebody who has not said yes.
 */

import { formatDayLong } from '@/lib/format-date'
import { hello, paragraphs } from '@/lib/notify/letters'
import { coolingOffHolds } from '@/lib/agents/dormant-outreach-rules'
import { saidYesToUpdates } from '@/lib/updates-consent'
import { CANDIDATE_UPDATE_TEMPLATE, OUTREACH_LETTER_TYPE } from './batch-rules'
import type { TaskPlan } from '@/lib/agents/tasks'

/** What a candidate batch writes in its task, so the walker and the page know whose letters these are. */
export const CANDIDATE_SIDE = 'CANDIDATE'
export const CANDIDATE_AUDIENCE_LABEL = 'Candidates who said yes to updates'
export const STOP_UPDATES_PLACEHOLDER = '(the link that stops updates goes here when the letter is sent)'

/** One letter and no follow-up: a candidate who did not answer is left alone. */
export function candidatePlan(recipients: number): TaskPlan {
  return {
    messages: [{ template: CANDIDATE_UPDATE_TEMPLATE, label: 'Update letter' }],
    retries: 0, daysApart: 1, recipients, letterRecordType: OUTREACH_LETTER_TYPE,
    closesWhen: 'every letter has gone or been stopped',
  }
}

export type CandidateHeld = 'NO_ADDRESS' | 'BOUNCED' | 'COOLING_OFF'

export interface CandidateFact {
  personId: string
  /** The name the firm reads her under. */
  name: string
  email: string | null
  updatesYesAt: Date | null
  updatesRevokedAt: Date | null
  /** Addresses this firm's earlier update letters bounced on, read by the caller. */
  bouncedAddress: boolean
  /** When this firm last drafted an update letter for her; null where it never did. */
  lastWrittenOn: Date | null
}
export interface CandidateWrites { personId: string; name: string; email: string }
export interface CandidateHeldRow { personId: string; name: string; reason: CandidateHeld; says: string }

export function candidateHeldSays(reason: CandidateHeld, name: string, lastOn: Date | null): string {
  switch (reason) {
    case 'NO_ADDRESS': return `${name} has no email address on record, so no letter can go. Nothing is sent to ${name}.`
    case 'BOUNCED': return `The last update letter to ${name} did not arrive. Nothing more is sent until ${name} changes the address on her own record.`
    case 'COOLING_OFF': return `${name} was written to${lastOn ? ` on ${formatDayLong(lastOn)}` : ' lately'}. Candidates are left alone for 180 days between update letters.`
  }
}

/**
 * Who gets a letter and who is held. A candidate without a standing yes is in
 * neither list: she is only counted, and never named. One letter per person.
 */
export function buildCandidateAudience(rows: readonly CandidateFact[], today: Date): { to: CandidateWrites[]; held: CandidateHeldRow[]; withoutYes: number } {
  const to: CandidateWrites[] = []
  const held: CandidateHeldRow[] = []
  const seen = new Set<string>()
  let withoutYes = 0
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId))
  for (const r of sorted) {
    if (seen.has(r.personId)) continue
    seen.add(r.personId)
    if (!saidYesToUpdates(r)) { withoutYes++; continue }
    const hold = (reason: CandidateHeld) => held.push({ personId: r.personId, name: r.name, reason, says: candidateHeldSays(reason, r.name, r.lastWrittenOn) })
    if (!r.email?.trim()) { hold('NO_ADDRESS'); continue }
    if (r.bouncedAddress) { hold('BOUNCED'); continue }
    if (coolingOffHolds(r.lastWrittenOn, today)) { hold('COOLING_OFF'); continue }
    to.push({ personId: r.personId, name: r.name, email: r.email.trim() })
  }
  return { to, held, withoutYes }
}

export interface CandidateLetterInput {
  firm: string
  postal: string
  recipientName: string
  subject: string
  body: string
  /** Null on the card, where a placeholder stands for the link. */
  stopUrl: string | null
  storefrontUrl: string | null
  /** A pack's tracked link to the page the letter is about (record 135); null where the letter has none. */
  pageUrl?: string | null
}

/** The letter: plain text, no tracking, no interested link. It says who sends it, why she got it and how to stop all of it. */
export function buildCandidateLetter(i: CandidateLetterInput): { subject: string; text: string } {
  return {
    subject: i.subject,
    text: paragraphs(
      hello(i.recipientName),
      `You are getting this because you said yes to updates, and ${i.firm} keeps you on its list of candidates.`,
      i.body.trim(),
      i.pageUrl ? `The page this is about: ${i.pageUrl}` : null,
      i.storefrontUrl ? `More about ${i.firm}: ${i.storefrontUrl}` : null,
      `${i.firm}\n${i.postal}`,
      `Do not want updates? Stop them here, no sign-in needed: ${i.stopUrl ?? STOP_UPDATES_PLACEHOLDER}\nThis ends updates from every firm until you say yes again. Messages about work already agreed, such as timesheets, still reach you.`,
    ),
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The card that asks for the one yes. It names people and never an address. */
export function candidateCard(i: {
  firm: string; subject: string; letter: string
  to: readonly { name: string }[]
  held: readonly { says: string }[]
  withoutYes: number
}): { question: string; detail: string } {
  const people = i.to.map((t) => t.name).join('\n')
  const held = i.held.length ? `\n\nHeld, not written to (${i.held.length})\n${i.held.map((h) => h.says).join('\n')}` : ''
  const quiet = i.withoutYes > 0 ? `\n\n${plural(i.withoutYes, 'candidate has', 'candidates have')} not said yes to updates and ${i.withoutYes === 1 ? 'is' : 'are'} not written to.` : ''
  return {
    question: `Outreach: send "${i.subject}" to ${plural(i.to.length, 'candidate', 'candidates')}? Etyme drafted the letter and sends it only if you say yes.`,
    detail: `${CANDIDATE_AUDIENCE_LABEL}. Subject: ${i.subject}\n\n${i.letter}\n\nWho gets it (${i.to.length})\n${people}${held}${quiet}\n\nThe 180 days between letters to one candidate is a proposal. Each letter goes once, with no follow-up.`,
  }
}
