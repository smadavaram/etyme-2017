/**
 * The answer key for `chase.propose` (record 123, plan C3 and C9).
 *
 * The run is about one record a chase was proposed for. This finds the
 * task written for it in the run's window and checks, from the record and
 * the readers, what a proposal must be: the plan on the task is the plan
 * the rules give that kind, a card is open or decided for it and is owed by
 * the seat the owner reader names today, the task has sent nothing before a
 * person's yes, and the company it is about reads dormant on a fresh
 * census. A kind with no plan rule written yet is not graded.
 */
import type { PrismaClient } from '@prisma/client'
import { censusFacts } from '@/lib/agents/census-keeper'
import { censusOn } from '@/lib/agents/census-rules'
import { OUTREACH_KINDS, OUTREACH_PLAN, OUTREACH_RECORD } from '@/lib/agents/dormant-outreach-rules'
import { CHASE_ROLES, INTERVIEW_CHASE_KIND, PROPOSED_INTERVIEW_PLAN, quietLongEnough, SUBMISSION_RECORD } from '@/lib/agents/interview-chase'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { daysOffRead } from './calendar'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

/** The plan each kind of chase task must carry. A kind not listed has no rule written yet. */
const PLAN_OF_KIND: Record<string, unknown> = { ...Object.fromEntries(OUTREACH_KINDS.map((k) => [k, OUTREACH_PLAN])), [INTERVIEW_CHASE_KIND]: PROPOSED_INTERVIEW_PLAN }

const sortedJson = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x)

export const chasePropose: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no record, so there is no task to look for.')
  const tasks = await read.agentTask.findMany({
    where: { companyId, recordType: ref.recordType, recordId: ref.recordId, createdAt: { gte: window.from, lte: window.to } },
    include: { decision: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (tasks.length === 0) return { verdict: 'FAIL', reason: 'The run proposed a chase but no task was written for the record in its window.', evidence: `${ref.recordType} ${ref.recordId}`, unitsFound: 0 }
  const unruled = tasks.filter((t) => !(t.kind in PLAN_OF_KIND))
  if (unruled.length) return unknownBecause(`No plan rule is written for ${unruled[0].kind} yet, so its proposal cannot be checked.`)

  const contact = ref.recordType === OUTREACH_RECORD ? await read.companyContact.findUnique({ where: { id: ref.recordId }, select: { atCompanyId: true } }) : null
  const census = contact ? censusOn(await censusFacts(companyId), window.to) : []
  const forSubmission = ref.recordType === SUBMISSION_RECORD
  const owner = await ownerForRoles(companyId, forSubmission ? CHASE_ROLES : ['Account Manager'], window.to)
  // An interview chase is about a submission the firm put forward: re-read it, and how long the client had been quiet when the task was written.
  const sub = forSubmission ? await read.submission.findUnique({ where: { id: ref.recordId }, select: { fromCompanyId: true, submittedAt: true, _count: { select: { interviews: true } } } }) : null
  const daysOff = forSubmission ? await daysOffRead(read, companyId) : []
  const problems: string[] = []
  let good = 0
  for (const t of tasks) {
    const side = t.kind.endsWith('SUPPLIER') ? 'SUPPLIER' : 'CUSTOMER'
    const mine: string[] = []
    if (sortedJson(t.plan) !== sortedJson(PLAN_OF_KIND[t.kind])) mine.push('its plan is not the plan the rules give this kind')
    if (!t.decision) mine.push('it has no card')
    else if (owner && t.decision.ownerPersonId !== owner) mine.push('its card is owed by a seat the owner reader does not name')
    if (forSubmission) {
      if (!sub || sub.fromCompanyId !== companyId) mine.push('the submission it is about is not this firm’s')
      else if (!quietLongEnough(sub.submittedAt, t.createdAt, daysOff)) mine.push('the client had not been quiet the proposed working days when it was written')
      if (await read.mailSend.count({ where: { agentTaskId: t.id } }) > 0) mine.push('it wrote to the client, and this chase writes to nobody')
    }
    if (t.state === 'PROPOSED' && t.sentCount > 0) mine.push('it sent a letter before anyone said yes')
    if (contact && census.find((r) => r.key === `${side}:${contact.atCompanyId}`)?.standing !== 'DORMANT') mine.push('the company it is about does not read dormant')
    if (mine.length === 0) good++
    else problems.push(`task ${t.kind}: ${mine.join(', ')}`)
  }
  const evidence = `${tasks.length} task${tasks.length === 1 ? '' : 's'} for ${ref.recordType} ${ref.recordId}`
  if (problems.length === 0) return { verdict: 'PASS', reason: 'The proposal carries its rule’s plan and an open card owed by the right seat, and sent nothing before a yes.', evidence, unitsFound: good }
  return { verdict: 'FAIL', reason: `${problems.join('; ')}.`, evidence, unitsFound: good }
}
