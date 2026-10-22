/**
 * The day an extension ends, from what somebody asked for.
 *
 * The contracts drawer offered three months and nothing else
 * (screen walk, 2026-10-22). A placement is extended to the day the
 * client agreed — the end of a release, the end of a quarter — and a
 * fixed three months is a number nobody asked for. So the route takes a
 * chosen day; the older "months" form stays, because two other screens
 * still offer "three more months" and that is a fair button too.
 *
 * Pure: no database, no clock. `today` is passed in.
 */

import { formatDay } from '@/lib/format-date'

/** The most one extension may add, the same ceiling the months form always had. */
export const LONGEST_EXTENSION_MONTHS = 24

export type ExtensionEnd =
  | {
      ok: true
      newEnd: Date
      /** Set where the caller asked in months; null where it chose a day. */
      months: number | null
      /** "Extended to Feb 17, 2027." */
      says: string
    }
  | { ok: false; code: 'VALIDATION'; field: 'newEndDate' | 'months'; message: string }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** "Feb 17, 2027", read in UTC because a stored day is midnight UTC. */
const plain = (d: Date): string => formatDay(d)

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** A calendar day at UTC midnight, or null where the string is not one. */
export function calendarDay(s: unknown): Date | null {
  if (typeof s !== 'string') return null
  const m = DAY.exec(s.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = new Date(Date.UTC(y, mo - 1, d))
  // 2027-02-30 rolls into March in Date.UTC; a day that rolls is not a day.
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null
  return at
}

/** The same day n months on, held to the month's last day (Aug 31 + 6 is Feb 28). */
function addMonthsUTC(d: Date, n: number): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)))
}

export function extensionEnd(input: {
  oldEnd: Date | null
  today: Date
  months?: unknown
  newEndDate?: unknown
}): ExtensionEnd {
  const { oldEnd, today } = input

  // ── A day somebody chose ──
  if (input.newEndDate !== undefined && input.newEndDate !== null) {
    const chosen = calendarDay(input.newEndDate)
    if (!chosen) {
      return {
        ok: false, code: 'VALIDATION', field: 'newEndDate',
        message: 'Pick the new last day from the calendar.',
      }
    }
    const floor = oldEnd ?? today
    const floorDay = calendarDay(dayKey(floor))!
    const after = oldEnd ? plain(floorDay) : 'today'
    if (dayKey(chosen) <= dayKey(floorDay)) {
      return {
        ok: false, code: 'VALIDATION', field: 'newEndDate',
        message: `An extension ends after ${after}. To end the placement sooner, use Initiate rolloff.`,
      }
    }
    const furthest = addMonthsUTC(floorDay, LONGEST_EXTENSION_MONTHS)
    if (dayKey(chosen) > dayKey(furthest)) {
      return {
        ok: false, code: 'VALIDATION', field: 'newEndDate',
        message: `One extension adds at most two years. Pick a day on or before ${plain(furthest)}.`,
      }
    }
    return { ok: true, newEnd: chosen, months: null, says: `Extended to ${plain(chosen)}.` }
  }

  // ── A number of months, as the older screens ask ──
  const months = input.months ?? 3
  if (typeof months !== 'number' || !Number.isInteger(months) || months < 1 || months > LONGEST_EXTENSION_MONTHS) {
    return {
      ok: false, code: 'VALIDATION', field: 'months',
      message: `months must be between 1 and ${LONGEST_EXTENSION_MONTHS}`,
    }
  }
  // Kept exactly as the route always computed it, so a screen asking for
  // three months lands on the day it always did.
  const newEnd = new Date(oldEnd ?? today)
  newEnd.setMonth(newEnd.getMonth() + months)
  return { ok: true, newEnd, months, says: `Extended to ${plain(newEnd)}.` }
}
