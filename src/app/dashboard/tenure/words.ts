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
