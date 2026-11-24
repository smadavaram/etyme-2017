/**
 * The submission chase (record 112, chain 1, "Win work"; part A of "Drafts
 * of outreach and chases"). A step of the confirmation tracker, under its
 * key `confirmation-tracker`. The rules are in `submission-chase-rules`.
 *
 * Each run, for one firm:
 *  1. A submission that went out, has waited more than three days, has a
 *     letter on the mail ledger that left, and never had a chase task is
 *     PROPOSED as one task with one card for a yes, owed by the Account
 *     Manager else the Owner. Nothing leaves before the yes.
 *  2. Every released task is walked: closed when a confirmation is
 *     recorded, stopped when the submission ended or its letter bounced
 *     (the tracker's own card asks a person), otherwise the letter or the
 *     reminder goes by working days, through the mail door with the task.
 *
 * The letter goes to the address the submission's own letter went to, never
 * to the candidate. It is sent about the submission (recordType
 * 'Submission'), so a bounce and a confirmation tied to it reach the
 * tracker's own reading. This step never records a confirmation, never
 * changes or withdraws a submission, and moves no money.
 */

import { prisma } from '@/lib/db'
import { daysOffFor } from '@/lib/days-off'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { nextLetter } from '@/lib/notify/timesheet-chase-agent'
import type { AgentContext } from './runner'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from './tasks'
import { daysWaiting } from './confirmation-rules'
import type { Item } from './confirmation-tracker'
import {
  PROPOSED_SUBMISSION_CHASE_PLAN, SUBMISSION_CHASE_KIND, SUBMISSION_CHASE_TEMPLATE, SUBMISSION_RECORD,
  chaseProposal, submissionChaseLetter, submissionChaseNoOwnerSays, submissionChaseQuestion,
} from './submission-chase-rules'

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const

/** Where the submission's own letter went: the newest letter about it that left and is not a chase. Null where none did. */
async function addressOf(companyId: string, submissionId: string): Promise<string | null> {
  const rows = await mailSendsAbout(companyId, SUBMISSION_RECORD, submissionId)
  const mine = rows.filter((r) => r.outcome === 'SENT' && r.template !== SUBMISSION_CHASE_TEMPLATE && r.toAddresses.length > 0)
  return mine.length ? mine[mine.length - 1].toAddresses[0] : null
}

