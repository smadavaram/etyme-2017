/**
 * Campaign packs on the record (records 112, 116, 135).
 *
 * A pack is one task and one card: its one yes (`approvalOf`) releases this
 * pack and nothing else. Detected pushes join only an APPROVED pack whose
 * segment and kinds they match (`packFits`); every other push waits as one
 * card and sends nothing. A pack's letters are `OutreachLetter` rows on its
 * task, so the one walker (`lib/agents/outreach-batch`) sends them under the
 * same checks as a batch: the task's yes, the agent switch, the Outreach
 * switch, the daily cap, an unsubscribe, a bounce, and a candidate's own yes.
 * Nothing in this file sends mail.
 */
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { LedgerRefusal } from '@/lib/record-ledger'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { baseUrl } from '@/lib/signed-link'
import { openDecision } from '@/lib/decision-items'
import { AGENT_HELD_AS } from '@/lib/agents/runner'
import { approvalOf, closeTask, proposeTask } from '@/lib/agents/tasks'
import { postalLine } from '@/lib/agents/dormant-outreach-rules'
import { CANDIDATE_SIDE } from './candidate-rules'
import { OUTREACH_BATCH_AGENT, batchBlock } from './batch-rules'
import { CONTENT_LABELS, type ContentKind } from './match-rules'
import { OUTREACH_PACK_KIND, PACK_LETTER_CAP, packCard, packFits, packPlan, readPackAsk, waitingCard } from './pack-rules'
import { defOf, readSegment, type Refusal } from './segment'
import { describeSegment } from './segment-rules'

const refuse = (says: string, field?: string, status = 422): Refusal => ({ ok: false, status, says, ...(field ? { field } : {}) })

/** What a pack's task carries so the walker knows these are a pack's letters, and what each letter says. */
export interface PackPayload {
  pack: true
  packId: string
  side: string
  subject: string
  body: string
  /** Per letter: the push it carries, its words, and the page its tracked link opens. Words only: no link is kept. */
  letterContent: Record<string, { pushId: string; subject: string; body: string; page: { pageKind: 'COURSE' | 'POD'; pageRef: string; path: string } | null }>
}

const sideOfRole = (role: string) => (role === 'CANDIDATE' ? CANDIDATE_SIDE : role === 'CLIENT' ? 'CUSTOMER' : 'SUPPLIER')

async function postalOf(companyId: string): Promise<string | null> {
  const rows = await prisma.companyAddress.findMany({ where: { companyId } })
  return postalLine(rows.find((a) => a.kind === 'LEGAL') ?? rows.find((a) => a.kind === 'BILLING') ?? null)
}

/** Propose a pack: one task and one card for the one yes. Sends nothing, and nothing joins it until the yes. */
export async function proposePack(seat: { companyId: string; personId: string }, raw: unknown, now: Date = new Date()): Promise<Refusal | { ok: true; id: string; taskId: string }> {
  const read = readPackAsk(raw)
  if (!read.ok) return refuse(read.says, read.field)
  const ask = read.ask
  const segment = await prisma.outreachSegment.findFirst({ where: { id: ask.segmentId, companyId: seat.companyId, archivedAt: null } })
  if (!segment) return refuse('That segment is not at your firm, or it was archived. Choose another.', 'segmentId')
  const def = defOf(segment)
  const postal = await postalOf(seat.companyId)
  const block = batchBlock({ postal, base: baseUrl() })
  if (block || !postal) return refuse(block?.says ?? 'The firm has no postal address on record.', 'postal')
  const owner = await ownerForRoles(seat.companyId, ['Account Manager'], now)
  if (!owner) return refuse('No Account Manager or Owner seat is working, so nobody can say yes to this pack.', 'name')
  const card = packCard({ name: ask.name, segmentWords: describeSegment(def), contentKinds: ask.contentKinds, role: def.role, cap: PACK_LETTER_CAP })
  let packId = ''
  let task
  try {
    task = await proposeTask({
      companyId: seat.companyId, agentKey: OUTREACH_BATCH_AGENT, kind: OUTREACH_PACK_KIND, recordType: 'Company', recordId: seat.companyId,
      plan: packPlan(def.role), ownerPersonId: owner, openedOn: now, today: now, question: card.question, detail: card.detail,
      payload: { pack: true, packId: '', side: sideOfRole(def.role), subject: ask.name, body: '', letterContent: {} } satisfies PackPayload as unknown as Prisma.InputJsonValue,
      withTask: async (tx, taskId) => {
        const row = await tx.outreachPack.create({ data: { companyId: seat.companyId, name: ask.name, segmentId: segment.id, contentKinds: ask.contentKinds, state: 'PROPOSED', agentTaskId: taskId, createdById: seat.personId } })
        packId = row.id
        await tx.agentTask.update({ where: { id: taskId }, data: { payload: { pack: true, packId: row.id, side: sideOfRole(def.role), subject: ask.name, body: '', letterContent: {} } satisfies PackPayload as unknown as Prisma.InputJsonValue } })
      },
    })
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(e.message)
    throw e
  }
  return { ok: true, id: packId, taskId: task.id }
}

