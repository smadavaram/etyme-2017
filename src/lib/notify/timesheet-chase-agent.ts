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
  messages: [{ template: TIMESHEET_CHASE_TEMPLATE, label: 'Timesheet reminder' }],
  retries: PROPOSED_CHASE.retries,
  daysApart: PROPOSED_CHASE.workingDaysApart,
  closesWhen: 'the week is filed',
}

/** The card's question, with the proposal said as a proposal. Pure. */
export function chaseQuestion(workerName: string, week: string, plan: TaskPlan = PROPOSED_CHASE_PLAN): string {
  const n = plan.retries
  return `${workerName} has not filed the week of ${week}. Send a letter asking for it? ` +
    `Proposed: one letter, then up to ${n} ${n === 1 ? 'reminder' : 'reminders'}, ${plan.daysApart} working days apart, ` +
    `closing when the week is filed. These numbers are proposals; the Owner can change them in Agent control.`
}

/** What a yes releases, in the card's own words: no template key, the same plan words as the question. Pure. */
export function chaseProof(plan: TaskPlan = PROPOSED_CHASE_PLAN): string {
  const n = plan.retries
  return `If you say yes, the agent sends a timesheet reminder. It may send it again up to ${n} ${n === 1 ? 'reminder' : 'reminders'}, ` +
    `${plan.daysApart} working days apart. It closes the task when ${plan.closesWhen}. Anything more is a new task and asks you again. ` +
    `These numbers are proposals; the Owner can change them in Agent control.`
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

/**
 * PROPOSAL, AWAITING THE OWNER. A chase looks back this many days from the
 * day a week fell due. Older unfiled weeks go to a person on one card.
 */
export const CHASE_LOOKBACK_DAYS = 14

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const

const DAY_MS = 86_400_000
const dn = (d: Date) => Math.floor(d.getTime() / DAY_MS)

/**
 * Whether the days of a period are covered by filed hours. Covered means
 * every working day of the period lies inside some filed sheet; a sheet on
 * other period boundaries still counts for the days it overlaps. Pure.
 */
export function periodCovered(start: Date, end: Date, sheets: readonly { periodStart: Date; periodEnd: Date }[], daysOff: readonly number[]): boolean {
  let any = false
  let needed = 0
  for (let n = dn(start); n <= dn(end); n++) {
    const day = new Date(n * DAY_MS)
    if (isDayOff(day, daysOff)) continue
    needed++
    if (sheets.some((t) => dn(t.periodStart) <= n && n <= dn(t.periodEnd))) any = true
    else return false
  }
  if (needed === 0) return sheets.some((t) => dn(t.periodStart) <= dn(end) && dn(t.periodEnd) >= dn(start))
  return any
}

interface DueCycle {
  completedAt: Date | null
  periodStart: Date | null
  periodEnd: Date | null
  sellContract: { personId: string; clientCompanyId: string; endClientCompanyId: string | null } | null
}

/**
 * Whether a week is filed, by any route: its hours-due date is completed, or
 * the worker filed hours (past OPEN) that cover its days on ANY line she has
 * at the same end client, her own employer's line included.
 */
async function weekFiled(c: DueCycle, daysOff: readonly number[]): Promise<boolean> {
  if (c.completedAt) return true
  if (!c.sellContract || !c.periodStart || !c.periodEnd) return false
  const end = c.sellContract.endClientCompanyId ?? c.sellContract.clientCompanyId
  const sheets = await prisma.timesheet.findMany({
    where: {
      personId: c.sellContract.personId, status: { not: 'OPEN' },
      periodStart: { lte: c.periodEnd }, periodEnd: { gte: c.periodStart },
      sellContract: { OR: [{ endClientCompanyId: end }, { endClientCompanyId: null, clientCompanyId: end }] },
    },
    select: { periodStart: true, periodEnd: true },
  })
  return periodCovered(c.periodStart, c.periodEnd, sheets, daysOff)
}

/** Whether this firm employs the person itself: its own employee seat, or its own direct (no supplier) pay line. */
async function employsWorker(companyId: string, personId: string): Promise<boolean> {
  if (await prisma.context.count({ where: { personId, companyId, type: 'EMPLOYEE' } }) > 0) return true
  return (await prisma.buyContractCandidate.count({ where: { personId, buyContract: { companyId, vendorCompanyId: null, supplierSellContractId: null } } })) > 0
}

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
    const task = await proposeTask({
      companyId, agentKey: ctx.agentKey, kind: TIMESHEET_CHASE_KIND, recordType: CHASE_RECORD, recordId: c.id,
      plan: PROPOSED_CHASE_PLAN, ownerPersonId, question: chaseQuestion(c.sellContract!.person.name, week), openedOn: now,
    })
    await prisma.decisionItem.update({ where: { id: task.decisionId }, data: { proof: chaseProof() } })
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'CHASE_PROPOSED', summary: `Proposed a chase for ${c.sellContract!.person.name}, week of ${week}. Nothing is sent until a person says yes.` })
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
    if (await weekFiled(c, daysOff)) { await closeTask(task.id, 'The week was filed, so the chase is closed.', 'CLOSED_BY_ARRIVAL'); continue }
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.

    const plan = task.plan as unknown as TaskPlan
    const left = await attemptsOf(companyId, task.id, c.id)
    const last = left.length ? left[left.length - 1].createdAt : null
    const next = nextLetter(plan, left.length, last, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') { await closeTask(task.id, 'No answer: every attempt in the plan was made and the week is still not filed. Any further step is a person’s to take.', 'DONE'); continue }

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
    const res = await send({
      to: c.sellContract.person.primaryEmail, subject: letter.subject, text: letter.text,
      about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: CHASE_RECORD, recordId: c.id, template: TIMESHEET_CHASE_TEMPLATE, chase: true },
    })
    const went = res.outcome === 'SENT'
    await ctx.act({
      recordType: TASK_RECORD, recordId: task.id, action: went ? 'CHASE_SENT' : 'CHASE_NOT_SENT',
      summary: went ? `Sent letter ${next.attempt} to ${c.sellContract.person.name} for the week of ${week}.` : `Letter ${next.attempt} could not be sent: ${res.note}`,
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
