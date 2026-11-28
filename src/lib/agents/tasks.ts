/**
 * The per-task approval record (record 112, the owner's answer of
 * 2026-11-22: "One time, but ask for every task").
 *
 *  - One person's yes on one task releases the whole task: its message,
 *    its permitted retries and its closing. The agent does not ask again
 *    inside it.
 *  - Every new task asks again. An escalation (a final notice, a hold) is
 *    a new task with its own yes and its parent's id.
 *  - Nothing carries across tasks: a send is allowed only about the
 *    task's own record, by its own agent, inside its approved plan.
 *  - The yes is a card on the decision queue. The task reads the card and
 *    never copies it. A switch at Off or Drafts only stops every send at
 *    once, whatever was approved.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { writeRecordAction, LedgerRefusal } from '@/lib/record-ledger'
import { openDecision } from '@/lib/decision-items'
import { AGENT_HELD_AS } from './runner'
import { agentKeys, agentName, offSays, type SwitchState } from './switch'
import { outreachHeld, isOn } from '@/lib/plugins'
import { pluginOfAgent } from '@/lib/plugin-registry'

export const TASK_RECORD = 'AgentTask'

export interface TaskPlan {
  /** The letters the task may send, by template name. */
  messages: { template: string; /** The letter's plain name, the one a person reads: “Timesheet reminder”. */ label?: string }[]
  /** How many times each letter may be sent again after the first. */
  retries: number
  /** Working days (the firm's own days off and holidays left out) between a send and its retry. */
  daysApart: number
  /** What closes the task, in words: "the timesheet arrives". */
  closesWhen: string
  /** A task that raises a card for a person and writes to nobody: it has no letters and no send step. */
  sendsNothing?: boolean
  /** A batch (record 117): the same letters go to this many people, each to its own. */
  recipients?: number
  /** A batch's letters are each about their own record of this type, one that belongs to the task. */
  letterRecordType?: string
}

