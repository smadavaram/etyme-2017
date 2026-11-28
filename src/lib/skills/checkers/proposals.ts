/**
 * The answer keys for the proposals agent's four skills (record 123 plan C3;
 * record 124). Each re-reads the proposal, its pieces and its tasks from the
 * record and re-derives what should be there with the same pure rules the
 * agent uses. None takes the agent's report.
 *
 *  - proposal.draft: the words are on the proposal, the structure is intact,
 *    and the paragraphs a model may have written hold no amount of money, no
 *    compliance statement and no number the record does not hold. A person's
 *    later edit makes it "not graded", never a fail.
 *  - proposal.check: every kind of piece the requirements name has a piece,
 *    the state agrees with the pieces, and only a person ever approved it.
 *    It also claims no certification the record does not hold today (record 132).
 *  - registration.draft: each answer drafted for a diversity portal is read back
 *    against the record as it stands: no certification not held, no ownership
 *    fact the Owner has not attested, no legal entity but the Owner's.
 *  - proposal.ask: the card is one task that sends nothing, in twelve words
 *    or fewer, and none is open for a proposal that is not ready.
 *  - proposal.chase: each reminder task is for one seat at the firm, names
 *    pieces on this proposal, and is closed only where they are in hand.
 */
import type { PrismaClient } from '@prisma/client'
import { bidEligibility, readDiversityFacts } from '@/lib/diversity/facts'
import { registrationProblems } from '@/lib/diversity/registration-rules'
import { certificationClaimProblems, checkProposal, draftProblems, paragraphsOf, piecesToAdd, requirementLines, stateAfterCheck, PROPOSAL_CHASE_KIND, PROPOSAL_REVIEW_KIND, PROPOSAL_RECORD } from '@/lib/proposals/draft-rules'
import { readProposalFacts } from '@/lib/proposals/facts-read'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

const fail = (reason: string, evidence: string | null): CheckerResult => ({ verdict: 'FAIL', reason, evidence, unitsFound: 0 })
const pass = (reason: string, evidence: string | null): CheckerResult => ({ verdict: 'PASS', reason, evidence, unitsFound: 1 })

export const proposalDraft: SkillChecker<PrismaClient> = async (companyId, _k, window, refs, read) => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no proposal.')
  const evidence = `Proposal ${ref.recordId}`
  const p = await read.proposal.findFirst({ where: { id: ref.recordId, companyId }, select: { draft: true } })
  if (!p) return fail('The run drafted a proposal that is not on the record.', evidence)
  if (!p.draft?.trim()) return fail('The run drafted a proposal and no draft is on the record.', evidence)
  const edited = await read.event.count({ where: { companyId, type: 'proposal.draft_edited', subjectId: ref.recordId, occurredAt: { gte: window.from } } })
  if (edited > 0) return unknownBecause('A person edited the draft after the run, so the words it wrote can no longer be read back.')
  const words = paragraphsOf(p.draft)
  if (!words) return fail('The draft has lost its sections, so the paragraphs the agent wrote cannot be found.', evidence)
  const facts = await readProposalFacts(read as never, companyId)
  const problems = [...draftProblems(words, facts), ...certificationClaimProblems(p.draft, facts.held ?? [])]
  return problems.length ? fail(problems.join(' '), evidence) : pass('The draft holds no amount of money, no compliance statement and no number the record does not hold.', evidence)
}

export const proposalCheck: SkillChecker<PrismaClient> = async (companyId, _k, _w, refs, read) => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no proposal.')
  const evidence = `Proposal ${ref.recordId}`
  const p = await read.proposal.findFirst({ where: { id: ref.recordId, companyId }, include: { pieces: true } })
  if (!p) return fail('The run checked a proposal that is not on the record.', evidence)
  if ((p.state === 'APPROVED' || p.state === 'SUBMITTED') && !p.approvedById) return fail(`The proposal reads ${p.state.toLowerCase()} and no person approved it.`, evidence)
  const lines = requirementLines(p.requirements)
  const missingKinds = piecesToAdd(lines, p.pieces)
  if (missingKinds.length) return fail(`The requirements name ${missingKinds.map((k) => k.toLowerCase().replace(/_/g, ' ')).join(' and ')}, and the proposal has no piece for ${missingKinds.length === 1 ? 'it' : 'them'}.`, evidence)
  if (p.state === 'APPROVED' || p.state === 'SUBMITTED') return pass('A person approved it, and every kind of piece the requirements name is there.', evidence)
  const want = stateAfterCheck(checkProposal(lines, p.pieces, await bidEligibility(read as never, companyId, p)))
  if (want !== 'DRAFT' && want !== p.state) return fail(`The pieces say ${want.toLowerCase().replace(/_/g, ' ')}, and the proposal reads ${p.state.toLowerCase().replace(/_/g, ' ')}.`, evidence)
  return pass('Every kind of piece the requirements name is there, and the state agrees with which pieces are in hand.', evidence)
}

