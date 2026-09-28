/**
 * Whether a week may be written, at the one door that writes weeks.
 *
 * ── Why this is at the door and not only on the worker's page ──────────
 *
 * `POST /api/me/work` (etyme-supply's) asks the worker's questions — which
 * rung, which days — and then hands the week to `POST /api/timesheets`.
 * The door itself asked none of them. So the rules held for anybody who
 * came through the worker's page and for nobody who called the door
 * directly: a probe filed Helena Marsh's week on the Computer Systems →
 * Northbend rung, above her employer's, and got a 201 — a second copy of
 * one week, billable twice. Days in the future, days outside the
 * placement and days another week already covered all went in; only a
 * second sheet on the same start date was refused, by the database.
 *
 * The rules are supply's, in `lib/consultant-portfolio`, and they are
 * reused here rather than written again: a second copy of "which days
 * are open" is two answers the day one of them changes.
 *
 * ── A week sent back is filed again over itself ───────────────────────
 *
 * A reject returns a week to OPEN with the reason on the automation log
 * (`[id]/reject`). Nothing could change its hours — no edit route, and
 * filing again collided with the week's own start date. So filing the
 * same week again, while it is OPEN, writes the new hours onto the same
 * row. Chosen over a separate "reopen as draft" step because the week is
 * already a draft: OPEN is what a reject writes. What was missing was a
 * way to correct it, and the worker already knows how to file a week.
 * The same row keeps its id, so the rejection on the log still points at
 * it. Both signatures are cleared, because they were given on hours that
 * are no longer the hours.
 *
 * Pure. The route reads the facts and this decides.
 */

import { checkWeek, dayStanding, rungsToFile, type WorkRung, type FiledWeek } from '@/lib/consultant-portfolio'

const DAY_MS = 86_400_000

function toDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function label(iso: string): string {
  return new Date(toDay(iso)).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** Longest period one sheet may claim. A month is a monthly timesheet; more is a typing mistake. */
export const LONGEST_PERIOD_DAYS = 31

/** A week already on this contract. */
export interface OnFile extends FiledWeek {
  id: string
  status: string
  /** Billed, decided on or drawn from — anything that means the week has been acted on. */
  actedOn: boolean
}

export type Filing =
  | {
      ok: true
      /** The OPEN week this replaces, where the worker is filing it again. */
      replaces: string | null
      days: Record<string, number>
      totalHours: number
      says: string
    }
  | { ok: false; code: 'NOT_THIS_RUNG' | 'NOT_TAKING_HOURS' | 'BAD_PERIOD' | 'ALREADY_FILED' | 'VALIDATION'; says: string }

/**
 * Whether this rung is the worker's to file on.
 *
 * In a chain the hours go on the bottom rung, where the employer is, and
 * every rung above bills those same hours (`lib/work-chain`). A week
 * filed on a rung above is a second copy of one week.
 */
export function rungVerdict(rungs: WorkRung[], contractId: string, today: string): Filing | null {
  if (rungsToFile(rungs, today).some((r) => r.id === contractId)) return null
  const r = rungs.find((x) => x.id === contractId)
  const live = r && (r.state === 'IN_PROGRESS' || r.state === 'ENDED')
  return live
    ? {
        ok: false,
        code: 'NOT_THIS_RUNG',
        says: 'Your hours go on the contract with the firm that employs you, not this one. Choose that placement.',
      }
    : { ok: false, code: 'NOT_TAKING_HOURS', says: 'This placement is not taking hours. Ask the firm that employs you.' }
}

/**
 * Whether this period, with these hours, may be written on this contract.
 *
 * The period is the claim: a day inside it is a day no other week may
 * carry, whether or not it has hours on it. So the period itself has to
 * have happened and sit inside the placement, and may not overlap another
 * week — and then `checkWeek` judges the hours day by day.
 */
export function mayFile(input: {
  periodStart: string
  periodEnd: string
  hours: Record<string, number | string | null | undefined>
  contract: { startDate: string; endDate: string | null }
  onFile: OnFile[]
  today: string
}): Filing {
  const { periodStart, periodEnd, contract, today } = input
  if (!/^\d{4}-\d{2}-\d{2}/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}/.test(periodEnd)) {
    return { ok: false, code: 'BAD_PERIOD', says: 'The week needs a first and a last day.' }
  }
  const from = toDay(periodStart)
  const to = toDay(periodEnd)
  if (to < from) {
    return { ok: false, code: 'BAD_PERIOD', says: `The week ends on ${label(periodEnd)}, before it starts on ${label(periodStart)}.` }
  }
  if ((to - from) / DAY_MS + 1 > LONGEST_PERIOD_DAYS) {
    return { ok: false, code: 'BAD_PERIOD', says: `One sheet covers at most ${LONGEST_PERIOD_DAYS} days. Send the hours a week at a time.` }
  }

  // Filing again over a week sent back: that week is the one being
  // written, so its own days are not "already filed" against itself.
  const same = input.onFile.find((w) => w.periodStart.slice(0, 10) === periodStart.slice(0, 10))
  if (same && (same.status !== 'OPEN' || same.actedOn)) {
    return {
      ok: false,
      code: 'ALREADY_FILED',
      says:
        same.status === 'OPEN'
          ? `The week of ${label(periodStart)} has already been acted on, so it cannot be filed again. Ask the firm that employs you.`
          : `The week of ${label(periodStart)} is already sent. If it is wrong, ask for it to be returned, then file it again.`,
    }
  }
  const others: FiledWeek[] = input.onFile
    .filter((w) => w !== same)
    .map((w) => ({ periodStart: w.periodStart.slice(0, 10), periodEnd: w.periodEnd.slice(0, 10) }))

  // Every day of the period, not only the ones with hours: the period is
  // what claims them. The same sentences checkWeek gives about a day.
  const days: string[] = []
  for (let d = from; d <= to; d += DAY_MS) days.push(fromDay(d))
  for (const day of days) {
    const standing = dayStanding(day, contract, others, today)
    if (standing === 'OPEN') continue
    const says =
      standing === 'FUTURE'
        ? `${label(day)} has not happened yet. Send the week once its days are over, or end it on ${label(today)}.`
        : standing === 'BEFORE_START'
          ? `${label(day)} is before your placement starts on ${label(contract.startDate)}. Start the week on ${label(contract.startDate)}.`
          : standing === 'AFTER_END'
            ? `${label(day)} is after your placement ended on ${label(contract.endDate!)}. End the week on ${label(contract.endDate!)}.`
            : `${label(day)} is already on a week you filed.`
    return { ok: false, code: standing === 'ALREADY_FILED' ? 'ALREADY_FILED' : 'VALIDATION', says }
  }

  const check = checkWeek({
    week: { periodStart, periodEnd, days, label: `${label(periodStart)} – ${label(periodEnd)}` },
    hours: input.hours,
    contract,
    filed: others,
    today,
  })
  if (!check.ok) return { ok: false, code: 'VALIDATION', says: check.says }

  return {
    ok: true,
    replaces: same?.id ?? null,
    days: check.days!,
    totalHours: check.totalHours!,
    says: check.says,
  }
}
