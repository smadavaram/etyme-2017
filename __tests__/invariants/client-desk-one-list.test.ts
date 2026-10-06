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
    expect(page).toContain('deskItems({ startingSoon: data.heldStarts ?? data.startingSoon, vendors: data.vendors })')
  })

  it('every start paperwork will refuse is counted, not only the five nearest the panel shows', () => {
    const route = src('src/app/api/program/route.ts')
    expect(route).not.toContain(".filter((c) => c.state !== 'IN_PROGRESS').slice(0, 5)")
    expect(route).toContain('startingSoon: cleared.slice(0, 5)')
    expect(route).toContain("heldStarts: cleared.filter((c) => c.paperwork.outcome === 'BLOCK')")
    const page = src('src/app/dashboard/program/page.tsx')
    expect(page.match(/startingSoon: data\.heldStarts \?\? data\.startingSoon/g)?.length).toBe(3)
  })

  it('the panel shows the nearest starts first, by the day they start', () => {
    expect(src('src/app/api/program/route.ts')).toContain('.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())')
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

// ── The approval panel says the money sentence once (2.6) ───────────

import { withoutRepeat } from '@/app/dashboard/requisitions/facts'

describe('The approval panel says why a job went to a person once', () => {
  it('a desk row drops the routing sentence the checks already printed, even where the figures were re-run since', () => {
    const recorded = 'Sent for a sign-off because about $180,000, estimated from $125/hr at 40 hours a week for 9 months is over the limit'
    const today = 'Sent for a sign-off because about $268,800, estimated from $140/hr at 40 hours a week for 12 months is over the limit'
    expect(withoutRepeat(`The final word on Apps' spend — ${recorded}`, [today])).toBe('The final word on Apps\' spend')
    expect(withoutRepeat(`Technology — over $80k: ${recorded} — state a budget and the limit is checked against that instead`, [today]))
      .toBe('Technology — over $80k')
  })

  it('the shorter wording is said once too: "About $180,000 is over the $80,000 limit, so Dana Whitfield signs it."', () => {
    const now = 'About $268,800 is over the $80,000 limit, so Dana Whitfield signs it. State a budget and the limit is checked against that.'
    const recorded = 'About $180,000 is over the $80,000 limit, so Dana Whitfield signs it. State a budget and the limit is checked against that.'
    expect(withoutRepeat(`The final word on Apps' spend — ${recorded}`, [now])).toBe('The final word on Apps\' spend')
    expect(withoutRepeat(`Technology — over $80k: ${recorded}`, [now])).toBe('Technology — over $80k')
    expect(withoutRepeat(recorded, [now])).toBe('')
  })

  it('a desk row keeps its routing sentence where the panel printed none', () => {
    const recorded = 'Sent for a sign-off because about $180,000 is over the limit'
    expect(withoutRepeat(`The final word on Apps' spend — ${recorded}`, ['Within plan: 4 of 6 approved heads in use'])).toBe(`The final word on Apps' spend — ${recorded}`)
  })
})

// ── The Submit dialog offers each job once (6.11) ───────────────────

import { requirementForReader, type RequirementRow } from '@/app/api/requirements/visible'
import { onePerJob } from '@/lib/internal-moves'

describe('The Submit dialog offers a client’s job once, never the firm’s own resold copy beside it', () => {
  const row = (over: Partial<RequirementRow>): RequirementRow => ({
    id: 'r', title: 'HCM integration lead', skills: [], location: null, billMin: null, billMax: null,
    months: null, startDate: null, status: 'OPEN', approvalState: 'AUTO_APPROVED', archivedAt: null,
    headcount: 1, cancelReason: null, source: null, marginClass: null, rateVisible: false,
    endClientVisible: false, companyId: 'client', company: { id: 'client', name: 'Northbend Athletic' },
    endClientCompany: null, _count: { submissions: 0, matches: 0, invitations: 0 },
    createdAt: new Date('2026-10-01T00:00:00Z'), mirroredFromId: null, ...over,
  })

  it('the job list tells a firm which of its own jobs is a copy, and tells nobody else', () => {
    const copy = row({ id: 'copy', companyId: 'teleworld', company: { id: 'teleworld', name: 'Teleworld' }, mirroredFromId: 'orig' })
    expect(requirementForReader(copy, 'teleworld').mirroredFromId).toBe('orig')
    expect(requirementForReader(copy, 'someone-else').mirroredFromId).toBeNull()
  })

  it('the copy is dropped where the original is in the list, and kept where it is not', () => {
    const orig = { id: 'orig', mirroredFromId: null }
    const copy = { id: 'copy', mirroredFromId: 'orig' }
    expect(onePerJob([orig, copy]).map((r) => r.id)).toEqual(['orig'])
    expect(onePerJob([copy]).map((r) => r.id)).toEqual(['copy'])
    expect(src('src/app/dashboard/submissions/page.tsx')).toContain('onePerJob<RequirementOption & { mirroredFromId: string | null }>(')
  })

  it('the people offered are the ones this firm has staffed — a line it sells or a submission it made — never somebody else’s history', () => {
    const route = src('src/app/api/submissions/own-people/route.ts')
    expect(route).toContain("where: { personId: { in: ids }, companyId: firmId }")
    expect(route).toContain("where: { personId: { in: ids }, fromCompanyId: firmId }")
  })
})

// ── A match's confidence says what it measures (5.4) ────────────────

import { confidenceWords } from '@/app/dashboard/requirements/[id]/confidence-words'

describe('A match’s confidence chip says what confidence measures', () => {
  it('it says how many facts are not known where the match lists them, never a bare "Moderate"', () => {
    expect(confidenceWords('MODERATE', 'Missing: availability date').text).toBe('Moderate confidence · 1 not known')
    expect(confidenceWords('LOW', 'Missing: location, work authorization, rate expectations').text).toBe('Low confidence · 3 not known')
  })

  it('a match with nothing missing says so', () => {
    expect(confidenceWords('HIGH', null).text).toBe('High confidence · nothing missing')
  })

  it('where the unknowns are sentences it gives no count it cannot stand behind', () => {
    expect(confidenceWords('MODERATE', 'where this candidate is based; whether related experience transfers: SAP FI; SAP CO').text)
      .toBe('Moderate confidence · some facts not known')
  })

  it('the matches list draws the chip from these words', () => {
    expect(src('src/app/dashboard/requirements/[id]/matches.tsx')).toContain('confidenceWords(m.confidence, m.unknowns)')
  })
})
