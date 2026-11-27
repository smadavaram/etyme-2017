/**
 * The answer key for `chase.close` (record 123, plan C3 and C9).
 *
 * The run is about one submission whose chase was closed because the client
 * moved it. This finds the task for it, which must read CLOSED_BY_ARRIVAL,
 * and re-reads the submission from the record: the client has moved it if
 * its status is past SUBMITTED, it was turned down, or an interview is
 * booked. A chase closed where the record shows no movement fails, naming
 * what the record says.
 */
import type { PrismaClient } from '@prisma/client'
import { movedByClient, INTERVIEW_CHASE_KIND } from '@/lib/agents/interview-chase'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

export const chaseClose: SkillChecker<PrismaClient> = async (companyId, _key, _window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no record, so there is no task to look for.')
  const tasks = await read.agentTask.findMany({
    where: { companyId, kind: INTERVIEW_CHASE_KIND, recordType: ref.recordType, recordId: ref.recordId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { state: true },
  })
  if (tasks.length === 0) return { verdict: 'FAIL', reason: 'The run closed a chase but no task is on the record for that submission.', evidence: `${ref.recordType} ${ref.recordId}`, unitsFound: 0 }
  const evidence = `${ref.recordType} ${ref.recordId}`
  if (!tasks.some((t) => t.state === 'CLOSED_BY_ARRIVAL')) return { verdict: 'FAIL', reason: `The task for it reads ${tasks[tasks.length - 1].state}, not closed by arrival.`, evidence, unitsFound: 0 }
  const s = await read.submission.findUnique({ where: { id: ref.recordId }, select: { status: true, rejectedAt: true, _count: { select: { interviews: true } } } })
  if (!s) return { verdict: 'FAIL', reason: 'The submission is gone, so nothing shows the client moved it.', evidence, unitsFound: 0 }
  if (!movedByClient({ status: s.status, rejectedAt: s.rejectedAt, interviews: s._count.interviews })) {
    return { verdict: 'FAIL', reason: 'The chase was closed because the client moved the submission, and the record shows it still submitted with no interview and no turn-down.', evidence, unitsFound: 0 }
  }
  return { verdict: 'PASS', reason: 'The task is closed by arrival and the record shows the client moved the submission.', evidence, unitsFound: 1 }
}