export const registrationDraft: SkillChecker<PrismaClient> = async (companyId, _k, window, refs, read) => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no registration.')
  const evidence = `Registration ${ref.recordId}`
  const r = await read.diversityRegistration.findFirst({ where: { id: ref.recordId, companyId }, select: { answers: true, questions: true, status: true, submittedById: true } })
  if (!r) return fail('The run drafted a registration that is not on the record.', evidence)
  if (!r.answers?.trim()) return fail('The run drafted a registration and no answers are on the record.', evidence)
  if (r.submittedById) return fail('The registration shows a person submitted it, and the agent only drafts. Check who marked it.', evidence)
  const edited = await read.event.count({ where: { companyId, type: 'diversity.registration_edited', subjectId: ref.recordId, occurredAt: { gte: window.from } } })
  if (edited > 0) return unknownBecause('A person edited the answers after the run, so the words it wrote can no longer be read back.')
  const problems = registrationProblems(r.answers, await readDiversityFacts(read as never, companyId))
  return problems.length ? fail(problems.join(' '), evidence) : pass('Every answer is from the record: no certification that is not held, no ownership fact the Owner has not attested.', evidence)
}

export const proposalAsk: SkillChecker<PrismaClient> = async (companyId, _k, _w, refs, read) => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no proposal.')
  const evidence = `Proposal ${ref.recordId}`
  const tasks = await read.agentTask.findMany({ where: { companyId, kind: PROPOSAL_REVIEW_KIND, recordType: PROPOSAL_RECORD, recordId: ref.recordId }, include: { decision: true }, orderBy: { createdAt: 'asc' } })
  if (tasks.length === 0) return fail('The run asked for a yes and no card is on the record for the proposal.', evidence)
  const open = tasks.filter((t) => ['PROPOSED', 'APPROVED', 'RUNNING'].includes(t.state))
  if (open.length > 1) return fail(`${open.length} cards are open for the same proposal.`, evidence)
  const bad = tasks.find((t) => (t.plan as { sendsNothing?: boolean } | null)?.sendsNothing !== true)
  if (bad) return fail('A card for this proposal could send something. A card that asks for approval sends nothing.', evidence)
  const long = tasks.find((t) => t.decision.question.trim().split(/\s+/).length > 12)
  if (long) return fail('The card’s question is longer than twelve words.', evidence)
  if (open.length === 1) {
    const p = await read.proposal.findFirst({ where: { id: ref.recordId, companyId }, include: { pieces: { select: { haveIt: true } } } })
    if (p && p.state !== 'READY_FOR_PERSON' && p.state !== 'APPROVED' && p.state !== 'SUBMITTED') return fail(`A card is open and the proposal reads ${p.state.toLowerCase().replace(/_/g, ' ')}, not ready for a person.`, evidence)
  }
  return pass('One card, sending nothing, in twelve words or fewer, and open only for a proposal that is ready.', evidence)
}

export const proposalChase: SkillChecker<PrismaClient> = async (companyId, _k, _w, refs, read) => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no proposal.')
  const evidence = `Proposal ${ref.recordId}`
  const tasks = await read.agentTask.findMany({ where: { companyId, kind: PROPOSAL_CHASE_KIND, recordType: PROPOSAL_RECORD, recordId: ref.recordId }, orderBy: { createdAt: 'asc' } })
  if (tasks.length === 0) return fail('The run chased a proposal and no reminder task is on the record for it.', evidence)
  const pieces = await read.proposalPiece.findMany({ where: { proposalId: ref.recordId }, select: { id: true, haveIt: true } })
  let good = 0
  for (const t of tasks) {
    const pay = (t.payload ?? {}) as { seatPersonId?: string; pieceIds?: string[] }
    const mine = (pay.pieceIds ?? []).map((id) => pieces.find((x) => x.id === id))
    if (!pay.seatPersonId || mine.length === 0 || mine.some((x) => !x)) return fail('A reminder task names no seat, or names a piece that is not on the proposal.', evidence)
    const seat = await read.context.findFirst({ where: { personId: pay.seatPersonId, companyId, revokedAt: null }, select: { id: true } })
    if (!seat) return fail('A reminder task is addressed to somebody who holds no seat at the firm. Reminders go to colleagues only.', evidence)
    if (t.state === 'CLOSED_BY_ARRIVAL' && mine.some((x) => !x!.haveIt)) return fail('A reminder was closed as answered while a piece it names is still missing.', evidence)
    good++
  }
  return { verdict: 'PASS', reason: 'Each reminder task is for one colleague at the firm, names pieces on this proposal, and is closed only where they are in hand.', evidence, unitsFound: good }
}
