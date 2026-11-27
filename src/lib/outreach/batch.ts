/**
 * An outreach batch on the record (record 117): the audience read from the
 * firm's own register and rolodex, the preview that writes nothing, the
 * batch that is one task and one card, and the page that counts it.
 * The rules are in `audience-rules`, `offer-rules` and `batch-rules`.
 */

import { mailLeaves } from '@/lib/notify/mail-leaves'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { LedgerRefusal } from '@/lib/record-ledger'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { baseUrl } from '@/lib/signed-link'
import { publicSite } from '@/lib/public-site'
import { suggestHotList, draftOffer, OFFER_LABELS } from './offer-rules'
import { mailSendsAbout, mailSendsAboutMany } from '@/lib/notify/mail-door'
import { censusFacts } from '@/lib/agents/census-keeper'
import { censusOn, type Side } from '@/lib/agents/census-rules'
import { postalLine, outreachKind, OUTREACH_RECORD, OUTREACH_TEMPLATE } from '@/lib/agents/dormant-outreach-rules'
import { proposeTask, approvalOf, planSellsLetters, outreachPausedSays } from '@/lib/agents/tasks'
import { outreachHeld } from '@/lib/plugins'
import { stoppedSays } from '@/lib/agents/control-view'
import { agentNameOf } from '@/lib/decision-queue'
import { standingWith, lacksPosition } from '@/app/api/companies/positions'
import { AUDIENCE_LABELS, buildAudience, sideOfAudience, type Audience, type PoolCompany, type PoolContact } from './audience-rules'
import {
  OUTREACH_BATCH_AGENT, OUTREACH_BATCH_KIND, OUTREACH_BATCH_TEMPLATE, batchBlock, batchCard, batchPlan, buildLetter, countsOf, letterWords, readBatchAsk,
  type BatchAsk,
} from './batch-rules'

export interface Refusal { ok: false; status: number; field?: string; says: string }
const refuse = (says: string, field?: string, status = 422): Refusal => ({ ok: false, status, says, ...(field ? { field } : {}) })

/** The firm's postal address as one line (legal, else billing); null where none is recorded. */
async function postalOf(companyId: string): Promise<string | null> {
  const rows = await prisma.companyAddress.findMany({ where: { companyId } })
  return postalLine(rows.find((a) => a.kind === 'LEGAL') ?? rows.find((a) => a.kind === 'BILLING') ?? null)
}

/** The firm's own page where it has one, as a full address; null where it has none or the deployment has no address. */
async function storefrontOf(slug: string): Promise<string | null> {
  const base = baseUrl()
  if (!base) return null
  try { return (await publicSite(slug)) ? `${base}/site/${slug}` : null } catch { return null }
}

async function bouncedAddresses(companyId: string, contacts: readonly { id: string }[]): Promise<Set<string>> {
  const out = new Set<string>()
  // A check-in letter's bounce is read by contact; a batch letter's by letter, at the address it was drafted for.
  const dormant = (await Promise.all(contacts.map((c) => mailSendsAbout(companyId, OUTREACH_RECORD, c.id)))).flat()
  for (const r of dormant) if (r.template === OUTREACH_TEMPLATE && r.outcome === 'FAILED_DELIVERY') r.toAddresses.forEach((a) => out.add(a.trim().toLowerCase()))
  const letters = await prisma.outreachLetter.findMany({ where: { companyId, contactId: { in: contacts.map((c) => c.id) } }, select: { id: true, email: true } })
  if (letters.length) {
    const sends = await mailSendsAboutMany(companyId, 'OutreachLetter', letters.map((l) => l.id))
    const bad = new Set(sends.filter((s) => s.outcome === 'FAILED_DELIVERY').map((s) => s.recordId))
    letters.filter((l) => bad.has(l.id)).forEach((l) => out.add(l.email.trim().toLowerCase()))
  }
  return out
}

