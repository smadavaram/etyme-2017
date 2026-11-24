/**
 * The dormant outreach's rules (record 112, chain 1, "Win work", item
 * "Drafts of outreach and chases", part B; record 116). Pure.
 *
 * When a customer or a supplier goes quiet, one task holds a plain
 * check-in letter and the person it goes to. After one person's yes, and
 * only with the agent On, the letter is sent: once, no reminders. Five
 * rules from record 116 decide who may be written to and how:
 * permission (the firm's own contact at a company it traded with),
 * an unsubscribe in every letter, an honest sender with a postal address,
 * a bounced address left alone, and one letter per company and side in
 * 180 days.
 */

import { formatDay } from '@/lib/format-date'
import { hello, paragraphs } from '@/lib/notify/letters'
import type { CensusRow, Side } from './census-rules'
import type { TaskPlan } from './tasks'

/** PROPOSED, AWAITING THE OWNER. Nobody has decided how long a company is left alone after a draft. */
export const COOLING_OFF_DAYS = 180

export const OUTREACH_TEMPLATE = 'dormant-outreach'
/** The task's record is the contact it goes to, so a send, an opt-out and a bounce all read one row. */
export const OUTREACH_RECORD = 'CompanyContact'
export const outreachKind = (side: Side): string => `DORMANT_OUTREACH_${side}`
export const OUTREACH_KINDS = ['DORMANT_OUTREACH_CUSTOMER', 'DORMANT_OUTREACH_SUPPLIER']

/** One letter, never sent again. Anything more is a new task and asks again. */
export const OUTREACH_PLAN: TaskPlan = {
  messages: [{ template: OUTREACH_TEMPLATE, label: 'Check-in letter' }],
  retries: 0, daysApart: 1, closesWhen: 'the letter has gone',
}

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

/** Where a firm's letters come from, as one line; null until a street and a city are recorded. Pure. */
export function postalLine(a: { street: string | null; city: string | null; state: string | null; postalCode: string | null; country: string } | null): string | null {
  if (!a?.street?.trim() || !a.city?.trim()) return null
  const place = [a.city.trim(), [a.state?.trim(), a.postalCode?.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [a.street.trim(), place, a.country?.trim()].filter(Boolean).join(', ')
}

export interface RolodexRow { id: string; name: string; email: string | null; kind: string; outreachOptOutAt: Date | null }
export type Block = 'NO_ADDRESS' | 'NO_LINK' | 'NO_CONTACT' | 'OPTED_OUT' | 'BOUNCED'
export type Recipient = { id: string; name: string; email: string }

/** Who a check-in goes to, by the kinds of contact that read it well; anybody else with an email after them, accounts payable last. */
const PREFERRED: Record<Side, string[]> = {
  CUSTOMER: ['HIRING_MANAGER', 'PROCUREMENT', 'EXECUTIVE'],
  SUPPLIER: ['RECRUITING', 'DELIVERY', 'EXECUTIVE'],
}

/**
 * Who may be written to, from the firm's own rolodex rows at the company
 * (the caller reads only rows whose owner is the sending firm). A contact
 * who unsubscribed, or whose address bounced, is never chosen; where
 * nobody is left it says which of the three it was. Pure.
 */
export function chooseRecipient(rows: readonly RolodexRow[], bounced: ReadonlySet<string>, side: Side): { ok: true; to: Recipient } | { ok: false; block: Block } {
  const withEmail = rows.filter((r) => r.email?.trim())
  if (withEmail.length === 0) return { ok: false, block: 'NO_CONTACT' }
  const open = withEmail.filter((r) => !r.outreachOptOutAt)
  if (open.length === 0) return { ok: false, block: 'OPTED_OUT' }
  const reachable = open.filter((r) => !bounced.has(r.email!.trim().toLowerCase()))
  if (reachable.length === 0) return { ok: false, block: 'BOUNCED' }
  const rank = (kind: string) => { const i = PREFERRED[side].indexOf(kind); return i >= 0 ? i : kind === 'AP' ? 99 : 50 }
  const pick = reachable.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.kind) - rank(b.r.kind) || a.i - b.i)[0].r
  return { ok: true, to: { id: pick.id, name: pick.name, email: pick.email!.trim() } }
}

