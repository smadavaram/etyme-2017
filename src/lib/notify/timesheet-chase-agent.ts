/**
 * The timesheet chase agent (record 112, chain 4, "Run the week").
 *
 * Each run, for one firm:
 *  1. Every week that is due and not filed, once per worker and week, is
 *     PROPOSED as a task with a card for a yes. The agent never proposes the
 *     same week twice, whatever became of the first task: a refused or
 *     finished chase is not opened again every morning.
 *  2. Every released task is walked to its end: closed the moment the week
 *     is filed, else the next letter if the plan says it is due, else done
 *     with "no answer" once the retries are spent. An escalation is a
 *     person's act and a new task; this agent opens none.
 * On Drafts only it proposes and sends nothing, even after a yes (the mail
 * door refuses it). Every act goes on the ledger through the runner.
 */

import { prisma } from '@/lib/db'
import { mailedBase } from '@/lib/app-url'
import { daysOffFor, isDayOff } from '@/lib/days-off'
import { firmSeats, seatAtFirm, openDecision } from '@/lib/decision-items'
import { dayAround } from '@/lib/decision-queue'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { registerAgent, AGENT_HELD_AS, type AgentContext } from '@/lib/agents/runner'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from '@/lib/agents/tasks'
import { registerPlan } from '@/lib/agents/plans'
import { runSkill } from '@/lib/skills/runner'
import {
  TIMESHEET_CHASE_AGENT, TIMESHEET_CHASE_KIND, CHASE_RECORD, PROPOSED_CHASE_PLAN, CHASE_LOOKBACK_DAYS,
  weekFiledWith, employsWorkerWith, type DueCycle,
} from '@/lib/agents/timesheet-chase-rules'
import { chaseNumbersOf, planWith, numbersSource } from '@/lib/agents/chase-numbers'
import { TIMESHEET_CHASE_TEMPLATE, timesheetChaseLetter, weekWords } from './timesheet-chase-letter'

// The names, the proposed plan and the week-filed rule live in the rules file, so the checkers read the same ones.
export { TIMESHEET_CHASE_AGENT, TIMESHEET_CHASE_KIND, CHASE_RECORD, PROPOSED_CHASE, PROPOSED_CHASE_PLAN, CHASE_LOOKBACK_DAYS, periodCovered } from '@/lib/agents/timesheet-chase-rules'

// The skills this agent runs (record 123), registered where the agent is defined so every door that runs it holds the plan.
registerPlan({ agentKey: TIMESHEET_CHASE_AGENT, skills: ['chase.propose', 'chase.send', 'chase.close'], outputSkill: 'chase.propose' })

/** The card's question, with the proposal said as a proposal. Pure. */
export function chaseQuestion(workerName: string, week: string, plan: TaskPlan = PROPOSED_CHASE_PLAN, ownerSet = false): string {
  const n = plan.retries
  return `${workerName} has not filed the week of ${week}. Send a letter asking for it? ` +
    `Proposed: one letter, then up to ${n} ${n === 1 ? 'reminder' : 'reminders'}, ${plan.daysApart} working days apart, ` +
    `closing when the week is filed. ${numbersSource(ownerSet)}`
}

/** What a yes releases, in the card's own words: no template key, the same plan words as the question. Pure. */
export function chaseProof(plan: TaskPlan = PROPOSED_CHASE_PLAN, ownerSet = false): string {
  const n = plan.retries
  return `If you say yes, the agent sends a timesheet reminder. It may send it again up to ${n} ${n === 1 ? 'reminder' : 'reminders'}, ` +
    `${plan.daysApart} working days apart. It closes the task when ${plan.closesWhen}. Anything more is a new task and asks you again. ` +
    numbersSource(ownerSet)
}

/** Whole working days after `from` up to and including `to`, skipping the firm's days off. Pure. */
export function workingDaysBetween(from: Date, to: Date, daysOff: readonly number[]): number {
  let n = 0
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  for (d.setUTCDate(d.getUTCDate() + 1); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isDayOff(d, daysOff)) n++
  }
  return n
}

/** One line per worker, her weeks together: "Ana Ruiz: Nov 2 to Nov 8, Nov 9 to Nov 15". Pure. */
export function backlogLines(rows: readonly { name: string; week: string }[]): string[] {
  const by = new Map<string, string[]>()
  for (const r of rows) by.set(r.name, [...(by.get(r.name) ?? []), r.week])
  return [...by.entries()].map(([name, weeks]) => `${name}: ${weeks.join(', ')}`)
}

