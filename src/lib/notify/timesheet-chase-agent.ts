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
import { firmSeats, seatAtFirm } from '@/lib/decision-items'
import { dayAround } from '@/lib/decision-queue'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { registerAgent, type AgentContext } from '@/lib/agents/runner'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from '@/lib/agents/tasks'
import { TIMESHEET_CHASE_TEMPLATE, timesheetChaseLetter, weekWords } from './timesheet-chase-letter'

export const TIMESHEET_CHASE_AGENT = 'timesheet-chase'
export const TIMESHEET_CHASE_KIND = 'TIMESHEET_CHASE'
/** A chase is about one due week: the hours-due date on the placement's calendar. */
export const CHASE_RECORD = 'Cycle'

/**
 * PROPOSED DEFAULTS, AWAITING THE OWNER. Nobody has decided these numbers.
 * One letter, then up to two retries, two working days apart, closing when
 * the week is filed. The card shows them as proposals the Owner may change;
 * until the Owner sets them, these are what a task is proposed with.
 */
export const PROPOSED_CHASE = { letters: 1, retries: 2, workingDaysApart: 2 } as const

export const PROPOSED_CHASE_PLAN: TaskPlan = {
  messages: [{ template: TIMESHEET_CHASE_TEMPLATE }],
  retries: PROPOSED_CHASE.retries,
  daysApart: PROPOSED_CHASE.workingDaysApart,
  closesWhen: 'the week is filed',
}

