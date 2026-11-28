/**
 * A letter to one contact (record 135). Pure.
 *
 * Basic outreach is core: a person at the firm writes to one contact the firm
 * itself recorded at a company it trades with, from that party's ledger. It
 * is one task and one yes, like every letter that leaves on an agent's hand,
 * and it follows the mass-mail policy of record 116: the sender and its postal
 * address named, an unsubscribe in the letter, nobody who unsubscribed, no
 * address that bounced. It sells nothing, so it has no follow-up and is not
 * held by the Outreach switch.
 */
import type { TaskPlan } from '@/lib/agents/tasks'
import { DIRECT_LETTER_TEMPLATE, OUTREACH_LETTER_TYPE, bodyRefusal, subjectRefusal } from './batch-rules'

/** What a direct letter's task carries, so the walker and the ledger know whose letter this is. */
export const DIRECT_SIDE = 'DIRECT'

export function directPlan(): TaskPlan {
  return {
    messages: [{ template: DIRECT_LETTER_TEMPLATE, label: 'Letter' }],
    retries: 0, daysApart: 1, recipients: 1, letterRecordType: OUTREACH_LETTER_TYPE,
    closesWhen: 'the letter has gone or been stopped',
  }
}

export interface DirectFacts {
  contact: { name: string; email: string | null; outreachOptOutAt: Date | null }
  /** The company is on the firm's own register as a customer or a supplier. */
  tradesWithCompany: boolean
  /** An earlier letter to this address did not arrive. */
  bounced: boolean
  subject: string
  body: string
  postal: string | null
  /** The unsubscribe link can be made on this deployment. */
  link: boolean
}

/** The sentence that refuses a direct letter, with the field it is about; null where it may be drafted. Pure. */
export function directRefusal(f: DirectFacts): { says: string; field?: string } | null {
  if (!f.tradesWithCompany) return { says: 'That company is not one the firm trades with, so it is not written to. Record it as a customer or a supplier in Companies first.', field: 'contactId' }
  if (f.contact.outreachOptOutAt) return { says: `${f.contact.name} asked for no more letters from the firm, so nothing is drafted.`, field: 'contactId' }
  if (!f.contact.email?.trim()) return { says: `${f.contact.name} has no email address recorded. Add one in Contacts.`, field: 'contactId' }
  if (f.bounced) return { says: `The address recorded for ${f.contact.name} did not receive the last letter. Record a new address in Contacts first.`, field: 'contactId' }
  const s = subjectRefusal(f.subject); if (s) return { says: s, field: 'subject' }
  const b = bodyRefusal(f.body); if (b) return { says: b, field: 'body' }
  if (!f.postal) return { says: 'The firm has no postal address on record, and every letter must carry one. Add it in Settings.', field: 'postal' }
  if (!f.link) return { says: 'Etyme has no public web address on this deployment, so a letter could not carry its unsubscribe link. Nothing was drafted.', field: 'link' }
  return null
}

/** The card that asks for the one yes. It names the person and the company and never an address. */
export function directCard(i: { firm: string; contactName: string; companyName: string; subject: string; letter: string }): { question: string; detail: string } {
  return {
    question: `Write to ${i.contactName} at ${i.companyName}: "${i.subject}"? Etyme drafted the letter and sends it only if you say yes.`,
    detail: `A letter from ${i.firm} to one contact. Subject: ${i.subject}\n\n${i.letter}\n\nIt goes once, with no follow-up. The unsubscribe link ends letters from ${i.firm} to ${i.contactName}.`,
  }
}

/** One letter as a line on the party's ledger: what happened to it, in the trade's words. Pure. */
export function letterLineSays(l: { subject: string; state: string; taskState: string; times: number; stoppedReason: string | null }): string {
  const t = `Letter "${l.subject}"`
  if (l.taskState === 'REFUSED') return `${t}: Not approved, so nothing was sent.`
  if (l.state === 'SENT') return `${t}: Sent${l.times > 1 ? ` ${l.times} times` : ''}.`
  if (l.state === 'STOPPED') {
    const why = l.stoppedReason === 'UNSUBSCRIBED' ? 'the reader unsubscribed' : l.stoppedReason === 'BOUNCED' ? 'the address did not receive it' : l.stoppedReason === 'INTERESTED' ? 'the reader answered' : 'the reader could not be written to when its turn came'
    return `${t}: Not sent, ${why}.`
  }
  if (l.state === 'HELD') return `${t}: Held, not written to.`
  return l.taskState === 'PROPOSED' ? `${t}: Waiting for a yes.` : `${t}: Waiting to go. It sends on the next run.`
}