/** Read the yes: move the pack with its task. An approved card makes the pack APPROVED; a refused or closed task closes it. Safe to call again. */
export async function syncPack(packId: string) {
  const pack = await prisma.outreachPack.findUniqueOrThrow({ where: { id: packId } })
  if (!pack.agentTaskId || pack.state === 'CLOSED') return pack
  const { task } = await approvalOf(pack.agentTaskId)
  const next = task.state === 'PROPOSED' ? 'PROPOSED' : task.state === 'APPROVED' || task.state === 'RUNNING' ? 'APPROVED' : 'CLOSED'
  if (next === pack.state) return pack
  return prisma.outreachPack.update({
    where: { id: packId },
    data: { state: next, ...(next === 'APPROVED' ? { approvedById: task.approvedById, approvedAt: task.approvedAt } : {}) },
  })
}

/** Close a pack that is still open. Letters already sent stand; none more go. */
export async function closePack(companyId: string, id: string): Promise<Refusal | { ok: true }> {
  const pack = await prisma.outreachPack.findFirst({ where: { id, companyId } })
  if (!pack) return refuse('There is no such pack at your firm.', undefined, 404)
  if (pack.state === 'CLOSED') return { ok: true }
  if (pack.agentTaskId) await closeTask(pack.agentTaskId, 'The pack was closed by a person. Letters already sent stand and nothing more goes.', 'STOPPED')
  await prisma.outreachPack.update({ where: { id }, data: { state: 'CLOSED' } })
  await prisma.outreachPush.updateMany({ where: { packId: id, state: 'QUEUED' }, data: { state: 'DROPPED' } })
  return { ok: true }
}

/** The one person a push is about, where it is about one: a visitor, or the company whose contract is ending. */
async function onlyFor(firing: { kind: string; sourceType: string; sourceId: string }): Promise<{ personId?: string; contactId?: string; atCompanyId?: string } | null> {
  if (firing.kind === 'REPEAT_VISITS') {
    const who = firing.sourceId.slice(firing.sourceId.indexOf(':') + 1)
    const person = await prisma.person.findUnique({ where: { id: who }, select: { id: true } })
    return person ? { personId: person.id } : { contactId: who }
  }
  if (firing.kind === 'CLIENT_CONTRACT_ENDING') {
    const c = await prisma.sellContract.findUnique({ where: { id: firing.sourceId }, select: { clientCompanyId: true } })
    return { atCompanyId: c?.clientCompanyId ?? '-' }
  }
  return null
}

/**
 * Put one push in the pack that covers it, or leave it waiting as a card.
 * Returns where it went. A push is never left in a pack that was not approved
 * by a person: the pack is read fresh from its task before anything joins.
 */
