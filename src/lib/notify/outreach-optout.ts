/**
 * The unsubscribe link in every outreach letter (record 116, rule 2).
 *
 * A check-in letter to a company gone quiet carries a link that works
 * with no sign-in. Using it records that this contact wants no more
 * outreach from the firm that sent it: `CompanyContact.outreachOptOutAt`
 * and one line on the record ledger. It stops outreach only. A chase
 * for a timesheet, a submission or a bill about a deal already made is
 * not outreach and still goes.
 *
 * The token is signed (`lib/signed-link`, purpose OUTREACH_OPTOUT) and
 * names only the contact. Nothing is stored for it, so there is no token
 * to leak from a table, and it is never logged, written to the ledger or
 * returned in a reply. Opening the page changes nothing: a mail scanner
 * that follows the link must not unsubscribe anybody, so the button does.
 * A second use finds the contact already unsubscribed and changes nothing.
 */
import { prisma } from '@/lib/db'
import { sign, read, baseUrl } from '@/lib/signed-link'
import { writeRecordAction } from '@/lib/record-ledger'

const KIND = 'OUTREACH_OPTOUT'

export const OUTREACH_OPTOUT_HELD_AS = 'Unsubscribe link'

/** The link for one contact, or null where the deployment has no public address (a letter then carries no broken link). */
export function unsubscribeUrlFor(contactId: string): string | null {
  const base = baseUrl()
  if (!base) return null
  try { return `${base}/answer/outreach/${sign(KIND, [contactId])}` } catch { return null }
}

export interface OptOutView { firm: string; already: boolean }
export type OptOutResult =
  | { ok: true; view: OptOutView; says: string }
  | { ok: false; status: number; says: string }

const BAD_LINK = 'This link is not valid. It may have been retyped or cut short. Use the unsubscribe link in the letter again.'

export const unsubscribedSays = (firm: string) =>
  `${firm} will send you no more outreach. Messages about work already agreed, such as timesheets and bills, still reach you.`

async function find(token: string) {
  const parts = read(KIND, token)
  if (!parts || !parts[0]) return null
  return prisma.companyContact.findUnique({
    where: { id: parts[0] },
    select: { id: true, name: true, companyId: true, atCompanyId: true, outreachOptOutAt: true, company: { select: { name: true } } },
  })
}

/** What the page shows: which firm the letter came from, and whether it is already done. Changes nothing. */
export async function openOptOut(token: string): Promise<OptOutResult> {
  const c = await find(token)
  if (!c) return { ok: false, status: 404, says: BAD_LINK }
  return { ok: true, view: { firm: c.company.name, already: c.outreachOptOutAt !== null }, says: '' }
}

/** Unsubscribe the contact. A second use changes nothing and says the same sentence. */
export async function applyOptOut(token: string, now: Date = new Date()): Promise<OptOutResult> {
  const c = await find(token)
  if (!c) return { ok: false, status: 404, says: BAD_LINK }
  const view = { firm: c.company.name, already: c.outreachOptOutAt !== null }
  if (c.outreachOptOutAt) return { ok: true, view, says: unsubscribedSays(c.company.name) }
  const moved = await prisma.companyContact.updateMany({ where: { id: c.id, outreachOptOutAt: null }, data: { outreachOptOutAt: now } })
  if (moved.count === 1) {
    // The ledger names a person; nobody signed in here, so it names the one who last set an agent's switch, as the agents do.
    const sw = await prisma.agentSwitch.findFirst({ where: { companyId: c.companyId }, orderBy: { changedAt: 'desc' }, select: { changedById: true } })
    const entity = await prisma.legalEntity.findFirst({ where: { companyId: c.companyId }, orderBy: { id: 'asc' }, select: { id: true } })
    if (sw) {
      await writeRecordAction(prisma, {
        companyId: c.companyId, recordType: 'Company', recordId: c.atCompanyId, action: 'OUTREACH_UNSUBSCRIBED',
        summary: `${c.name} used the unsubscribe link in a check-in letter. ${c.company.name} sends this contact no more outreach. Chases and bills are not affected.`,
        personId: sw.changedById, heldAs: OUTREACH_OPTOUT_HELD_AS, actingEntityId: entity?.id ?? null,
      }).catch(() => undefined)
    }
  }
  return { ok: true, view, says: unsubscribedSays(c.company.name) }
}