export async function submissionChaseStep(ctx: AgentContext, items: Item[], deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx

  // 1. Propose.
  const owner = await ownerForRoles(companyId, ['Account Manager'], now)
  const ownerless: string[] = []
  for (const item of items) {
    const f = item.fact
    if (item.state !== 'AWAITING' || daysWaiting(f.submittedAt, now) <= 0) continue
    const everHadTask = (await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, kind: SUBMISSION_CHASE_KIND, recordType: SUBMISSION_RECORD, recordId: f.id } })) > 0
    const hasSentLetter = (await addressOf(companyId, f.id)) !== null
    if (!chaseProposal({ state: item.state, waitedDays: daysWaiting(f.submittedAt, now), hasSentLetter, everHadTask }).propose) continue
    if (!owner) { ownerless.push(f.id); continue }
    if (!(await ctx.mayAct(2))) break // proposing writes two counted rows
    const task = await proposeTask({
      companyId, agentKey: ctx.agentKey, kind: SUBMISSION_CHASE_KIND, recordType: SUBMISSION_RECORD, recordId: f.id,
      plan: PROPOSED_SUBMISSION_CHASE_PLAN, ownerPersonId: owner, openedOn: now,
      question: submissionChaseQuestion({ person: f.personName, job: f.jobTitle, sentOn: f.submittedAt }),
    })
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'SUBMISSION_CHASE_PROPOSED', summary: `Proposed a follow-up of ${f.personName} for ${f.jobTitle}. Nothing is sent until a person says yes.` })
  }
  if (ownerless.length > 0) {
    const last = await prisma.recordAction.findFirst({ where: { companyId, agentKey: ctx.agentKey, action: 'SUBMISSION_CHASE_PROPOSED' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    const said = await prisma.recordAction.count({ where: { companyId, agentKey: ctx.agentKey, action: 'SUBMISSION_CHASE_NO_OWNER', ...(last ? { createdAt: { gt: last.createdAt } } : {}) } })
    if (said === 0 && (await ctx.mayAct(1))) {
      await ctx.act({ recordType: 'Company', recordId: companyId, action: 'SUBMISSION_CHASE_NO_OWNER', summary: submissionChaseNoOwnerSays(ownerless.length) })
    }
  }

  // 2. Walk every released task.
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey: ctx.agentKey, kind: SUBMISSION_CHASE_KIND, recordType: SUBMISSION_RECORD, state: { in: [...OPEN] } },
    orderBy: { createdAt: 'asc' },
  })
  if (tasks.length === 0) return
  const daysOff = await daysOffFor(companyId)
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    // Close first, whether or not anybody has said yes yet: a chase for a submission that is answered or gone asks for nothing.
    if (task.state !== 'PROPOSED' && task.state !== 'APPROVED' && task.state !== 'RUNNING') continue
    const item = items.find((i) => i.fact.id === task.recordId)
    if (!item) { await closeTask(task.id, 'The submission was turned down or withdrawn, so the follow-up is stopped.', 'STOPPED'); continue }
    if (item.state === 'CONFIRMED') { await closeTask(task.id, 'A confirmation is recorded, so the follow-up is closed.', 'CLOSED_BY_ARRIVAL'); continue }
    if (item.state === 'FAILED_DELIVERY') { await closeTask(task.id, 'A letter about this submission did not reach the other side. The tracker’s own card asks a person, so the follow-up is stopped.', 'STOPPED'); continue }
    if (item.state === 'NOT_SENT') { await closeTask(task.id, 'The submission is no longer out, so the follow-up is stopped.', 'STOPPED'); continue }
    if (task.state === 'PROPOSED') continue // nothing is sent before a person's yes
    if (item.state === 'BLOCKED') continue // held by a dual authorization: a person's to release first
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.

    const plan = task.plan as unknown as TaskPlan
    const left = (await mailSendsAbout(companyId, SUBMISSION_RECORD, task.recordId)).filter((r) => r.agentTaskId === task.id) // every attempt counts
    const next = nextLetter(plan, left.length, left.length ? left[left.length - 1].createdAt : null, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') {
      if (!left.some((r) => r.outcome === 'SENT')) {
        const why = left.length ? left[left.length - 1].note ?? 'the mail service gave no reason' : 'no attempt was recorded'
        await closeTask(task.id, `No letter could leave: ${why} Nothing was sent. A person follows up.`, 'DONE')
      } else {
        await closeTask(task.id, 'No answer: the letter and its reminder went and no confirmation is recorded. Any further step is a person’s to take.', 'DONE')
      }
      continue
    }

    if (!(await ctx.mayAct())) return // the letter and its row are one unit
    const to = await addressOf(companyId, task.recordId)
    if (!to) continue
    const f = item.fact
    const letter = submissionChaseLetter({ firmName: firm?.name ?? 'We', contactName: null, person: f.personName, job: f.jobTitle, sentOn: f.submittedAt, attempt: next.attempt })
    const res = await send({
      to, subject: letter.subject, text: letter.text,
      about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: SUBMISSION_RECORD, recordId: task.recordId, template: SUBMISSION_CHASE_TEMPLATE, chase: true },
    })
    const went = res.outcome === 'SENT'
    await ctx.act({
      recordType: TASK_RECORD, recordId: task.id, action: went ? 'SUBMISSION_CHASE_SENT' : 'SUBMISSION_CHASE_NOT_SENT',
      summary: went ? `Sent letter ${next.attempt} about ${f.personName} for ${f.jobTitle}.` : `Letter ${next.attempt} about ${f.personName} for ${f.jobTitle} was not sent: ${res.note}`,
    })
  }
}