/** A letter's name as a person reads it: its label, else its template made into words. Pure. */
export function letterName(m: { template: string; label?: string }): string {
  if (m.label?.trim()) return m.label.trim()
  const t = m.template.replace(/[-_]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** The plan in plain words, the proof a person reads before saying yes. Pure. */
export function planWords(plan: TaskPlan): string {
  if (plan.sendsNothing) return `If you say yes, nothing is sent. A person follows up. It closes the task when ${plan.closesWhen}.`
  const names = plan.messages.map((m) => `“${letterName(m)}”`).join(', ')
  const again = plan.retries === 0
    ? 'It is not sent again.'
    : `Each may be sent again up to ${plan.retries} ${plan.retries === 1 ? 'time' : 'times'}, ${plan.daysApart} working ${plan.daysApart === 1 ? 'day' : 'days'} apart.`
  const to = plan.recipients ? ` to each of ${plan.recipients} ${plan.recipients === 1 ? 'contact' : 'contacts'}, one letter each` : ''
  return `If you say yes, the agent sends ${names}${to}. ${again} It closes the task when ${plan.closesWhen}. Anything more is a new task and asks you again.`
}

export function planRefusal(plan: TaskPlan): string | null {
  if (!plan || !Array.isArray(plan.messages) || (plan.messages.length === 0 && !plan.sendsNothing)) return 'A task names the letters it may send.'
  if (plan.messages.some((m) => !m.template?.trim())) return 'Every letter in a task has a template name.'
  if (!Number.isInteger(plan.retries) || plan.retries < 0) return 'A task says how many times a letter may be sent again, none or more.'
  if (plan.retries > 0 && (!Number.isInteger(plan.daysApart) || plan.daysApart < 1)) return 'A task that sends again says how many days apart.'
  if (!plan.closesWhen?.trim()) return 'A task says what closes it.'
  if (plan.recipients !== undefined && (!Number.isInteger(plan.recipients) || plan.recipients < 1)) return 'A batch says how many people it writes to, one or more.'
  if (plan.recipients !== undefined && !plan.letterRecordType?.trim()) return 'A batch says what record each of its letters is about.'
  return null
}

/** A task's state and what it may do, as the pure rule reads them. */
export interface SendCheck {
  task: { companyId: string; agentKey: string; recordType: string; recordId: string; state: string; plan: TaskPlan; sentCount: number }
  switchState: SwitchState
  step: { companyId: string; agentKey: string; recordType: string | null; recordId: string | null; template: string; attempt: number }
}

/** Why an agent may not send this letter, in a sentence; null when it may. Pure. */
export function sendRefusal(c: SendCheck): string | null {
  const { task, step } = c
  if (task.companyId !== step.companyId || task.agentKey !== step.agentKey) return 'That task belongs to another agent or firm, so this send needs its own task.'
  if (c.switchState === 'OFF') return offSays(step.agentKey)
  if (c.switchState === 'DRAFT_ONLY') return `${agentName(step.agentKey)} is on drafts only. It prepares the task and sends nothing, even after a yes.`
  if (task.state === 'PROPOSED') return 'This task is waiting for a yes. Nothing is sent until a person approves it.'
  if (task.state === 'REFUSED') return 'This task was refused, so nothing is sent.'
  if (task.state !== 'APPROVED' && task.state !== 'RUNNING') return 'This task is closed. A new send needs a new task and a new yes.'
  // A batch's letter is about its own record, one the caller has checked belongs to this task.
  const aboutTask = task.plan.letterRecordType ? step.recordType === task.plan.letterRecordType : step.recordType === task.recordType && step.recordId === task.recordId
  if (!aboutTask) return 'This task was approved for another record. A send about this one needs its own task.'
  if (!task.plan.messages.some((m) => m.template === step.template)) return 'That letter is not in the approved plan. It needs a new task and a new yes.'
  if (!Number.isInteger(step.attempt) || step.attempt < 1 || step.attempt > 1 + task.plan.retries) return 'That is beyond the retries the task was approved for. It needs a new task and a new yes.'
  if (task.sentCount >= task.plan.messages.length * (1 + task.plan.retries) * (task.plan.recipients ?? 1)) return 'The task has sent everything it was approved for. More needs a new task and a new yes.'
  return null
}

async function stampFor(companyId: string, agentKey: string) {
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey } } })
  if (!sw) throw new LedgerRefusal(offSays(agentKey))
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  return { sw, personId: sw.changedById, actingEntityId: entities.length === 1 ? entities[0].id : null }
}

export interface ProposeInput {
  companyId: string
  agentKey: string
  kind: string
  recordType: string
  recordId: string
  plan: TaskPlan
  /** The seat that owes the yes. */
  ownerPersonId: string
  /** The question the card asks, in the trade's words. */
  question: string
  /** Set on an escalation: the task it grows out of. */
  parentTaskId?: string | null
  actingEntityId?: string | null
  openedOn?: Date
  /** Words shown under the plan on the card, written with it (a draft a person sends, say). */
  detail?: string
  /** What a person chose for the task (an outreach batch), written with it. */
  payload?: Prisma.InputJsonValue
  /** Rows that belong to the task, written in the same transaction, so a task never stands without them. */
  withTask?: (tx: Prisma.TransactionClient, taskId: string) => Promise<void>
  /** The firm's own today, where the caller holds the clock (an agent run's `now`). Left out, it is read. */
  today?: Date
}

