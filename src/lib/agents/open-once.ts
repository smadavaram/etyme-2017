/**
 * One decision per thing, for the agents of chains 3 and 6 (record 112).
 * Nothing opens where one is open on the same record, or where one was
 * decided on these very words. Mirrors the reconciliation agent's rule so
 * the queue never fills with the same question every morning. The card is
 * the agent's work for a person; nothing here sends, signs or changes a
 * record the card is about.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision, firmToday } from '@/lib/decision-items'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { AGENT_HELD_AS, type AgentContext } from './runner'

export type Opened = 'OPENED' | 'ALREADY_OPEN' | 'ALREADY_DECIDED' | 'NO_OWNER' | 'REFUSED'

export interface Card { question: string; proof: string }

/**
 * What a card-opening skill reports about one `openOnce` (record 123): a card
 * that was opened, or was already there, is a pass; a card nobody could be
 * owed, or the ledger refused, is a failed call and says so. A card already
 * decided on these very words is a pass: the question was asked and answered.
 */
export function cardOutcome(r: Opened): { result: Opened; verdict?: 'FAIL'; failReason?: string } {
  if (r === 'NO_OWNER') return { result: r, verdict: 'FAIL', failReason: 'Nobody holds a seat that could be owed this card.' }
  if (r === 'REFUSED') return { result: r, verdict: 'FAIL', failReason: 'The ledger refused the card, or the agent has no switch.' }
  return { result: r }
}

/** The seat that owes a card: the first of these roles with a working seat, else the Owner; null where nobody does. */
export const ownerOf = (ctx: AgentContext, roles: readonly string[]) => ownerForRoles(ctx.companyId, roles, ctx.now)

export async function openOnce(
  ctx: AgentContext,
  ownerPersonId: string | null,
  link: { recordType: string; recordId: string },
  card: Card,
  /** Records the record view opens (a contract, a person, a company), shown beside the dedupe link as proof. */
  also: { recordType: string; recordId: string }[] = [],
): Promise<Opened> {
  if (!ownerPersonId) return 'NO_OWNER'
  const { companyId, now } = ctx
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return 'REFUSED'
  // The same card is one whose own dedupe link (the first) is this link. A card
  // that only shows this record beside its own link is a different card.
  const same = (await prisma.decisionItem.findMany({
    where: { companyId, proofLinks: { array_contains: [link] }, agentTasks: { none: {} } },
    select: { state: true, proof: true, proofLinks: true },
  })).filter((d) => {
    const first = Array.isArray(d.proofLinks) ? (d.proofLinks[0] as { recordType?: string; recordId?: string } | undefined) : undefined
    return first?.recordType === link.recordType && first?.recordId === link.recordId
  })
  if (same.some((d) => d.state === 'OPEN')) return 'ALREADY_OPEN'
  if (same.some((d) => d.proof === card.proof.trim())) return 'ALREADY_DECIDED'
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  try {
    await openDecision({
      companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
      question: card.question, ownerPersonId, openedOn: await firmToday(companyId, now),
      proof: card.proof, proofLinks: [link, ...also],
    }, now)
    return 'OPENED'
  } catch (e) {
    if (e instanceof LedgerRefusal) return 'REFUSED'
    throw e
  }
}
