import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lineFor } from '@/lib/overtime'
import { flaggedWeekSays, weekFlag } from '@/lib/timesheet-flag'
import { waitingOnSays } from '@/app/api/requisitions/words'
import { askState, askedAlreadySays, oneLinePerAsk, ASK_AGAIN_AFTER_DAYS } from '@/app/api/requirements/[id]/matches/asked'
import { listTotals, type TotalsRow } from '@/app/dashboard/timesheets/totals'
import { sourceWord } from '@/app/dashboard/requirements/words'
import { jobFacts, missingForApproval, missingSays } from '@/app/dashboard/requisitions/facts'

/**
 * The arithmetic and the words under the Northbend Athletic walk of
 * 2026-09-30. The routes are walked in `__integration__/client-desk-walk`;
 * these hold on every commit, with no database.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the line a week is judged against', () => {
  it('a contract’s own overtime line always wins over the job’s hours', () => {
    const p = lineFor({ overtimeAfterHours: 45, overtimeMultiplierBps: 20_000 }, { hoursPerWeek: 40 }, { stillToSign: true, decided: false })
    expect(p).toEqual({ afterHours: 45, multiplierBps: 20_000 })
  })

  it('a contract with no line is judged against the job’s hours while the week waits to be signed', () => {
    expect(lineFor({ overtimeAfterHours: null }, { hoursPerWeek: 30 }, { stillToSign: true, decided: false }).afterHours).toBe(30)
  })

  it('a job that states no hours is judged against forty, the same number the flag uses', () => {
    expect(lineFor(null, null, { stillToSign: true, decided: false }).afterHours).toBe(40)
    expect(weekFlag({ hours: 41, hoursPerWeek: null, periodEnd: new Date('2026-09-26'), contractEnd: null, anomalyScore: null, anomalyReason: null }))
      .toBe('41h claimed on a 40h-a-week job.')
  })

  it('a week signed before anybody asked keeps its straight time', () => {
    expect(lineFor({ overtimeAfterHours: null }, { hoursPerWeek: 40 }, { stillToSign: false, decided: false }).afterHours).toBeNull()
  })

  it('a week decided against the job’s hours is read against them once signed', () => {
    expect(lineFor({ overtimeAfterHours: null }, { hoursPerWeek: 40 }, { stillToSign: false, decided: true }).afterHours).toBe(40)
  })
})

describe('a flagged week is signed with a reason', () => {
  it('the refusal says what is wrong with the week, then what to do', () => {
    expect(flaggedWeekSays('44h claimed on a 40h-a-week job.')).toBe(
      '44h claimed on a 40h-a-week job. Say why this week is right before you sign it. The reason goes on your signature.'
    )
  })

  it('the approval route asks for the reason before the overtime question and before anything is written', () => {
    const route = read('src/app/api/timesheets/[id]/approve/route.ts')
    const at = (n: string) => {
      const i = route.indexOf(n)
      expect(i, n).toBeGreaterThan(-1)
      return i
    }
    expect(at("code: 'FLAG_NEEDS_REASON'")).toBeLessThan(at("code: 'OVERTIME_UNDECIDED'"))
    expect(at("code: 'FLAG_NEEDS_REASON'")).toBeLessThan(at('workAssertion.create'))
  })

  it('the tick on a flagged row on the Timesheets page opens the reason, and a bulk press never signs a flagged week', () => {
    const page = read('src/app/dashboard/timesheets/page.tsx')
    expect(page).toContain('if (flagged?.flag && !note) {')
    expect(page).toContain("body.error?.code === 'FLAG_NEEDS_REASON'")
    expect(page).toContain('ts.mayApprove && !ts.flag')
  })
})

describe('who a job request waits on is said once', () => {
  const row = (rank: number, outcome: string, name: string | null) => ({ rank, outcome, approver: name ? { name } : null })

  it('two desks signing alongside at one rank are both named, in the same order wherever the rows came from', () => {
    const a = [row(1, 'PENDING', 'Dana Whitfield'), row(1, 'PENDING', 'Camille Whitford')]
    expect(waitingOnSays(a)).toBe('Waiting on Camille Whitford and Dana Whitfield')
    expect(waitingOnSays([...a].reverse())).toBe(waitingOnSays(a))
  })

  it('only the rank in play is named — a desk that signs after it is not waited on yet', () => {
    expect(waitingOnSays([row(1, 'APPROVED', 'Meera Krishnan'), row(2, 'PENDING', 'Camille Whitford'), row(3, 'PENDING', 'Dana Whitfield')]))
      .toBe('Waiting on Camille Whitford')
  })

  it('a desk nobody is named for is said as one, and a settled chain waits on nobody', () => {
    expect(waitingOnSays([row(1, 'PENDING', null)])).toBe('Waiting on a desk nobody is named for')
    expect(waitingOnSays([row(1, 'APPROVED', 'Dana Whitfield')])).toBeNull()
  })

  it('the list card and the job request page both print the route’s sentence rather than picking a pending row', () => {
    expect(read('src/app/dashboard/requisitions/page.tsx')).toContain('{r.waitingOn && !mine && (')
    expect(read('src/app/dashboard/requisitions/[id]/page.tsx')).toContain('{data.waitingOn && !mine && (')
  })
})

describe('an ask is made once and said once', () => {
  const at = new Date('2026-09-30T16:00:00Z')
  const day = 86_400_000

  it('a match never asked for offers the ask', () => {
    expect(askState(null, at)).toBeNull()
  })

  it('just after asking, the row says when and offers no second ask', () => {
    const st = askState(at, new Date(at.getTime() + 60_000))!
    expect(st.says).toBe('Asked on Sep 30')
    expect(st.mayAskAgain).toBe(false)
    expect(st.againFrom).toBe(new Date(at.getTime() + 3 * day).toISOString())
  })

  it(`"Ask again" is offered ${ASK_AGAIN_AFTER_DAYS} days after the last ask, not before`, () => {
    expect(askState(at, new Date(at.getTime() + 3 * day - 1))!.mayAskAgain).toBe(false)
    expect(askState(at, new Date(at.getTime() + 3 * day))!.mayAskAgain).toBe(true)
  })

  it('a repeat inside the window is refused in a sentence that names the day it may be asked again', () => {
    expect(askedAlreadySays({ firm: 'Pinnacle Resourcing', person: 'Tamsin Okoro', at })).toBe(
      'You asked Pinnacle Resourcing for Tamsin Okoro on Sep 30. Give them time to answer — you can ask again from Oct 3.'
    )
  })

  it('the same person asked of the same supplier for the same job is one line, from the first time it was asked', () => {
    const md = { personId: 'p1', requirementId: 'r1', supplierId: 's1' }
    const rows = [
      { id: 'c', createdAt: new Date(at.getTime() + 2000), metadata: md },
      { id: 'b', createdAt: new Date(at.getTime() + 1000), metadata: md },
      { id: 'a', createdAt: at, metadata: md },
      { id: 'x', createdAt: at, metadata: { ...md, personId: 'p2' } },
    ]
    expect(oneLinePerAsk(rows).map((r) => r.id)).toEqual(['a', 'x'])
  })
})

describe('the timesheet tiles say what they add up', () => {
  const week = (over: Partial<TotalsRow>): TotalsRow => ({
    periodStart: '2026-09-20T00:00:00.000Z', totalHours: 40, status: 'APPROVED', flag: null,
    waitingOnYou: false, valueCents: 400_000, ...over,
  })

  it('the hours are labelled with how many weeks and since when, never as "this period"', () => {
    const t = listTotals([week({ periodStart: '2026-02-23T00:00:00.000Z' }), week({ totalHours: 44 })], { onServer: 2, payBasis: false })
    expect(t.hours).toBe(84)
    expect(t.hoursSays).toBe('all 2 weeks on this list, since Feb 23, 2026')
  })

  it('a list cut at a page says it is the weeks shown, of how many', () => {
    expect(listTotals([week({})], { onServer: 60, payBasis: false }).hoursSays).toBe('the 1 week shown of 60, since Sep 20, 2026')
  })

  it('the flagged tile counts exactly the weeks that carry the warning mark', () => {
    const t = listTotals(
      [week({ flag: '45h claimed on a 40h-a-week job.', status: 'SUBMITTED', waitingOnYou: true }),
       week({ flag: '44h claimed on a 40h-a-week job.', status: 'SUBMITTED', waitingOnYou: true }),
       week({ flag: 'A day over twelve hours.' }),
       week({})],
      { onServer: 4, payBasis: false }
    )
    expect(t.flagged).toBe(3)
    expect(t.flaggedSays).toBe('2 waiting on you')
  })

  it('the approved value says it is every approved week listed, and leaves out a week nobody can price', () => {
    const t = listTotals([week({ periodStart: '2026-02-23T00:00:00.000Z' }), week({ valueCents: null })], { onServer: 2, payBasis: false })
    expect(t.approvedValueCents).toBe(400_000)
    expect(t.approvedSays).toBe('billable, from 2 weeks approved since Feb 23, 2026; 1 more with no rate on file')
  })

  it('the page no longer says "this period" or "none detected" over rows with a warning', () => {
    const page = read('src/app/dashboard/timesheets/page.tsx')
    expect(page).not.toContain('>this period<')
    expect(page).not.toContain("'none detected'")
  })
})

describe('the job request pages speak plain words and carry the matches', () => {
  it('the job request the client’s menu opens shows the matches for that job', () => {
    const page = read('src/app/dashboard/requisitions/[id]/page.tsx')
    expect(page).toContain("import { JobMatches } from '../../requirements/[id]/matches'")
    expect(page).toContain('<JobMatches')
  })

  it('the matches page says Job requests, not Requirements, and has no pile, no Distribute and no raw source code', () => {
    const page = read('src/app/dashboard/requirements/[id]/page.tsx')
    expect(page).not.toContain('← Requirements')
    expect(page).not.toContain('The pile')
    expect(page).not.toContain('Distribute →')
    expect(page).not.toContain('label="Source"')
    expect(page).toContain('← {listWord}')
  })

  it('how a job request came in is said in words, never as the column’s code', () => {
    expect(sourceWord('MANUAL')).toBe('Typed in here')
    expect(sourceWord('EMAIL')).toBe('From an email')
    expect(sourceWord(null)).toBe('Came in another way')
  })
})

describe('the dashboard promises no speed and counts what it says', () => {
  it('the job requests tile promises no speed', () => {
    const page = read('src/app/dashboard/program/page.tsx')
    expect(page).not.toContain('within the hour')
    expect(page).not.toMatch(/first good candidate in \$\{/)
  })

  it('the headline names the contractors not started yet, so it adds up to the Contractors tab', () => {
    const page = read('src/app/dashboard/program/page.tsx')
    expect(page).toContain('not started yet')
    expect(page).toContain("count: (s.contractors ?? data.contractors.length) || undefined")
  })
})

describe('a job request says what the job is before anybody approves it', () => {
  const job = {
    headcount: 1, months: 6, hoursPerWeek: 40, location: 'Tualatin, OR', billMin: 9_000, billMax: 11_500,
    startDate: null, neededBy: '2026-11-02T00:00:00.000Z', budgetCents: 12_000_000,
    owner: { id: 'p1', name: 'Marcus Oyelaran' }, raisedBy: { id: 'p1', name: 'Marcus Oyelaran' },
    orgUnit: { name: 'Technology' }, costCenter: { code: 'APPS-4100', name: 'Apps' },
  }

  it('a job request shows when, how long, the hours, where, the pay range, how many and whose need it is', () => {
    const f = Object.fromEntries(jobFacts(job).map((x: any) => [x.label, x.value]))
    expect(f['Starts']).toBe('Needed by Nov 2, 2026')
    expect(f['How long']).toBe('6 months')
    expect(f['Hours a week']).toBe('40')
    expect(f['Where']).toBe('Tualatin, OR')
    expect(f['Pay range']).toMatch(/^\$90.*–\$115.* an hour$/)
    expect(f['How many']).toBe('1 person')
    expect(f['Hiring manager']).toBe('Marcus Oyelaran')
    expect(f['Cost center']).toBe('Apps (APPS-4100)')
  })

  it('a fact the job request does not state says so, rather than leaving a blank', () => {
    const f = Object.fromEntries(jobFacts({ headcount: 2 }).map((x: any) => [x.label, x.value]))
    expect(f['Pay range']).toBe('Not stated')
    expect(f['Where']).toBe('Not stated')
    expect(f['How many']).toBe('2 people')
  })

  it('the raise form asks for what the desks check and what an approver reads, in one sentence', () => {
    const empty = { title: 'Payroll data analyst', skills: '', billMax: '', months: '', hoursPerWeek: '', costCenterId: '', description: '', justification: '', location: '' }
    expect(missingSays(missingForApproval(empty, { costCentersOffered: true }))).toBe(
      'Say what the work is, the skills it needs, the most you will pay an hour, how many months, the hours a week, where the work is, which budget pays for it and why it is needed. The desks check the job against these, and whoever approves it reads them.'
    )
    const full = { ...empty, skills: 'SQL', billMax: '115', months: '6', hoursPerWeek: '40', costCenterId: 'cc', description: 'Reports.', justification: 'Backfill.', location: 'Tualatin, OR' }
    expect(missingForApproval(full, { costCentersOffered: true })).toEqual([])
  })

  it('the job request page shows the job before its approval, and what the approval checked', () => {
    const page = read('src/app/dashboard/requisitions/[id]/page.tsx')
    expect(page.indexOf('aria-label="The job"')).toBeGreaterThan(-1)
    expect(page.indexOf('aria-label="The job"')).toBeLessThan(page.indexOf('<ListSection title="Approval">'))
    expect(page).toContain('<CheckedAgainst checked={data.checked ?? null} approvalState={r.approvalState} />')
    expect(page).toContain('<ListSection title="Send to suppliers">')
    expect(page).not.toContain('Send to vendors')
    expect(page).not.toContain('Gone quiet')
  })
})

describe('a client reads suppliers, never vendors', () => {
  it('a client told its job request is fully approved reads that it is open to its suppliers', () => {
    const route = read('src/app/api/requisitions/[id]/approve/route.ts')
    expect(route).toContain('It is now open to your suppliers.')
    expect(route).not.toContain('open to your vendors')
  })
})