/** Prepare a task and open the card that asks for its yes. Allowed Drafts only; refused Off. */
export async function proposeTask(input: ProposeInput) {
  const refusal = planRefusal(input.plan)
  if (refusal) throw new LedgerRefusal(refusal)
  const { sw, personId, actingEntityId } = await stampFor(input.companyId, input.agentKey)
  if (sw.state === 'OFF') throw new LedgerRefusal(offSays(input.agentKey))
  // A task names its plugin. Where the plugin is off and holds everything, no task is proposed (nothing to approve, nothing to pause).
  const plugin = pluginOfAgent(input.agentKey)
  if (plugin && plugin.whenOff === 'EVERYTHING') {
    const firm = await prisma.company.findUnique({ where: { id: input.companyId }, select: { name: true, pluginsOn: true } })
    if (!isOn(firm?.pluginsOn, plugin.key)) throw new LedgerRefusal(pluginOffTaskSays(plugin.label, firm?.name ?? 'your firm'))
  }
  if (input.parentTaskId) {
    const parent = await prisma.agentTask.findFirst({ where: { id: input.parentTaskId, companyId: input.companyId } })
    if (!parent) throw new LedgerRefusal('The task this one grows out of is not at this firm.')
  }
  const kind = input.parentTaskId ? 'ESCALATION' : input.kind
  const entity = input.actingEntityId ?? actingEntityId
  return prisma.$transaction(async (tx) => {
    const decision = await openDecision({
      companyId: input.companyId, personId, heldAs: AGENT_HELD_AS, actingEntityId: entity,
      question: input.question, ownerPersonId: input.ownerPersonId, openedOn: input.openedOn ?? new Date(),
      proof: input.detail ? `${planWords(input.plan)}\n\n${input.detail}` : planWords(input.plan), proofLinks: [],
    }, input.today, tx)
    const task = await tx.agentTask.create({
      data: {
        companyId: input.companyId, agentKey: input.agentKey, pluginKey: plugin?.key ?? null, kind, recordType: input.recordType, recordId: input.recordId,
        plan: input.plan as unknown as Prisma.InputJsonValue, decisionId: decision.id, parentTaskId: input.parentTaskId ?? null,
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
      },
    })
    if (input.withTask) await input.withTask(tx, task.id)
    await tx.decisionItem.update({ where: { id: decision.id }, data: { proofLinks: [{ recordType: TASK_RECORD, recordId: task.id }] } })
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: TASK_RECORD, recordId: task.id, action: 'TASK_PROPOSED',
      summary: `${agentName(input.agentKey)} proposed a task and asked for a yes: ${input.question}`,
      personId, heldAs: AGENT_HELD_AS, actingEntityId: entity, agentKey: input.agentKey, ruleVersion: null,
    })
    return task
  })
}

/**
 * Read the card for a task and move the task with it: an approved card
 * releases it, a rejected card refuses it, an open card waits. Safe to call
 * any number of times.
 */
export async function approvalOf(taskId: string) {
  const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId }, include: { decision: true } })
  const verdict = task.decision.state === 'APPROVED' ? 'APPROVED' as const : task.decision.state === 'REJECTED' ? 'REJECTED' as const : 'OPEN' as const
  if (task.state === 'PROPOSED' && verdict !== 'OPEN') {
    const to = verdict === 'APPROVED' ? 'APPROVED' as const : 'REFUSED' as const
    const moved = await prisma.agentTask.updateMany({
      where: { id: task.id, state: 'PROPOSED' },
      data: { state: to, ...(to === 'APPROVED' ? { approvedById: task.decision.decidedByPersonId, approvedAt: task.decision.decidedAt } : { closedReason: task.decision.verdictNote ?? 'The yes was refused.' }) },
    })
    if (moved.count === 1) {
      const s = await stampFor(task.companyId, task.agentKey).catch(() => null)
      if (s) {
        await writeRecordAction(prisma, {
          companyId: task.companyId, recordType: TASK_RECORD, recordId: task.id, action: to === 'APPROVED' ? 'TASK_RELEASED' : 'TASK_REFUSED',
          summary: to === 'APPROVED' ? 'A person said yes: the whole task, its retries and its closing, is released.' : 'A person said no: the task is refused and nothing is sent.',
          personId: s.personId, heldAs: AGENT_HELD_AS, actingEntityId: s.actingEntityId, agentKey: task.agentKey,
        })
      }
    }
  }
  const fresh = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  return { verdict, task: fresh }
}