export type NextLetter =
  | { act: 'SEND'; attempt: number }
  | { act: 'WAIT'; says: string }
  | { act: 'END' }

/**
 * What a released task does now, from how many letters have left and the
 * day the last one did. The first goes at once; each retry once the working
 * days apart have passed; once every letter is out and the last wait has
 * passed with no week, the task ends. Pure.
 */
export function nextLetter(plan: TaskPlan, sent: number, lastSentAt: Date | null, now: Date, daysOff: readonly number[]): NextLetter {
  const total = plan.messages.length * (1 + plan.retries)
  if (sent === 0 || !lastSentAt) return { act: 'SEND', attempt: 1 }
  const passed = workingDaysBetween(lastSentAt, now, daysOff) >= plan.daysApart
  if (!passed) return { act: 'WAIT', says: `The last letter went ${lastSentAt.toISOString().slice(0, 10)}; the next waits ${plan.daysApart} working days.` }
  return sent >= total ? { act: 'END' } : { act: 'SEND', attempt: sent + 1 }
}

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const

const DAY_MS = 86_400_000

const weekFiled = (c: DueCycle, daysOff: readonly number[]) => weekFiledWith(prisma, c, daysOff)
const employsWorker = (companyId: string, personId: string) => employsWorkerWith(prisma, companyId, personId)

/** The seat that owes the yes: AP & Payroll, else the Owner. Null where neither is working. */
async function cardOwner(companyId: string, now: Date): Promise<string | null> {
  const seats = await firmSeats(companyId)
  const working = seats.filter((s) => seatAtFirm(s, seats, now) !== null)
  return (working.find((s) => s.roleName === 'AP & Payroll') ?? working.find((s) => s.isOwner))?.personId ?? null
}

/** Every attempt of this task, whatever came of it, oldest first, read through the door's own reader. */
async function attemptsOf(companyId: string, taskId: string, cycleId: string) {
  return (await mailSendsAbout(companyId, CHASE_RECORD, cycleId)).filter((r) => r.agentTaskId === taskId)
}

/** The seat the agent acts as: whoever last changed its switch. */
export async function agentStamp(companyId: string, agentKey: string) {
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey } } })
  if (!sw) return null
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  return { personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null }
}

