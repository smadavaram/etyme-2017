/**
 * Who an outreach batch may write to (record 117, step 1; record 116). Pure.
 *
 * An audience is read from the firm's own record: the companies on its
 * register as customers or suppliers, and the contacts the firm itself
 * recorded at them. Never a bought, rented or public list, never a
 * contact read from another firm's record, never a company Not
 * classified. One letter goes to one contact per company. Whoever cannot
 * be written to is listed as held with the sentence that says why.
 */

import { formatDayLong } from '@/lib/format-date'
import { chooseRecipient, coolingOffHolds, type Block, type RolodexRow } from '@/lib/agents/dormant-outreach-rules'
import type { Side } from '@/lib/agents/census-rules'

export const AUDIENCES = ['DORMANT_CUSTOMERS', 'ALL_CUSTOMERS', 'DORMANT_SUPPLIERS', 'ALL_SUPPLIERS'] as const
export type Audience = (typeof AUDIENCES)[number]
export const AUDIENCE_LABELS: Record<Audience, string> = {
  DORMANT_CUSTOMERS: 'Customers gone quiet', ALL_CUSTOMERS: 'All customers', DORMANT_SUPPLIERS: 'Suppliers gone quiet', ALL_SUPPLIERS: 'All suppliers',
}
export const sideOfAudience = (a: Audience): Side => (a.endsWith('CUSTOMERS') ? 'CUSTOMER' : 'SUPPLIER')

export type HeldReason = Block | 'NOT_CLASSIFIED' | 'COOLING_OFF'
export interface PoolCompany { id: string; name: string; side: Side; standing: 'ACTIVE' | 'DORMANT'; lastActivity: Date | null }
export interface PoolContact extends RolodexRow { atCompanyId: string }
export interface AudienceInput {
  audience: Audience
  /** Write only to this kind of contact (Procurement, Hiring manager...); null for whoever reads it best. */
  contactKind: string | null
  /** The firm's own register: customers and suppliers, active or dormant. */
  register: readonly PoolCompany[]
  /** Companies the firm recorded that hold no position yet. */
  notClassified: readonly { id: string; name: string }[]
  /** The firm's own rolodex rows. Rows at any other company are never read. */
  contacts: readonly PoolContact[]
  /** Addresses this firm's earlier outreach bounced on, lower case. */
  bounced: ReadonlySet<string>
  /** When this firm last wrote or drafted outreach to each company on this side. */
  lastWrittenTo: ReadonlyMap<string, Date>
  today: Date
}
export interface Writes { contactId: string; atCompanyId: string; companyName: string; name: string; email: string }
export interface Held { atCompanyId: string; companyName: string; reason: HeldReason; says: string; lastOn: Date | null }

/** The sentence for a hold, naming the firm's own next step. Pure. */
export function heldSays(reason: HeldReason | 'NO_ADDRESS' | 'NO_LINK', companyName: string, lastOn: Date | null): string {
  switch (reason) {
    case 'OPTED_OUT': return `Everyone recorded at ${companyName} with an email asked for no more outreach. Nobody there is written to.`
    case 'BOUNCED': return `The address recorded at ${companyName} did not receive the last letter. Record a new address in Contacts and it is written to next time.`
    case 'NO_CONTACT': return `Nobody with an email is recorded at ${companyName} for this letter. Add a contact there in Contacts.`
    case 'NOT_CLASSIFIED': return `${companyName} is Not classified, so it is in no list. Open it in Companies and say whether it is a customer or a supplier.`
    case 'COOLING_OFF': return `${companyName} was written to${lastOn ? ` on ${formatDayLong(lastOn)}` : ' lately'}. Companies are left alone for 180 days between letters.`
    case 'NO_ADDRESS': return 'The firm has no postal address on record, and every letter must carry one. Add it in Settings.'
    case 'NO_LINK': return 'Etyme has no public web address on this deployment, so a letter could not carry its unsubscribe link.'
  }
}

/** Who gets a letter and who is held, for one audience. Pure. */
export function buildAudience(i: AudienceInput): { to: Writes[]; held: Held[] } {
  const side = sideOfAudience(i.audience)
  const dormantOnly = i.audience.startsWith('DORMANT')
  const companies = i.register
    .filter((c) => c.side === side && (!dormantOnly || c.standing === 'DORMANT'))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const to: Writes[] = []
  const held: Held[] = []
  const hold = (c: { id: string; name: string }, reason: HeldReason, lastOn: Date | null = null) =>
    held.push({ atCompanyId: c.id, companyName: c.name, reason, says: heldSays(reason, c.name, lastOn), lastOn })
  const seen = new Set<string>()
  for (const c of companies) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    const last = i.lastWrittenTo.get(c.id) ?? null
    if (coolingOffHolds(last, i.today)) { hold(c, 'COOLING_OFF', last); continue }
    const rows = i.contacts.filter((r) => r.atCompanyId === c.id && (!i.contactKind || r.kind === i.contactKind))
    const pick = chooseRecipient(rows, i.bounced, side)
    if (!pick.ok) { hold(c, pick.block); continue }
    to.push({ contactId: pick.to.id, atCompanyId: c.id, companyName: c.name, name: pick.to.name, email: pick.to.email })
  }
  // A company the firm recorded with no position is never written to, and a broad list says so.
  if (!dormantOnly) for (const n of [...i.notClassified].sort((a, b) => a.name.localeCompare(b.name))) hold(n, 'NOT_CLASSIFIED')
  return { to, held }
}
