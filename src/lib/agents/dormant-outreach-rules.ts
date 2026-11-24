/**
 * The dormant outreach's rules (record 112, chain 1, "Win work", item
 * "Drafts of outreach and chases", part B). Pure.
 *
 * Outreach is a person's act. The agent only drafts: when a customer or a
 * supplier goes quiet, one card holds a plain check-in letter and the
 * person it would go to. Nothing is sent by Etyme, ever. There is no task
 * and no yes that releases a send, because no send exists.
 */

import { formatDay } from '@/lib/format-date'
import { hello, paragraphs } from '@/lib/notify/letters'
import type { CensusRow, Side } from './census-rules'

/** PROPOSED, AWAITING THE OWNER. Nobody has decided how long a company is left alone after a draft. */
export const COOLING_OFF_DAYS = 180

export const OUTREACH_SENTENCE = 'A person sends this; Etyme sent nothing.'

/** A card's opening words, by side. The cooling-off and the dedupe read cards by this prefix. */
export const outreachPrefix = (side: Side): string => `Check in with ${side === 'CUSTOMER' ? 'customer' : 'supplier'} `

const DAY = 86_400_000
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY)

/** The companies that were active a week ago and are dormant now. A company new on the census is not one. Pure. */
export function becameDormant(before: readonly CensusRow[], after: readonly CensusRow[]): CensusRow[] {
  const was = new Map(before.map((r) => [r.key, r]))
  return after.filter((r) => r.standing === 'DORMANT' && was.get(r.key)?.standing === 'ACTIVE')
}

/** Whether a draft was made for this company and side too recently to make another. Pure. */
export function coolingOffHolds(lastDraftOn: Date | null, today: Date, days: number = COOLING_OFF_DAYS): boolean {
  return lastDraftOn !== null && dayOf(today) - dayOf(lastDraftOn) < days
}

export interface OutreachInput {
  side: Side
  firmName: string
  companyName: string
  lastActivity: Date | null
  today: Date
  /** Somebody recorded at the company with an email; null where nobody is. */
  recipient: { name: string; email: string } | null
}

/** The draft letter. It differs by side, says why the reader got it, and carries no rate, no link and no name of anyone. Pure. */
export function outreachLetter(i: OutreachInput): { subject: string; text: string } {
  const since = i.lastActivity ? `since ${formatDay(i.lastActivity)}` : 'for some time'
  const customer = i.side === 'CUSTOMER'
  return {
    subject: `Checking in from ${i.firmName}`,
    text: paragraphs(
      hello(i.recipient?.name ?? null),
      customer
        ? `You are getting this because ${i.firmName} has not done any work with ${i.companyName} ${since}.`
        : `You are getting this because ${i.companyName} has not put forward any people to ${i.firmName} ${since}.`,
      customer
        ? 'If you have jobs coming up, reply and tell us what you need. If you do not, a line saying so is just as useful.'
        : 'If you have people available, reply and tell us who and from when. If you do not, a line saying so is just as useful.',
    ),
  }
}

/** The card: the question, and the draft with its recipient as the proof. Pure. */
export function outreachCard(i: OutreachInput): { question: string; proof: string } {
  const letter = outreachLetter(i)
  const quiet = i.lastActivity ? `nothing since ${formatDay(i.lastActivity)}` : 'nothing on record'
  const to = i.recipient
    ? `To: ${i.recipient.name} <${i.recipient.email}>`
    : `No one with an email is recorded at ${i.companyName}. Add a contact there, then send the draft yourself.`
  return {
    question: `${outreachPrefix(i.side)}${i.companyName}: ${quiet}. Etyme drafted a check-in letter. ${OUTREACH_SENTENCE}`,
    proof: `${to}\nSubject: ${letter.subject}\n\n${letter.text}\n\n${OUTREACH_SENTENCE} The 180-day wait before another draft for this company is a proposal.`,
  }
}