export interface OutreachInput {
  side: Side
  firmName: string
  /** The firm's postal address as one line. */
  postal: string
  companyName: string
  lastActivity: Date | null
  today: Date
  recipient: { name: string }
  /** The link that works without signing in. Null on the card, where a placeholder stands for it. */
  unsubscribeUrl: string | null
}

export const UNSUBSCRIBE_PLACEHOLDER = '(the unsubscribe link goes here when the letter is sent)'

/** The letter. It says who sends it and where, why the reader got it, and how to stop it. No rate and no name of anyone who worked there. Pure. */
export function outreachLetter(i: OutreachInput): { subject: string; text: string } {
  const since = i.lastActivity ? `since ${formatDay(i.lastActivity)}` : 'for some time'
  const customer = i.side === 'CUSTOMER'
  return {
    subject: customer ? `Check-in from ${i.firmName}: any jobs coming up?` : `Check-in from ${i.firmName}: any people available?`,
    text: paragraphs(
      hello(i.recipient.name),
      customer
        ? `You are getting this because ${i.firmName} has not done any work with ${i.companyName} ${since}, and we have your name from our own records.`
        : `You are getting this because ${i.companyName} has not put forward any people to ${i.firmName} ${since}, and we have your name from our own records.`,
      customer
        ? 'If you have jobs coming up, reply and tell us what you need. If you do not, a line saying so is just as useful.'
        : 'If you have people available, reply and tell us who and from when. If you do not, a line saying so is just as useful.',
      `${i.firmName}\n${i.postal}`,
      `Do not want letters like this from ${i.firmName}? Unsubscribe here, no sign-in needed: ${i.unsubscribeUrl ?? UNSUBSCRIBE_PLACEHOLDER}\nThis stops check-in letters only. Messages about work already agreed, such as timesheets and bills, still reach you.`,
    ),
  }
}

const quietWords = (i: { lastActivity: Date | null }) => (i.lastActivity ? `nothing since ${formatDay(i.lastActivity)}` : 'nothing on record')

/** The task's card: the question, and the draft with its recipient as the detail. Pure. */
export function outreachCard(i: OutreachInput & { recipient: { name: string; email: string } }): { question: string; detail: string } {
  const letter = outreachLetter(i)
  return {
    question: `${outreachPrefix(i.side)}${i.companyName}: ${quietWords(i)}. Etyme drafted a check-in letter and sends it only if you say yes.`,
    detail: `To: ${i.recipient.name} <${i.recipient.email}>\nSubject: ${letter.subject}\n\n${letter.text}\n\nThe 180-day wait before another letter to this company is a proposal.`,
  }
}

/** The card where no letter can be drafted, and why, in a sentence that names the fix. Pure. */
export function blockedCard(i: { side: Side; firmName: string; companyName: string; lastActivity: Date | null }, block: Block): { question: string; proof: string } {
  const why: Record<Block, string> = {
    NO_ADDRESS: `${i.firmName} has no postal address on record, and every letter must carry one. Add the firm's address in Settings: /dashboard/settings/setup/addresses. Then send the check-in yourself.`,
    NO_LINK: 'Etyme has no public web address on this deployment, so the letter could not carry its unsubscribe link. Nothing was drafted.',
    NO_CONTACT: `No one with an email is recorded at ${i.companyName}. Add a contact there in Contacts: /dashboard/contacts. Then send the check-in yourself.`,
    OPTED_OUT: `Everyone recorded at ${i.companyName} with an email asked ${i.firmName} for no more check-in letters. Nothing is sent to them.`,
    BOUNCED: `The address recorded at ${i.companyName} did not receive the last check-in letter. Record a new address for them in Contacts: /dashboard/contacts. Then send the check-in yourself.`,
  }
  return {
    question: `${outreachPrefix(i.side)}${i.companyName}: ${quietWords(i)}. No letter was drafted, and nothing is sent. Read why.`,
    proof: `${why[block]}\n\nThe 180-day wait before another card for this company is a proposal.`,
  }
}
