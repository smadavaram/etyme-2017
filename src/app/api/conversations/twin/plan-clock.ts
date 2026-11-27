/**
 * The tenant hears its own clock (records 126, 127): the 60 free days of an
 * edition that pays, and the read-only day after them.
 *
 * Said to the Owner only, in Ask Etyme, and nowhere else:
 *   · From day 50, one line in the greeting counts the days left. It is a
 *     line the Owner pulls by opening Ask Etyme, never a push, so it is
 *     not a nudge every morning.
 *   · On day 61 unpaid, one card in the queue: the account is read-only
 *     and Settings is where a plan is chosen. It stays until a plan is
 *     paid, and it is one row however many mornings pass.
 *
 * Nobody else is told. An Admin, a recruiter or an AP clerk cannot choose a
 * plan, so a line or a card for them is a message they cannot act on.
 *
 * Nothing here sends an email or a Teams message, and no sentence says one
 * went. If a letter is ever added, it asks `mailLeaves` first
 * (lib/notify/mail-leaves), as every sentence about email does.
 *
 * The clock itself is `trialOf` (lib/money/pricing) and the rule's switch is
 * `readOnlyRuleOn` (lib/tenant-state): read here, never written a second time.
 */

import { prisma } from '@/lib/db'
import { OWNER_ROLE } from '@/lib/owner-rules'
import { trialOf, type PricedEdition, type TrialState } from '@/lib/money/pricing'
import { readOnlyRuleOn } from '@/lib/tenant-state'
import { countWordLower } from './count-words'
import { PLAN_CLOCK, type QueueItem, type QueueRead, type RichLine } from './ask'

export { PLAN_CLOCK }
/** Where a plan is chosen. The same place the refusal sentence names. */
export const PLAN_HREF = '/dashboard/settings'
/** The first day the greeting counts: day 50 of 60 is ten days left. */
export const COUNT_FROM_DAYS_LEFT = 10

/** The greeting's counting line, or null before day 50 and after the trial. Pure. */
export function planLineFor(trial: TrialState): RichLine | null {
  if (trial.state !== 'TRIAL' || trial.daysLeft > COUNT_FROM_DAYS_LEFT) return null
  const left = trial.daysLeft
  const when = left === 0 ? 'end today' : left === 1 ? 'end tomorrow' : `end in ${countWordLower(left)} days`
  return {
    says: `Your free 60 days ${when}. Choose a plan in Settings before then.`,
    links: [{ text: 'Settings', href: PLAN_HREF }],
  }
}

/** The one day-61 card, or null. Four words and five words: nine, under the twelve a card may hold. Pure. */
export function planCardFor(trial: TrialState, companyId: string, ruleOn: boolean): QueueItem | null {
  if (!ruleOn || trial.state !== 'UNPAID') return null
  return {
    type: PLAN_CLOCK,
    entityType: 'Company',
    entityId: companyId,
    title: 'Your account is read-only',
    subtitle: 'Choose a plan in Settings.',
    actionUrl: PLAN_HREF,
  }
}

/** The queue with the day-61 card first and counted. A queue that could not be read stays unread. */
export function withPlanCard(q: QueueRead | null, card: QueueItem | null): QueueRead | null {
  if (!q || !card) return q
  if (q.items.some((d) => d.type === card.type && d.entityId === card.entityId)) return q
  return { total: q.total + 1, items: [card, ...q.items] }
}

export interface PlanClock {
  line: RichLine | null
  card: QueueItem | null
}

export const NO_PLAN_CLOCK: PlanClock = { line: null, card: null }

/** Pure: who hears it. Only the Owner. */
export function hearsTheClock(roleName: string | null | undefined): boolean {
  return roleName === OWNER_ROLE
}

/**
 * What this seat hears about its company's clock. Nothing for anybody but
 * the Owner, and no read of the company for them.
 */
export async function planClockFor(reader: { companyId: string; roleName: string | null }, now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<PlanClock> {
  if (!hearsTheClock(reader.roleName)) return NO_PLAN_CLOCK
  const c = await prisma.company.findUnique({
    where: { id: reader.companyId },
    select: { edition: true, activatedAt: true, paidThrough: true, billingExempt: true },
  })
  if (!c) return NO_PLAN_CLOCK
  const trial = trialOf({ ...c, edition: c.edition as PricedEdition, now })
  // Paid ahead inside the free days: nothing is left to choose.
  if (c.paidThrough && c.paidThrough.getTime() > now.getTime()) return NO_PLAN_CLOCK
  return { line: planLineFor(trial), card: planCardFor(trial, reader.companyId, readOnlyRuleOn(env)) }
}
