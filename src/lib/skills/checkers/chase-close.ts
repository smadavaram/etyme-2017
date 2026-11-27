/**
 * The answer key for `chase.close` (record 123, plan C3 and C9).
 *
 * The run is about one submission whose chase was closed because the answer
 * arrived. This finds the task for it, which must read CLOSED_BY_ARRIVAL,
 * and re-reads the record for the kind of chase it was:
 *  - an interview chase closes when the client moved the submission: its
 *    status is past SUBMITTED, it was turned down, or an interview is
 *    booked;
 *  - a submission chase closes when a confirmation counts: one is recorded
 *    and the letter it answers, where it names one, did not bounce.
 * A chase closed where the record shows no such arrival fails, naming what
 * the record says.
 */
import type { PrismaClient } from '@prisma/client'
import { movedByClient, INTERVIEW_CHASE_KIND } from '@/lib/agents/interview-chase'
import { countingConfirmations } from '@/lib/agents/confirmation-rules'
import { SUBMISSION_CHASE_KIND } from '@/lib/agents/submission-chase-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

export const chaseClose: SkillChecker<PrismaClient> = async (companyId, _key, _window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no record, so there is no task to look for.')
  const tasks = await read.agentTask.findMany({
    where: { companyId, kind: { in: [INTERVIEW_CHASE_KIND, SUBMISSION_CHASE_KIND] }, recordType: ref.recordType, recordId: ref.recordId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { state: true, kind: true },
  })
  if (tasks.length === 0) return { verdict: 'FAIL', reason: 'The run closed a chase but no task is on the record for that submission.', evidence: `${ref.recordType} ${ref.recordId}`, unitsFound: 0 }
  const evidence = `${ref.recordType} ${ref.recordId}`
  const closed = tasks.filter((t) => t.state === 'CLOSED_BY_ARRIVAL')
  if (closed.length === 0) return { verdict: 'FAIL', reason: `The task for it reads ${tasks[tasks.length - 1].state}, not closed by arrival.`, evidence, unitsFound: 0 }
  const s = await read.submission.findUnique({ where: { id: ref.recordId }, select: { status: true, rejectedAt: true, _count: { select: { interviews: true } } } })
  if (!s) return { verdict: 'FAIL', reason: 'The submission is gone, so nothing shows the answer arrived.', evidence, unitsFound: 0 }
  if (closed.some((t) => t.kind === INTERVIEW_CHASE_KIND) && !movedByClient({ status: s.status, rejectedAt: s.rejectedAt, interviews: s._count.interviews })) {
    return { verdict: 'FAIL', reason: 'The chase was closed because the client moved the submission, and the record shows it still submitted with no interview and no turn-down.', evidence, unitsFound: 0 }
  }
  if (closed.some((t) => t.kind === SUBMISSION_CHASE_KIND)) {
    const confirmations = await read.submissionConfirmation.findMany({ where: { companyId, submissionId: ref.recordId }, select: { id: true, mailSendId: true, confirmedAt: true } })
    const letters = await read.mailSend.findMany({ where: { companyId, recordType: ref.recordType, recordId: ref.recordId }, select: { id: true, outcome: true, createdAt: true } })
    if (countingConfirmations(confirmations, letters).length === 0) {
      return { verdict: 'FAIL', reason: 'The chase was closed because a confirmation was recorded, and the record holds no confirmation that counts.', evidence, unitsFound: 0 }
    }
  }
  return { verdict: 'PASS', reason: 'The task is closed by arrival and the record shows the answer arrived.', evidence, unitsFound: 1 }
}
