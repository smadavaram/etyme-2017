/**
 * A person approving a proposal (record 124): the one act, read by the
 * approve route and by the yes on the agent's card. The agent has no door
 * here: both callers are a signed-in person's own act.
 */
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { moveRefusal, type ProposalState } from './rules'
import { PROPOSAL_RECORD, PROPOSAL_REVIEW_KIND } from './draft-rules'
import { bidEligibility } from '@/lib/diversity/facts'

/** The sentence that refuses this person's approval, or null where it may go ahead. Reads fresh. */
export async function approvalRefusal(companyId: string, proposalId: string): Promise<string | null> {
  const p = await prisma.proposal.findFirst({ where: { id: proposalId, companyId }, include: { pieces: { select: { haveIt: true } } } })
  if (!p) return 'That proposal is not on this firm’s list.'
  const no = moveRefusal('PERSON', p.state as ProposalState, 'APPROVED', p.pieces.filter((x) => !x.haveIt).length)
  if (no) return no
  // A bid set aside for a certification the firm does not hold today is never approved as eligible (record 132).
  const eligibility = await bidEligibility(prisma, companyId, p)
  return eligibility.eligible ? null : eligibility.says
}

export async function approveByPerson(input: { companyId: string; proposalId: string; personId: string }): Promise<{ ok: true } | { ok: false; says: string }> {
  const says = await approvalRefusal(input.companyId, input.proposalId)
  if (says) return { ok: false, says }
  // Only a proposal still waiting for the yes moves, so two people at once cannot both approve it.
  const moved = await prisma.proposal.updateMany({
    where: { id: input.proposalId, companyId: input.companyId, state: 'READY_FOR_PERSON' },
    data: { state: 'APPROVED', approvedAt: new Date(), approvedById: input.personId },
  })
  if (moved.count !== 1) return { ok: false, says: 'That proposal was changed while you were reading it. Open it again.' }
  await emit({ type: 'proposal.approved', companyId: input.companyId, subjectType: 'Proposal', subjectId: input.proposalId, actorPersonId: input.personId, payload: {} })
  return { ok: true }
}

/** The proposal a decision card asks about, where it is the proposals agent's review card; null for every other card. */
export async function proposalOfReviewCard(companyId: string, decisionId: string): Promise<string | null> {
  const t = await prisma.agentTask.findFirst({ where: { companyId, decisionId, kind: PROPOSAL_REVIEW_KIND, recordType: PROPOSAL_RECORD }, select: { recordId: true } })
  return t?.recordId ?? null
}
