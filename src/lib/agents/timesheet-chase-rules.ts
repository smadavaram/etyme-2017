/**
 * What the timesheet chase decides, apart from what it does (record 123).
 * The agent (`lib/notify/timesheet-chase-agent`) and the checkers that re-read
 * its work (`lib/skills/checkers`) read the same rules here: the kind of
 * task, its proposed plan, when a week counts as filed and whose worker the
 * firm chases. Each reader takes the database handle it is given, so a
 * checker hands in its read-only client and the agent hands in its own.
 */

import { isDayOff } from '@/lib/days-off'
import { TIMESHEET_CHASE_TEMPLATE } from '@/lib/notify/timesheet-chase-letter'
import type { TaskPlan } from './tasks'

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

/**
 * PROPOSAL, AWAITING THE OWNER. A chase looks back this many days from the
 * day a week fell due. Older unfiled weeks go to a person on one card.
 */
export const CHASE_LOOKBACK_DAYS = 14

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

export interface DueCycle {
  completedAt: Date | null
  periodStart: Date | null
  periodEnd: Date | null
  sellContract: { personId: string; clientCompanyId: string; endClientCompanyId: string | null } | null
}

/** The two reads a due week needs, so any client, read-only or not, may be handed in. */
export interface ChaseReads {
  timesheet: { findMany(args: any): Promise<{ periodStart: Date; periodEnd: Date }[]> }
  context: { count(args: any): Promise<number> }
  buyContractCandidate: { count(args: any): Promise<number> }
}

/**
 * Whether a week is filed, by any route: its hours-due date is completed, or
 * the worker filed hours (past OPEN) that cover its days on ANY line she has
 * at the same end client, her own employer's line included.
 */
export async function weekFiledWith(db: ChaseReads, c: DueCycle, daysOff: readonly number[]): Promise<boolean> {
  if (c.completedAt) return true
  if (!c.sellContract || !c.periodStart || !c.periodEnd) return false
  const end = c.sellContract.endClientCompanyId ?? c.sellContract.clientCompanyId
  const sheets = await db.timesheet.findMany({
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
export async function employsWorkerWith(db: ChaseReads, companyId: string, personId: string): Promise<boolean> {
  if (await db.context.count({ where: { personId, companyId, type: 'EMPLOYEE' } }) > 0) return true
  return (await db.buyContractCandidate.count({ where: { personId, buyContract: { companyId, vendorCompanyId: null, supplierSellContractId: null } } })) > 0
}
