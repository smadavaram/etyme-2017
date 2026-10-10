/**
 * The dates a bill was asked for, as the bound on what it bills.
 *
 * ── The three weeks on a one-week bill ───────────────────────────────
 *
 * Found on the founder's lifecycle walk of 2026-09-28. `POST
 * /api/invoices/generate` took `periodStart` and `periodEnd` and used
 * them for one thing only: deciding which timesheets to LOAD — every
 * sheet that touched the window by as much as a day, which is right for
 * loading, because a week running 27 July to 2 August has days in both
 * months. It then priced each loaded sheet against the contract's whole
 * billing period, `periodFor(periodStart)`. On a monthly contract that
 * is the month. So a week that grazed the window on its last day was
 * billed whole, the header read "September 2026" over one week of work,
 * and the due date ran from the 30th.
 *
 * And a period asked for under any other name — `from`, `to`, `start`,
 * `period` — was not read at all. No filter, no refusal: the run billed
 * every signed week the engagement had, and the caller believed it had
 * billed one.
 *
 * ── What the window is ────────────────────────────────────────────────
 *
 * The contract still says what a period is (`lib/periods`). The dates
 * asked for narrow it and never widen it: a bill covers the part of ONE
 * contract period between the two dates, and a week crossing the edge
 * of that part follows the straddle rule a bill can record
 * (`billingStraddle` — whole where its last or first worked day falls), the
 * same rule a week crossing a month end follows. A part-period bill is
 * already a thing the three-way match accepts in words ("part of
 * August"); a bill spanning two periods is not, so dates running past
 * the end of the period are cut there and the bill says so.
 *
 * Pure. No database, so every branch is tested on fixed dates.
 */

import { periodFor, iso, type Period, type Terms } from '@/lib/periods'

/** What the caller asked for, read and checked. Null means "not said". */
export interface Asked {
  start: Date | null
  end: Date | null
}

export type ReadWindow =
  | ({ ok: true } & Asked)
  | { ok: false; field: string; says: string }

/**
 * Names a caller might reasonably use for a period that this route does
 * not read. Refused, because ignoring one bills every week there is.
 */
const NOT_READ = [
  'from', 'to', 'start', 'end', 'period', 'periodFrom', 'periodTo',
  'week', 'weekOf', 'weekStart', 'weekEnd', 'startDate', 'endDate', 'dateFrom', 'dateTo',
] as const

function calendarDay(raw: unknown): Date | null {
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null
  const s = raw instanceof Date ? raw.toISOString() : raw.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s)
  if (!m) return null
  const out = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // 2026-02-30 is not a day, and Date would quietly make it 2 March.
  if (iso(out) !== `${m[1]}-${m[2]}-${m[3]}`) return null
  return out
}

/** Read `periodStart` and `periodEnd` off a request body, or say why not. */
export function readWindow(body: Record<string, unknown> | null | undefined): ReadWindow {
  const b = body ?? {}

  const stray = NOT_READ.find((k) => b[k] !== undefined && b[k] !== null && b[k] !== '')
  if (stray) {
    return {
      ok: false,
      field: stray,
      says:
        `This bill was asked for with "${stray}", which the generator does not read — ` +
        'so it would have billed every signed week rather than the ones meant. ' +
        'Give the dates as periodStart and periodEnd (YYYY-MM-DD), or leave both out ' +
        'to bill the latest billing period.',
    }
  }

  const out: Asked = { start: null, end: null }
  for (const field of ['periodStart', 'periodEnd'] as const) {
    const raw = b[field]
    if (raw === undefined || raw === null || raw === '') continue
    const day = calendarDay(raw)
    if (!day) {
      return {
        ok: false,
        field,
        says: `"${String(raw)}" is not a date this bill can be bounded by. Give ${field} as YYYY-MM-DD.`,
      }
    }
    if (field === 'periodStart') out.start = day
    else out.end = day
  }

  if (out.start && out.end && out.end < out.start) {
    return {
      ok: false,
      field: 'periodEnd',
      says: `The dates asked for end on ${iso(out.end)}, before it starts on ${iso(out.start)}.`,
    }
  }

  return { ok: true, ...out }
}

export interface BillingWindow {
  /** What this bill covers: the header's period, and what every sheet is judged against. */
  window: Period
  /** The contract period the window sits in. */
  contractPeriod: Period
  /** True where the window is less than the whole contract period. */
  narrowed: boolean
  /** Said where the dates asked for ran past the contract period and were cut. */
  clipped: string | null
}

/**
 * The window a bill covers.
 *
 * With no dates, the contract period containing the latest work — what
 * the generator has always billed. With dates, the part of the contract
 * period containing the first of them that lies between them.
 */
export function billingWindow(asked: Asked, latestWork: Date, terms: Terms): BillingWindow {
  const on = asked.start ?? asked.end ?? latestWork
  const cp = periodFor(on, terms)

  if (!asked.start && !asked.end) {
    return { window: cp, contractPeriod: cp, narrowed: false, clipped: null }
  }

  const start = asked.start && asked.start > cp.start ? asked.start : cp.start
  const end = asked.end && asked.end < cp.end ? asked.end : cp.end

  const clipped =
    asked.end && asked.end > cp.end
      ? `The dates asked for run past the end of ${cp.label} on ${iso(cp.end)}. One bill covers ` +
        'one billing period, so the days after it bill on the next one.'
      : null

  const whole = start.getTime() === cp.start.getTime() && end.getTime() === cp.end.getTime()

  return {
    window: whole ? cp : { start, end, label: `${iso(start)} to ${iso(end)}, part of ${cp.label}` },
    contractPeriod: cp,
    narrowed: !whole,
    clipped,
  }
}

/** Whether a day falls inside the window, read as a calendar day in UTC. */
export function inWindow(when: Date, window: Period): boolean {
  const day = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate())
  return day >= window.start.getTime() && day <= window.end.getTime()
}
