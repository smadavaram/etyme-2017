/**
 * The record ledger (2026-11-21 → 105, 107).
 *
 * Every act on a record is one row, written once and never changed. A
 * "record" is any existing row, named by its type and id. Each row
 * carries three stamps, written at the time:
 *  - the legal entity the act was done for, chosen by the caller at the
 *    point of action, never read off an email address or a signature;
 *  - the person who did it;
 *  - the role or queue she held, copied as text, so a later change of
 *    role never rewrites what she was when she acted.
 *
 * The ledger is the audit trail and the usage meter. This file is the one
 * writer and offers no way to change or remove a row.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'

type Tx = Prisma.TransactionClient | PrismaClient

export interface RecordActionInput {
  companyId: string
  recordType: string
  recordId: string
  /** A short action word: OPENED, DECIDED, SENT. */
  action: string
  /** What happened, in a plain sentence. */
  summary: string
  /** The legal entity acted for. Required when the company has any. */
  actingEntityId?: string | null
  personId: string
  /** The role or queue she held, as she held it at the time. */
  heldAs: string
  /** Set where an agent drafted the act. */
  agentKey?: string | null
  ruleVersion?: string | null
}

export class LedgerRefusal extends Error {}

/** Why a row cannot be written, in a sentence; null when it can. Pure. */
export function stampRefusal(
  input: Pick<RecordActionInput, 'actingEntityId' | 'personId' | 'heldAs' | 'summary' | 'action'>,
  ownEntityIds: readonly string[],
): string | null {
  if (!input.personId) return 'Every act on the record names the person who did it.'
  if (!input.heldAs?.trim()) return 'Every act on the record names the role or queue the person held.'
  if (!input.action?.trim() || !input.summary?.trim()) return 'Every act on the record says what happened, in a sentence.'
  if (input.actingEntityId) {
    if (!ownEntityIds.includes(input.actingEntityId)) {
      return 'That legal entity is not one of this company’s own. Choose one of the company’s entities.'
    }
  } else if (ownEntityIds.length > 0) {
    return 'This company has legal entities. Choose which one this act is done for.'
  }
  return null
}

/** Write one row. Refuses, in a sentence, a stamp that does not hold. */
export async function writeRecordAction(tx: Tx, input: RecordActionInput) {
  const entities = await tx.legalEntity.findMany({ where: { companyId: input.companyId }, select: { id: true } })
  const refusal = stampRefusal(input, entities.map((e) => e.id))
  if (refusal) throw new LedgerRefusal(refusal)
  return tx.recordAction.create({
    data: {
      companyId: input.companyId,
      recordType: input.recordType,
      recordId: input.recordId,
      action: input.action.trim(),
      summary: input.summary.trim(),
      actingEntityId: input.actingEntityId ?? null,
      personId: input.personId,
      heldAs: input.heldAs.trim(),
      agentKey: input.agentKey ?? null,
      ruleVersion: input.ruleVersion ?? null,
    },
  })
}

/** Every act on one record, oldest first, read only inside its company. */
export function recordTimeline(companyId: string, recordType: string, recordId: string, db: Tx = prisma) {
  return db.recordAction.findMany({
    where: { companyId, recordType, recordId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { person: { select: { name: true } }, actingEntity: { select: { name: true } } },
  })
}

/**
 * The usage meter: how many acts each agent drafted in [from, to). Acts
 * no agent drafted count under null. A count, never a price.
 */
export async function usageCount(companyId: string, from: Date, to: Date, db: Tx = prisma): Promise<{ agentKey: string | null; count: number }[]> {
  const rows = await db.recordAction.groupBy({
    by: ['agentKey'],
    where: { companyId, createdAt: { gte: from, lt: to } },
    _count: { _all: true },
  })
  return rows.map((r) => ({ agentKey: r.agentKey, count: r._count._all }))
}

export const LEDGER_PAGE_SIZE = 25

/**
 * The firm's whole ledger, newest first, one page at a time (page 1 is
 * the newest). Read only inside its company; a count, never a price.
 */
export async function firmLedger(companyId: string, page: number = 1, db: Tx = prisma) {
  const at = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  const [rows, total] = await Promise.all([
    db.recordAction.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (at - 1) * LEDGER_PAGE_SIZE,
      take: LEDGER_PAGE_SIZE,
      include: { person: { select: { name: true } }, actingEntity: { select: { name: true } } },
    }),
    db.recordAction.count({ where: { companyId } }),
  ])
  return { rows, page: at, pages: Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE)), total }
}
