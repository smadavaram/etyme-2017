import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flaggedFirst, weekFlag } from '@/lib/timesheet-flag'

/**
 * The client's timesheet page says "Flagged entries are shown first", and
 * the list was ordered by date alone: Northbend's 44-hour week sat third
 * behind two plain ones.
 */

const d = (iso: string) => new Date(iso + 'T00:00:00Z')
const row = (id: string, start: string, flag: string | null) => ({ id, periodStart: d(start), flag })

describe('flagged weeks are read first', () => {
  it('a flagged week is listed before every unflagged one', () => {
    const out = flaggedFirst([
      row('plain-new', '2026-09-21', null),
      row('plain-mid', '2026-09-14', null),
      row('over-hours', '2026-09-07', '44h claimed on a 40h-a-week role.'),
      row('plain-old', '2026-08-31', null),
    ])
    expect(out.map((r) => r.id)).toEqual(['over-hours', 'plain-new', 'plain-mid', 'plain-old'])
  })

  it('within the flagged and within the plain, the newest week comes first', () => {
    const out = flaggedFirst([
      row('f-old', '2026-08-31', 'x'), row('p-old', '2026-08-31', null),
      row('f-new', '2026-09-21', 'y'), row('p-new', '2026-09-21', null),
    ])
    expect(out.map((r) => r.id)).toEqual(['f-new', 'f-old', 'p-new', 'p-old'])
  })

  it('a week over the role’s hours is flagged, in a sentence', () => {
    expect(weekFlag({ hours: 44, hoursPerWeek: 40, periodEnd: d('2026-09-13'), contractEnd: null, anomalyScore: null, anomalyReason: null }))
      .toBe('44h claimed on a 40h-a-week role.')
  })

  it('a week running past the contract’s last day is flagged', () => {
    expect(weekFlag({ hours: 30, hoursPerWeek: 40, periodEnd: d('2026-09-13'), contractEnd: d('2026-09-10'), anomalyScore: null, anomalyReason: null }))
      .toBe("The week runs past the contract's last day, Sep 10.")
  })

  it('a week the door flagged when it was filed — a day over twelve hours — stays flagged', () => {
    expect(weekFlag({ hours: 38, hoursPerWeek: 40, periodEnd: d('2026-09-13'), contractEnd: null, anomalyScore: 30, anomalyReason: 'Day with 14 hours exceeds 12-hour threshold' }))
      .toBe('Day with 14 hours exceeds 12-hour threshold')
  })

  it('a plain week carries no flag', () => {
    expect(weekFlag({ hours: 40, hoursPerWeek: 40, periodEnd: d('2026-09-13'), contractEnd: null, anomalyScore: null, anomalyReason: null })).toBeNull()
  })

  it('the timesheet list is ordered flagged-first across every page, not within one', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/route.ts'), 'utf8')
    const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
    expect(get).toMatch(/const ranked = flaggedFirst\(/)
    expect(get).toMatch(/ranked\.slice\(\(page - 1\) \* limit, page \* limit\)/)
    expect(get).not.toMatch(/orderBy: \{ periodStart: 'desc' \}/)
  })
})