export async function placePush(pushId: string, now: Date = new Date()): Promise<{ where: 'PACK' | 'CARD' | 'NOBODY'; packId?: string; says: string }> {
  const push = await prisma.outreachPush.findUniqueOrThrow({ where: { id: pushId }, include: { firing: true } })
  if (push.state === 'SENT' || push.state === 'DROPPED') return { where: 'NOBODY', says: 'This push is closed.' }
  if (push.state === 'QUEUED' && push.packId) return { where: 'PACK', packId: push.packId, says: 'Already in its pack.' }
  const candidates = await prisma.outreachPack.findMany({ where: { companyId: push.companyId, segmentId: push.segmentId, state: { in: ['PROPOSED', 'APPROVED'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  let chosen = null as null | Awaited<ReturnType<typeof syncPack>>
  for (const c of candidates) {
    const fresh = await syncPack(c.id)
    if (packFits(fresh, push) === null) { chosen = fresh; break }
  }
  if (!chosen) return waitAsCard(push, now)
  return queueInto(chosen.id, push, now)
}

async function queueInto(packId: string, push: Awaited<ReturnType<typeof prisma.outreachPush.findUniqueOrThrow>> & { firing: { kind: string; sourceType: string; sourceId: string } }, now: Date) {
  const pack = await prisma.outreachPack.findUniqueOrThrow({ where: { id: packId } })
  const segment = await prisma.outreachSegment.findUniqueOrThrow({ where: { id: push.segmentId } })
  const def = defOf(segment)
  const read = await readSegment(push.companyId, def, null, now)
  const only = await onlyFor(push.firing)
  const members = read.members.filter((m) => !only || (only.personId ? m.id === only.personId : only.contactId ? m.id === only.contactId : m.atCompanyId === only.atCompanyId))
  const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: pack.agentTaskId! } })
  const payload = task.payload as unknown as PackPayload
  const page = await pageFor(push)
  const made = await prisma.$transaction(async (tx) => {
    const have = await tx.outreachLetter.findMany({ where: { agentTaskId: task.id }, select: { contactId: true, atCompanyId: true } })
    const taken = new Set(have.flatMap((h) => [h.contactId, h.atCompanyId]))
    const cap = ((task.plan as { recipients?: number }).recipients ?? PACK_LETTER_CAP)
    const fresh = members.filter((m) => !taken.has(m.id) && !taken.has(m.atCompanyId)).slice(0, Math.max(0, cap - have.length))
    const content = { ...payload.letterContent }
    for (const m of fresh) {
      const l = await tx.outreachLetter.create({ data: { companyId: push.companyId, agentTaskId: task.id, contactId: m.id, atCompanyId: m.atCompanyId, email: m.email, state: 'READY' } })
      content[l.id] = { pushId: push.id, subject: push.subject, body: push.body, page }
    }
    await tx.agentTask.update({ where: { id: task.id }, data: { payload: { ...payload, letterContent: content } as unknown as Prisma.InputJsonValue } })
    await tx.outreachPush.update({ where: { id: push.id }, data: { packId, state: fresh.length ? 'QUEUED' : 'DROPPED' } })
    await tx.outreachTripwireFiring.update({ where: { id: push.firingId }, data: { state: 'PUSHED' } })
    return fresh.length
  })
  return made
    ? { where: 'PACK' as const, packId, says: `${made} ${made === 1 ? 'letter' : 'letters'} queued in the pack ${pack.name}. They go only after the yes the pack already has.` }
    : { where: 'NOBODY' as const, packId, says: 'Nobody in the segment is left to write to for this: everyone is already in the pack, held, or past its limit.' }
}

async function pageFor(push: { contentKind: string; contentRef: string; companyId: string }) {
  const firm = await prisma.company.findUnique({ where: { id: push.companyId }, select: { slug: true } })
  if (!firm) return null
  if (push.contentKind === 'POD_OFFER') return { pageKind: 'POD' as const, pageRef: push.contentRef, path: `/site/${firm.slug}` }
  const course = await prisma.course.findUnique({ where: { id: push.contentRef }, select: { trackKey: true } })
  return { pageKind: 'COURSE' as const, pageRef: push.contentRef, path: course?.trackKey ? `/learn/${firm.slug}/${course.trackKey}` : `/learn/${firm.slug}` }
}

/** No approved pack covers the push: it waits, and one card (shared by pushes of the same segment and kind) tells the person. Sends nothing. */
async function waitAsCard(push: { id: string; companyId: string; segmentId: string; contentKind: string; firingId: string; firing: { reason: string } }, now: Date) {
  const segment = await prisma.outreachSegment.findUniqueOrThrow({ where: { id: push.segmentId } })
  const sibling = await prisma.outreachPush.findFirst({
    where: { companyId: push.companyId, segmentId: push.segmentId, contentKind: push.contentKind, state: 'WAITING', decisionId: { not: null }, id: { not: push.id } },
    select: { decisionId: true },
  })
  let decisionId: string | null = null
  if (sibling?.decisionId && await prisma.decisionItem.count({ where: { id: sibling.decisionId, state: 'OPEN' } })) decisionId = sibling.decisionId
  if (!decisionId) {
    const owner = await ownerForRoles(push.companyId, ['Account Manager'], now)
    const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId: push.companyId, agentKey: OUTREACH_BATCH_AGENT } } })
    if (owner && sw) {
      const card = waitingCard({ reason: push.firing.reason, contentLabel: CONTENT_LABELS[push.contentKind as ContentKind] ?? push.contentKind, segmentWords: describeSegment(defOf(segment)) })
      const entities = await prisma.legalEntity.findMany({ where: { companyId: push.companyId }, select: { id: true } })
      try {
        const item = await openDecision({
          companyId: push.companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
          question: card.question, ownerPersonId: owner, openedOn: now, proof: card.detail, proofLinks: [{ recordType: 'Company', recordId: push.companyId }],
        }, now)
        decisionId = item.id
      } catch (e) { if (!(e instanceof LedgerRefusal)) throw e }
    }
  }
  await prisma.outreachPush.update({ where: { id: push.id }, data: { state: 'WAITING', decisionId } })
  await prisma.outreachTripwireFiring.update({ where: { id: push.firingId }, data: { state: 'WAITING' } })
  return { where: 'CARD' as const, says: 'No approved pack covers this segment and kind, so it waits and nothing is sent.' }
}

