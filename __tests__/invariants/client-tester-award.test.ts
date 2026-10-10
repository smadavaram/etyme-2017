import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assessAward, awardSaid, roundsToCallOff, STOOD_DOWN_REASON, type AwardFacts } from '@/lib/award'
import { REASONS, isBadSubmission, type Reason } from '@/lib/outcomes'
import {
  submissionStatusWord, submissionKindWord, submittedOn, jobsToSubmitTo, KIND_HEADING,
} from '@/app/dashboard/submissions/words'
import { offeredForWork, seatRunsTheFirm } from '@/app/api/submissions/own-people/who'
import { jobFacts, checkedSays, withoutRepeat, filledSays, stillOpen } from '@/app/dashboard/requisitions/facts'
import { deskCounts, deskHeadline, emptyQueueSays } from '@/app/dashboard/program/needs-you'
import { stageWordFor } from '@/app/dashboard/requirements/words'

/**
 * The client tester's walk of Northbend Athletic on commit e80773ab9
 * (2026-10-03), the demand side's findings one at a time, as sentences.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

const facts = (over: Partial<AwardFacts> = {}): AwardFacts => ({
  headcount: 1,
  alreadyAwarded: 0,
  personAlreadyAwarded: false,
  personName: 'Daniel Okafor',
  requisitionApprovalState: 'AUTO_APPROVED',
  requisitionStatus: 'OPEN',
  awardedRateCents: 13_200,
  vendorBand: null,
  ceilingCents: 14_000,
  governance: { blocks: [], warnings: [] },
  ...over,
})

// ── The interviews an award makes pointless (s3-11) ─────────────────

describe('Awarding a job calls off the interviews it makes pointless', () => {
  const rounds = [
    { id: 'r-rajesh', submissionId: 's-rajesh', state: 'CONFIRMED' },
    { id: 'r-meilin', submissionId: 's-meilin', state: 'PROPOSED' },
    { id: 'r-daniel', submissionId: 's-daniel', state: 'PROPOSED' },
    { id: 'r-old', submissionId: 's-rajesh', state: 'DONE' },
    { id: 'r-gone', submissionId: 's-meilin', state: 'CANCELLED' },
  ]
  const job = { placedSubmissionId: 's-daniel', placedName: 'Daniel Okafor', roleTitle: 'HCM integration lead' }

  it('filling the job calls off every other candidate’s booked or proposed round', () => {
    const off = roundsToCallOff(rounds, { ...job, fills: true }).map((r) => r.id)
    expect(off).toContain('r-rajesh')
    expect(off).toContain('r-meilin')
  })

  it('the placed person’s own open round is called off too, because it decides nothing now', () => {
    const off = roundsToCallOff(rounds, { ...job, fills: true })
    expect(off.find((r) => r.id === 'r-daniel')?.reason).toBe(
      'Daniel Okafor was placed on HCM integration lead, so this round is no longer needed.'
    )
  })

  it('a round already held or already called off is history and is never touched', () => {
    const off = roundsToCallOff(rounds, { ...job, fills: true }).map((r) => r.id)
    expect(off).not.toContain('r-old')
    expect(off).not.toContain('r-gone')
  })

  it('while a seat is still open the other candidates are still in the running and keep their rounds', () => {
    const off = roundsToCallOff(rounds, { ...job, fills: false }).map((r) => r.id)
    expect(off).toEqual(['r-daniel'])
  })

  it('each called-off round says why in a sentence every party can read, never a code', () => {
    const off = roundsToCallOff(rounds, { ...job, fills: true })
    expect(off.find((r) => r.id === 'r-rajesh')?.reason).toBe(
      'HCM integration lead has been filled by another candidate, so this round will not go ahead.'
    )
  })

  it('the award route calls the rounds off in its own transaction and tells everybody in each one on their channel', () => {
    const route = src('src/app/api/submissions/[id]/award/route.ts')
    expect(route).toContain('roundsToCallOff(')
    expect(route).toContain("state: 'CANCELLED', cancelledAt")
    // The same notice a person calling a round off sends: the supplier's
    // desks in the app, the candidate by email.
    expect(route).toContain("tell('CANCELLED', r.id, { reason: r.reason })")
    // On the award's own record: part of the person's act, not the system's.
    expect(route).toContain('interviewsCalledOff: result.calledOff as any')
  })
})

// ── The stand-down carries a reason code ────────────────────────────

describe('A candidate stood down by the award ends with a reason code, not free text', () => {
  it('the reason is TIMING — beaten to it — from the closed list of reasons', () => {
    expect(REASONS.map((r) => r.code)).toContain(STOOD_DOWN_REASON)
  })

  it('being beaten to a seat does not count against the supplier’s bar', () => {
    expect(isBadSubmission(STOOD_DOWN_REASON as Reason)).toBe(false)
  })

  it('the award writes the code beside the status on every candidate it stands down', () => {
    const route = src('src/app/api/submissions/[id]/award/route.ts')
    expect(route).toMatch(/status: 'NOT_SELECTED',[\s\S]{0,80}rejectReason: STOOD_DOWN_REASON/)
  })
})

// ── The award's confirmation (s3-9) ─────────────────────────────────

describe('The award says what happened in words, each thing once', () => {
  it('a note that reached the award through two doors is said once', () => {
    const d = assessAward(facts({
      governance: {
        blocks: [],
        warnings: ['The vendor has not said how this person is engaged', 'The vendor has not said how this person is engaged'],
      },
    }))
    expect(d.summary.match(/has not said how this person is engaged/g)).toHaveLength(1)
  })

  it('one note reads "One thing to note", never "1 note(s)"', () => {
    const d = assessAward(facts({ governance: { blocks: [], warnings: ['The vendor has not said how this person is engaged'] } }))
    expect(d.summary).toBe(
      'Daniel Okafor is placed. This fills the job. One thing to note: The vendor has not said how this person is engaged.'
    )
    expect(d.summary).not.toContain('(s)')
  })

  it('filling the job says how many others were told they were not chosen and how many interviews were called off', () => {
    expect(awardSaid({ personName: 'Daniel Okafor', fills: true, seatsAfter: 0, notes: [], passedOver: 2, roundsCalledOff: 2 })).toBe(
      'Daniel Okafor is placed. This fills the job: Two other candidates were told they were not chosen, ' +
      'and two interviews were called off, and everybody in them told.'
    )
  })

  it('one seat left reads "One position is still open"', () => {
    expect(awardSaid({ personName: 'Daniel Okafor', fills: false, seatsAfter: 1, notes: [] })).toBe(
      'Daniel Okafor is placed. One position is still open.'
    )
  })

  it('the screens print the award’s sentence and do not append the notes a second time', () => {
    const subs = src('src/app/dashboard/submissions/page.tsx')
    expect(subs).toContain('setSaid(body.data?.message ?? null)')
    expect(subs).not.toContain('[body.data?.message, ...notes]')
    const req = src('src/app/dashboard/requisitions/[id]/page.tsx')
    expect(req).not.toContain('vendor(s) stood down')
  })
})

// ── The Submissions page (s3-3, s3-9) ───────────────────────────────

describe('The Submissions page reads in words, not codes', () => {
  it('a candidate stood down reads "Not chosen", never NOT_SELECTED', () => {
    expect(submissionStatusWord('NOT_SELECTED')).toBe('Not chosen')
    expect(submissionStatusWord('INTERVIEW')).toBe('Interviewing')
  })

  it('every status the page filters on has a word without an underscore', () => {
    for (const st of ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']) {
      expect(submissionStatusWord(st)).not.toMatch(/_|^[A-Z]+$/)
    }
  })

  it('how a person came is said from where the reader sits — "our own employee" to the firm that sent them', () => {
    expect(submissionKindWord('INTERNAL', 'sent')).toBe('Our own employee')
    expect(submissionKindWord('INTERNAL', 'received')).toBe('Supplier’s own employee')
    expect(submissionKindWord('BENCH', 'received')).toBe('From the supplier’s bench')
    expect(submissionKindWord('NETWORK', 'received')).toBe('Through another firm')
  })

  it('the column is headed with a question, and no row prints BENCH, INTERNAL or NETWORK', () => {
    expect(KIND_HEADING).toBe('How they came')
    const page = src('src/app/dashboard/submissions/page.tsx')
    expect(page).not.toContain('{row.kind}</span>')
    expect(page).not.toContain('{row.status}</span>')
  })

  it('every row dates its submission in one style, never "6d ago" beside "9/19/2026"', () => {
    expect(submittedOn('2026-09-19T15:00:00Z')).toBe('Sep 19, 2026')
    expect(src('src/app/dashboard/submissions/page.tsx')).not.toContain('timeAgo(')
  })
})

// ── The Submit dialog (bench tester, story 6) ───────────────────────

describe('The Submit dialog offers people the firm staffs and jobs it may answer', () => {
  it('a firm’s own resold copy of a client’s job is not offered to submit to', () => {
    const jobs = [
      { id: 'client', company: { id: 'corveldt' } },
      { id: 'copy', company: { id: 'teleworld' } },
    ]
    expect(jobsToSubmitTo(jobs, 'teleworld').map((j) => j.id)).toEqual(['client'])
  })

  it('the owner, HR and a delivery manager run the firm and are not offered as candidates', () => {
    expect(seatRunsTheFirm(['*'])).toBe(true)
    expect(offeredForWork({ permissions: ['documents.write', 'consultants.read'], worksHere: false })).toBe(false)
    expect(offeredForWork({ permissions: ['requirements.write', 'assignments.write'], worksHere: false })).toBe(false)
  })

  it('an employee whose seat only reads their own work and files their own hours is offered', () => {
    expect(offeredForWork({ permissions: ['assignments.read', 'timesheets.read'], worksHere: false })).toBe(true)
  })

  it('somebody the work shows is staffed — a contract line, a submission, a profile — is offered whatever their seat', () => {
    expect(offeredForWork({ permissions: ['requirements.write'], worksHere: true })).toBe(true)
  })
})

// ── The job request after the award (s3-10) ─────────────────────────

describe('A filled job request says it is filled and offers nothing that sends it out again', () => {
  const candidates = [
    { status: 'PLACED', person: { name: 'Daniel Okafor' }, rate: 13_100, placedRate: 13_200 },
    { status: 'NOT_SELECTED', person: { name: 'Rajesh Iyer' }, rate: 13_400, placedRate: null },
  ]

  it('it names who filled it at the rate the award agreed, not the rate the supplier asked', () => {
    expect(filledSays({ status: 'FILLED', headcount: 1 }, candidates)).toBe(
      'Filled by Daniel Okafor at $132/hr. It goes to no more suppliers, and everybody else who was put forward has been told.'
    )
  })

  it('a job still open says nothing about being filled', () => {
    expect(filledSays({ status: 'OPEN', headcount: 1 }, candidates)).toBeNull()
  })

  it('a filled or put-away job is not offered to suppliers or matched again', () => {
    expect(stillOpen({ status: 'FILLED', archivedAt: '2026-10-03T00:00:00Z' })).toBe(false)
    expect(stillOpen({ status: 'OPEN', archivedAt: '2026-10-03T00:00:00Z' })).toBe(false)
    expect(stillOpen({ status: 'OPEN', archivedAt: null })).toBe(true)
  })

  it('the page shows the placed candidate at the rate on the line the award wrote', () => {
    expect(src('src/app/api/requisitions/[id]/route.ts')).toContain('placedRate: placedLineOf(s)?.billRate ?? null')
    expect(src('src/app/dashboard/requisitions/[id]/page.tsx')).toContain('money(c.placedRate ?? c.rate)')
  })
})

// ── The job request page (s2-3, s2-6, s2-7) ─────────────────────────

describe('The job request page says each thing once and never contradicts itself', () => {
  it('a manager who raised their own request reads their own name beside Raised by', () => {
    const me = { id: 'p-marcus', name: 'Marcus Oyelaran' }
    const raised = jobFacts({ headcount: 1, owner: me, raisedBy: me }).find((f) => f.label === 'Raised by')
    expect(raised?.value).toBe('Marcus Oyelaran')
  })

  it('a job that cleared by rule and would need a person today says the clearance stands and the check is today’s', () => {
    const says = checkedSays(
      { basis: 'NOW', at: '2026-10-03T00:00:00Z', checks: [{ outcome: 'ROUTE', reason: 'over the limit' }] },
      'AUTO_APPROVED'
    )
    expect(says.intro).toContain('It cleared by rule when it was raised, and that stands.')
    expect(says.routeSuffix).toBe(' — would need a person if raised today')
  })

  it('a job still waiting on a desk says plainly that it needs a person', () => {
    const says = checkedSays(
      { basis: 'RECORDED', at: '2026-10-03T00:00:00Z', checks: [{ outcome: 'ROUTE', reason: 'over the limit' }] },
      'PENDING_APPROVAL'
    )
    expect(says.routeSuffix).toBe(' — needs a person')
  })

  it('a desk’s row keeps only its own part of a sentence the panel already printed', () => {
    const long = 'Sent for a sign-off because about $180,000, estimated from $125/hr at 40 hours a week for 9 months is over the limit'
    expect(withoutRepeat(`The final word on Apps' spend — ${long}`, [long])).toBe('The final word on Apps\' spend')
    expect(withoutRepeat(`Technology — over $80k: ${long}`, [long])).toBe('Technology — over $80k')
  })

  it('a desk row with nothing of its own left is not printed as an empty line', () => {
    expect(withoutRepeat('Within the plan and under every threshold, which is long', ['Within the plan and under every threshold, which is long'])).toBe('')
  })

  it('the raise banner hides a check its headline already says, and the desks below drop it too', () => {
    const list = src('src/app/dashboard/requisitions/page.tsx')
    expect(list).toContain("c.outcome === 'PASS' || !decision.summary.includes(c.reason)")
    expect(list).toContain('alreadySaid={decision.checks.filter')
  })

  it('a desk’s decision is dated like every other date on the page, never 10/3/2026', () => {
    const chain = src('src/app/dashboard/requisitions/chain.tsx')
    expect(chain).not.toContain('toLocaleDateString()')
    expect(chain).toContain('{day(a.decidedAt)}')
  })
})

// ── The client's dashboard (s1-1, s1-2, s1-3, s1-5, s6-1) ───────────

describe('The client’s dashboard agrees with itself and every tile opens what it counts', () => {
  const counts = deskCounts({
    decisions: [],
    startingSoon: [{ paperwork: { outcome: 'BLOCK' } }],
    vendors: [{ agreement: false, headcount: 2 }],
  })

  it('under "2 things need you" the box never says nothing is waiting on you', () => {
    expect(deskHeadline(counts).says).toMatch(/^2 things need you/)
    const said = emptyQueueSays({ counts, approvalsWithOthers: 3, doneToday: 1 })
    expect(said).not.toContain('Nothing is waiting on you')
    expect(said).toBe(
      'No approvals or weeks to sign. What needs you is below: 1 start held up by paperwork, under Starting soon; ' +
      '1 supplier with no agreement on file, under Suppliers. 3 approvals are waiting on the hiring managers who own them'
    )
  })

  it('a desk with truly nothing waiting still says so', () => {
    const none = deskCounts({ decisions: [], startingSoon: [], vendors: [] })
    expect(emptyQueueSays({ counts: none, approvalsWithOthers: 0, doneToday: 0 })).toContain('Nothing is waiting on you.')
  })

  it('a job request awaiting approval reads "Awaiting approval" on the dashboard, as it does on Job requests', () => {
    expect(stageWordFor({ status: 'DRAFT', approvalState: 'PENDING_APPROVAL', archivedAt: null })).toBe('Awaiting approval')
    const page = src('src/app/dashboard/program/page.tsx')
    expect(page).not.toContain("r.status === 'OPEN' ? 'Published' : 'Draft'")
    expect(src('src/app/api/program/route.ts')).toContain('approvalState: r.approvalState')
  })

  it('the On site tile opens the people on site, and the page honors the filter it was sent', () => {
    expect(src('src/app/dashboard/program/page.tsx')).toContain('href="/dashboard/people?filter=ON_SITE"')
    expect(src('src/app/dashboard/people/page.tsx')).toContain("new URLSearchParams(window.location.search).get('filter')")
  })

  it('the This month tile opens the spend behind the number', () => {
    expect(src('src/app/dashboard/program/page.tsx')).toContain('sub="from current rates" href="/dashboard/program/budget"')
  })

  it('one month on site reads "1 month", never "1 months"', () => {
    expect(src('src/lib/one-person.ts')).toContain("month${monthsHere === 1 ? '' : 's'} here")
    expect(src('src/app/dashboard/program/page.tsx')).toContain("{plural(p.cumulativeMonths, 'month')} here")
  })
})

// ── The client's signed total (money's report on the walk) ──────────

import { listTotals as totalsOf, type TotalsRow as Row } from '@/app/dashboard/timesheets/totals'

describe('A week the reader signed counts in the value they approved, though the firm below has not accepted it', () => {
  const row = (over: Partial<Row>): Row => ({
    periodStart: '2026-09-20T00:00:00.000Z', totalHours: 40, status: 'SUBMITTED', flag: null,
    waitingOnYou: false, valueCents: 392_000, youSigned: false, ...over,
  })

  it('a week still SUBMITTED but signed by the client is counted, and one nobody signed is not', () => {
    const t = totalsOf([row({ youSigned: true }), row({})], { onServer: 2, payBasis: false })
    expect(t.approvedValueCents).toBe(392_000)
  })

  it('the tile says when what it counts was signed by you rather than approved by every firm', () => {
    expect(totalsOf([row({ youSigned: true })], { onServer: 1, payBasis: false }).approvedSays)
      .toBe('billable, from 1 week signed by you since Sep 20, 2026')
    expect(totalsOf([row({ youSigned: true }), row({ status: 'APPROVED' })], { onServer: 2, payBasis: false }).approvedSays)
      .toBe('billable, from 2 weeks approved or signed by you since Sep 20, 2026')
  })
})
