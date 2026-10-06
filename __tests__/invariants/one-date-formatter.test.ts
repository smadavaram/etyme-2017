/**
 * A screen prints a date through the one formatter.
 *
 * On 2026-10-06, 88 files under `src/` called `toLocaleDateString`
 * directly, in more than a dozen shapes: bare calls in the reader's own
 * locale and zone (so a day stored at midnight UTC printed as the day
 * before for anybody west of Greenwich), `en-GB` beside `en-US`, long
 * months beside short, with the year and without. Two screens could print
 * one `periodEnd` as two different days.
 *
 * Two doors, and only two:
 *
 *   · `lib/format-date` — a calendar day, read in UTC: "Oct 6, 2026".
 *   · `lib/when` — a moment, in somebody's own zone with the zone named:
 *     "Tue, Oct 6, 9:00 AM PDT", and the day a moment fell on for them.
 *
 * Every other file that formats a date itself is on the allowlist below,
 * as it stood the day the rule arrived. Each belongs to a domain that
 * migrates it in its own time. THE LIST MAY ONLY SHRINK: a file is taken
 * off when it moves to a door, and the second sentence fails if a file on
 * the list has already moved, so the list cannot carry a dead entry that
 * would let the same file slip back.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

/** The two doors. Nothing else may format a date itself. */
const DOORS = ['src/lib/format-date.ts', 'src/lib/when.ts']

/**
 * Files that formatted a date themselves on 2026-10-06 and have not moved
 * yet. Sorted. May only shrink — never add a file to it; use a door.
 */
const NOT_YET_MOVED: string[] = [
  'src/app/answer/[token]/page.tsx',
  'src/app/api/alumni/route.ts',
  'src/app/api/contracts/[id]/extend/route.ts',
  'src/app/api/contracts/[id]/rolloff/route.ts',
  'src/app/api/me/route.ts',
  'src/app/api/program/agreements/[id]/history/route.ts',
  'src/app/api/program/agreements/verdict.ts',
  'src/app/api/program/route.ts',
  'src/app/api/requirements/[id]/matches/asked.ts',
  'src/app/api/timesheets/filing.ts',
  'src/app/dashboard/alumni/page.tsx',
  'src/app/dashboard/ap/page.tsx',
  'src/app/dashboard/blacklist/page.tsx',
  'src/app/dashboard/compliance/page.tsx',
  'src/app/dashboard/consultants/page.tsx',
  'src/app/dashboard/contracts/page.tsx',
  'src/app/dashboard/conversations/page.tsx',
  'src/app/dashboard/decisions/page.tsx',
  'src/app/dashboard/documents/page.tsx',
  'src/app/dashboard/expenses/page.tsx',
  'src/app/dashboard/interviews/page.tsx',
  'src/app/dashboard/invitations/page.tsx',
  'src/app/dashboard/invoices/page.tsx',
  'src/app/dashboard/leads/page.tsx',
  'src/app/dashboard/my-data/page.tsx',
  'src/app/dashboard/my-work/page.tsx',
  'src/app/dashboard/notifications/page.tsx',
  'src/app/dashboard/payroll/commissions/page.tsx',
  'src/app/dashboard/payroll/page.tsx',
  'src/app/dashboard/people/[id]/page.tsx',
  'src/app/dashboard/people/page.tsx',
  'src/app/dashboard/privacy/page.tsx',
  'src/app/dashboard/program/agreements/standing.ts',
  'src/app/dashboard/program/page.tsx',
  'src/app/dashboard/program/seats/page.tsx',
  'src/app/dashboard/rate-history/page.tsx',
  'src/app/dashboard/requirements/[id]/matches.tsx',
  'src/app/dashboard/requirements/[id]/page.tsx',
  'src/app/dashboard/requirements/[id]/pile/page.tsx',
  'src/app/dashboard/requirements/page.tsx',
  'src/app/dashboard/requisitions/facts.ts',
  'src/app/dashboard/requisitions/page.tsx',
  'src/app/dashboard/rolloff/page.tsx',
  'src/app/dashboard/submissions/[id]/terms/page.tsx',
  'src/app/dashboard/submissions/page.tsx',
  'src/app/dashboard/submissions/words.ts',
  'src/app/dashboard/suppliers/page.tsx',
  'src/app/dashboard/texts/page.tsx',
  'src/app/dashboard/timesheets/decide-overtime.tsx',
  'src/app/dashboard/timesheets/page.tsx',
  'src/app/dashboard/timesheets/totals.ts',
  'src/components/thread.tsx',
  'src/lib/agreement-term.ts',
  'src/lib/award/hire-terms.ts',
  'src/lib/bench-filter.ts',
  'src/lib/bench-policy.ts',
  'src/lib/bench-stay.ts',
  'src/lib/billing-cascade.ts',
  'src/lib/census-page.ts',
  'src/lib/census.ts',
  'src/lib/consultant-portfolio.ts',
  'src/lib/document-stages.ts',
  'src/lib/interviews.ts',
  'src/lib/money/back-pay.ts',
  'src/lib/money/billed-elsewhere.ts',
  'src/lib/money/nothing-to-bill.ts',
  'src/lib/money/pay-change-notice.ts',
  'src/lib/money/pay-hours.ts',
  'src/lib/money/pay-line.ts',
  'src/lib/money/payers-acceptance.ts',
  'src/lib/notify/letters.ts',
  'src/lib/one-person.ts',
  'src/lib/overtime.ts',
  'src/lib/papering.ts',
  'src/lib/plain-date.ts',
  'src/lib/three-way-match.ts',
  'src/lib/timesheet-flag.ts',
  'src/lib/worker-classification.ts',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, full))
  }
  return out
}