/** May the agent send this letter now? One answer, read fresh: the card, the switch and the plan. */
export async function mayAgentSend(taskId: string, step: SendCheck['step']): Promise<{ ok: true } | { ok: false; says: string }> {
  const found = await prisma.agentTask.findUnique({ where: { id: taskId }, select: { id: true } })
  if (!found) return { ok: false, says: 'There is no such task, so nothing is sent.' }
  const { task } = await approvalOf(taskId)
  const refusedLetter = await letterNotOfTask(task, step)
  if (refusedLetter) return { ok: false, says: refusedLetter }
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId: task.companyId, agentKey: task.agentKey } } })
  const says = sendRefusal({
    task: { ...task, plan: task.plan as unknown as TaskPlan },
    switchState: (sw?.state ?? 'OFF') as SwitchState, step,
  })
  if (says) return { ok: false, says }
  // Outreach (records 122, 123): a letter that sells waits while the firm's switch is off, under the same yes.
  const held = await outreachPause(task)
  if (held) return { ok: false, says: held }
  // Any other plugin that holds everything while off: the task is paused, its yes kept, nothing deleted.
  const firm = await prisma.company.findUnique({ where: { id: task.companyId }, select: { name: true, pluginsOn: true } })
  const paused = pluginTaskPausedSays(task, firm)
  return paused ? { ok: false, says: paused } : { ok: true }
}

/** The sentence for a task refused or paused because its plugin is off. Pure. */
export function pluginOffTaskSays(pluginLabel: string, firmName: string): string {
  return `${pluginLabel} is off for ${firmName}, so this task waits. The Owner turns it on in Settings. Nothing was deleted, and the task keeps its yes.`
}

/**
 * Pure: the pause sentence for a released task whose plugin holds everything
 * while it is off, else null. Outreach holds only its sends and keeps its own
 * words (`outreachPause`), so it answers null here.
 */
export function pluginTaskPausedSays(task: { agentKey: string; state: string }, firm: { name: string; pluginsOn: readonly string[] } | null): string | null {
  if (task.state !== 'APPROVED' && task.state !== 'RUNNING') return null
  const plugin = pluginOfAgent(task.agentKey)
  if (!plugin || plugin.whenOff !== 'EVERYTHING' || isOn(firm?.pluginsOn, plugin.key)) return null
  return `Paused: ${pluginOffTaskSays(plugin.label, firm?.name ?? 'your firm')}`
}

export const OUTREACH_PAUSED = 'OUTREACH_PAUSED'
export const OUTREACH_RESUMED = 'OUTREACH_RESUMED'

/** The sentence on a paused task's card. Pure. The Owner's link is the Settings plugins page. */
export function outreachPausedSays(firmName: string): string {
  return `Paused: Outreach is off for ${firmName}. Nothing more is sent until the Owner turns it on. Letters already sent stand.`
}
export const OUTREACH_SETTINGS_HREF = '/dashboard/settings'

/** Does the task's plan hold any letter that sells. Pure. */
export function planSellsLetters(plan: unknown): boolean {
  return ((plan as TaskPlan | null)?.messages ?? []).some((m) => outreachHeld([], m.template))
}

/**
 * The pause sentence for a released task whose firm has Outreach off, else
 * null. Reads fresh. Writes one OUTREACH_PAUSED row when the pause begins and
 * one OUTREACH_RESUMED when it ends, never one per run. The task itself is
 * never moved: it stays APPROVED or RUNNING under its own yes and its own text.
 */
