/**
 * The answer key for `dual-auth.block` (record 123, plan C3 and C9).
 *
 * The run is about one submission held because the same person was put
 * forward twice for the same job in overlapping time. This reads every live
 * submission the firm sent and groups them with the rules' own reader
 * (`dualAuthorizations`): the submission must be in a group of two or more,
 * one person, one job, overlapping dates. Then two cards for that pair must
 * be on the record, owed by two different people; where the firm has one
 * working seat the ledger must say nobody can release it. A block this
 * agent lifted itself is never a pass: the cards are read, not the agent.
 */
import type { PrismaClient } from '@prisma/client'
import { firmSeats, seatAtFirm } from '@/lib/decision-items'
import { dualAuthorizations, dualQuestion } from '@/lib/agents/confirmation-rules'
import { CONFIRMATION_AGENT } from '@/lib/agents/confirmation-rules'
import { ENDED, PERSON_RECORD, factFromRow } from '@/lib/agents/confirmation-tracker'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt } from './cards'

export const dualAuthBlock: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no submission, so there is nothing to re-read.')
  const evidence = `Submission ${ref.recordId}`
  const rows = await read.submission.findMany({
    where: { fromCompanyId: companyId, status: { notIn: ENDED } },
    select: { id: true, personId: true, submittedAt: true, rejectedAt: true, checkState: true, person: { select: { name: true } }, requirement: { select: { title: true, companyId: true, endClientCompanyId: true } } },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }], take: 3000,
  })
  const group = dualAuthorizations(rows.map(factFromRow)).find((g) => g.some((m) => m.id === ref.recordId))
  if (!group) return { verdict: 'FAIL', reason: 'The record shows no second submission of the same person for the same job in overlapping time, so nothing was held.', evidence, unitsFound: 0 }
  const first = group[0]
  const cards = await cardsAt(read, companyId, { recordType: PERSON_RECORD, recordId: first.personId }, dualQuestion(first.personName, first.jobTitle))
  if (cards.length >= 2) {
    if (new Set(cards.map((c) => c.ownerPersonId)).size < 2) return { verdict: 'FAIL', reason: 'The two cards are owed by one person, and a hold lifts only when two different people say yes.', evidence, unitsFound: 0 }
    return { verdict: 'PASS', reason: `${group.length} submissions of one person for one job overlap, and two cards are owed by two different people.`, evidence, unitsFound: 1 }
  }
  if (cards.length === 1) return { verdict: 'FAIL', reason: 'Only one card is on the record for the hold, and it needs two.', evidence, unitsFound: 0 }
  const seats = await firmSeats(companyId, read as any)
  if (seats.filter((s) => seatAtFirm(s, seats, window.to) !== null).length >= 2) return { verdict: 'FAIL', reason: 'No card was opened for the hold, and the firm has two working seats to put it to.', evidence, unitsFound: 0 }
  const said = await read.recordAction.count({ where: { companyId, agentKey: CONFIRMATION_AGENT, action: 'DUAL_AUTHORIZATION_BLOCKED', recordId: first.personId } })
  if (said === 0) return { verdict: 'FAIL', reason: 'The firm has one working seat and the ledger does not say nobody can release the hold.', evidence, unitsFound: 0 }
  return { verdict: 'PASS', reason: 'The firm has one working seat, and the ledger says so beside the hold.', evidence, unitsFound: 1 }
}
