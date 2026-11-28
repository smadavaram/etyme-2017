/**
 * Basic outreach on the party's ledger (record 135). Reads and writes the
 * letters that are core: a letter to one contact, and a candidate's update
 * letters. Nothing here consults the Outreach switch.
 *
 * - `createDirectLetter` raises one task, one card and one letter.
 * - `partyLetters` reads the lines the ledger adds (every letter sent or
 *   held to this party) and the panel the Ledger tab draws: who may be
 *   written to, and a candidate's own standing yes with the firm's last letters.
 *
 * Rules are in `direct-rules` and `candidate-rules`; the walker that sends is
 * `lib/agents/outreach-batch`.
 */
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { LedgerRefusal } from '@/lib/record-ledger'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { baseUrl } from '@/lib/signed-link'
import { publicSite } from '@/lib/public-site'
import { mailSendsAboutMany } from '@/lib/notify/mail-door'
import { censusFacts } from '@/lib/agents/census-keeper'
import { censusOn } from '@/lib/agents/census-rules'
import { postalLine } from '@/lib/agents/dormant-outreach-rules'
import { proposeTask } from '@/lib/agents/tasks'
import { saidYesToUpdates } from '@/lib/updates-consent'
import { recordAccess } from '@/lib/access-log'
import { hasPermission } from '@/lib/permissions'
import type { LedgerLine, LetterPanel } from '@/lib/party-ledger/lines'
import { OUTREACH_BATCH_AGENT, OUTREACH_BATCH_KIND, buildLetter } from './batch-rules'
import { DIRECT_SIDE, directCard, directPlan, directRefusal, letterLineSays } from './direct-rules'
import { outreachNotYours } from './rules-of-access'
import { candidateOutreachNotYours } from './candidate-batch'

export interface Refusal { ok: false; status: number; field?: string; says: string }
const refuse = (says: string, field?: string, status = 422): Refusal => ({ ok: false, status, says, ...(field ? { field } : {}) })

async function postalOf(companyId: string): Promise<string | null> {
  const rows = await prisma.companyAddress.findMany({ where: { companyId } })
  return postalLine(rows.find((a) => a.kind === 'LEGAL') ?? rows.find((a) => a.kind === 'BILLING') ?? null)
}

/** Whether the firm's own register holds the company as a customer or a supplier. */
async function tradesWith(firmId: string, atCompanyId: string, now: Date): Promise<boolean> {
  return censusOn(await censusFacts(firmId), now).some((r) => r.key.slice(r.key.indexOf(':') + 1) === atCompanyId)
}

async function bouncedAt(firmId: string, contactId: string, email: string): Promise<boolean> {
  const letters = await prisma.outreachLetter.findMany({ where: { companyId: firmId, contactId }, select: { id: true, email: true } })
  if (letters.length === 0) return false
  const sends = await mailSendsAboutMany(firmId, 'OutreachLetter', letters.map((l) => l.id))
  const bad = new Set(sends.filter((s) => s.outcome === 'FAILED_DELIVERY').map((s) => s.recordId))
  return letters.some((l) => bad.has(l.id) && l.email.trim().toLowerCase() === email.trim().toLowerCase())
}

/** Raise a letter to one contact: the letter, the one task and the one card. Nothing is sent until a person says yes. */
export async function createDirectLetter(seat: { companyId: string; personId: string }, raw: unknown, now: Date = new Date()): Promise<Refusal | { ok: true; id: string }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const contactId = typeof b.contactId === 'string' ? b.contactId : ''
  const contact = contactId ? await prisma.companyContact.findFirst({ where: { id: contactId, companyId: seat.companyId }, select: { id: true, name: true, email: true, atCompanyId: true, outreachOptOutAt: true, atCompany: { select: { name: true } } } }) : null
  if (!contact) return refuse('That contact is not in the firm’s own Contacts, so nothing is written.', 'contactId', 404)
  const subject = typeof b.subject === 'string' ? b.subject.trim() : ''
  const body = typeof b.body === 'string' ? b.body.trim() : ''
  const postal = await postalOf(seat.companyId)
  const no = directRefusal({
    contact, tradesWithCompany: await tradesWith(seat.companyId, contact.atCompanyId, now),
    bounced: !!contact.email && (await bouncedAt(seat.companyId, contact.id, contact.email)),
    subject, body, postal, link: !!baseUrl(),
  })
  if (no) return refuse(no.says, no.field)
  const owner = await ownerForRoles(seat.companyId, ['Account Manager'], now)
  if (!owner) return refuse('No Account Manager or Owner seat is working, so nobody can say yes to this letter.', 'audience')
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: seat.companyId }, select: { name: true, slug: true } })
  let storefront: string | null = null
  try { storefront = baseUrl() && (await publicSite(firm.slug)) ? `${baseUrl()}/site/${firm.slug}` : null } catch { storefront = null }
  const letter = buildLetter({ firm: firm.name, postal: postal!, recipientName: contact.name, companyName: contact.atCompany.name, subject, body, unsubscribeUrl: null, interestedUrl: null, storefrontUrl: storefront, direct: true }).text
  const card = directCard({ firm: firm.name, contactName: contact.name, companyName: contact.atCompany.name, subject, letter })
  try {
    const payload = { side: DIRECT_SIDE, audience: DIRECT_SIDE, subject, body, atCompanyId: contact.atCompanyId }
    const task = await proposeTask({
      companyId: seat.companyId, agentKey: OUTREACH_BATCH_AGENT, kind: OUTREACH_BATCH_KIND, recordType: 'Company', recordId: seat.companyId,
      plan: directPlan(), ownerPersonId: owner, openedOn: now, today: now, question: card.question, detail: card.detail,
      payload: payload as unknown as Prisma.InputJsonValue,
      withTask: async (tx, taskId) => {
        await tx.outreachLetter.create({ data: { companyId: seat.companyId, agentTaskId: taskId, contactId: contact.id, atCompanyId: contact.atCompanyId, email: contact.email!.trim(), state: 'READY' } })
      },
    })
    return { ok: true, id: task.id }
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(e.message)
    throw e
  }
}

