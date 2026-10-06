/**
 * The sentences on the time-limit page.
 *
 * Pure, and apart from the page, so each is a test name the founder can
 * read. The founder's plain words (2026-09-28): *time limit*, not tenure
 * cap; the page said "Cross-vendor tenure… twenty-four months of
 * exposure", which is a note to engineers rather than a heading for a
 * program manager.
 */

import { plainDate } from '@/lib/plain-date'
import { monthsOf } from '@/lib/tenure-days'

/** The line under the heading. Says nothing about a company it cannot yet name. */
export function tenureSubtitle(o: {
  clientName: string | null | undefined
  capMonths: number | null
  breakDays: number | null
}): string {
  const at = o.clientName?.trim() ? ` at ${o.clientName.trim()}` : ''
  const parts = [
    `How long each person has worked${at}, added up across every supplier that sent them.`,
    'Twelve months through one supplier and twelve through another is twenty-four months here.',
  ]
  if (o.capMonths != null) parts.push(`Time limit: ${o.capMonths} months.`)
  if (o.breakDays != null) parts.push(`Break before coming back: ${o.breakDays} days.`)
  return parts.join(' ')
}

/** Where a person stands against the limit, as the line under their bar. */
export function limitLine(o: {
  days: number
  capMonths: number
  percent: number
  limitDays: number
  overBy: string | null
}): string {
  const base = `${o.percent}% of the ${o.capMonths}-month time limit (${o.days} of ${o.limitDays} days)`
  return o.overBy ? `${base} — ${o.overBy}` : base
}

/** The day somebody may come back, as a person reads it. */
export function eligibleWords(iso: string | null): string {
  return iso ? plainDate(iso) : '—'
}

/**
 * The day somebody reaches the time limit, as the cell under "Reaches the limit".
 *
 * Three answers, and the third is the honest one: a date in the past
 * (reached), a date ahead (reaches), or no date because the contracts on
 * the record end before the limit — said in words rather than as a dash,
 * because a dash reads as "we do not know" when the answer is "not on
 * the paper that exists".
 */
export function limitDayWords(o: { reachedOn: string | null; today: Date; live: boolean }): string {
  if (o.reachedOn) {
    const on = plainDate(o.reachedOn)
    return new Date(o.reachedOn).getTime() <= o.today.getTime() ? `Reached ${on}` : on
  }
  return o.live ? 'Not before the current contracts end' : 'Not on site'
}

/**
 * A live contract booked past the limit, in a sentence.
 *
 * "Pinnacle Resourcing's contract runs to Sep 3, 2027, 7 months past the
 * time limit on Feb 3, 2027." Whole months, never rounded up — the same
 * rule as months served — and days where it is under a month. A contract
 * with no end date runs past any limit, and says so.
 */
export function runsPastWords(o: {
  firm: string
  endDate: string | null
  daysPast: number | null
  reachedOn: string
}): string {
  const limit = plainDate(o.reachedOn)
  if (o.endDate == null || o.daysPast == null) {
    return `${o.firm}’s contract has no end date, so it runs past the time limit on ${limit}.`
  }
  const months = monthsOf(o.daysPast)
  const by = months >= 1
    ? `${months} month${months === 1 ? '' : 's'}`
    : `${o.daysPast} day${o.daysPast === 1 ? '' : 's'}`
  return `${o.firm}’s contract runs to ${plainDate(o.endDate)}, ${by} past the time limit on ${limit}.`
}

/**
 * The status chip's words. BREAK_REQUIRED covers two people: somebody
 * still on site past the limit, who owes a break when they leave, and
 * somebody already away past the limit at a client with no break rule,
 * who owes nothing that would ever end — "Break required" would promise
 * them a way back the client's rules do not give.
 */
export function statusLabel(status: string, onSite: boolean): string {
  switch (status) {
    case 'WARNING': return 'Approaching'
    case 'BREAK_REQUIRED': return onSite ? 'Break required' : 'Past the limit'
    case 'IN_BREAK': return 'In break'
    case 'ELIGIBLE': return 'Eligible'
    default: return 'OK'
  }
}