/** The card's question, with the proposal said as a proposal. Pure. */
export function chaseQuestion(workerName: string, week: string, plan: TaskPlan = PROPOSED_CHASE_PLAN): string {
  const n = plan.retries
  return `${workerName} has not filed the week of ${week}. Send a letter asking for it? ` +
    `Proposed: one letter, then up to ${n} ${n === 1 ? 'reminder' : 'reminders'}, ${plan.daysApart} working days apart, ` +
    `closing when the week is filed. These numbers are proposals the Owner may change.`
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

/** Whether a week is filed, by any route: its hours-due date is completed, or a sheet past OPEN exists for it. */
async function weekFiled(c: { completedAt: Date | null; sellContractId: string | null; periodEnd: Date | null }): Promise<boolean> {
  if (c.completedAt) return true
  if (!c.sellContractId || !c.periodEnd) return false
  return (await prisma.timesheet.count({ where: { sellContractId: c.sellContractId, periodEnd: c.periodEnd, status: { not: 'OPEN' } } })) > 0
}

/** The seat that owes the yes: AP & Payroll, else the Owner. Null where neither is working. */
async function cardOwner(companyId: string, now: Date): Promise<string | null> {
  const seats = await firmSeats(companyId)
  const working = seats.filter((s) => seatAtFirm(s, seats, now) !== null)
  return (working.find((s) => s.roleName === 'AP & Payroll') ?? working.find((s) => s.isOwner))?.personId ?? null
}

/** The letters of this task that left, oldest first, read through the door's own reader (never the ledger directly). */
async function lettersOf(companyId: string, taskId: string, cycleId: string) {
  return (await mailSendsAbout(companyId, CHASE_RECORD, cycleId)).filter((r) => r.agentTaskId === taskId && r.outcome === 'SENT')
}

export async function timesheetChaseStep(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx
  const dayStart = dayAround(now).from
  const daysOff = await daysOffFor(companyId)
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

  // 1. Propose a task for every due week nobody has filed or chased.
  const due = await prisma.cycle.findMany({
    where: { kind: 'TIMESHEET_SUBMIT', completedAt: null, dueOn: { lt: new Date(dayStart.getTime() + 86_400_000) }, sellContract: { companyId, state: { in: ['IN_PROGRESS'] } } },
    select: { id: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true, sellContractId: true, sellContract: { select: { person: { select: { name: true } } } } },
    orderBy: { dueOn: 'asc' },
  })
  for (const c of due) {
    if (await weekFiled(c)) continue
    const had = await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, recordType: CHASE_RECORD, recordId: c.id } })
    if (had > 0) continue
    const ownerPersonId = await cardOwner(companyId, now)
    if (!ownerPersonId) continue
    const week = c.periodStart && c.periodEnd ? weekWords(c.periodStart, c.periodEnd) : `${weekWords(c.dueOn, c.dueOn)} (due)`
    const task = await proposeTask({
      companyId, agentKey: ctx.agentKey, kind: TIMESHEET_CHASE_KIND, recordType: CHASE_RECORD, recordId: c.id,
      plan: PROPOSED_CHASE_PLAN, ownerPersonId, question: chaseQuestion(c.sellContract!.person.name, week), openedOn: now,
    })
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'CHASE_PROPOSED', summary: `Proposed a chase for ${c.sellContract!.person.name}, week of ${week}. Nothing is sent until the Owner says yes.` })
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
      select: { id: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true, sellContractId: true, sellContract: { select: { person: { select: { id: true, name: true, primaryEmail: true } } } } },
    })
    if (!c || !c.sellContract) { await closeTask(task.id, 'The week this chase was about is no longer on the record.', 'STOPPED'); continue }
    if (await weekFiled(c)) { await closeTask(task.id, 'The week was filed, so the chase is closed.', 'CLOSED_BY_ARRIVAL'); continue }
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.

    const plan = task.plan as unknown as TaskPlan
    const left = await lettersOf(companyId, task.id, c.id)
    const sentRows = left.length
    const last = left.length ? left[left.length - 1].createdAt : null
    const next = nextLetter(plan, sentRows, last, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') { await closeTask(task.id, 'No answer: every letter in the plan was sent and the week is still not filed. Any further step is a person’s to take.', 'DONE'); continue }

    // The old reminder already told her today: no second letter the same day.
    const told = await prisma.notification.count({
      where: { personId: c.sellContract.person.id, type: 'CYCLE_DUE', createdAt: { gte: dayStart }, data: { path: ['cycleId'], equals: c.id } },
    })
    if (told > 0) continue

    const week = c.periodStart && c.periodEnd ? weekWords(c.periodStart, c.periodEnd) : weekWords(c.dueOn, c.dueOn)
    const base = mailedBase()
    const letter = timesheetChaseLetter({
      workerName: c.sellContract.person.name, firmName: firm?.name ?? 'Your firm', periodStart: c.periodStart ?? c.dueOn, periodEnd: c.periodEnd ?? c.dueOn,
      dueOn: c.dueOn, link: base ? `${base}/dashboard/my-work` : '', attempt: next.attempt,
    })
    const res = await send({
      to: c.sellContract.person.primaryEmail, subject: letter.subject, text: letter.text,
      about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: CHASE_RECORD, recordId: c.id, template: TIMESHEET_CHASE_TEMPLATE, chase: true },
    })
    const went = res.outcome === 'SENT'
    await ctx.act({
      recordType: TASK_RECORD, recordId: task.id, action: went ? 'CHASE_SENT' : 'CHASE_NOT_SENT',
      summary: went ? `Sent letter ${next.attempt} to ${c.sellContract.person.name} for the week of ${week}.` : `Letter ${next.attempt} to ${c.sellContract.person.name} was not sent: ${res.note}`,
    })
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

/** A week was filed: close its open chase at once. Never throws; the filing is the act that matters. */
export async function closeChaseOnFiling(sellContractId: string): Promise<void> {
  try {
    const filed = await prisma.cycle.findMany({ where: { sellContractId, kind: 'TIMESHEET_SUBMIT', completedAt: { not: null } }, select: { id: true } })
    if (filed.length === 0) return
    const tasks = await prisma.agentTask.findMany({
      where: { agentKey: TIMESHEET_CHASE_AGENT, recordType: CHASE_RECORD, recordId: { in: filed.map((f) => f.id) }, state: { in: [...OPEN] } }, select: { id: true },
    })
    for (const t of tasks) await closeTask(t.id, 'The week was filed, so the chase is closed.', 'CLOSED_BY_ARRIVAL')
  } catch { /* the nightly step closes it on its next run */ }
}
