/**
 * The tracked link in a pack's letter (record 135), and the visit it records.
 *
 * Only a signed-in person is ever counted, and only when she is the person
 * the letter was written to: a candidate by her own account, a contact by
 * the account that holds the address the letter went to. A visitor who is
 * not signed in, or who is signed in as somebody else, is sent on to the page
 * and nothing is written. The link is signed and never stored. This is the
 * only place a visit is counted; page analytics stays on the marketing pages.
 */
import { prisma } from '@/lib/db'
import { sign, read, baseUrl } from '@/lib/signed-link'
import { CANDIDATE_SIDE } from './candidate-rules'
import { scanAfterVisit } from './tripwires'

const KIND = 'OUTREACH_VISIT'

export interface TrackedPage { pageKind: 'COURSE' | 'POD'; pageRef: string; path: string }

/** The link for one letter and one page, or null where the deployment has no public address (a letter then carries no broken link). */
export function trackedUrlFor(letterId: string, page: TrackedPage): string | null {
  const base = baseUrl()
  if (!base || !page.path.startsWith('/')) return null
  try { return `${base}/api/outreach/visit/${sign(KIND, [letterId, page.pageKind, page.pageRef, Buffer.from(page.path).toString('base64url')])}` } catch { return null }
}

export interface VisitOutcome { redirect: string | null; recorded: boolean; why: string }

/** Open a tracked link as whoever is signed in (an email, or none). Always says where to go; records only a known recipient. */
export async function openVisit(token: string, sessionEmail: string | null, now: Date = new Date()): Promise<VisitOutcome> {
  const parts = read(KIND, token)
  if (!parts || parts.length !== 4) return { redirect: null, recorded: false, why: 'This link is not valid.' }
  const [letterId, pageKind, pageRef, enc] = parts
  const path = Buffer.from(enc, 'base64url').toString()
  if (!path.startsWith('/') || path.startsWith('//') || (pageKind !== 'COURSE' && pageKind !== 'POD')) return { redirect: null, recorded: false, why: 'This link is not valid.' }
  if (!sessionEmail) return { redirect: path, recorded: false, why: 'Nobody is signed in, so nothing was counted.' }
  const letter = await prisma.outreachLetter.findUnique({ where: { id: letterId }, include: { agentTask: { select: { payload: true } } } })
  if (!letter) return { redirect: path, recorded: false, why: 'The letter is not on record, so nothing was counted.' }
  const email = sessionEmail.trim().toLowerCase()
  const me = await prisma.person.findFirst({ where: { primaryEmail: { equals: email, mode: 'insensitive' } }, select: { id: true } })
  const candidate = (letter.agentTask.payload as { side?: string } | null)?.side === CANDIDATE_SIDE
  let who: { personId: string | null; contactId: string | null } | null = null
  if (candidate) {
    if (me && me.id === letter.contactId) who = { personId: me.id, contactId: null }
  } else {
    const contact = await prisma.companyContact.findUnique({ where: { id: letter.contactId }, select: { id: true, email: true, personId: true } })
    if (contact && ((me && contact.personId === me.id) || contact.email?.trim().toLowerCase() === email || letter.email.trim().toLowerCase() === email)) who = { personId: null, contactId: contact.id }
  }
  if (!who) return { redirect: path, recorded: false, why: 'The person signed in is not the person the letter was written to, so nothing was counted.' }
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const again = await prisma.outreachVisit.findFirst({ where: { letterId, pageKind, pageRef, at: { gte: dayStart } }, select: { id: true } })
  if (!again) {
    await prisma.outreachVisit.create({ data: { companyId: letter.companyId, letterId, personId: who.personId, contactId: who.contactId, pageKind, pageRef, at: now } })
    await scanAfterVisit(letter.companyId, now) // on an event: has she now come back?
  }
  return { redirect: path, recorded: !again, why: again ? 'Already counted today.' : 'Counted.' }
}
