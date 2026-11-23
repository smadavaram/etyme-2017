/**
 * The interview chase agent (record 112, chain 2, "Fill it": "the chase on
 * interview movement"). Key `interview-chase`.
 *
 * A submission the firm put forward and the client has not moved in
 * `PROPOSED_QUIET_DAYS` working days (no interview proposed, no answer, no
 * turn-down) is PROPOSED as one task with a card for a yes: ask the client
 * for movement. One task per submission, never proposed twice whatever
 * became of the first. After the yes (one yes per task, record 112) the
 * agent sends the letter and its permitted reminder through the mail door,
 * and closes the task the moment the client moves the submission. When the
 * reminders are spent it ends with "no answer"; what to do then is a
 * person's, and this agent opens no escalation.
 *
 * On Drafts only it proposes and sends nothing, even after a yes (the mail
 * door refuses it). Every act goes on the ledger through the runner.
 * The letter names the person and the job the client already holds, and
 * carries no rate.
 */

import { prisma } from '@/lib/db'
import { mailedBase } from '@/lib/app-url'
import { daysOffFor } from '@/lib/days-off'
import { formatDay } from '@/lib/format-date'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { nextLetter, workingDaysBetween } from '@/lib/notify/timesheet-chase-agent'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { registerAgent, type AgentContext, type AgentDef } from '@/lib/agents/runner'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from '@/lib/agents/tasks'

export const INTERVIEW_CHASE = 'interview-chase'
export const INTERVIEW_CHASE_RULE = 'interview-chase-1'
export const INTERVIEW_CHASE_KIND = 'INTERVIEW_CHASE'
export const INTERVIEW_CHASE_TEMPLATE = 'interview-chase'
export const SUBMISSION_RECORD = 'Submission'
export const CHASE_ROLES = ['Recruiter', 'Account Manager'] as const

/**
 * PROPOSED DEFAULTS, AWAITING THE OWNER. Nobody has decided these numbers.
 * Three working days of quiet before a task is proposed; then one letter
 * and one reminder, three working days apart.
 */
export const PROPOSED_QUIET_DAYS = 3
export const PROPOSED_INTERVIEW_PLAN: TaskPlan = {
  messages: [{ template: INTERVIEW_CHASE_TEMPLATE, label: 'Interview follow-up' }],
  retries: 1,
  daysApart: 3,
  closesWhen: 'the client moves the submission',
}

/** The card's question, with the proposals said as proposals. Pure. */
export function chaseQuestion(candidate: string, job: string, clientName: string, plan: TaskPlan = PROPOSED_INTERVIEW_PLAN): string {
  const n = plan.retries
  return `${clientName} has not moved ${candidate} for ${job} in ${PROPOSED_QUIET_DAYS} working days. Send a letter asking where it stands? ` +
    `Proposed: one letter, then ${n} ${n === 1 ? 'reminder' : 'reminders'} ${plan.daysApart} working days apart, closing when they move it. ` +
    `These numbers are proposals the Owner may change.`
}

/** The letter to the client contact. Plain words, no rate. Pure. */
export function interviewChaseLetter(i: { contactName: string; firmName: string; candidate: string; job: string; submittedOn: Date; link: string; attempt: number }): { subject: string; text: string } {
  const first = i.contactName.trim().split(/\s+/)[0] || 'there'
  const where = i.link ? `You can answer here: ${i.link}` : 'Open Etyme and go to Submissions to answer.'
  const again = i.attempt > 1 ? 'This is a reminder. ' : ''
  return {
    subject: i.attempt > 1 ? `Reminder: ${i.candidate} for ${i.job}` : `Where does ${i.candidate} stand for ${i.job}?`,
    text: [
      `Hi ${first},`,
      '',
      `${again}${i.firmName} put ${i.candidate} forward for ${i.job} on ${formatDay(i.submittedOn, { year: false })}, and we have not heard back.`,
      'Could you schedule an interview, or tell us if you have decided against it? A short answer helps us tell the candidate.',
      '',
      where,
    ].join('\n'),
  }
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

export async function interviewChaseStep(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx
  const daysOff = await daysOffFor(companyId)
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

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
      plan: PROPOSED_INTERVIEW_PLAN, ownerPersonId, question: chaseQuestion(s.person.name, s.requirement.title, s.toCompany.name), openedOn: now,
    })
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'CHASE_PROPOSED', summary: `Proposed a chase to ${s.toCompany.name} for ${s.person.name}, ${s.requirement.title}. Nothing is sent until a person says yes.` })
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
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.
    const contact = s.requirement.raisedBy
    if (!contact?.primaryEmail) continue

    const plan = task.plan as unknown as TaskPlan
    const left = (await mailSendsAbout(companyId, SUBMISSION_RECORD, s.id)).filter((r) => r.agentTaskId === task.id && r.outcome === 'SENT')
    const next = nextLetter(plan, left.length, left.length ? left[left.length - 1].createdAt : null, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') { await closeTask(task.id, 'No answer: every letter in the plan was sent and the client has not moved the submission. Any further step is a person’s to take.', 'DONE'); continue }

    if (!(await ctx.mayAct())) return // the letter and its row are one unit
    const base = mailedBase()
    const letter = interviewChaseLetter({
      contactName: contact.name, firmName: firm?.name ?? 'Your supplier', candidate: s.person.name, job: s.requirement.title,
      submittedOn: s.submittedAt, link: base ? `${base}/dashboard/submissions` : '', attempt: next.attempt,
    })
    const res = await send({
      to: contact.primaryEmail, subject: letter.subject, text: letter.text,
      about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: SUBMISSION_RECORD, recordId: s.id, template: INTERVIEW_CHASE_TEMPLATE, chase: true },
    })
    const went = res.outcome === 'SENT'
    await ctx.act({
      recordType: TASK_RECORD, recordId: task.id, action: went ? 'CHASE_SENT' : 'CHASE_NOT_SENT',
      summary: went ? `Sent letter ${next.attempt} to ${s.toCompany.name} about ${s.person.name}.` : `Letter ${next.attempt} to ${s.toCompany.name} about ${s.person.name} was not sent: ${res.note}`,
    })
  }
}

export const interviewChaseAgent: AgentDef = { ruleVersion: INTERVIEW_CHASE_RULE, step: interviewChaseStep }

/** Put the step in the runner's registry. Called by the cron route that runs agents. */
export function registerInterviewChase() { registerAgent(INTERVIEW_CHASE, interviewChaseAgent) }
