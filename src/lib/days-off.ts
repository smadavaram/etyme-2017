/**
 * The company's week: which days are off, when hours are due, when they
 * are approved. One door for reading and writing all of it.
 *
 * ── What the founder decided, 2026-09-30 ─────────────────────────────
 *
 * "If a company is in Dubai they would have Friday off — this should be a
 * configurable setting." So days off are a company setting, defaulting to
 * Saturday and Sunday, and a company may mark any days — Friday alone,
 * Friday and Saturday, or none.
 *
 * "Your recommendation is default, but companies can choose to change
 * their settings and take up to an additional week to approve." So a
 * week's hours are due on the Monday after it ends and approved by the
 * Wednesday; a company may change both, and may give approvers one extra
 * week — approval by the following Wednesday at the latest — and never
 * more.
 *
 * ── What a day off does and does not do ──────────────────────────────
 *
 * It decides what a sheet expects and what a date shifts around. It never
 * decides what may be filed: a Saturday worked to help a release is
 * normal in India and the US alike, and it is checked like any other day.
 * Nothing on the filing path reads this file, and
 * `__tests__/invariants/days-off.test.ts` fails if it starts to.
 *
 * ── Where it lives ───────────────────────────────────────────────────
 *
 * On the company today. It moves to the site when the legal-entity and
 * site layer exists, and the readers will not notice, because they come
 * through here. The week still starts on Sunday for everybody.
 */

import { prisma } from '@/lib/db'
import { DEFAULT_DAYS_OFF, cleanDaysOff } from '@/lib/cycle-shift'

export { DEFAULT_DAYS_OFF }

/** When a week's hours are due and approved. */
export interface WeekDue {
  /** Weekday after the week ends on which its hours are due, 0 = Sunday. */
  hoursDueWeekday: number
  /** Weekday by which the hours must be approved, 0 = Sunday. */
  approveByWeekday: number
  /** Extra weeks the approvers are given: 0 or 1. */
  approvalExtraWeeks: number
}

export interface WeekSettings extends WeekDue {
  daysOff: number[]
  /** When somebody last answered. Null: nobody has, and the defaults stand. */
  setAt: Date | null
  setById: string | null
}

export const DEFAULT_WEEK_DUE: Readonly<WeekDue> = Object.freeze({
  hoursDueWeekday: 1, // Monday
  approveByWeekday: 3, // Wednesday
  approvalExtraWeeks: 0,
})

/** The most extra weeks approvers may be given. */
export const MAX_EXTRA_WEEKS = 1

/**
 * The latest an approval may fall, in days after the Saturday a week
 * ends: the following Wednesday. Monday is 2, Wednesday 4, the Wednesday
 * a week later 11.
 */
export const LATEST_APPROVAL_DAYS = 11

export const TOO_MANY_EXTRA_WEEKS =
  'Approvers may have at most one extra week. Every day an approval waits is a day the bill and the pay wait behind it.'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Days after the Saturday a week ends, for a weekday in the week after. */
const daysAfterWeekEnds = (weekday: number, extraWeeks = 0): number => weekday + 1 + 7 * extraWeeks

const isWeekday = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6

// ── Pure ───────────────────────────────────────────────────────────────

/**
 * Whether this calendar day is one of the company's days off.
 *
 * Read in UTC, the way every calendar day on this system is stored and
 * printed (`lib/format-date`). A day off is not expected on a sheet; it is
 * never refused on one.
 */
export function isDayOff(date: Date, daysOff: readonly number[] = DEFAULT_DAYS_OFF): boolean {
  return daysOff.includes(date.getUTCDay())
}

/** What a company row holds, read as answers this build can stand behind. */
export function settingsFrom(row: {
  daysOff?: number[] | null
  hoursDueWeekday?: number | null
  approveByWeekday?: number | null
  approvalExtraWeeks?: number | null
  weekSettingsSetAt?: Date | null
  weekSettingsSetById?: string | null
} | null | undefined): WeekSettings {
  // A stored value that would fail the door reads as the default rather
  // than as a date nobody chose.
  const due = checkWeekSettings(DEFAULT_WEEK_DUE, {
    hoursDueWeekday: row?.hoursDueWeekday ?? undefined,
    approveByWeekday: row?.approveByWeekday ?? undefined,
    approvalExtraWeeks: row?.approvalExtraWeeks ?? undefined,
  })
  const days = cleanDaysOff(row?.daysOff)
  return {
    daysOff: days ?? [...DEFAULT_DAYS_OFF],
    ...(due.ok ? due.due : DEFAULT_WEEK_DUE),
    setAt: row?.weekSettingsSetAt ?? null,
    setById: row?.weekSettingsSetById ?? null,
  }
}

export interface WeekChanges {
  daysOff?: unknown
  hoursDueWeekday?: unknown
  approveByWeekday?: unknown
  approvalExtraWeeks?: unknown
}

export type WeekCheck =
  | { ok: true; due: WeekDue; daysOff: number[] | null; changed: string[] }
  | { ok: false; field: string; message: string }

/**
 * The answers as they would stand after these changes, or the sentence
 * saying why not. No database: the route and the tests both ask this.
 */