/** When each company was last written to, or drafted for, on this side: an earlier batch not refused, or a check-in task. */
async function lastWrittenTo(companyId: string, side: Side, contacts: readonly PoolContact[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  const note = (id: string, at: Date) => { if (!out.has(id) || out.get(id)! < at) out.set(id, at) }
  const ids = [...new Set(contacts.map((c) => c.atCompanyId))]
  const letters = await prisma.outreachLetter.findMany({
    where: { companyId, atCompanyId: { in: ids }, state: { not: 'HELD' }, agentTask: { state: { not: 'REFUSED' } } },
    select: { atCompanyId: true, createdAt: true, agentTask: { select: { payload: true } } },
  })
  for (const l of letters) if ((l.agentTask.payload as { side?: string } | null)?.side === side) note(l.atCompanyId, l.createdAt)
  const at = new Map(contacts.map((c) => [c.id, c.atCompanyId]))
  const tasks = contacts.length
    ? await prisma.agentTask.findMany({ where: { companyId, kind: outreachKind(side), recordType: OUTREACH_RECORD, recordId: { in: [...at.keys()] }, state: { not: 'REFUSED' } }, select: { recordId: true, createdAt: true } })
    : []
  for (const t of tasks) { const c = at.get(t.recordId); if (c) note(c, t.createdAt) }
  return out
}

/** Read the audience off the firm's own record: register, rolodex, bounces and the last time each company was written to. */
export async function audienceOf(companyId: string, audience: Audience, contactKind: string | null, now: Date) {
  const side = sideOfAudience(audience)
  const register: PoolCompany[] = censusOn(await censusFacts(companyId), now).map((r) => ({
    id: r.key.slice(r.key.indexOf(':') + 1), name: r.name, side: r.side, standing: r.standing, lastActivity: r.lastActivity,
  }))
  const registered = register.map((r) => r.id)
  const mine = register.filter((r) => r.side === side).map((r) => r.id)
  const contacts: PoolContact[] = (await prisma.companyContact.findMany({
    where: { companyId, atCompanyId: { in: mine } },
    select: { id: true, name: true, email: true, kind: true, outreachOptOutAt: true, atCompanyId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  }))
  let notClassified: { id: string; name: string }[] = []
  if (!audience.startsWith('DORMANT')) {
    const loose = await prisma.companyContact.findMany({
      where: { companyId, atCompanyId: { notIn: registered } }, distinct: ['atCompanyId'],
      select: { atCompany: { select: { id: true, name: true, kind: true, claimedAt: true, listedById: true } } },
    })
    for (const { atCompany } of loose) {
      const read = await standingWith(companyId, atCompany)
      if (read && lacksPosition(read, atCompany.kind, ['CUSTOMER', 'SUPPLIER'])) notClassified.push({ id: atCompany.id, name: atCompany.name })
    }
  }
  const out = buildAudience({
    audience, contactKind, register, notClassified, contacts, today: now,
    bounced: await bouncedAddresses(companyId, contacts), lastWrittenTo: await lastWrittenTo(companyId, side, contacts),
  })
  return { ...out, side }
}

/** What the screen shows before anything is asked: the hot list suggested from the people the firm has said yes to showing. */
export async function suggestions(companyId: string) {
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } })
  let hotList: { skills: string; availability: string }[] = []
  try {
    const site = firm ? await publicSite(firm.slug) : null
    hotList = site ? suggestHotList(site.comingFree) : []
  } catch { hotList = [] }
  return { hotList, postal: (await postalOf(companyId)) !== null, link: baseUrl() !== '', mail: mailLeaves() }
}

const placeholderLetter = (a: { firm: string; postal: string; subject: string; body: string; companyName: string; recipientName: string; storefront: string | null }) =>
  buildLetter({ firm: a.firm, postal: a.postal, recipientName: a.recipientName, companyName: a.companyName, subject: a.subject, body: a.body, unsubscribeUrl: null, interestedUrl: null, storefrontUrl: a.storefront })

/**
 * The preview: the drafted letter, who gets it and who is held and why.
 * Writes nothing. Where the offer is not complete yet, the audience is
 * still read and the sentence says what the offer lacks.
 */