export type PartyLetterPanel = LetterPanel

const standingSays = {
  YES: 'She said yes to updates. The firm may write to her, one letter at a time, each with its own yes from the firm.',
  NOT_YET: 'She has not said yes to updates, so no letter goes to her.',
  TOOK_BACK: 'She took her yes to updates back, so no letter goes to her.',
} as const

/**
 * The letters on one party's ledger, and the panel the Ledger tab draws.
 * `firmId` is the reading firm. A person is read only as a candidate this
 * firm keeps; a company only where the firm trades with it. Reads only.
 */
export async function partyLetters(
  reader: { companyId: string | null; personId: string; permissions: readonly string[]; companyKind: string | null },
  subject: { kind: 'person' | 'company'; id: string }, now: Date = new Date(),
): Promise<{ lines: LedgerLine[]; panel: PartyLetterPanel }> {
  const none = { lines: [] as LedgerLine[], panel: { writeTo: null, writeToSays: null, candidate: null } as PartyLetterPanel }
  const firm = reader.companyId
  if (!firm || reader.companyKind === 'CLIENT') return none
  const who = { permissions: reader.permissions, company: { kind: reader.companyKind } }
  const isCandidate = subject.kind === 'person'
  // Candidates: the people the firm keeps. Anybody else's letters are not this firm's to read.
  let kept = false
  let person: { updatesYesAt: Date | null; updatesRevokedAt: Date | null } | null = null
  if (isCandidate) {
    if (candidateOutreachNotYours(who as never)) return none
    kept = (await prisma.consultantProfile.count({
      where: { personId: subject.id, OR: [{ listings: { some: { companyId: firm, revokedAt: null, state: 'GRANTED' } } }, { person: { contexts: { some: { companyId: firm, revokedAt: null } } } }] },
    })) > 0
    if (!kept) return none
    person = await prisma.person.findUnique({ where: { id: subject.id }, select: { updatesYesAt: true, updatesRevokedAt: true } })
    await recordAccess([{ personId: subject.id }], { actorPersonId: reader.personId, actorCompanyId: firm, action: 'PROFILE_VIEW', reason: 'Read her standing yes to updates and the firm’s letters to her, on her ledger.' })
  } else if (outreachNotYours(who as never)) return none

  const letters = await prisma.outreachLetter.findMany({
    where: isCandidate ? { companyId: firm, contactId: subject.id, atCompanyId: subject.id } : { companyId: firm, atCompanyId: subject.id, NOT: { contactId: subject.id } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    include: { agentTask: { select: { id: true, state: true, payload: true } } },
  })
  const sends = letters.length ? await mailSendsAboutMany(firm, 'OutreachLetter', letters.map((l) => l.id)) : []
  const sentAt = (id: string) => sends.filter((s) => s.recordId === id && s.outcome === 'SENT')
  const rows = letters.map((l) => {
    const mine = sentAt(l.id)
    const subjectLine = (l.agentTask.payload as { subject?: string } | null)?.subject ?? 'Letter'
    const when = mine.length ? mine.reduce((a, s) => (s.createdAt > a ? s.createdAt : a), mine[0].createdAt) : l.createdAt
    return {
      line: {
        section: 'activity' as const, kind: isCandidate ? 'update letter' : 'letter',
        says: letterLineSays({ subject: subjectLine, state: l.state, taskState: l.agentTask.state, times: mine.length, stoppedReason: l.stoppedReason }),
        when, source: { type: 'OutreachLetter', id: l.id }, href: `/dashboard/companies/outreach/${l.agentTask.id}`, plugin: null,
      } as LedgerLine,
      subject: subjectLine, when,
    }
  })
  const lines = rows.map((r) => r.line)

  if (isCandidate) {
    const standing = !person?.updatesYesAt ? 'NOT_YET' : saidYesToUpdates(person) ? 'YES' : 'TOOK_BACK'
    return { lines, panel: { writeTo: null, writeToSays: null, candidate: { standing, says: standingSays[standing], last: rows.slice(0, 3).map((r) => ({ subject: r.subject, says: r.line.says, when: r.when.toISOString() })) } } }
  }
  if (subject.id === firm) return { lines, panel: { writeTo: null, writeToSays: null, candidate: null } }
  if (!(await tradesWith(firm, subject.id, now))) {
    return { lines, panel: { writeTo: null, writeToSays: 'This company is not one the firm trades with, so it is not written to. Record it as a customer or a supplier in Companies first.', candidate: null } }
  }
  const contacts = await prisma.companyContact.findMany({ where: { companyId: firm, atCompanyId: subject.id }, select: { id: true, name: true, email: true, outreachOptOutAt: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
  return {
    lines,
    panel: {
      writeTo: contacts.map((c) => ({
        id: c.id, name: c.name,
        canWrite: !c.outreachOptOutAt && !!c.email?.trim(),
        says: c.outreachOptOutAt ? `${c.name} asked for no more letters.` : !c.email?.trim() ? `${c.name} has no email address recorded. Add one in Contacts.` : null,
      })),
      writeToSays: contacts.length === 0 ? 'Nobody is recorded at this company yet. Add a contact in Contacts to write to them.' : null,
      candidate: null,
    },
  }
}
