/**
 * Decision items a person opens (2026-11-21 → 105, 107).
 *
 * A decision the firm owes, in a sentence, with the seat that owes it,
 * the legal entity it is for, the day a person says it opened, and the
 * proof (text, and links to the records it points at). Its true age
 * counts from that day in whole days. A decision made by phone stays
 * open until somebody records it here.
 *
 * Three acts: approve (closes it, an optional note), reject (closes it,
 * a reason) and send back (keeps it open and its age counting, a
 * reason). Opening and each act write a row on the record ledger with
 * the actor's own three stamps; `recordTimeline` in lib/record-ledger
 * reads the item's whole history.
 *
 * Only the owner, or the firm's Owner or Admin, acts on it. Not yet wired
 * to a route or a page; the next builder does that.
 */

import { prisma } from '@/lib/db'
import { writeRecordAction, stampRefusal, LedgerRefusal } from '@/lib/record-ledger'
import { OWNER_ROLE, ADMIN_ROLE } from '@/lib/owner-rules'

export const DECISION_RECORD = 'DecisionItem'
const DAY = 86_400_000

export type Verdict = 'APPROVE' | 'REJECT' | 'SEND_BACK'
export interface ProofLink { recordType: string; recordId: string }

/** A date as its UTC calendar day, in whole days since the epoch. Pure. */
function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY)
}

/** Whole days from the day it opened to today. Pure. */
export function ageInDays(openedOn: Date, today: Date = new Date()): number {
  return Math.max(0, dayNumber(today) - dayNumber(openedOn))
}

/** Why it cannot be opened, in a sentence; null when it can. Pure. */
export function openRefusal(input: { question: string; proof: string; openedOn: Date }, today: Date = new Date()): string | null {
  if (!input.question?.trim()) return 'A decision says its question in a sentence.'
  if (!input.proof?.trim()) return 'A decision says what shows it is owed.'
  if (Number.isNaN(input.openedOn.getTime())) return 'A decision needs the day it opened.'
  if (dayNumber(input.openedOn) > dayNumber(today)) return 'A decision cannot open on a day that has not happened yet.'
  return null
}

const NOT_YOURS = 'Only the person who owes this decision, or the firm’s Owner or Admin, decides it.'

/** Who may act on a decision, as a rule. Pure. */
export function mayDecide(input: { ownerPersonId: string; deciderPersonId: string; deciderRoleNames: readonly (string | null)[] }): string | null {
  if (input.deciderPersonId === input.ownerPersonId) return null
  if (input.deciderRoleNames.some((n) => n === OWNER_ROLE || n === ADMIN_ROLE)) return null
  return NOT_YOURS
}

/** Why this act cannot be taken on an item in this state, in a sentence; null when it can. Pure. */
export function verdictRefusal(state: string, verdict: Verdict, note: string | null | undefined): string | null {
  if (state !== 'OPEN') return 'This decision is already closed and cannot be decided again.'
  if (verdict === 'REJECT' && !note?.trim()) return 'Say in one line why it is rejected.'
  if (verdict === 'SEND_BACK' && !note?.trim()) return 'Say in one line why it is sent back.'
  return null
}

interface Stamp {
  companyId: string
  personId: string
  heldAs: string
  actingEntityId?: string | null
}

