import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor } from '@/lib/company-defaults'
import { namesAPermission } from '@/lib/refusal-words'
import { termsStanding, colleaguesTermsRefused } from '@/app/api/submissions/[id]/terms/standing'
import { lineTheReaderPays } from '@/app/api/requisitions/[id]/placed-line'
import { listTotals, totalsRowOf } from '@/app/dashboard/timesheets/totals'
import { ownWeeksSays, RATE_WITHHELD_CELL } from '@/app/api/timesheets/own-weeks'
import { submissionReach, clientSubmissionsRefused } from '@/app/api/submissions/own-only'
import { TIMESHEETS_NOT_AT_A_COMPANY, notAtACompany } from '@/app/api/people/not-at-a-company'

/**
 * Round six of the sign-up walk, 2026-10-08, on the buying side
 * (docs/results/2026-10-08-signup-round-6.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it.
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')
const WORKER = ['assignments.read', 'timesheets.read']
const role = (kind: 'VENDOR' | 'GSI', name: string) => rolesFor(kind).find((r) => r.name === name)!.permissions as string[]
const at = (permissions: string[] | null, over: Partial<Parameters<typeof termsStanding>[0]> = {}) =>
  termsStanding({ callerPersonId: 'karthik', callerCompanyId: 'teleworld', permissions, personId: 'felix', firmId: 'teleworld', ...over })

describe('1: a person’s terms are read by the person and by the firm’s desk, never by every seat at the firm', () => {
  it('the person the submission names reads their own terms, even from a seat with no desk', () => {
    expect(at(WORKER, { personId: 'karthik' })).toBe('PERSON')
    expect(at([], { personId: 'karthik' })).toBe('PERSON')
  })

  it('a worker seat like Karthik Menon’s at the same firm is not the firm for a colleague’s terms', () => {
    expect(at(WORKER)).toBe('NO_DESK')
  })

  it('a Member with no permission at the same firm is not the firm either', () => {
    expect(at([])).toBe('NO_DESK')
  })

  it('a desk at the firm that neither reads submissions nor papers contracts, like HR, is not the firm', () => {
    expect(at(role('VENDOR', 'HR'))).toBe('NO_DESK')
  })

  it('the recruiting desk, which reads the firm’s submissions, is the firm', () => {
    expect(at(role('VENDOR', 'Recruiter'))).toBe('FIRM')
  })

  it('the contract desk, which states the terms, is the firm', () => {
    expect(at(role('VENDOR', 'Contract Manager'))).toBe('FIRM')
  })

  it('the owner is the firm', () => {
    expect(at(['*'])).toBe('FIRM')
  })

  it('a seat at another company is a stranger whatever it holds', () => {
    expect(at(['*'], { callerCompanyId: 'northbend' })).toBe('STRANGER')
    expect(at([], { callerCompanyId: null })).toBe('STRANGER')
  })

  it('the refusal a colleague reads names nobody and no permission key', () => {
    const says = colleaguesTermsRefused('Teleworld Solutions')
    expect(says).toBe('Somebody else’s terms is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    expect(namesAPermission(says)).toBe(false)
  })

  it('the terms route refuses a colleague through the no-desk sentence and writes the refusal before sending it', () => {
    const route = src('app/api/submissions/[id]/terms/route.ts')
    expect(route).toMatch(/termsStanding\(/)
    expect(route).toMatch(/if \(you === 'NO_DESK'\) return refuseColleague\(caller, l\)/)
    const fn = route.slice(route.indexOf('async function refuseColleague'))
    expect(fn.indexOf('await recordRefusal(')).toBeGreaterThan(-1)
    expect(fn.indexOf('await recordRefusal(')).toBeLessThan(fn.indexOf("refuse('NO_DESK'"))
  })

  it('the route no longer treats every seat at the submitting firm as the firm', () => {
    expect(src('app/api/submissions/[id]/terms/route.ts')).not.toMatch(/if \(caller\.company\?\.id === l\.sub\.fromCompanyId\) return 'FIRM'/)
  })
})

describe('2: a filled job request is priced at the rung the reader pays', () => {
  const day = (d: string) => new Date(`2026-${d}T00:00:00Z`)
  const lines = [
    { id: 'top', personId: 'helena', companyId: 'computer-systems', clientCompanyId: 'northbend', billRate: 14_500, createdAt: day('03-16') },
    { id: 'below', personId: 'helena', companyId: 'techpeple', clientCompanyId: 'computer-systems', billRate: 11_800, createdAt: day('10-08') },
  ]
  const sub = { personId: 'helena', fromCompanyId: 'computer-systems', toCompanyId: 'northbend' }

  it('Northbend reads Helena Marsh at the $145 it pays, though the $118 line below it was written later', () => {
    expect(lineTheReaderPays(lines, sub, 'northbend')?.billRate).toBe(14_500)
  })

  it('the line between two other firms is never the reader’s figure', () => {
    expect(lineTheReaderPays([lines[1]], sub, 'northbend')).toBeNull()
  })

  it('a reader the submission was not made to is priced nothing', () => {
    expect(lineTheReaderPays(lines, sub, 'computer-systems')).toBeNull()
  })

  it('the job request route reads the line through this rule and no longer maps every line by person', () => {
    const route = src('app/api/requisitions/[id]/route.ts')
    expect(route).toMatch(/lineTheReaderPays\(lines, s, caller\.company\?\.id\)/)
    expect(route).not.toMatch(/new Map\(lines\.map\(\(l\) => \[l\.personId, l\.billRate\]\)\)/)
  })
})

describe('4: a withheld rate is not a zero and not a missing rate', () => {
  const week = (over: Partial<Parameters<typeof totalsRowOf>[0]> = {}) => totalsRowOf({
    periodStart: '2026-06-01T00:00:00.000Z', totalHours: 40, status: 'APPROVED', flag: null,
    rate: { cents: null, withheld: true }, ...over,
  })

  it('weeks whose rate is withheld from the reader show no approved value at all, never $0', () => {
    const t = listTotals([week(), week({ totalHours: 8 })], { onServer: 2, payBasis: false })
    expect(t.approvedValueCents).toBeNull()
    expect(t.approvedSays).toBe('2 weeks approved since Jun 1, 2026; their value is read by the billing desk')
    expect(t.approvedSays).not.toContain('no rate on file')
  })

  it('a week with no rate on file still says so, apart from one whose rate is withheld', () => {
    const t = listTotals(
      [week({ rate: { cents: 10_000 } }), week(), week({ rate: { cents: null } })],
      { onServer: 3, payBasis: false }
    )
    expect(t.approvedValueCents).toBe(400_000)
    expect(t.approvedSays).toBe('billable, from 3 weeks approved since Jun 1, 2026; 1 more whose rate is read by the billing desk; 1 more with no rate on file')
  })

  it('the timesheets route marks a rate it withholds, rather than sending a bare null', () => {
    expect(src('app/api/timesheets/route.ts')).toMatch(/says: BILL_WITHHELD_SAYS, withheld: true/)
  })

  it('the rate column says who reads a withheld rate, and the tile draws a dash rather than $0', () => {
    const page = src('app/dashboard/timesheets/page.tsx')
    expect(page).toMatch(/row\.rate\.withheld \? RATE_WITHHELD_CELL : 'not recorded'/)
    expect(page).toMatch(/totals\.approvedValueCents == null\s*\?\s*'—'/)
    expect(RATE_WITHHELD_CELL).toBe('Rate is read by the billing desk')
  })

  it('a seat reading only its own weeks is told they are its own, not "hours your people worked"', () => {
    expect(ownWeeksSays('Teleworld Solutions')).toBe(
      'These are your own weeks at Teleworld Solutions. Your colleagues’ weeks and what the client is billed are read by the timesheet and billing desks.'
    )
    expect(src('app/dashboard/timesheets/page.tsx')).toMatch(/\{ownSays \?\? framing\.subtitle\}/)
  })
})

describe('5: a client puts nobody forward, so its desk-less seat is not shown "the times you were put forward"', () => {
  it('a desk-less seat at a client is refused Submissions rather than narrowed to its own rows', () => {
    expect(submissionReach({
      permissions: [], seated: false, consultantSeat: false, callerPersonId: 'mo', askedPersonId: null, atAClient: true,
    })).toEqual({ clientNoDesk: true })
  })

  it('a worker seat at a supplier is still narrowed to the submissions naming it', () => {
    expect(submissionReach({
      permissions: WORKER, seated: false, consultantSeat: false, callerPersonId: 'karthik', askedPersonId: null, atAClient: false,
    })).toEqual({ ownOnly: true, personId: 'karthik' })
  })

  it('a client’s hiring desk is never refused by this rule', () => {
    expect(submissionReach({
      permissions: ['submissions.read', 'requirements.read'], seated: false, consultantSeat: false, callerPersonId: 'pm', askedPersonId: null, atAClient: true,
    })).toEqual({ ownOnly: false })
  })

  it('the refusal names the page and the client, and no permission key', () => {
    const says = clientSubmissionsRefused('Northbend Athletic')
    expect(says).toBe('Submissions is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.')
    expect(namesAPermission(says)).toBe(false)
  })

  it('the submissions route asks whether the reader is at a client and logs the refusal before sending it', () => {
    const route = src('app/api/submissions/route.ts')
    expect(route).toMatch(/atAClient: caller\.company\?\.kind === 'CLIENT'/)
    const branch = route.slice(route.indexOf("if ('clientNoDesk' in reach)"))
    expect(branch.indexOf('await recordRefusal(')).toBeLessThan(branch.indexOf("code: 'NO_DESK'"))
  })
})

describe('11: Timesheets tells somebody with no company whose page it is', () => {
  it('the sentence says whose books these are and where her own work is', () => {
    expect(TIMESHEETS_NOT_AT_A_COMPANY).toBe(
      'These are a company’s books, and you are not signed in at a company. Your own work is under Your work.'
    )
  })

  it('the page draws that sentence alone, never "your firm" or "your consultants"', () => {
    const page = src('app/dashboard/timesheets/page.tsx')
    expect(page).toMatch(/if \(!sessionLoading && !company\) \{\s*return <p[^>]*>\{TIMESHEETS_NOT_AT_A_COMPANY\}<\/p>/)
  })

  it('the route’s filing line says the same to a reader with no company', () => {
    expect(src('app/api/timesheets/route.ts')).toMatch(/\? TIMESHEETS_NOT_AT_A_COMPANY/)
  })
})

describe('13: a refused page draws its sentence alone', () => {
  it('Leads returns the refusal before the paste form, and offers the form only after a read succeeded', () => {
    const page = src('app/dashboard/leads/page.tsx')
    const main = page.slice(page.indexOf('export default function LeadsPage'))
    expect(main.indexOf('if (refused)')).toBeGreaterThan(-1)
    expect(main.indexOf('if (refused)')).toBeLessThan(main.indexOf('<PasteBox'))
    expect(main).toMatch(/\{readOnce && \(\s*<PasteBox/)
  })

  it('the pile returns the refusal before the "Screen again" button, and draws the button only over a pile it read', () => {
    const page = src('app/dashboard/requirements/[id]/pile/page.tsx')
    expect(page.indexOf('if (refused)')).toBeGreaterThan(-1)
    expect(page.indexOf('if (refused)')).toBeLessThan(page.indexOf("'Screen again'"))
    expect(page).toMatch(/\{pile && \(\s*<div className="flex items-center gap-3">/)
  })
})

describe('9: somebody with no company is told in a sentence, not a system phrase', () => {
  it('the sentence names the page and says where her own work is', () => {
    expect(notAtACompany('Shared with you')).toBe(
      'Shared with you belongs to a company, and you are not signed in at one. Your own work is under Your work.'
    )
  })

  const PHRASES = [
    'Invitations are addressed to a company',
    'A program belongs to a company',
    'You must belong to a company',
    'No company context',
  ]
  const ROUTES = [
    'app/api/invitations/route.ts',
    'app/api/program/team/route.ts',
    'app/api/program/milestones/route.ts',
    'app/api/program/milestones/[id]/decide/route.ts',
    'app/api/program/milestones/[id]/deliver/route.ts',
    'app/api/program/engagements/route.ts',
    'app/api/program/engagements/[id]/sow/route.ts',
    'app/api/program/agreements/route.ts',
    'app/api/program/agreements/[id]/route.ts',
    'app/api/program/agreements/[id]/sign/route.ts',
    'app/api/program/agreements/[id]/history/route.ts',
    'app/api/program/agreements/[id]/end/route.ts',
    'app/api/submissions/route.ts',
    'app/api/timesheets/route.ts',
    'lib/resolve-client-company.ts',
  ]
  for (const r of ROUTES) {
    it(`${r} says no system phrase to somebody with no company`, () => {
      const file = src(r)
      for (const p of PHRASES) expect(file, p).not.toContain(`'${p}`)
    })
  }

  it('Job requests does not tell somebody with no company that whoever set up her access can add it', () => {
    expect(src('app/api/requirements/route.ts')).toMatch(/!caller\.company && !desk\s*\?\s*notAtACompany\('Job requests'\)/)
  })
})
