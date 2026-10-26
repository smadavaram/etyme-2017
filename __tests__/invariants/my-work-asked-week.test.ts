import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { askedWeek } from '@/app/dashboard/my-work/asked-week'

/**
 * Ask Etyme's "File my week" card links to `/dashboard/my-work?week=…`.
 * The page must open its filing form on that week, a Sunday-to-Saturday
 * week, and fall back to the current one when the value says nothing.
 */
const wk = (periodStart: string) => ({ periodStart, periodEnd: '', days: [], label: periodStart })
const filing = [
  // The current week first, the way /api/me/work lists them.
  { contractId: 'c1', weeks: [wk('2026-10-25'), wk('2026-09-13'), wk('2026-09-06')] },
]

describe('Your work opens on the week a link names', () => {
  it('a worker sent to file the week of Sep 13 lands on that week, not on the current one', () => {
    expect(askedWeek(filing, '2026-09-13')).toEqual({ contractId: 'c1', periodStart: '2026-09-13' })
  })

  it('any day inside the Sunday-to-Saturday week names that week', () => {
    expect(askedWeek(filing, '2026-09-19')).toEqual({ contractId: 'c1', periodStart: '2026-09-13' })
    expect(askedWeek(filing, '2026-09-20')).toBeNull()
  })

  it('a week that opens midweek, on the day the placement started, is still found by its Sunday', () => {
    const started = [{ contractId: 'c2', weeks: [wk('2026-09-16')] }]
    expect(askedWeek(started, '2026-09-13')).toEqual({ contractId: 'c2', periodStart: '2026-09-16' })
  })

  it('the week is found on whichever placement has it open', () => {
    const two = [{ contractId: 'a', weeks: [wk('2026-10-25')] }, { contractId: 'b', weeks: [wk('2026-09-13')] }]
    expect(askedWeek(two, '2026-09-13')).toEqual({ contractId: 'b', periodStart: '2026-09-13' })
  })

  it('a missing, malformed or impossible date falls back to the current week', () => {
    for (const v of [null, undefined, '', 'last-week', '2026-9-13', '2026-02-30', '2026-09-13T00:00']) {
      expect(askedWeek(filing, v)).toBeNull()
    }
  })

  it('a week with nothing open to file falls back to the current week', () => {
    expect(askedWeek(filing, '2026-08-02')).toBeNull()
  })

  it('the page reads ?week= and hands it to the filing form', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/my-work/page.tsx'), 'utf8')
    expect(src).toMatch(/get\('week'\)/)
    expect(src).toMatch(/askedWeek\(filing, asked\)/)
    expect(src).toMatch(/<FileYourWeek filing=\{data\.filing\} asked=\{asked\}/)
  })
})