export async function openDecision(
  input: Stamp & { question: string; ownerPersonId: string; openedOn: Date; proof: string; proofLinks?: ProofLink[] },
  today: Date = new Date(),
) {
  const refusal = openRefusal(input, today)
  if (refusal) throw new LedgerRefusal(refusal)
  const entities = await prisma.legalEntity.findMany({ where: { companyId: input.companyId }, select: { id: true } })
  const entityRefusal = stampRefusal({ ...input, action: 'OPENED', summary: input.question }, entities.map((e) => e.id))
  if (entityRefusal) throw new LedgerRefusal(entityRefusal)
  const ownerSeat = await prisma.context.findFirst({
    where: { personId: input.ownerPersonId, companyId: input.companyId, revokedAt: null },
    select: { id: true },
  })
  if (!ownerSeat) throw new LedgerRefusal('A decision is owed by somebody with a seat at this firm.')
  const links = (input.proofLinks ?? []).map((l) => ({ recordType: l.recordType, recordId: l.recordId }))
  return prisma.$transaction(async (tx) => {
    const item = await tx.decisionItem.create({
      data: {
        companyId: input.companyId,
        question: input.question.trim(),
        ownerPersonId: input.ownerPersonId,
        actingEntityId: input.actingEntityId ?? null,
        openedOn: new Date(dayNumber(input.openedOn) * DAY),
        proof: input.proof.trim(),
        proofLinks: links,
      },
    })
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: DECISION_RECORD, recordId: item.id,
      action: 'OPENED', summary: `Opened: ${item.question}`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId,
    })
    return item
  })
}

/** The firm's decisions, oldest first by the day they opened, with owner, entity and age in days. */
export async function listDecisions(companyId: string, today: Date = new Date()) {
  const rows = await prisma.decisionItem.findMany({
    where: { companyId },
    orderBy: [{ openedOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: {
      ownerPerson: { select: { name: true } },
      actingEntity: { select: { name: true } },
      decidedBy: { select: { name: true } },
      sentBackBy: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    ...r,
    proofLinks: (r.proofLinks ?? []) as unknown as ProofLink[],
    ownerName: r.ownerPerson.name,
    entityName: r.actingEntity?.name ?? null,
    ageDays: ageInDays(r.openedOn, today),
  }))
}

/** Approve, reject or send back. The ledger row carries the decider's own three stamps. */
export async function decideDecision(input: Stamp & { decisionId: string; verdict: Verdict; note?: string | null }) {
  const item = await prisma.decisionItem.findFirst({ where: { id: input.decisionId, companyId: input.companyId } })
  if (!item) throw new LedgerRefusal('There is no such decision at this firm.')
  const stateRefusal = verdictRefusal(item.state, input.verdict, input.note)
  if (stateRefusal) throw new LedgerRefusal(stateRefusal)
  const seats = await prisma.context.findMany({
    where: { personId: input.personId, companyId: input.companyId, revokedAt: null, suspendedAt: null },
    select: { role: { select: { name: true } } },
  })
  const who = seats.length === 0
    ? NOT_YOURS
    : mayDecide({ ownerPersonId: item.ownerPersonId, deciderPersonId: input.personId, deciderRoleNames: seats.map((s) => s.role?.name ?? null) })
  if (who) throw new LedgerRefusal(who)
  const note = input.note?.trim() || null
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    // Only an item still OPEN moves, so two people deciding at once cannot both close it.
    const data = input.verdict === 'SEND_BACK'
      ? { sentBackReason: note, sentBackByPersonId: input.personId, sentBackAt: now }
      : { state: input.verdict === 'APPROVE' ? 'APPROVED' as const : 'REJECTED' as const, verdictNote: note, decidedByPersonId: input.personId, decidedAt: now }
    const moved = await tx.decisionItem.updateMany({ where: { id: item.id, state: 'OPEN' }, data })
    if (moved.count !== 1) throw new LedgerRefusal('This decision is already closed and cannot be decided again.')
    const words = input.verdict === 'APPROVE' ? 'Approved' : input.verdict === 'REJECT' ? 'Rejected' : 'Sent back'
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: DECISION_RECORD, recordId: item.id,
      action: input.verdict === 'APPROVE' ? 'APPROVED' : input.verdict === 'REJECT' ? 'REJECTED' : 'SENT_BACK',
      summary: note ? `${words}: ${note}` : `${words}.`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId,
    })
    return tx.decisionItem.findUniqueOrThrow({ where: { id: item.id } })
  })
}