export async function outreachPause(task: { id: string; companyId: string; agentKey: string; state: string; plan: unknown }): Promise<string | null> {
  if (!planSellsLetters(task.plan) || (task.state !== 'APPROVED' && task.state !== 'RUNNING')) return null
  const firm = await prisma.company.findUnique({ where: { id: task.companyId }, select: { name: true, pluginsOn: true } })
  const held = outreachHeld(firm?.pluginsOn, 'outreach-batch')
  const last = await prisma.recordAction.findFirst({
    where: { companyId: task.companyId, recordType: TASK_RECORD, recordId: task.id, action: { in: [OUTREACH_PAUSED, OUTREACH_RESUMED] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { action: true },
  })
  const says = held ? outreachPausedSays(firm?.name ?? 'your firm') : null
  const pausedNow = last?.action === OUTREACH_PAUSED
  if (held === pausedNow || (!held && !last)) return says
  const s = await stampFor(task.companyId, task.agentKey).catch(() => null)
  if (s) {
    await writeRecordAction(prisma, {
      companyId: task.companyId, recordType: TASK_RECORD, recordId: task.id, action: held ? OUTREACH_PAUSED : OUTREACH_RESUMED,
      summary: held ? says! : 'Outreach is on again. The task goes on under its own yes and sends the approved text.',
      personId: s.personId, heldAs: AGENT_HELD_AS, actingEntityId: s.actingEntityId, agentKey: task.agentKey,
    })
  }
  return says
}

/** A batch's letter must belong to the task that approved it; null where it does, or where the task is no batch. */
export async function letterNotOfTask(task: { id: string; plan: unknown }, step: { recordType: string | null; recordId: string | null }): Promise<string | null> {
  const plan = task.plan as TaskPlan
  if (!plan?.letterRecordType || step.recordType !== plan.letterRecordType) return null
  if (plan.letterRecordType !== 'OutreachLetter') return 'This batch names a kind of letter Etyme does not know, so nothing is sent.'
  const letter = step.recordId ? await prisma.outreachLetter.findUnique({ where: { id: step.recordId }, select: { agentTaskId: true } }) : null
  return letter?.agentTaskId === task.id ? null : 'That letter is not part of the approved batch, so nothing is sent.'
}

/** One send left. Counts it, and a released task is running from its first. */
export async function noteSent(taskId: string) {
  await prisma.agentTask.updateMany({ where: { id: taskId, state: { in: ['APPROVED', 'RUNNING'] } }, data: { state: 'RUNNING', sentCount: { increment: 1 } } })
}

export type TaskEnd = 'DONE' | 'CLOSED_BY_ARRIVAL' | 'STOPPED'

/** Close a task that is still open, with the reason, on the ledger. A closed task never reopens. */
export async function closeTask(taskId: string, reason: string, end: TaskEnd = 'DONE') {
  if (!reason?.trim()) throw new LedgerRefusal('Say why the task is closed.')
  const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  const moved = await prisma.agentTask.updateMany({
    where: { id: taskId, state: { in: ['PROPOSED', 'APPROVED', 'RUNNING'] } },
    data: { state: end, closedReason: reason.trim() },
  })
  if (moved.count !== 1) return false
  const s = await stampFor(task.companyId, task.agentKey)
  await writeRecordAction(prisma, {
    companyId: task.companyId, recordType: TASK_RECORD, recordId: task.id, action: end === 'CLOSED_BY_ARRIVAL' ? 'TASK_CLOSED_BY_ARRIVAL' : end === 'STOPPED' ? 'TASK_STOPPED' : 'TASK_DONE',
    summary: reason.trim(), personId: s.personId, heldAs: AGENT_HELD_AS, actingEntityId: s.actingEntityId, agentKey: task.agentKey,
  })
  return true
}

/** The tasks the control view lists: waiting for a yes, and running. */
export async function openTasks(companyId: string) {
  const rows = await prisma.agentTask.findMany({
    where: { companyId, state: { in: ['PROPOSED', 'APPROVED', 'RUNNING'] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { decision: { select: { id: true, question: true, ownerPerson: { select: { name: true } } } } },
  })
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, pluginsOn: true } })
  const off = outreachHeld(firm?.pluginsOn, 'outreach-batch')
  return rows.filter((r) => agentKeys().includes(r.agentKey)).map((r) => ({
    id: r.id, agentKey: r.agentKey, kind: r.kind, state: r.state, question: r.decision.question, ownerName: r.decision.ownerPerson.name,
    decisionId: r.decision.id, sent: r.sentCount, escalationOf: r.parentTaskId,
    paused: off && planSellsLetters(r.plan) && (r.state === 'APPROVED' || r.state === 'RUNNING') ? outreachPausedSays(firm?.name ?? 'your firm') : pluginTaskPausedSays(r, firm),
  }))
}