export async function timesheetChaseStep(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx
  const dayStart = dayAround(now).from
  const daysOff = await daysOffFor(companyId)
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

  // 1. Propose a task for every recent due week nobody has filed or chased.
  const cutoff = new Date(dayStart.getTime() - CHASE_LOOKBACK_DAYS * DAY_MS)
  const due = await prisma.cycle.findMany({
    where: { kind: 'TIMESHEET_SUBMIT', completedAt: null, dueOn: { lt: new Date(dayStart.getTime() + DAY_MS) }, sellContract: { companyId, state: { in: ['IN_PROGRESS'] } } },
    select: {
      id: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true, sellContractId: true,
      sellContract: { select: { personId: true, clientCompanyId: true, endClientCompanyId: true, person: { select: { name: true } } } },
    },
    orderBy: { dueOn: 'asc' },
  })
  const old: typeof due = []
  for (const c of due) {
    // Only a firm's own worker is chased; a sub-vendor's worker is the sub's to chase.
    if (!(await employsWorker(companyId, c.sellContract!.personId))) continue
    if (await weekFiled(c, daysOff)) continue
    if (c.dueOn < cutoff) { old.push(c); continue }
    const had = await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, recordType: CHASE_RECORD, recordId: c.id } })
    if (had > 0) continue
    const ownerPersonId = await cardOwner(companyId, now)
    if (!ownerPersonId) continue
    if (!(await ctx.mayAct(2))) break // proposing writes two counted rows
    const week = c.periodStart && c.periodEnd ? weekWords(c.periodStart, c.periodEnd) : `${weekWords(c.dueOn, c.dueOn)} (due)`
    // The firm's own numbers, if the Owner set any, are taken now and kept in the task's plan.
    const set = await chaseNumbersOf(companyId, ctx.agentKey)
    const plan = planWith(PROPOSED_CHASE_PLAN, set)
    await runSkill(ctx, 'chase.propose', { recordType: CHASE_RECORD, recordId: c.id, unitsPlanned: 1 }, async () => {
      const task = await proposeTask({
        companyId, agentKey: ctx.agentKey, kind: TIMESHEET_CHASE_KIND, recordType: CHASE_RECORD, recordId: c.id,
        plan, ownerPersonId, question: chaseQuestion(c.sellContract!.person.name, week, plan, set !== null), openedOn: now,
      })
      await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { proof: chaseProof(plan, set !== null) } })
      await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'CHASE_PROPOSED', summary: `Proposed a chase for ${c.sellContract!.person.name}, week of ${week}. Nothing is sent until a person says yes.` })
      return { result: task }
    })
  }

  // Older unfiled weeks are one card for a person, once, never a chase each.
  const unlisted: typeof due = []
  for (const c of old) {
    const listed = await prisma.decisionItem.count({ where: { companyId, proofLinks: { array_contains: [{ recordType: CHASE_RECORD, recordId: c.id }] } } })
    if (listed === 0 && (await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, recordType: CHASE_RECORD, recordId: c.id } })) === 0) unlisted.push(c)
  }
  const stamp = unlisted.length ? await agentStamp(companyId, ctx.agentKey) : null
  const backlogOwner = stamp ? await cardOwner(companyId, now) : null
  if (stamp && backlogOwner && (await ctx.mayAct())) {
    const lines = backlogLines(unlisted.map((c) => ({ name: c.sellContract!.person.name, week: c.periodStart && c.periodEnd ? weekWords(c.periodStart, c.periodEnd) : weekWords(c.dueOn, c.dueOn) })))
    await openDecision({
      ...stamp, companyId, ownerPersonId: backlogOwner, openedOn: now,
      question: `${unlisted.length} older ${unlisted.length === 1 ? 'week is' : 'weeks are'} still not filed: ${lines.join('; ')}. Contact them yourself?`,
      proof: `The agent only chases weeks due in the last ${CHASE_LOOKBACK_DAYS} days. These fell due earlier, so it sends nothing about them.`,
      proofLinks: unlisted.map((c) => ({ recordType: CHASE_RECORD, recordId: c.id })),
    })
    await ctx.act({ recordType: CHASE_RECORD, recordId: unlisted[0].id, action: 'CHASE_BACKLOG_LISTED', summary: `Listed ${unlisted.length} older unfiled ${unlisted.length === 1 ? 'week' : 'weeks'} on one card for a person.` })
  }

  // 2. Walk every released task.
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey: ctx.agentKey, kind: TIMESHEET_CHASE_KIND, recordType: CHASE_RECORD, state: { in: ['PROPOSED', 'APPROVED', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
  })
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state !== 'APPROVED' && task.state !== 'RUNNING') continue
    const c = await prisma.cycle.findUnique({
      where: { id: task.recordId },
      select: { id: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true, sellContractId: true, sellContract: { select: { personId: true, clientCompanyId: true, endClientCompanyId: true, person: { select: { id: true, name: true, primaryEmail: true } } } } },
    })
    if (!c || !c.sellContract) { await closeTask(task.id, 'The week this chase was about is no longer on the record.', 'STOPPED'); continue }
    if (await weekFiled(c, daysOff)) {
      await runSkill(ctx, 'chase.close', { recordType: CHASE_RECORD, recordId: c.id, unitsPlanned: 1 }, async () => {
        await closeTask(task.id, 'The week was filed, so the chase is closed.', 'CLOSED_BY_ARRIVAL')
        return { result: true }
      })
      continue
    }
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.

    const plan = task.plan as unknown as TaskPlan
    const left = await attemptsOf(companyId, task.id, c.id)
    const last = left.length ? left[left.length - 1].createdAt : null
    const next = nextLetter(plan, left.length, last, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') {
      // Nothing left at all: say so, never "no answer", and tell a person once.
      if (!left.some((r) => r.outcome === 'SENT')) {
        const why = left.length ? left[left.length - 1].note ?? 'the mail service gave no reason' : 'no attempt was recorded'
        await closeTask(task.id, `No letter could leave: ${why} Nothing was sent, so nobody was asked. A person follows up.`, 'DONE')
        const stampNL = await agentStamp(companyId, ctx.agentKey)
        const ownerNL = await cardOwner(companyId, now)
        if (stampNL && ownerNL) {
          await openDecision({
            ...stampNL, companyId, ownerPersonId: ownerNL, openedOn: now,
            question: `Failed delivery: no letter to ${c.sellContract.person.name} about her missing week could leave. Follow up by hand?`,
            proof: `Every attempt in the plan was made and none left. The last reason: ${why}`,
            proofLinks: [{ recordType: TASK_RECORD, recordId: task.id }],
          })
        }
        continue
      } await closeTask(task.id, 'No answer: every attempt in the plan was made and the week is still not filed. Any further step is a person’s to take.', 'DONE'); continue }

    // The old reminder already told her today: no second letter the same day.
    const told = await prisma.notification.count({
      where: { personId: c.sellContract.person.id, type: 'CYCLE_DUE', createdAt: { gte: dayStart }, data: { path: ['cycleId'], equals: c.id } },
    })
    if (told > 0) continue

    if (!(await ctx.mayAct())) return // the letter and its row are one unit
    const week = c.periodStart && c.periodEnd ? weekWords(c.periodStart, c.periodEnd) : weekWords(c.dueOn, c.dueOn)
    const base = mailedBase()
    const letter = timesheetChaseLetter({
      workerName: c.sellContract.person.name, firmName: firm?.name ?? 'Your firm', periodStart: c.periodStart ?? c.dueOn, periodEnd: c.periodEnd ?? c.dueOn,
      dueOn: c.dueOn, link: base ? `${base}/dashboard/my-work` : '', attempt: next.attempt,
    })
    const { result: res } = await runSkill(ctx, 'chase.send', { recordType: CHASE_RECORD, recordId: c.id, unitsPlanned: 1 }, async () => {
      const r = await send({
        to: c.sellContract!.person.primaryEmail, subject: letter.subject, text: letter.text,
        about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: CHASE_RECORD, recordId: c.id, template: TIMESHEET_CHASE_TEMPLATE, chase: true },
      })
      const went = r.outcome === 'SENT'
      await ctx.act({
        recordType: TASK_RECORD, recordId: task.id, action: went ? 'CHASE_SENT' : 'CHASE_NOT_SENT',
        summary: went ? `Sent letter ${next.attempt} to ${c.sellContract!.person.name} for the week of ${week}.` : `Letter ${next.attempt} could not be sent: ${r.note}`,
      })
      return { result: r }
    })
    if (res.outcome === 'FAILED_DELIVERY') {
      // The task's card reopens as a new card for its owner: "failed delivery".
      const stamp = await agentStamp(companyId, ctx.agentKey)
      const owner = await cardOwner(companyId, now)
      if (stamp && owner) {
        await openDecision({
          ...stamp, companyId, ownerPersonId: owner, openedOn: now,
          question: `Failed delivery: letter ${next.attempt} to ${c.sellContract.person.name} for the week of ${week} did not arrive. Check her email address.`,
          proof: `The mail service said: ${res.note}`,
          proofLinks: [{ recordType: TASK_RECORD, recordId: task.id }],
        })
      }
    }
  }
}

