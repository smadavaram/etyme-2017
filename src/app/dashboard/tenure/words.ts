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
import { runsPastSentence } from '@/lib/tenure-days'

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
 * A live contract booked past the limit, in a sentence, with what to do.
 *
 * "Pinnacle Resourcing’s contract runs to Sep 3, 2027, 7 months past the
 * day Lucía Fernández reaches the time limit (Feb 2, 2027). Shorten it or
 * plan the break." The wording is `runsPastSentence` in lib/tenure-days,
 * so the placement can say the same thing in the same words.
 */
export function runsPastWords(o: {
  firm: string
  personName?: string | null
  endDate: string | null
  daysPast: number | null
  reachedOn: string
  today?: Date
}): string {
  return runsPastSentence({
    firm: o.firm,
    personName: o.personName ?? null,
    endDate: o.endDate ? new Date(o.endDate) : null,
    reachedOn: new Date(o.reachedOn),
    now: o.today,
  })
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

/**
 * The status chip's words, past the limit first.
 *
 * Found by the founder's tester, 2026-11-08: Kwame Mensah read 135% of
 * the client's time limit and the chip said only "In break", because
 * `statusLabel` names where somebody is (on site, away, back) and never
 * whether they are past the limit. Being past it is the fact a program
 * manager acts on, so it is said first, and where somebody is comes
 * second. One sentence per state:
 *
 *   past, on site                 "Past the time limit · still on site"
 *   past, in break, a day known   "Past the time limit · in break until Nov 18, 2026"
 *   past, away, no break rule     "Past the time limit"
 *   not past                      statusLabel's words, unchanged
 *
 * "Past" is the standing's own `pastLimit` (days counted at or over the
 * limit), the same test the block fires on, so the chip and the refusal
 * cannot disagree. A served break resets the count, so somebody eligible
 * again is never read as past.
 */
export function standingWords(o: {
  status: string
  onSite: boolean
  pastLimit: boolean
  eligibleDate: string | null
}): string {
  if (!o.pastLimit) return statusLabel(o.status, o.onSite)
  const past = 'Past the time limit'
  if (o.onSite) return `${past} · still on site`
  if (o.status === 'IN_BREAK') {
    return o.eligibleDate ? `${past} · in break until ${plainDate(o.eligibleDate)}` : `${past} · in break`
  }
  return past
}

/**
 * Where a row sorts on the ledger: everybody past the time limit first,
 * in break or not, then approaching, in break, OK and eligible. Read by
 * the route's own order and by the page's Status column, so the two
 * cannot disagree.
 */
export function ledgerRank(o: { status: string; pastLimit: boolean }): number {
  if (o.pastLimit) return 0
  const order: Record<string, number> = { BREAK_REQUIRED: 0, WARNING: 1, IN_BREAK: 2, OK: 3, ELIGIBLE: 4 }
  return order[o.status] ?? 5
}

/**
 * What the page may draw, given what the route said.
 *
 * Sign-up walk, round four: a Member the route refused read "TRACKED 0 …
 * OVER THE LIMIT 0" above the refusal, at a client with somebody 24
 * months in. A zero says "nobody is over the limit". The truth was "not
 * yours to see". So a refusal is the whole page, and no figure is drawn
 * until the route has answered with figures.
 */
export type TenureView =
  | { show: 'refused'; says: string }
  | { show: 'loading' }
  | { show: 'page' }

export function tenureView(s: { loading: boolean; error: string | null; hasData: boolean }): TenureView {
  if (s.error) return { show: 'refused', says: s.error }
  if (!s.hasData) return { show: 'loading' }
  return { show: 'page' }
}
