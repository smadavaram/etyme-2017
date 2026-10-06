/**
 * Whether "Ask them back" is offered, read off the time-limit ledger.
 *
 * Addendum E §E.2.3: asking somebody back checks the ledger before the
 * action is offered, and inside a break the screen shows the day they
 * may come back instead of a button.
 *
 * This used to carry its own copy of the break arithmetic, and it
 * disagreed with the ledger and the award in two ways. It only looked
 * at the break once somebody was past the limit, so a person who left
 * last week under the limit was offered a button the award would then
 * refuse. And past the limit with no break rule it offered the button,
 * which is the silent permit the ledger stopped making on 2026-10-06.
 *
 * Now it reads `standingAgainstLimit` and `ledgerStatus` in
 * lib/tenure-days — the one standing the ledger, the award, the
 * activation and the extension read — so the alumni list, the ask-back
 * request and those doors cannot give different answers. Pure: the
 * route reads the lines and passes `now`.
 */

import { standingAgainstLimit, ledgerStatus, type SiteLine, type LimitRules, type LedgerStatus } from '@/lib/tenure-days'
import { plainDate } from '@/lib/plain-date'

export interface AskBack {
  /** True only where the ledger reads the person clear to come back. */
  canReengage: boolean
  /** The ledger's status word for the person, the same value /api/tenure sends. */
  ledgerStatus: LedgerStatus
  /** Inside a break: the day they may come back, YYYY-MM-DD. Otherwise null — never a guessed day. */
  eligibleDate: string | null
  /** Why there is no button, in a sentence. Null where there is a button or they are on contract. */
  reengageBlockReason: string | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function askBack(lines: SiteLine[], rules: LimitRules, now: Date = new Date()): AskBack {
  const standing = standingAgainstLimit(lines, rules, now)
  const status = ledgerStatus(standing)

  // On contract here — any live line, begun or not. Nobody is asked back
  // to a site they have not left; the page says "On contract".
  if (lines.some((l) => l.live)) {
    return { canReengage: false, ledgerStatus: status, eligibleDate: null, reengageBlockReason: null }
  }

  if (status === 'IN_BREAK') {
    const eligibleDate = standing.eligibleOn ? iso(standing.eligibleOn) : null
    const left = standing.lastDay ? `Left on ${plainDate(iso(standing.lastDay))}. ` : ''
    return {
      canReengage: false,
      ledgerStatus: status,
      eligibleDate,
      reengageBlockReason:
        `${left}This site requires a ${rules.breakDays}-day break before anybody comes back` +
        (eligibleDate ? `, so they may come back from ${plainDate(eligibleDate)}.` : '.'),
    }
  }

  if (status === 'BREAK_REQUIRED') {
    // Away and past the limit, at a client with no break rule: nothing
    // resets the count, so there is no day to promise.
    return {
      canReengage: false,
      ledgerStatus: status,
      eligibleDate: null,
      reengageBlockReason:
        `Past the limit. They have served the ${rules.capMonths}-month time limit here, and this site has ` +
        `no break rule that would reset it, so there is no day on which they may come back.`,
    }
  }

  // OK, Approaching, or Eligible after a served break.
  return { canReengage: true, ledgerStatus: status, eligibleDate: null, reengageBlockReason: null }
}
