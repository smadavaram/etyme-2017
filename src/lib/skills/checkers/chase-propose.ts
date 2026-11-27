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
import { SUBMISSION_CHASE_KIND, SUBMISSION_CHASE_TEMPLATE, PROPOSED_SUBMISSION_CHASE_PLAN, chaseProposal } from '@/lib/agents/submission-chase-rules'
import { daysWaiting, wentOut } from '@/lib/agents/confirmation-rules'
import { daysOffRead } from './calendar'
import { CHASE_LOOKBACK_DAYS, CHASE_RECORD, PROPOSED_CHASE_PLAN, TIMESHEET_CHASE_AGENT, TIMESHEET_CHASE_KIND } from '@/lib/agents/timesheet-chase-rules'
import { chaseNumbersFrom, planWith } from '@/lib/agents/chase-numbers'
import { dueWeek, employsAtFirm, filedAsOf } from './timesheet-week'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

/** The plan each kind of chase task must carry. A kind not listed has no rule written yet. */
const PLAN_OF_KIND: Record<string, unknown> = { ...Object.fromEntries(OUTREACH_KINDS.map((k) => [k, OUTREACH_PLAN])), [INTERVIEW_CHASE_KIND]: PROPOSED_INTERVIEW_PLAN, [SUBMISSION_CHASE_KIND]: PROPOSED_SUBMISSION_CHASE_PLAN, [TIMESHEET_CHASE_KIND]: PROPOSED_CHASE_PLAN }

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
  const forWeek = ref.recordType === CHASE_RECORD
  const owner = await ownerForRoles(companyId, forSubmission ? CHASE_ROLES : forWeek ? ['AP & Payroll'] : ['Account Manager'], window.to)
  // A timesheet chase: the plan it was written with is the proposed plan, or the numbers the Owner had set on the agent's switch.
  const ownerNumbers = forWeek ? chaseNumbersFrom((await read.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: TIMESHEET_CHASE_AGENT } }, select: { chasePlan: true } }))?.chasePlan) : null
  const week = forWeek ? await dueWeek(read, ref.recordId) : null
  const submissionChaseOwner = forSubmission ? await ownerForRoles(companyId, ['Account Manager'], window.to) : null
  // An interview chase is about a submission the firm put forward: re-read it, and how long the client had been quiet when the task was written.
  const sub = forSubmission ? await read.submission.findUnique({ where: { id: ref.recordId }, select: { fromCompanyId: true, submittedAt: true, checkState: true, _count: { select: { interviews: true } } } }) : null
  const daysOff = forSubmission && tasks.some((t) => t.kind === INTERVIEW_CHASE_KIND) ? await daysOffRead(read, companyId) : []
  const problems: string[] = []
  let good = 0
  for (const t of tasks) {
    const side = t.kind.endsWith('SUPPLIER') ? 'SUPPLIER' : 'CUSTOMER'
    const mine: string[] = []
    const given = t.kind === TIMESHEET_CHASE_KIND && ownerNumbers ? [PLAN_OF_KIND[t.kind], planWith(PROPOSED_CHASE_PLAN, ownerNumbers)] : [PLAN_OF_KIND[t.kind]]
    if (!given.some((p) => sortedJson(t.plan) === sortedJson(p))) mine.push('its plan is not the plan the rules give this kind')
    const expectedOwner = t.kind === SUBMISSION_CHASE_KIND ? submissionChaseOwner : owner
    if (!t.decision) mine.push('it has no card')
    else if (expectedOwner && t.decision.ownerPersonId !== expectedOwner) mine.push('its card is owed by a seat the owner reader does not name')
    if (t.kind === SUBMISSION_CHASE_KIND) {
      // A submission chase: re-read the submission, its letters and its confirmations as they stood when the task was written.
      if (!sub || sub.fromCompanyId !== companyId) mine.push('the submission it is about is not this firm’s')
      else if (!wentOut(sub)) mine.push('the submission it is about had not gone out')
      else {
        const [letters, confirmed, earlier] = await Promise.all([
          read.mailSend.findMany({ where: { companyId, recordType: SUBMISSION_RECORD, recordId: ref.recordId, outcome: 'SENT', createdAt: { lte: t.createdAt } }, select: { template: true, toAddresses: true } }),
          read.submissionConfirmation.count({ where: { companyId, submissionId: ref.recordId, createdAt: { lte: t.createdAt } } }),
          read.agentTask.count({ where: { companyId, kind: SUBMISSION_CHASE_KIND, recordType: SUBMISSION_RECORD, recordId: ref.recordId, createdAt: { lt: t.createdAt } } }),
        ])
        if (confirmed > 0) mine.push('a confirmation was already recorded when it was written')
        const proposal = chaseProposal({
          state: 'AWAITING', waitedDays: daysWaiting(sub.submittedAt, t.createdAt),
          hasSentLetter: letters.some((m) => m.template !== SUBMISSION_CHASE_TEMPLATE && m.toAddresses.length > 0), everHadTask: earlier > 0,
        })
        if (!proposal.propose) mine.push(`the rules would not have proposed it: ${proposal.why}`)
      }
    }
    if (t.kind === TIMESHEET_CHASE_KIND) {
      // A timesheet chase: re-read the due week as it stood when the task was written. It fell due that day or within the look-back, was this firm's own worker's and was not yet filed.
      const day = new Date(Date.UTC(t.createdAt.getUTCFullYear(), t.createdAt.getUTCMonth(), t.createdAt.getUTCDate()))
      if (!week || week.kind !== 'TIMESHEET_SUBMIT' || !week.sellContract || week.sellContract.companyId !== companyId) mine.push('the week it is about is not one of this firm’s placements')
      else if (week.sellContract.state !== 'IN_PROGRESS') mine.push('the placement it is about was not in progress')
      else if (week.dueOn.getTime() >= day.getTime() + 86_400_000) mine.push('the week had not fallen due when it was written')
      else if (week.dueOn.getTime() < day.getTime() - CHASE_LOOKBACK_DAYS * 86_400_000) mine.push(`the week fell due more than ${CHASE_LOOKBACK_DAYS} days before it was written, so it belongs on the one card for older weeks`)
      else if (!(await employsAtFirm(read, companyId, week.sellContract.personId))) mine.push('the worker is not the firm’s own, so the chase is her employer’s')
      else if (await filedAsOf(read, companyId, week, t.createdAt)) mine.push('the week was already filed when it was written')
      if (await read.mailSend.count({ where: { agentTaskId: t.id, createdAt: { lt: t.approvedAt ?? t.createdAt } } }) > 0) mine.push('a letter went before anyone said yes')
    }
    if (t.kind === INTERVIEW_CHASE_KIND) {
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