export async function previewBatch(companyId: string, raw: unknown, now: Date = new Date()) {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const audience = typeof b.audience === 'string' && b.audience in AUDIENCE_LABELS ? (b.audience as Audience) : null
  if (!audience) return refuse('Choose who the letter goes to.', 'audience')
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, slug: true } })
  const postal = await postalOf(companyId)
  const block = batchBlock({ postal, base: baseUrl() })
  const kind = typeof b.contactKind === 'string' && b.contactKind.trim() ? b.contactKind.trim() : null
  const { to, held } = await audienceOf(companyId, audience, kind, now)
  const drafted = typeof b.offerKind === 'string' ? draftOffer(firm.name, b.offerKind, b.offer) : null
  const subject = typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim() : drafted?.ok ? drafted.subject : ''
  const body = typeof b.body === 'string' && b.body.trim() ? b.body.trim() : drafted?.ok ? drafted.body : ''
  const letter = postal && subject && body
    ? placeholderLetter({ firm: firm.name, postal, subject, body, companyName: to[0]?.companyName ?? 'their company', recipientName: to[0]?.name ?? '', storefront: await storefrontOf(firm.slug) }).text
    : null
  return {
    ok: true as const,
    data: {
      audience: { key: audience, label: AUDIENCE_LABELS[audience], count: to.length },
      to: to.map((t) => ({ contactId: t.contactId, name: t.name, email: t.email, companyName: t.companyName })),
      held: held.map((h) => ({ companyName: h.companyName, reason: h.reason, says: h.says })),
      draft: drafted === null ? null : drafted.ok ? { subject, body } : null,
      offerSays: drafted && !drafted.ok ? drafted.says : null,
      letter,
      blocked: block,
    },
  }
}

/** Raise the batch: the letters, the one task and the one card. Refused in a sentence where it cannot be drafted. */
export async function createBatch(seat: { companyId: string; personId: string }, raw: unknown, now: Date = new Date()): Promise<Refusal | { ok: true; id: string; contacts: number; held: number }> {
  const read = readBatchAsk(raw)
  if (!read.ok) return refuse(read.says, read.field)
  const ask: BatchAsk = read.ask
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: seat.companyId }, select: { name: true, slug: true } })
  const postal = await postalOf(seat.companyId)
  const block = batchBlock({ postal, base: baseUrl() })
  if (block || !postal) return refuse(block?.says ?? 'The firm has no postal address on record.', 'postal')
  const { to, held, side } = await audienceOf(seat.companyId, ask.audience, ask.contactKind, now)
  if (to.length === 0) return refuse('Nobody is left to write to. Everyone in this list is held; the list says why next to each company.', 'audience')
  const owner = await ownerForRoles(seat.companyId, ['Account Manager'], now)
  if (!owner) return refuse('No Account Manager or Owner seat is working, so nobody can say yes to this batch.', 'audience')
  const letter = placeholderLetter({ firm: firm.name, postal, subject: ask.subject, body: ask.body, companyName: to[0].companyName, recipientName: to[0].name, storefront: await storefrontOf(firm.slug) }).text
  const card = batchCard({ firm: firm.name, audienceLabel: AUDIENCE_LABELS[ask.audience], subject: ask.subject, letter, to, held })
  let task
  try {
    const payload = {
      audience: ask.audience, side, contactKind: ask.contactKind, offerKind: ask.offerKind, offer: ask.offer, subject: ask.subject, body: ask.body,
      held: held.map((h) => ({ atCompanyId: h.atCompanyId, companyName: h.companyName, reason: h.reason, says: h.says })),
    }
    // The task, its card, what the person chose and its letters are written together, or not at all.
    task = await proposeTask({
      companyId: seat.companyId, agentKey: OUTREACH_BATCH_AGENT, kind: OUTREACH_BATCH_KIND, recordType: 'Company', recordId: seat.companyId,
      plan: batchPlan(to.length), ownerPersonId: owner, openedOn: now, today: now, question: card.question, detail: card.detail,
      payload: payload as unknown as Prisma.InputJsonValue,
      withTask: async (tx, taskId) => {
        await tx.outreachLetter.createMany({
          data: to.map((t) => ({ companyId: seat.companyId, agentTaskId: taskId, contactId: t.contactId, atCompanyId: t.atCompanyId, email: t.email, state: 'READY' })),
        })
      },
    })
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(e.message, undefined, 422)
    throw e
  }
  return { ok: true, id: task.id, contacts: to.length, held: held.length }
}

const DAYS = 86_400_000