/** Waiting pushes that an approved pack now covers join it. Called each run and after a yes. */
export async function releaseWaiting(companyId: string, now: Date = new Date()): Promise<number> {
  const waiting = await prisma.outreachPush.findMany({ where: { companyId, state: 'WAITING' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  let moved = 0
  for (const p of waiting) { const r = await placePush(p.id, now); if (r.where !== 'CARD') moved++ }
  return moved
}

/** The firm's packs with their counts, for the page. Reads the yes fresh. */
export async function packsOf(companyId: string) {
  const rows = await prisma.outreachPack.findMany({ where: { companyId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { _count: { select: { pushes: true } } }, take: 50 })
  const out = []
  for (const r of rows) {
    const p = await syncPack(r.id)
    const letters = p.agentTaskId ? await prisma.outreachLetter.count({ where: { agentTaskId: p.agentTaskId } }) : 0
    const task = p.agentTaskId ? await prisma.agentTask.findUnique({ where: { id: p.agentTaskId }, select: { sentCount: true, decisionId: true } }) : null
    out.push({ id: p.id, name: p.name, state: p.state, segmentId: p.segmentId, contentKinds: p.contentKinds, pushes: r._count.pushes, letters, sent: task?.sentCount ?? 0, decisionId: task?.decisionId ?? null, approvedAt: p.approvedAt })
  }
  return out
}
