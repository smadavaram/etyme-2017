/**
 * An update batch to candidates on the record (record 117, the lead's ruling
 * of 2026-11-27): the audience read from the people the firm keeps who have
 * a standing yes to updates, the preview that writes nothing, and the batch
 * that is one task and one card. The rules are in `candidate-rules`; the
 * walker that sends is `lib/agents/outreach-batch`.
 *
 * A candidate's letter is an `OutreachLetter` row whose `contactId` and
 * `atCompanyId` both hold her person id: the table has no column for a
 * person, and the architect may add one. `payload.side` is CANDIDATE, so no
 * reader of a company's letters counts it as a company's.
 */
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { LedgerRefusal } from '@/lib/record-ledger'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { baseUrl } from '@/lib/signed-link'
import { publicSite } from '@/lib/public-site'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { mailSendsAboutMany } from '@/lib/notify/mail-door'
import { postalLine } from '@/lib/agents/dormant-outreach-rules'
import { proposeTask } from '@/lib/agents/tasks'
import { batchBlock, bodyRefusal, subjectRefusal } from './batch-rules'
import { draftOffer, hotListWordsRefusal } from './offer-rules'
import {
  CANDIDATE_AUDIENCE_LABEL, CANDIDATE_SIDE, buildCandidateAudience, buildCandidateLetter, candidateCard, candidatePlan, type CandidateFact,
} from './candidate-rules'
import { OUTREACH_BATCH_AGENT, OUTREACH_BATCH_KIND } from './batch-rules'
import { hasPermission } from '@/lib/permissions'
import { logBulkAccess } from '@/lib/access-log'

export interface Refusal { ok: false; status: number; field?: string; says: string }
const refuse = (says: string, field?: string, status = 422): Refusal => ({ ok: false, status, says, ...(field ? { field } : {}) })

/** Who writes to candidates: a seat that reads the firm's candidates, at a firm that sells. A client buys and sends none. Pure. */
export function candidateOutreachNotYours(caller: { permissions: unknown; company: { kind?: string | null } | null }): string | null {
  if (caller.company?.kind === 'CLIENT') return 'A client buys and does not sell, so it sends no outreach.'
  if (!hasPermission(caller.permissions as any, 'consultants.read')) return 'Update letters are written by the people who see the firm’s candidates. Your seat does not.'
  return null
}

async function postalOf(companyId: string): Promise<string | null> {
  const rows = await prisma.companyAddress.findMany({ where: { companyId } })
  return postalLine(rows.find((a) => a.kind === 'LEGAL') ?? rows.find((a) => a.kind === 'BILLING') ?? null)
}

async function storefrontOf(slug: string): Promise<string | null> {
  const base = baseUrl()
  if (!base) return null
  try { return (await publicSite(slug)) ? `${base}/site/${slug}` : null } catch { return null }
}

/** The names read here are people's own; each is one row in the access trail. */
function logRead(companyId: string, actorPersonId: string, who: readonly { personId: string }[]) {
  logBulkAccess(who.map((w) => w.personId), { actorPersonId, actorCompanyId: companyId, action: 'TALENT_VIEW_ANON', reason: 'Read on Candidates, Outreach: who has said yes to updates' })
}

/** The people this firm keeps: a granted listing or a seat here. Her yes is read from her own record. */
export async function candidatesOf(companyId: string, now: Date) {
  const profiles = await prisma.consultantProfile.findMany({
    where: {
      OR: [
        { listings: { some: { companyId, revokedAt: null, state: 'GRANTED' } } },
        { person: { contexts: { some: { companyId, revokedAt: null } } } },
      ],
    },
    select: { personId: true, person: { select: { name: true, primaryEmail: true, updatesYesAt: true, updatesRevokedAt: true } } },
  })
  const ids = profiles.map((p) => p.personId)
  const letters = ids.length ? await prisma.outreachLetter.findMany({
    where: { companyId, contactId: { in: ids }, state: { not: 'HELD' }, agentTask: { state: { not: 'REFUSED' } } },
    select: { id: true, contactId: true, email: true, createdAt: true },
  }) : []
  const sends = letters.length ? await mailSendsAboutMany(companyId, 'OutreachLetter', letters.map((l) => l.id)) : []
  const bad = new Set(sends.filter((s) => s.outcome === 'FAILED_DELIVERY').map((s) => s.recordId))
  const last = new Map<string, Date>()
  const bounced = new Set<string>()
  for (const l of letters) {
    if (!last.has(l.contactId) || last.get(l.contactId)! < l.createdAt) last.set(l.contactId, l.createdAt)
    if (bad.has(l.id)) bounced.add(`${l.contactId}:${l.email.trim().toLowerCase()}`)
  }
  const facts: CandidateFact[] = profiles.map((p) => ({
    personId: p.personId, name: p.person.name, email: p.person.primaryEmail,
    updatesYesAt: p.person.updatesYesAt, updatesRevokedAt: p.person.updatesRevokedAt,
    bouncedAddress: !!p.person.primaryEmail && bounced.has(`${p.personId}:${p.person.primaryEmail.trim().toLowerCase()}`),
    lastWrittenOn: last.get(p.personId) ?? null,
  }))
  return buildCandidateAudience(facts, now)
}