/** The firm's batches, newest first, with the one line a list needs. */
export async function batchesOf(companyId: string) {
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, kind: OUTREACH_BATCH_KIND }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    include: { decision: { select: { question: true } }, _count: { select: { outreachLetters: true } } },
  })
  return tasks.map((t) => ({
    id: t.id, state: t.state, question: t.decision.question, contacts: t._count.outreachLetters, sentLetters: t.sentCount,
    createdAt: t.createdAt, subject: (t.payload as { subject?: string } | null)?.subject ?? null,
  }))
}

/** One batch, counted: sent and bounced from the mail sent, interested and unsubscribed from the letters. Null where it is not this firm's. */
export async function batchView(companyId: string, id: string, now: Date = new Date()) {
  const found = await prisma.agentTask.findFirst({ where: { id, companyId, kind: OUTREACH_BATCH_KIND }, select: { id: true } })
  if (!found) return null
  const { task } = await approvalOf(id)
  const payload = (task.payload ?? {}) as { audience?: Audience; offerKind?: keyof typeof OFFER_LABELS; subject?: string; held?: { companyName: string; reason: string; says: string }[] }
  const [firm, letters, sw, card] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, pluginsOn: true } }),
    prisma.outreachLetter.findMany({ where: { agentTaskId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: task.agentKey } } }),
    prisma.decisionItem.findUnique({ where: { id: task.decisionId }, select: { id: true, state: true, question: true } }),
  ])
  const [contacts, companies, sends] = await Promise.all([
    prisma.companyContact.findMany({ where: { id: { in: letters.map((l) => l.contactId) }, companyId }, select: { id: true, name: true, outreachOptOutAt: true } }),
    prisma.company.findMany({ where: { id: { in: letters.map((l) => l.atCompanyId) } }, select: { id: true, name: true } }),
    letters.length ? mailSendsAboutMany(companyId, 'OutreachLetter', letters.map((l) => l.id)) : [],
  ])
  const byContact = new Map(contacts.map((c) => [c.id, c]))
  const byCompany = new Map(companies.map((c) => [c.id, c.name]))
  const rows = letters.map((l) => {
    const c = byContact.get(l.contactId)
    const mine = sends.filter((s) => s.recordId === l.id)
    const optedOut = c?.outreachOptOutAt != null
    const bounced = mine.some((s) => s.outcome === 'FAILED_DELIVERY')
    return {
      id: l.id, name: c?.name ?? 'A contact', email: l.email, companyName: byCompany.get(l.atCompanyId) ?? 'A company', state: l.state,
      times: mine.filter((s) => s.outcome === 'SENT').length, interested: l.interestedAt !== null, unsubscribed: optedOut, bounced,
      says: letterWords({ state: l.state, attempt: l.attempt, nextDueAt: l.nextDueAt, stoppedReason: l.stoppedReason, interestedAt: l.interestedAt, optedOut, bounced }),
    }
  })
  const counts = countsOf({
    letters: letters.map((l) => ({ id: l.id, state: l.state, interestedAt: l.interestedAt, optedOut: byContact.get(l.contactId)?.outreachOptOutAt != null })),
    sends: sends.map((s) => ({ recordId: s.recordId, outcome: s.outcome })),
  })
  const switchState = (sw?.state ?? 'OFF') as 'OFF' | 'DRAFT_ONLY' | 'ON'
  // Paused under its own yes while the firm's Outreach is off: the control list's sentence, read without writing a row.
  const paused = (task.state === 'APPROVED' || task.state === 'RUNNING') && planSellsLetters(task.plan) && outreachHeld(firm?.pluginsOn, OUTREACH_BATCH_TEMPLATE)
    ? outreachPausedSays(firm?.name ?? 'your firm') : null
  return {
    id, state: task.state, subject: payload.subject ?? null, audience: payload.audience ? AUDIENCE_LABELS[payload.audience] : null,
    offer: payload.offerKind ? OFFER_LABELS[payload.offerKind] : null, createdAt: task.createdAt, closedReason: task.closedReason,
    card: card ? { id: card.id, state: card.state } : null,
    stopped: stoppedSays(task.state, switchState, agentNameOf(task.agentKey)) ?? paused, paused,
    counts, rows, held: payload.held ?? [], daysOld: Math.floor((now.getTime() - task.createdAt.getTime()) / DAYS),
  }
}
