/**
 * The answer key for `confirmation.match` (record 123, plan C3 and C9).
 *
 * The run is about one submission a reply was matched to. This reads the
 * submission again and finds the reply the way the tracker's own reader does
 * (`replyOn`): a message of a confirming kind, on the submission's own
 * thread between the two firms, written by a person seated at the other
 * firm. A draft is never a confirmation. With the agent On, the
 * confirmation must be on the record as the agent's own portal row with its
 * ledger line; with it on drafts only, no confirmation may be on the record
 * and the ledger must say the match was found and not recorded.
 */
import type { PrismaClient } from '@prisma/client'
import { replyOn } from '@/lib/agents/confirmation-tracker'
import { CONFIRMATION_AGENT, wentOut } from '@/lib/agents/confirmation-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

export const confirmationMatch: SkillChecker<PrismaClient> = async (companyId, _key, _window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no submission, so there is nothing to re-read.')
  const evidence = `Submission ${ref.recordId}`
  const sub = await read.submission.findFirst({ where: { id: ref.recordId, fromCompanyId: companyId }, select: { id: true, personId: true, checkState: true, submittedAt: true, toCompanyId: true } })
  if (!sub) return { verdict: 'FAIL', reason: 'The submission the run matched is not one this firm sent.', evidence, unitsFound: 0 }
  if (!wentOut(sub)) return { verdict: 'FAIL', reason: 'The submission is still a draft, and a draft is never a confirmation.', evidence, unitsFound: 0 }
  const reply = await replyOn(companyId, { toCompanyId: sub.toCompanyId, fact: { id: sub.id, submittedAt: sub.submittedAt } }, read as any)
  if (!reply) return { verdict: 'FAIL', reason: 'No interview or rate message from a person seated at the other firm is on the submission’s own thread.', evidence, unitsFound: 0 }
  const rows = await read.submissionConfirmation.findMany({ where: { companyId, submissionId: sub.id, channel: 'PORTAL', confirmedByPersonId: null }, select: { id: true } })
  if (rows.length > 0) {
    const lines = await read.recordAction.count({ where: { companyId, agentKey: CONFIRMATION_AGENT, action: 'CONFIRMATION_MATCHED', recordType: 'SubmissionConfirmation', recordId: { in: rows.map((r) => r.id) } } })
    if (lines < rows.length) return { verdict: 'FAIL', reason: 'A confirmation was recorded for the reply and the ledger holds no line saying the agent matched it.', evidence, unitsFound: 0 }
    return { verdict: 'PASS', reason: 'The reply is on the submission’s own thread, and the agent recorded it once as a portal confirmation with its ledger line.', evidence, unitsFound: 1 }
  }
  const sw = await read.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: CONFIRMATION_AGENT } }, select: { state: true } })
  if (sw?.state === 'ON') return { verdict: 'FAIL', reason: 'The agent is On and the reply on the thread was never recorded as a confirmation.', evidence, unitsFound: 0 }
  const noted = await read.recordAction.count({ where: { companyId, agentKey: CONFIRMATION_AGENT, action: 'CONFIRMATION_FOUND_NOT_RECORDED', recordId: sub.personId, summary: { contains: sub.submittedAt.toISOString().slice(0, 10) } } })
  if (noted === 0) return { verdict: 'FAIL', reason: 'The agent is on drafts only and the ledger does not say it found the reply and recorded nothing.', evidence, unitsFound: 0 }
  return { verdict: 'PASS', reason: 'The reply is on the thread; the agent is on drafts only, so it recorded nothing and said so on the ledger.', evidence, unitsFound: 1 }
}
