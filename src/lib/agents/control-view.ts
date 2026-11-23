/**
 * What Agent control adds beside the switches (record 112, chain 7):
 * a task's "Stopped" state once its agent is not On, the proposed defaults
 * of every agent in one place, and the latest "This week" line. Pure apart
 * from `latestThisWeek`.
 */

import { prisma } from '@/lib/db'
import { PROPOSED_DORMANT_AFTER_DAYS } from './census-rules'
import { PROPOSED_LATE_AFTER_DAYS } from './confirmation-rules'
import { PROPOSED_CHASE } from '@/lib/notify/timesheet-chase-agent'
import { PROPOSED_MONEY_CHASE } from '@/lib/money/money-owed-chase'
import { PROPOSED_QUIET_DAYS } from './interview-chase'
import { WEEKLY_SUMMARY_ACTION, WEEKLY_SUMMARY_AGENT } from './weekly-summary'

/**
 * A running or approved task whose agent is Off sends nothing, and one on
 * Drafts only sends nothing either: the engine refuses it, and the screen
 * says so. A task still waiting for its yes is not stopped; it has not
 * started. Pure.
 */
export function stoppedSays(taskState: string, switchState: 'OFF' | 'DRAFT_ONLY' | 'ON', agentName: string): string | null {
  if (taskState === 'PROPOSED' || switchState === 'ON') return null
  return switchState === 'OFF'
    ? `Stopped: ${agentName} is switched off, so nothing more is sent. Switch it on to continue.`
    : `Stopped: ${agentName} is on Drafts only, so nothing is sent. Switch it on to continue.`
}

export interface ProposedDefault { agentKey: string; says: string }

const times = (n: number, w: string) => `${n} ${n === 1 ? w : w + 's'}`

/** Every agent's proposed numbers, said as proposals. Nobody has decided them. Pure. */
export function proposedDefaults(): ProposedDefault[] {
  return [
    { agentKey: 'timesheet-chase', says: `One letter, then up to ${times(PROPOSED_CHASE.retries, 'reminder')}, ${PROPOSED_CHASE.workingDaysApart} working days apart, closing when the week is filed.` },
    { agentKey: 'money-owed-chase', says: `One letter, then up to ${times(PROPOSED_MONEY_CHASE.retries, 'reminder')}, ${PROPOSED_MONEY_CHASE.workingDaysApart} working days apart, closing when the bill is paid in full.` },
    { agentKey: 'interview-chase', says: `A reminder card opens after ${PROPOSED_QUIET_DAYS} working days of quiet. It sends nothing: a person follows up with the client.` },
    { agentKey: 'census-keeper', says: `A customer or supplier is dormant after ${PROPOSED_DORMANT_AFTER_DAYS} days with no contract, bill or submission.` },
    { agentKey: 'confirmation-tracker', says: `A submission is late when the other side has not confirmed in ${PROPOSED_LATE_AFTER_DAYS} days.` },
    { agentKey: WEEKLY_SUMMARY_AGENT, says: 'Runs once a week, on the firm’s Monday, and sends nothing.' },
  ]
}

/** The newest weekly summary line on the firm's ledger, or null where none has run. */
export async function latestThisWeek(companyId: string): Promise<{ at: Date; says: string } | null> {
  const row = await prisma.recordAction.findFirst({
    where: { companyId, agentKey: WEEKLY_SUMMARY_AGENT, action: WEEKLY_SUMMARY_ACTION },
    orderBy: { createdAt: 'desc' }, select: { createdAt: true, summary: true },
  })
  return row ? { at: row.createdAt, says: row.summary } : null
}
