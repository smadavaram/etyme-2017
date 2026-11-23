/**
 * The interview chase agent (record 112, chain 2, "Fill it": "the chase on
 * interview movement"). Key `interview-chase`.
 *
 * A submission the firm put forward and the client has not moved in
 * `PROPOSED_QUIET_DAYS` working days (no interview proposed, no answer, no
 * turn-down) is PROPOSED as one task with a card for a yes: ask the client
 * for movement. One task per submission, never proposed twice whatever
 * became of the first. After the yes (one yes per task, record 112) the
 * agent closes the task the moment the client moves the submission.
 *
 * It never writes to the client (owner 2026-11-23: a supplier answers a
 * thread and never starts one, until the owner rules otherwise). The plan
 * has no send step: the card says a person follows up. Its key stays
 * switchable so it can still raise the reminder card.
 */

import { prisma } from '@/lib/db'
import { daysOffFor } from '@/lib/days-off'
import { workingDaysBetween } from '@/lib/notify/timesheet-chase-agent'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { registerAgent, type AgentContext, type AgentDef } from '@/lib/agents/runner'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from '@/lib/agents/tasks'

export const INTERVIEW_CHASE = 'interview-chase'
export const INTERVIEW_CHASE_RULE = 'interview-chase-1'
export const INTERVIEW_CHASE_KIND = 'INTERVIEW_CHASE'
export const SUBMISSION_RECORD = 'Submission'
export const CHASE_ROLES = ['Recruiter', 'Account Manager'] as const

/**
 * PROPOSED DEFAULTS, AWAITING THE OWNER. Nobody has decided these numbers.
 * Three working days of quiet before a task is proposed.
 */
export const PROPOSED_QUIET_DAYS = 3
export const PROPOSED_INTERVIEW_PLAN: TaskPlan = {
  messages: [],
  retries: 0,
  daysApart: 0,
  closesWhen: 'the client moves the submission',
  sendsNothing: true,
}

/** The card's question: a person follows up; the agent writes to nobody. Pure. */
export function chaseQuestion(candidate: string, job: string, clientName: string, contactName: string): string {
  return `${clientName} has not moved ${candidate} for ${job} in ${PROPOSED_QUIET_DAYS} working days. ` +
    `A person follows up with ${contactName} about ${candidate}; the agent does not write to the client.`
}

/** Whether the client has moved it: any status past SUBMITTED, an interview, or a turn-down. Pure. */
export function movedByClient(s: { status: string; rejectedAt: Date | null; interviews: number }): boolean {
  return s.status !== 'SUBMITTED' || s.rejectedAt !== null || s.interviews > 0
}

/** Whether a quiet submission is due a task: still not moved, and quiet for the proposed working days. Pure. */
export function quietLongEnough(submittedAt: Date, now: Date, daysOff: readonly number[]): boolean {
  return workingDaysBetween(submittedAt, now, daysOff) >= PROPOSED_QUIET_DAYS
}

const SUB_SELECT = {
  id: true, status: true, rejectedAt: true, submittedAt: true, fromCompanyId: true,
  person: { select: { name: true } },
  toCompany: { select: { name: true } },
  requirement: { select: { title: true, status: true, raisedBy: { select: { name: true, primaryEmail: true } } } },
  _count: { select: { interviews: true } },
} as const

export async function interviewChaseStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const daysOff = await daysOffFor(companyId)

  // 1. Propose a task for every submission the client has left quiet.
  const quiet = await prisma.submission.findMany({
    where: { fromCompanyId: companyId, status: 'SUBMITTED', rejectedAt: null, requirement: { status: 'OPEN' }, interviews: { none: {} } },
    select: SUB_SELECT, orderBy: { submittedAt: 'asc' }, take: 200,
  })
  for (const s of quiet) {
    if (movedByClient({ status: s.status, rejectedAt: s.rejectedAt, interviews: s._count.interviews })) continue
    if (!quietLongEnough(s.submittedAt, now, daysOff)) continue
    if (!s.requirement.raisedBy?.primaryEmail) continue // nobody to write to: a person's to find
    const had = await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, recordType: SUBMISSION_RECORD, recordId: s.id } })
    if (had > 0) continue
    const ownerPersonId = await ownerForRoles(companyId, CHASE_ROLES, now)
    if (!ownerPersonId) continue
    if (!(await ctx.mayAct(2))) break // proposing writes two counted rows
    const task = await proposeTask({
      companyId, agentKey: ctx.agentKey, kind: INTERVIEW_CHASE_KIND, recordType: SUBMISSION_RECORD, recordId: s.id,
      plan: PROPOSED_INTERVIEW_PLAN, ownerPersonId, question: chaseQuestion(s.person.name, s.requirement.title, s.toCompany.name, s.requirement.raisedBy.name), openedOn: now,
    })
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'CHASE_PROPOSED', summary: `Proposed a follow-up with ${s.toCompany.name} for ${s.person.name}, ${s.requirement.title}. The agent writes to nobody.` })
  }

  // 2. Walk every released task.
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey: ctx.agentKey, kind: INTERVIEW_CHASE_KIND, recordType: SUBMISSION_RECORD, state: { in: ['PROPOSED', 'APPROVED', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
  })
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state !== 'APPROVED' && task.state !== 'RUNNING') continue
    const s = await prisma.submission.findUnique({ where: { id: task.recordId }, select: SUB_SELECT })
    if (!s) { await closeTask(task.id, 'The submission this chase was about is no longer on the record.', 'STOPPED'); continue }
    if (movedByClient({ status: s.status, rejectedAt: s.rejectedAt, interviews: s._count.interviews })) {
      await closeTask(task.id, 'The client moved the submission, so the chase is closed.', 'CLOSED_BY_ARRIVAL'); continue
    }
    // No send step: after a yes the task waits for the client to move, and a person follows up.
  }
}

export const interviewChaseAgent: AgentDef = { ruleVersion: INTERVIEW_CHASE_RULE, step: interviewChaseStep }

/** Put the step in the runner's registry. Called by the cron route that runs agents. */
export function registerInterviewChase() { registerAgent(INTERVIEW_CHASE, interviewChaseAgent) }