export const TIMESHEET_CHASE_RULES = 'timesheet-chase-1'

/** Put the step in the runner's registry. Called by the cron route that runs agents. */
export function registerTimesheetChase() {
  registerAgent(TIMESHEET_CHASE_AGENT, { ruleVersion: TIMESHEET_CHASE_RULES, step: timesheetChaseStep })
}

/** The firms (of those given) whose chase agent is On: the old scheduled reminder stays quiet for them. */
export async function firmsChasing(companyIds: readonly string[]): Promise<Set<string>> {
  if (companyIds.length === 0) return new Set()
  const rows = await prisma.agentSwitch.findMany({ where: { agentKey: TIMESHEET_CHASE_AGENT, state: 'ON', companyId: { in: [...companyIds] } }, select: { companyId: true } })
  return new Set(rows.map((r) => r.companyId))
}

/**
 * A week was filed on this line: close every open chase of that worker whose
 * week is now covered, on this line or on the line above it. Never throws;
 * the filing is the act that matters.
 */
export async function closeChaseOnFiling(sellContractId: string): Promise<void> {
  try {
    const line = await prisma.sellContract.findUnique({ where: { id: sellContractId }, select: { personId: true } })
    if (!line) return
    const open = await prisma.agentTask.findMany({
      where: { agentKey: TIMESHEET_CHASE_AGENT, kind: TIMESHEET_CHASE_KIND, recordType: CHASE_RECORD, state: { in: [...OPEN] } },
      select: { id: true, companyId: true, recordId: true },
    })
    if (open.length === 0) return
    const cycles = await prisma.cycle.findMany({
      where: { id: { in: open.map((t) => t.recordId) }, sellContract: { personId: line.personId } },
      select: { id: true, completedAt: true, periodStart: true, periodEnd: true, sellContract: { select: { personId: true, clientCompanyId: true, endClientCompanyId: true } } },
    })
    for (const c of cycles) {
      const t = open.find((x) => x.recordId === c.id)!
      if (await weekFiled(c, await daysOffFor(t.companyId))) await closeTask(t.id, 'The week was filed, so the chase is closed.', 'CLOSED_BY_ARRIVAL')
    }
  } catch { /* the nightly step closes it on its next run */ }
}
