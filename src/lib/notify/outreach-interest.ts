/**
 * The "I'm interested" link in an outreach letter (record 117).
 *
 * Etyme never reads a mailbox, so an answer comes only through this
 * link. It is signed (`lib/signed-link`, purpose OUTREACH_INTERESTED) and
 * names only the letter. Nothing is stored for it, and it is never
 * logged, written to the ledger, put on a card or returned in a reply.
 * Opening the page changes nothing, because a mail scanner follows every
 * link; the button posts. Pressing it stops that letter's follow-ups,
 * opens one lead and one card for the person who owes the answer, and
 * lands the reader on the firm's own page where it has one. A second use
 * finds the letter already answered and changes nothing.
 */
import { prisma } from '@/lib/db'
import { sign, read, baseUrl } from '@/lib/signed-link'
import { writeRecordAction, LedgerRefusal } from '@/lib/record-ledger'
import { openDecision } from '@/lib/decision-items'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { publicSite } from '@/lib/public-site'
import { AGENT_HELD_AS } from '@/lib/agents/runner'

const KIND = 'OUTREACH_INTERESTED'

export const OUTREACH_INTEREST_HELD_AS = 'Interested link'

/** The link for one letter, or null where the deployment has no public address (a letter then carries no broken link). */
export function interestedUrlFor(letterId: string): string | null {
  const base = baseUrl()
  if (!base) return null
  try { return `${base}/answer/outreach-interest/${sign(KIND, [letterId])}` } catch { return null }
}

export interface InterestView { firm: string; already: boolean }
export type InterestResult =
  | { ok: true; view: InterestView; says: string; landing: string | null }
  | { ok: false; status: number; says: string }

const BAD_LINK = 'This link is not valid. It may have been retyped or cut short. Use the link in the letter again.'

export const interestedSays = (firm: string) => `Thanks. ${firm} has been told and will reply to you by email.`

async function find(token: string) {
  const parts = read(KIND, token)
  if (!parts || !parts[0]) return null
  const letter = await prisma.outreachLetter.findUnique({ where: { id: parts[0] }, include: { agentTask: { select: { companyId: true, agentKey: true, payload: true } } } })
  if (!letter) return null
  const [firm, contact, at] = await Promise.all([
    prisma.company.findUnique({ where: { id: letter.companyId }, select: { name: true, slug: true } }),
    prisma.companyContact.findUnique({ where: { id: letter.contactId }, select: { name: true, email: true } }),
    prisma.company.findUnique({ where: { id: letter.atCompanyId }, select: { name: true } }),
  ])
  if (!firm) return null
  return { letter, firm, contact, at }
}

/** The firm's own page, where it has one; the page that carries its Ask box. */
async function landingOf(slug: string): Promise<string | null> {
  try { return (await publicSite(slug)) ? `/site/${slug}` : null } catch { return null }
}

/** What the page shows: which firm's letter this is, and whether it is already answered. Changes nothing. */
export async function openInterest(token: string): Promise<InterestResult> {
  const f = await find(token)
  if (!f) return { ok: false, status: 404, says: BAD_LINK }
  return { ok: true, view: { firm: f.firm.name, already: f.letter.interestedAt !== null }, says: '', landing: null }
}

/** Say the contact is interested. One lead and one card, once; a second use says the same and changes nothing. */
export async function applyInterest(token: string, now: Date = new Date()): Promise<InterestResult> {
  const f = await find(token)
  if (!f) return { ok: false, status: 404, says: BAD_LINK }
  const { letter, firm } = f
  const view = { firm: firm.name, already: letter.interestedAt !== null }
  const landing = await landingOf(firm.slug)
  if (letter.interestedAt) return { ok: true, view, says: interestedSays(firm.name), landing }
  const moved = await prisma.outreachLetter.updateMany({ where: { id: letter.id, interestedAt: null }, data: { interestedAt: now } })
  if (moved.count !== 1) return { ok: true, view, says: interestedSays(firm.name), landing }
  // The letter stops here: no follow-up goes to somebody who has answered. A letter already stopped keeps its reason.
  await prisma.outreachLetter.updateMany({ where: { id: letter.id, state: { not: 'STOPPED' } }, data: { state: 'STOPPED', stoppedReason: 'INTERESTED', nextDueAt: null } })

  const payload = (letter.agentTask.payload ?? {}) as { subject?: string }
  const subject = payload.subject ?? 'an outreach letter'
  const name = f.contact?.name ?? 'A contact'
  const company = f.at?.name ?? 'a company you wrote to'
  const lead = await prisma.lead.create({
    data: {
      companyId: letter.companyId, source: 'OUTREACH', postedBy: name, postedByCompanyId: letter.atCompanyId,
      title: `${name} at ${company} is interested`, skills: [], contact: f.contact?.email ?? letter.email,
      text: `${name} at ${company} pressed "I'm interested" on the letter "${subject}".`,
    },
  })
  await prisma.outreachLetter.update({ where: { id: letter.id }, data: { leadId: lead.id } })

  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId: letter.companyId, agentKey: letter.agentTask.agentKey } } })
  const owner = await ownerForRoles(letter.companyId, ['Account Manager'], now)
  if (sw && owner) {
    const entities = await prisma.legalEntity.findMany({ where: { companyId: letter.companyId }, select: { id: true } })
    try {
      await openDecision({
        companyId: letter.companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
        question: `${name} at ${company} is interested in "${subject}". Reply to them.`, ownerPersonId: owner, openedOn: now,
        proof: `${name} pressed "I'm interested" in the letter "${subject}". Their email is ${f.contact?.email ?? letter.email}. Letters to them have stopped. The batch: /dashboard/companies/outreach/${letter.agentTaskId}`,
        proofLinks: [{ recordType: 'Company', recordId: letter.atCompanyId }],
      }, now)
    } catch (e) { if (!(e instanceof LedgerRefusal)) throw e }
  }
  if (sw) {
    const entity = await prisma.legalEntity.findFirst({ where: { companyId: letter.companyId }, orderBy: { id: 'asc' }, select: { id: true } })
    await writeRecordAction(prisma, {
      companyId: letter.companyId, recordType: 'Company', recordId: letter.atCompanyId, action: 'OUTREACH_INTERESTED',
      summary: `${name} at ${company} pressed "I'm interested" in an outreach letter. Their letters have stopped and a lead is open.`,
      personId: sw.changedById, heldAs: OUTREACH_INTEREST_HELD_AS, actingEntityId: entity?.id ?? null,
    }).catch(() => undefined)
  }
  return { ok: true, view, says: interestedSays(firm.name), landing }
}