/** What the screen shows before anything is asked: who would get a letter, by count. Names none who have not said yes. */
export async function candidateSuggestions(companyId: string, now: Date = new Date()) {
  const a = await candidatesOf(companyId, now)
  return { yes: a.to.length, held: a.held.length, withoutYes: a.withoutYes, postal: (await postalOf(companyId)) !== null, link: baseUrl() !== '', mail: mailLeaves() }
}

/** The subject and body a person typed, or the offer drafted where she typed none. A sentence where either is not fit to send. */
function wordsOf(firm: string, b: Record<string, unknown>): { ok: true; subject: string; body: string } | Refusal {
  let subject = typeof b.subject === 'string' ? b.subject.trim() : ''
  let body = typeof b.body === 'string' ? b.body.trim() : ''
  if ((!subject || !body) && b.offerKind === 'OPEN_JOB') {
    const d = draftOffer(firm, 'OPEN_JOB', b.offer)
    if (!d.ok) return refuse(d.says, d.field)
    subject ||= d.subject; body ||= d.body
  }
  const s = subjectRefusal(subject); if (s) return refuse(s, 'subject')
  const t = bodyRefusal(body); if (t) return refuse(t, 'body')
  // A candidate update never carries another person's rate or address.
  const u = hotListWordsRefusal(`${subject}\n${body}`)
  if (u) return refuse('An update to candidates carries no rate, email address or phone number. Take it out.', 'body')
  return { ok: true, subject, body }
}

/** The preview: the drafted letter, who gets it and who is held and why. Writes nothing, and names no address. */
export async function previewCandidateBatch(companyId: string, raw: unknown, actorPersonId: string, now: Date = new Date()) {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, slug: true } })
  const postal = await postalOf(companyId)
  const block = batchBlock({ postal, base: baseUrl() })
  const { to, held, withoutYes } = await candidatesOf(companyId, now)
  logRead(companyId, actorPersonId, [...to, ...held])
  const words = wordsOf(firm.name, b)
  const letter = postal && words.ok
    ? buildCandidateLetter({ firm: firm.name, postal, recipientName: to[0]?.name ?? '', subject: words.subject, body: words.body, stopUrl: null, storefrontUrl: await storefrontOf(firm.slug) }).text
    : null
  return {
    ok: true as const,
    data: {
      audience: { label: CANDIDATE_AUDIENCE_LABEL, count: to.length, withoutYes },
      to: to.map((t) => ({ personId: t.personId, name: t.name })),
      held: held.map((h) => ({ name: h.name, reason: h.reason, says: h.says })),
      draft: words.ok ? { subject: words.subject, body: words.body } : null,
      says: words.ok ? null : words.says,
      letter, blocked: block,
    },
  }
}

/** Raise the batch: the letters, the one task and the one card. Refused in a sentence where it cannot be drafted. */
export async function createCandidateBatch(seat: { companyId: string; personId: string }, raw: unknown, now: Date = new Date()): Promise<Refusal | { ok: true; id: string; candidates: number; held: number }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: seat.companyId }, select: { name: true, slug: true } })
  const words = wordsOf(firm.name, b)
  if (!words.ok) return words
  const postal = await postalOf(seat.companyId)
  const block = batchBlock({ postal, base: baseUrl() })
  if (block || !postal) return refuse(block?.says ?? 'The firm has no postal address on record.', 'postal')
  const { to, held, withoutYes } = await candidatesOf(seat.companyId, now)
  logRead(seat.companyId, seat.personId, [...to, ...held])
  if (to.length === 0) return refuse(withoutYes > 0 && held.length === 0
    ? 'No candidate has said yes to updates, so nobody can be written to. A candidate says yes on her own page or from a link in a letter.'
    : 'Nobody is left to write to. Everyone who said yes is held; the list says why next to each name.', 'audience')
  const owner = await ownerForRoles(seat.companyId, ['Account Manager'], now)
  if (!owner) return refuse('No Account Manager or Owner seat is working, so nobody can say yes to this batch.', 'audience')
  const letter = buildCandidateLetter({ firm: firm.name, postal, recipientName: to[0].name, subject: words.subject, body: words.body, stopUrl: null, storefrontUrl: await storefrontOf(firm.slug) }).text
  const card = candidateCard({ firm: firm.name, subject: words.subject, letter, to, held, withoutYes })
  let task
  try {
    const payload = {
      side: CANDIDATE_SIDE, audience: CANDIDATE_SIDE, subject: words.subject, body: words.body,
      held: held.map((h) => ({ companyName: h.name, reason: h.reason, says: h.says })),
    }
    task = await proposeTask({
      companyId: seat.companyId, agentKey: OUTREACH_BATCH_AGENT, kind: OUTREACH_BATCH_KIND, recordType: 'Company', recordId: seat.companyId,
      plan: candidatePlan(to.length), ownerPersonId: owner, openedOn: now, today: now, question: card.question, detail: card.detail,
      payload: payload as unknown as Prisma.InputJsonValue,
      withTask: async (tx, taskId) => {
        await tx.outreachLetter.createMany({
          data: to.map((t) => ({ companyId: seat.companyId, agentTaskId: taskId, contactId: t.personId, atCompanyId: t.personId, email: t.email, state: 'READY' })),
        })
      },
    })
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(e.message, undefined, 422)
    throw e
  }
  return { ok: true, id: task.id, candidates: to.length, held: held.length }
}
