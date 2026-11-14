/**
 * What "Add US holidays for …" answers, in a payroll person's words.
 *
 * The walk, 2026-11-14: the button answered "Added 2 public holidays for
 * the rest of 2026." and named no day. It names them now ("Added
 * Thanksgiving Day, Nov 26, and Christmas Day, Dec 25."), says which were
 * already on the calendar, and where a pay day already written on a
 * placement falls on a day just added, it says so and what the Owner can
 * do today. No date moves here: whether an unpaid date moves when a
 * holiday is added is the founder's to decide, and has been asked.
 *
 * Pure. Dates are printed through lib/format-date, without the year,
 * because the year is the one the button names.
 */

import { formatDay } from '@/lib/format-date'

export interface Day { date: string; name: string }

const MAX_NAMED = 3

function day(h: Day): string {
  return `${h.name}, ${formatDay(h.date, { year: false })}`
}

/** "A", "A and B", "A, B and C". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Names up to three days, then a count, so a whole year stays one short sentence. */
function days(hs: Day[]): string {
  const sorted = [...hs].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length <= MAX_NAMED) {
    // "Thanksgiving Day, Nov 26, and Christmas Day, Dec 25": each day's
    // date sits between commas, so the last one takes ", and".
    const each = sorted.map(day)
    if (each.length <= 1) return each.join('')
    return `${each.slice(0, -1).join(', ')}, and ${each[each.length - 1]}`
  }
  return `${sorted.length} public holidays, from ${day(sorted[0])}, to ${day(sorted[sorted.length - 1])}`
}

/** Names up to three people, then "and N more". */
function people(names: string[]): string {
  const u = [...new Set(names)].sort()
  if (u.length <= MAX_NAMED) return list(u)
  return `${u.slice(0, MAX_NAMED).join(', ')} and ${u.length - MAX_NAMED} more`
}

export function holidaysAddedSays(i: {
  year: number
  /** True where only the rest of the year was asked for. */
  rest: boolean
  /** Every day the button offered. */
  offered: Day[]
  /** The days it wrote: offered minus those already on the calendar. */
  added: Day[]
  /** Unpaid pay days already written on this company's placements, on a day just added. */
  payDaysOnAdded: Array<{ date: string; person: string }>
  /** False where the company chose that pay days stay on a day off (cycleShiftPay NONE). */
  payMoves: boolean
}): string {
  const span = i.rest ? `the rest of ${i.year}` : String(i.year)
  if (i.offered.length === 0) return `No public holidays are left in ${i.year}.`
  if (i.added.length === 0) {
    return `Nothing was added. Every public holiday for ${span} is already on your calendar.`
  }
  const addedDates = new Set(i.added.map((h) => h.date))
  const already = i.offered.filter((h) => !addedDates.has(h.date))
  const out: string[] = [`Added ${days(i.added)}.`]
  if (already.length > 0) {
    out.push(already.length <= MAX_NAMED
      ? `${days(already)} ${already.length === 1 ? 'was' : 'were'} already on your calendar.`
      : `${already.length} others were already on your calendar.`)
  }
  const hits = i.payDaysOnAdded.filter((p) => addedDates.has(p.date))
  if (hits.length > 0) {
    const on = i.added.filter((h) => hits.some((p) => p.date === h.date))
    out.push(`Pay days already written for ${people(hits.map((p) => p.person))} fall on ${days(on)}, and keep their dates.`)
    out.push(i.payMoves
      ? 'Record holidays before you record a placement, and its pay days move off them.'
      : 'Your pay days are set to stay on a day off, so new ones do not move either.')
  }
  return out.join(' ')
}
