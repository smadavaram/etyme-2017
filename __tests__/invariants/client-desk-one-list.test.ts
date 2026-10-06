import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { deskCounts, deskHeadline, deskItems, onSiteSub } from '@/app/dashboard/program/needs-you'
import { filledSays } from '@/app/dashboard/requisitions/facts'
import { says as overtimeTerms } from '@/lib/overtime'
import { formatDayLong } from '@/lib/format-date'
import { submissionStatusWord } from '@/app/dashboard/submissions/words'

/**
 * What the client tester's walk of Northbend Athletic (2026-10-03) still
 * found after the first round of fixes, re-checked on 2026-10-06 against
 * the tip with the Sunday week and the one date formatter in it.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

// ── The program dashboard: one list, one count (1.1 / 6.1) ──────────

describe('The headline and the box under it read one list', () => {
  const startingSoon = [
    { contractId: 'c1', person: { name: 'Samuel Adeyinka' }, vendor: { name: 'Brightmoor' },
      paperwork: { outcome: 'BLOCK' as const, says: 'Samuel cannot start without proof of right to work.', fix: 'Get it on file, then start him.' } },
    { contractId: 'c2', person: { name: 'Mei-Lin Chao' }, vendor: { name: 'Pinnacle' },
      paperwork: { outcome: 'WARN' as const, says: 'No background check on file.', fix: null } },
    { contractId: 'c3', person: { name: 'Rajesh Iyer' }, vendor: { name: 'Brightmoor' },
      paperwork: { outcome: 'PASS' as const, says: '', fix: null } },
  ]
  const vendors = [
    { id: 'v1', name: 'Wrenfield Technical', agreement: false, headcount: 2 },
    { id: 'v2', name: 'Computer Systems', agreement: true, headcount: 4 },
    { id: 'v3', name: 'Pinnacle', headcount: 1 },
  ]

  it('the box draws every start paperwork will refuse and every supplier with no agreement, so the headline counts exactly its rows', () => {
    const items = deskItems({ startingSoon, vendors })
    const counts = deskCounts({ decisions: [], startingSoon, vendors })
    expect(items.map((i) => i.who)).toEqual(['Samuel Adeyinka — through Brightmoor', 'Wrenfield Technical'])
    expect(deskHeadline(counts).total).toBe(items.length)
    expect(deskHeadline(counts).says).toMatch(/^2 things need you\./)
  })

  it('with one decision in the queue the headline counts it and the two rows, three in all', () => {
    const counts = deskCounts({ decisions: [{ type: 'TIMESHEET_APPROVAL' }], startingSoon, vendors })
    expect(deskHeadline(counts).total).toBe(1 + deskItems({ startingSoon, vendors }).length)
  })

  it('a start that only warns is not a row, because it refuses nobody', () => {
    expect(deskItems({ startingSoon, vendors }).some((i) => i.who.startsWith('Mei-Lin'))).toBe(false)
  })

  it('a supplier whose agreement was never read is not a row, because an unknown is not a finding', () => {
    expect(deskItems({ startingSoon, vendors }).some((i) => i.who === 'Pinnacle')).toBe(false)
  })

  it('each row says what is wrong and what to do, and opens the place to do it', () => {
    const [start, agreement] = deskItems({ startingSoon, vendors })
    expect(start.says).toBe('Samuel cannot start without proof of right to work. Get it on file, then start him.')
    expect(start.href).toBe('/dashboard/placements/c1')
    expect(agreement.says).toBe('2 people are on site through Wrenfield Technical, and no agreement with them is on file. Put one on file.')
    expect(agreement.href).toBe('/dashboard/program/agreements')
  })

  it('the box says nothing is waiting only when the headline says nothing needs you', () => {
    const page = src('src/app/dashboard/program/page.tsx')
    expect(page).toContain('queue.length === 0 && others.length === 0')
    expect(page).toContain('deskItems({ startingSoon: data.startingSoon, vendors: data.vendors })')
  })
})

describe('The On site tile says what it counts (1.3)', () => {
  it('it counts people working today and names how many more are signed and not started', () => {
    expect(onSiteSub(1)).toBe('working today; 1 more signed, not started')
    expect(onSiteSub(0)).toBe('working today')
    expect(src('src/app/dashboard/program/page.tsx')).toContain('sub={onSiteSub(s.notStarted ?? 0)}')
  })
})

// ── The job request after the award (3.10) ──────────────────────────

describe('A filled job request says who, at what rate, and when, and offers nothing to send', () => {
  it('it names who filled it, at the rate the award agreed, on the day the award wrote the line', () => {
    expect(filledSays({ status: 'FILLED', headcount: 1 }, [
      { status: 'PLACED', person: { name: 'Daniel Okafor' }, rate: 13_100, placedRate: 13_200, placedOn: '2026-10-26T15:04:00.000Z' },
      { status: 'NOT_SELECTED', person: { name: 'Rajesh Iyer' }, rate: 13_400, placedRate: null, placedOn: null },
    ])).toBe(
      'Filled by Daniel Okafor at $132/hr on Oct 26, 2026. It goes to no more suppliers, and everybody else who was put forward has been told.'
    )
  })

  it('the page reads the award day from the line the award wrote', () => {
    expect(src('src/app/api/requisitions/[id]/route.ts')).toContain('placedOn: placedOnFor.get(s.personId) ?? null')
  })

  it('a filled job draws no Send to suppliers box and no count of suppliers working it', () => {
    const page = src('src/app/dashboard/requisitions/[id]/page.tsx')
    expect(page).toContain("{r.status !== 'FILLED' && (")
    expect(page).toMatch(/\{jobOpen && \(\s*<>\s*<div><Lbl>Suppliers asked/)
  })
})

// ── Signing a week that went over (4.9) ─────────────────────────────

describe('The overtime question offers only what it can do', () => {
  it('the terms name time off in the bank only where the dialog offers it', () => {
    expect(overtimeTerms({ afterHours: 40, multiplierBps: 15_000 })).not.toMatch(/time off/)
    expect(overtimeTerms({ afterHours: 40, multiplierBps: 15_000 })).toBe(
      'Over 40 hours in a week, whoever approves the week decides: the usual rate or a premium (time and a half unless they say otherwise).'
    )
    expect(overtimeTerms({ afterHours: 40, multiplierBps: 15_000 }, { timeOff: true })).toMatch(/or time off in the bank\.$/)
    expect(src('src/app/dashboard/timesheets/decide-overtime.tsx')).toContain('{ timeOff: timeOffAllowed }')
  })

  it('the week is named by the Sunday it opens on', () => {
    expect(formatDayLong('2026-09-20', { weekday: true, year: false })).toBe('Sunday, September 20')
    expect(src('src/app/dashboard/timesheets/decide-overtime.tsx')).toContain('formatDayLong(iso, { weekday: true, year: false })')
  })
})

// ── Submissions (3.3) ───────────────────────────────────────────────

describe('Submissions says one word for one state', () => {
  it('the filters use the row’s own status words — "Turned down", never "Rejected" over a row reading "Turned down"', () => {
    const page = src('src/app/dashboard/submissions/page.tsx')
    expect(page).toContain("{ key: 'REJECTED', label: submissionStatusWord('REJECTED') }")
    expect(submissionStatusWord('REJECTED')).toBe('Turned down')
    expect(submissionStatusWord('INTERVIEW')).toBe('Interviewing')
  })

  it('the job column is headed with the reader’s own word for a job, and no row reads the code word Internal', () => {
    const page = src('src/app/dashboard/submissions/page.tsx')
    expect(page).toContain('label: jobWord,')
    expect(page).not.toContain("? 'Internal' :")
  })
})