/** Option names that only a date format asks for. */
const DATE_OPTION = /\b(month|day|year|weekday|dateStyle|timeStyle|hour|minute|timeZone)\s*:/

/**
 * Why a file formats a date itself, or nothing where it does not.
 * `toLocaleString` is also how a number gets its commas, so it counts
 * only where the receiver is a Date or the options are a date's.
 */
function formatsADate(src: string): string[] {
  const why: string[] = []
  if (/\.toLocaleDateString\(/.test(src)) why.push('toLocaleDateString')
  // `Intl.DateTimeFormatOptions` is a type, and formats nothing.
  if (/\bIntl\.DateTimeFormat\b(?!Options)/.test(src)) why.push('Intl.DateTimeFormat')
  const call = /\.toLocaleString\(/g
  let m: RegExpExecArray | null
  while ((m = call.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 60), m.index)
    const args = src.slice(m.index, m.index + 240).split(/\)\s*[;}`,]/)[0]
    const onADate =
      /new Date\([^()]*(\([^()]*\))?[^()]*\)\)?$/.test(before) ||
      /\b(at|date|when|day)\)?$/i.test(before) ||
      DATE_OPTION.test(args)
    if (onADate) { why.push('toLocaleString on a date'); break }
  }
  return why
}

const FILES = walk(join(ROOT, 'src')).sort()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('a screen prints a date through the one formatter', () => {
  it('the detector sees a date formatted by hand and leaves a number with commas alone', () => {
    expect(formatsADate("d.toLocaleDateString('en-US')")).toEqual(['toLocaleDateString'])
    expect(formatsADate('{new Date(m.createdAt).toLocaleString()}')).toEqual(['toLocaleString on a date'])
    expect(formatsADate("x.toLocaleString('en-US', { month: 'short', day: 'numeric' })")).toEqual(['toLocaleString on a date'])
    expect(formatsADate('new Intl.DateTimeFormat(\'en-US\').format(at)')).toEqual(['Intl.DateTimeFormat'])
    expect(formatsADate("`$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`")).toEqual([])
    expect(formatsADate('const opts: Intl.DateTimeFormatOptions = {}')).toEqual([])
  })

  it('a screen prints a date through the one formatter', () => {
    const allowed = new Set([...DOORS, ...NOT_YET_MOVED])
    const strays = FILES
      .map((f) => ({ f, why: formatsADate(read(f)) }))
      .filter(({ f, why }) => why.length > 0 && !allowed.has(f))
      .map(({ f, why }) => `${f} (${why.join(', ')})`)
    expect(
      strays,
      'these files format a date themselves. Print a calendar day with formatDay, formatDayLong, ' +
      'formatMonth or formatRange from lib/format-date, and a moment with momentFor or ' +
      'dayOfMomentFor from lib/when:\n  ' + strays.join('\n  '),
    ).toEqual([])
  })

  it('no file is added to the allowlist, and a file that has moved comes off it', () => {
    const moved = NOT_YET_MOVED.filter((f) => !existsSync(join(ROOT, f)) || formatsADate(read(f)).length === 0)
    expect(
      moved,
      'these files no longer format a date themselves. Take them off NOT_YET_MOVED so they cannot slip back:\n  ' +
      moved.join('\n  '),
    ).toEqual([])
  })

  it('the allowlist is kept sorted, so a file added to it shows up in review', () => {
    expect(NOT_YET_MOVED).toEqual([...NOT_YET_MOVED].sort())
    expect(new Set(NOT_YET_MOVED).size).toBe(NOT_YET_MOVED.length)
  })

  it('the allowlist only shrinks from the 78 files it held when the rule arrived', () => {
    // Raise this number and the review will ask why; lower it as files move.
    expect(NOT_YET_MOVED.length).toBeLessThanOrEqual(78)
  })

  it('the two doors exist and are the only files exempt', () => {
    for (const d of DOORS) expect(existsSync(join(ROOT, d)), d).toBe(true)
    expect(NOT_YET_MOVED.filter((f) => DOORS.includes(f))).toEqual([])
  })
})
