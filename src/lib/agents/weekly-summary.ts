/**
 * The weekly summary (record 112, chain 7, "Run the firm"). Key `weekly-summary`.
 *
 * Once a week, on the firm's own Monday: how many customers and suppliers
 * are active and how many dormant, how many consultants are billing, the
 * hours the employer accepted last week and the hours still waiting for
 * acceptance. One line on the ledger, which Agent control shows as "This
 * week", and one card to the Owner. It sends nothing and changes nothing;
 * Drafts only and On do the same.
 *
 * Every figure is read from a reader that already exists and is computed
 * nowhere a second way: the census from `censusFacts` and `censusOn` (the
 * census keeper's own), consultants billing from `firmTuesday`'s list of
 * people on site, hours from the timesheets' own `employerAcceptedAt` and
 * `acceptedHours` (null means accepted as approved). Where a figure does
 * not apply to the firm (a client bills nobody) it is null and says why.
 */

import { formatDayLong } from '@/lib/format-date'
import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision, firmToday, firmZone, todayIn } from '@/lib/decision-items'
import { firmTuesday } from '@/lib/money/firm-today'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { AGENT_HELD_AS, registerAgent, type AgentContext, type AgentDef } from './runner'
import { censusFacts } from './census-keeper'
import { censusOn } from './census-rules'

export const WEEKLY_SUMMARY_AGENT = 'weekly-summary'
export const WEEKLY_SUMMARY_RULE = 'weekly-summary-v1'
export const WEEKLY_SUMMARY_ACTION = 'WEEKLY_SUMMARY'
export const WEEKLY_SUMMARY_RECORD = 'Company'
export const WEEKLY_SUMMARY_QUESTION_PREFIX = 'This week: '

const DAY = 86_400_000

export interface WeeklySummary {
  /** The Sunday that began the week the hours are for. */
  weekOf: Date
  customers: { active: number; dormant: number }
  suppliers: { active: number; dormant: number }
  /** Null where the firm sells nobody's time. */
  consultantsBilling: number | null
  hoursAccepted: number
  hoursWaiting: number
}

/** Whether the firm's own day is a Monday. `today` is the firm's day as its UTC midnight. Pure. */
export const isFirmMonday = (today: Date): boolean => today.getUTCDay() === 1

/** The Sunday-to-Saturday week before the firm's Monday: [Sunday, next Sunday). Pure. */
export function lastWeekBefore(monday: Date): { from: Date; to: Date } {
  const to = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() - 1))
  return { from: new Date(to.getTime() - 7 * DAY), to }
}

/** Hours on a sheet the employer will pay for: what it accepted, else what was approved. Pure. */
export const hoursOf = (s: { acceptedHours: unknown | null; totalHours: unknown }): number => Number(s.acceptedHours ?? s.totalHours)

/** Sum hours to the hundredth, so a float never prints a tail. Pure. */
export const sumHours = (rows: readonly { acceptedHours: unknown | null; totalHours: unknown }[]): number =>
  Math.round(rows.reduce((n, r) => n + hoursOf(r), 0) * 100) / 100

const hoursWord = (h: number) => `${h} ${h === 1 ? 'hour' : 'hours'}`
const date = (d: Date) => formatDayLong(d, { year: false })

/** The one ledger line, "This week". Pure. */
export function summaryLine(s: WeeklySummary): string {
  const side = (n: string, c: { active: number; dormant: number }) => `${c.active} ${n} active, ${c.dormant} dormant`
  const billing = s.consultantsBilling === null ? 'consultants billing not applicable to this firm' : `${s.consultantsBilling} ${s.consultantsBilling === 1 ? 'consultant' : 'consultants'} billing`
  return `${WEEKLY_SUMMARY_QUESTION_PREFIX}${side('customers', s.customers)}; ${side('suppliers', s.suppliers)}; ${billing}; ` +
    `${hoursWord(s.hoursAccepted)} accepted for the week of ${date(s.weekOf)}; ${hoursWord(s.hoursWaiting)} waiting for acceptance.`
}

export const summaryQuestion = (s: WeeklySummary): string =>
  `${WEEKLY_SUMMARY_QUESTION_PREFIX}${hoursWord(s.hoursWaiting)} waiting for acceptance and ${hoursWord(s.hoursAccepted)} accepted for the week of ${date(s.weekOf)}. Read the summary?`

export const summaryProof = (s: WeeklySummary): string => `${summaryLine(s)} This summary sends nothing and changes nothing. Dormant means no contract, bill or submission in the last 90 days, a proposal the Owner may change.`

/** Read every figure from the firm's own record. */
export async function readWeeklySummary(companyId: string, now: Date): Promise<WeeklySummary> {
  const today = todayIn(await firmZone(companyId), now)
  const week = lastWeekBefore(today)
  const rows = censusOn(await censusFacts(companyId), now)
  const count = (side: 'CUSTOMER' | 'SUPPLIER') => ({
    active: rows.filter((r) => r.side === side && r.standing === 'ACTIVE').length,
    dormant: rows.filter((r) => r.side === side && r.standing === 'DORMANT').length,
  })
  const tuesday = await firmTuesday(companyId, now)
  const sheets = await prisma.timesheet.findMany({
    where: { sellContract: { companyId }, periodStart: { gte: week.from, lt: week.to }, status: { in: ['SUBMITTED', 'APPROVED'] } },
    select: { status: true, employerAcceptedAt: true, acceptedHours: true, totalHours: true },
  })
  return {
    weekOf: week.from, customers: count('CUSTOMER'), suppliers: count('SUPPLIER'),
    consultantsBilling: tuesday ? new Set(tuesday.billingThisMonth.people.map((p) => p.personId)).size : null,
    hoursAccepted: sumHours(sheets.filter((t) => t.employerAcceptedAt !== null)),
    hoursWaiting: sumHours(sheets.filter((t) => t.employerAcceptedAt === null && t.status === 'SUBMITTED')),
  }
}

export async function weeklySummaryStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const today = await firmToday(companyId, now)
  if (!isFirmMonday(today)) return
  // Once a week: not again where this Monday's line is already on the ledger.
  const done = await prisma.recordAction.count({ where: { companyId, agentKey: ctx.agentKey, action: WEEKLY_SUMMARY_ACTION, createdAt: { gte: new Date(today.getTime() - DAY) } } })
  if (done > 0) return
  if (!(await ctx.mayAct())) return
  const s = await readWeeklySummary(companyId, now)
  await ctx.act({ recordType: WEEKLY_SUMMARY_RECORD, recordId: companyId, action: WEEKLY_SUMMARY_ACTION, summary: summaryLine(s) })

  const owner = await ownerForRoles(companyId, [], now)
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!owner || !sw) return
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  try {
    await openDecision({
      companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
      question: summaryQuestion(s), ownerPersonId: owner, openedOn: today,
      proof: summaryProof(s), proofLinks: [{ recordType: WEEKLY_SUMMARY_RECORD, recordId: companyId }],
    })
  } catch (e) {
    if (!(e instanceof LedgerRefusal)) throw e
  }
}

export const weeklySummaryAgent: AgentDef = { ruleVersion: WEEKLY_SUMMARY_RULE, step: weeklySummaryStep }

export function registerWeeklySummary(): void { registerAgent(WEEKLY_SUMMARY_AGENT, weeklySummaryAgent) }