export function checkWeekSettings(current: WeekDue, changes: WeekChanges): WeekCheck {
  const changed: string[] = []
  let daysOff: number[] | null = null

  if (changes.daysOff !== undefined) {
    if (!Array.isArray(changes.daysOff) || !changes.daysOff.every(isWeekday)) {
      return { ok: false, field: 'daysOff', message: 'A day off is a day of the week, from Sunday (0) to Saturday (6).' }
    }
    const clean = cleanDaysOff(changes.daysOff)
    if (!clean) {
      return { ok: false, field: 'daysOff', message: 'At least one day of the week has to be a working day.' }
    }
    daysOff = clean
    changed.push('daysOff')
  }

  const due: WeekDue = { ...current }
  for (const field of ['hoursDueWeekday', 'approveByWeekday'] as const) {
    if (changes[field] === undefined) continue
    if (!isWeekday(changes[field])) {
      const what = field === 'hoursDueWeekday' ? 'Hours fall due' : 'Hours are approved'
      return { ok: false, field, message: `${what} on a day of the week, from Sunday (0) to Saturday (6).` }
    }
    due[field] = changes[field] as number
    changed.push(field)
  }

  if (changes.approvalExtraWeeks !== undefined) {
    const v = changes.approvalExtraWeeks
    if (!Number.isInteger(v) || (v as number) < 0) {
      return { ok: false, field: 'approvalExtraWeeks', message: 'Extra weeks for approvers is 0 or 1.' }
    }
    if ((v as number) > MAX_EXTRA_WEEKS) {
      return { ok: false, field: 'approvalExtraWeeks', message: TOO_MANY_EXTRA_WEEKS }
    }
    due.approvalExtraWeeks = v as number
    changed.push('approvalExtraWeeks')
  }

  const dueAfter = daysAfterWeekEnds(due.hoursDueWeekday)
  const approveAfter = daysAfterWeekEnds(due.approveByWeekday, due.approvalExtraWeeks)
  if (approveAfter < dueAfter) {
    return {
      ok: false,
      field: 'approveByWeekday',
      message:
        `Hours due on ${WEEKDAY_NAMES[due.hoursDueWeekday]} cannot be approved by the ${WEEKDAY_NAMES[due.approveByWeekday]} before it. ` +
        'Pick an approval day on or after the day hours are due.',
    }
  }
  if (approveAfter > LATEST_APPROVAL_DAYS) {
    return {
      ok: false,
      field: 'approveByWeekday',
      message:
        'With the extra week, hours must be approved by the following Wednesday at the latest. ' +
        'Every day an approval waits is a day the bill and the pay wait behind it.',
    }
  }

  return { ok: true, due, daysOff, changed }
}

/**
 * The day a week's hours are due and the day they must be approved by,
 * for the Sunday-to-Saturday week starting on `weekStart` (UTC midnight).
 */
export function deadlinesFor(weekStart: Date, due: WeekDue = DEFAULT_WEEK_DUE): { hoursDueOn: Date; approveByOn: Date } {
  const saturday = Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6)
  const at = (n: number) => new Date(saturday + n * 86_400_000)
  return {
    hoursDueOn: at(daysAfterWeekEnds(due.hoursDueWeekday)),
    approveByOn: at(daysAfterWeekEnds(due.approveByWeekday, due.approvalExtraWeeks)),
  }
}

// ── The door to the row ────────────────────────────────────────────────

const SELECT = {
  daysOff: true,
  hoursDueWeekday: true,
  approveByWeekday: true,
  approvalExtraWeeks: true,
  weekSettingsSetAt: true,
  weekSettingsSetById: true,
} as const

/** Everything this company answered about its week, or the defaults. */
export async function weekSettingsFor(companyId: string): Promise<WeekSettings> {
  const row = await prisma.company.findUnique({ where: { id: companyId }, select: SELECT })
  return settingsFrom(row)
}

/** The company's days off; Saturday and Sunday where it said nothing. */
export async function daysOffFor(companyId: string): Promise<number[]> {
  return (await weekSettingsFor(companyId)).daysOff
}

/** When this company's week's hours are due and approved. */
export async function weekDueFor(companyId: string): Promise<WeekDue> {
  const s = await weekSettingsFor(companyId)
  return {
    hoursDueWeekday: s.hoursDueWeekday,
    approveByWeekday: s.approveByWeekday,
    approvalExtraWeeks: s.approvalExtraWeeks,
  }
}

/**
 * Change the answers, recording who and when. Refuses in a sentence, and
 * writes nothing on a refusal.
 */
export async function setWeekSettings(
  companyId: string,
  byId: string,
  changes: WeekChanges
): Promise<{ ok: true; settings: WeekSettings; changed: string[] } | { ok: false; field: string; message: string }> {
  const current = await weekSettingsFor(companyId)
  const check = checkWeekSettings(current, changes)
  if (!check.ok) return check
  if (check.changed.length === 0) {
    return { ok: false, field: '', message: 'Nothing to change.' }
  }
  const row = await prisma.company.update({
    where: { id: companyId },
    data: {
      ...(check.daysOff ? { daysOff: check.daysOff } : {}),
      hoursDueWeekday: check.due.hoursDueWeekday,
      approveByWeekday: check.due.approveByWeekday,
      approvalExtraWeeks: check.due.approvalExtraWeeks,
      weekSettingsSetAt: new Date(),
      weekSettingsSetById: byId,
    },
    select: SELECT,
  })
  return { ok: true, settings: settingsFrom(row), changed: check.changed }
}
