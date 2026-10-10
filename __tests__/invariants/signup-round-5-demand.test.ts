import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor } from '@/lib/company-defaults'
import { namesAPermission } from '@/lib/refusal-words'
import { sectionOfHref } from '@/lib/page-framing'
import {
  holdsNoDesk, submissionReach, ownSubmissionsSays, othersSubmissionsRefused, mayAnswerWithCv,
} from '@/app/api/submissions/own-only'
import { colleaguesWeeksRefused } from '@/app/api/timesheets/own-weeks'
import { knownBy } from '@/app/api/submissions/name-if-known'
import { notAPartySays } from '@/app/api/submissions/[id]/terms/not-a-party'
import { refusalFor } from '@/app/dashboard/program/own-refusal'
import { NOT_AT_A_COMPANY, SUBMISSIONS_NOT_AT_A_COMPANY } from '@/app/api/people/not-at-a-company'

/**
 * Round five of the sign-up walk, 2026-10-08, on the buying side
 * (docs/results/2026-10-08-signup-round-5.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it.
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')
const page = (p: string) => src(`app/dashboard/${p}/page.tsx`)

const WORKER = ['assignments.read', 'timesheets.read']
const role = (kind: 'VENDOR' | 'GSI', name: string) => rolesFor(kind).find((r) => r.name === name)!.permissions as string[]

describe('3: answering a job with a CV is the recruiting desk’s act', () => {
  it('a seat holding only a worker’s own reads holds no desk', () => {
    expect(holdsNoDesk(WORKER)).toBe(true)
    expect(holdsNoDesk([])).toBe(true)
    expect(holdsNoDesk(null)).toBe(false)
  })

  it('a worker seat like Karthik Menon’s cannot answer a job with a CV, and is told it has no desk', () => {
    expect(mayAnswerWithCv(WORKER)).toEqual({ open: false, deskless: true })
  })

  it('a Member with no permission at all cannot answer a job with a CV either', () => {
    expect(mayAnswerWithCv([])).toEqual({ open: false, deskless: true })
  })

  it('a desk that does not recruit, like HR, is refused answering with a CV and is not called desk-less', () => {
    expect(mayAnswerWithCv(role('VENDOR', 'HR'))).toEqual({ open: false, deskless: false })
  })

  it('a recruiter may answer a job with a CV', () => {
    expect(mayAnswerWithCv(role('VENDOR', 'Recruiter')).open).toBe(true)
  })

  it('the answer route asks this before it creates any person, listing or submission', () => {
    const route = src('app/api/invitations/[id]/answer/route.ts')
    const gate = route.indexOf('mayAnswerWithCv(caller.permissions)')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(route.indexOf('prisma.person.create'))
    expect(gate).toBeLessThan(route.indexOf('prisma.benchListing.upsert'))
    expect(route).toMatch(/noDeskYet\('Answering a job with a CV'/)
  })

  it('Shared with you offers the CV box only to a seat the route would let answer', () => {
    expect(page('invitations')).toMatch(/\(accepted \|\| open\) && mayAnswer && <AnswerBox/)
  })
})

describe('4: a seat with no desk reads only the submissions that name it, and no rate', () => {
  const base = { seated: false, consultantSeat: false, callerPersonId: 'karthik', askedPersonId: null }

  it('a worker seat is narrowed to the submissions naming its holder', () => {
    expect(submissionReach({ ...base, permissions: WORKER })).toEqual({ ownOnly: true, personId: 'karthik' })
  })

  it('asking for its own submissions by person is honored', () => {
    expect(submissionReach({ ...base, permissions: WORKER, askedPersonId: 'karthik' })).toEqual({ ownOnly: true, personId: 'karthik' })
  })

  it('asking for a colleague’s submissions from a worker seat is refused', () => {
    expect(submissionReach({ ...base, permissions: WORKER, askedPersonId: 'meera' })).toEqual({ refused: true, askedPersonId: 'meera' })
  })

  it('a recruiter reads the firm’s list unchanged', () => {
    expect(submissionReach({ ...base, permissions: role('VENDOR', 'Recruiter') })).toEqual({ ownOnly: false })
  })

  it('a program office in a client’s seat is never narrowed as desk-less', () => {
    expect(submissionReach({ ...base, permissions: [], seated: true })).toEqual({ ownOnly: false })
  })

  it('the refusal for somebody else’s submissions names nobody and no permission key', () => {
    const says = othersSubmissionsRefused('Teleworld Solutions')
    expect(says).toBe('Somebody else’s submissions is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    expect(namesAPermission(says)).toBe(false)
  })

  it('the line over a desk-less seat’s own submissions says whose they are and that rates are the recruiting desk’s', () => {
    expect(ownSubmissionsSays('Teleworld Solutions')).toBe(
      'These are the times you were put forward by Teleworld Solutions. Your colleagues’ submissions and every rate are read by the recruiting desk.'
    )
  })

  it('the submissions route sends no rate on a desk-less seat’s rows', () => {
    expect(src('app/api/submissions/route.ts')).toMatch(/rate: ownOnly \? null : s\.rate/)
  })

  it('the invitations route refuses a desk-less seat before reading any rate band', () => {
    const route = src('app/api/invitations/route.ts')
    const gate = route.indexOf("noDeskYet('Shared with you'")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(route.indexOf('payMin: inv.payMin'))
  })

  it('the Submissions page shows a desk-less seat whose rows these are and offers it no Submit button', () => {
    const p = page('submissions')
    // Round seven, problem 5: the route's sentence is now the heading
    // itself, and the Submit button sits inside the desk's furniture.
    expect(p).toContain('subtitle={head.says}')
    expect(p.indexOf('!own ? (')).toBeGreaterThan(-1)
    expect(p.indexOf('+ {framing.create}')).toBeGreaterThan(p.indexOf('!own ? ('))
  })
})

describe('8: a refusal names a person only where the reader already knows them', () => {
  it('a timesheet refused for somebody the reader’s company does not know reads "That timesheet"', () => {
    expect(colleaguesWeeksRefused(null, 'Teleworld Solutions')).toBe(
      'That timesheet is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.'
    )
  })

  it('a colleague at the reader’s own company is still named', () => {
    expect(colleaguesWeeksRefused('Felix Brenner', 'Teleworld Solutions')).toMatch(/^Felix Brenner’s timesheet is not part of your seat/)
  })

  it('the timesheets route looks the name up only through the reader’s own company', () => {
    expect(src('app/api/timesheets/route.ts')).toMatch(/nameIfKnown\(whose\.refusedPersonId, caller\.company\?\.id \?\? null\)/)
  })

  it('a firm names a person it pays or bills for, and nobody it has no line with', () => {
    const ties = knownBy('marcus', 'teleworld')
    // Its own seat, its own sell line, its own buy line — each on the reader's company, and nothing wider.
    expect(ties).toEqual({
      seat: { personId: 'marcus', companyId: 'teleworld', revokedAt: null },
      billsFor: { personId: 'marcus', companyId: 'teleworld' },
      paysFor: { personId: 'marcus', buyContract: { companyId: 'teleworld' } },
    })
    const door = src('app/api/submissions/name-if-known.ts')
    expect(door).toMatch(/prisma\.context\.findFirst\(\{ where: ties\.seat/)
    expect(door).toMatch(/prisma\.sellContract\.findFirst\(\{ where: ties\.billsFor/)
    expect(door).toMatch(/prisma\.buyContractCandidate\.findFirst\(\{ where: ties\.paysFor/)
    // Being the client or the end client on another firm's line is not a tie.
    expect(door).not.toMatch(/clientCompanyId|endClientCompanyId|vendorCompanyId/)
  })

  it('the terms refusal says "a person" when the reader has no business with them', () => {
    expect(notAPartySays(null)).toBe('These are the terms between a person and the firm that holds them. Only those two can read them.')
  })

  it('the terms refusal never names the firm that holds the person', () => {
    const route = src('app/api/submissions/[id]/terms/route.ts')
    expect(route).not.toMatch(/Only \$\{l\.sub\.person\.name\} and \$\{l\.sub\.fromCompany\.name\} agree these terms/)
    expect(route).not.toMatch(/These are the terms between \$\{l\.sub\.person\.name\}/)
  })
})

describe('14: a refusal reads as a refusal, in the page’s own name, alone', () => {
  const door = { code: 'NO_DESK', message: 'Dashboard is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.' }

  it('Milestones names itself, not "Dashboard", and keeps the company and the ask', () => {
    expect(refusalFor(door, 'Milestones')).toBe('Milestones is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.')
  })

  it('a refusal that is not the door’s keeps its own sentence', () => {
    expect(refusalFor({ code: 'FORBIDDEN', message: 'Only the client signs this.' }, 'Agreements')).toBe('Only the client signs this.')
  })

  it('a refusal with no sentence in it still says the page’s name', () => {
    expect(refusalFor(null, 'Agreements')).toBe('Agreements is not part of your seat. Ask your company’s owner if you need it.')
  })

  it('Milestones draws the refusal alone and never as "Could not load milestones"', () => {
    const p = page('program/milestones')
    expect(p).toMatch(/refusedBy\(res, 'Milestones'\)/)
    expect(p).not.toContain('Could not load milestones')
    expect(p.indexOf('if (refused)')).toBeGreaterThan(-1)
    expect(p.indexOf('if (refused)')).toBeLessThan(p.indexOf('<ErrorState'))
  })

  it('Agreements draws the refusal in its own name and adds no second sentence about a contract manager', () => {
    const p = page('program/agreements')
    expect(p).toMatch(/refusalFor\(\{ code: e\.code, message: e\.message \}, 'Agreements'\)/)
    expect(p).not.toMatch(/ask an owner to seat you as a contract manager/)
  })

  it('the job request page and Shared with you draw a refusal with no "Try again" under it', () => {
    for (const p of ['requisitions/[id]', 'invitations']) {
      const s = page(p)
      expect(s, p).toMatch(/if \(refused\)[\s\S]{0,20}return <RefusedState says=\{refused\} \/>/)
      // The refusal returns before the failure branch that carries "Try again".
      const tryAgain = s.indexOf('Try again', s.indexOf('{refused}'))
      const failure = s.lastIndexOf('error', tryAgain)
      expect(s.indexOf('{refused}'), p).toBeLessThan(failure)
    }
  })
})

describe('15: Program office waits for its read before saying who sits there', () => {
  it('the page says "Loading…" until the first read is back, never "Nobody outside this company sits in this program"', () => {
    const p = page('program/seats')
    expect(p).toMatch(/if \(!readOnce\) \{\s*return <LoadingState says="Loading…" \/>/)
    expect(p.indexOf('if (!readOnce)')).toBeLessThan(p.indexOf('{live.length === 0 && !nothingYet'))
  })
})

describe('17: somebody with no company is told the truth, not "Loading…" or a bench she is not on', () => {
  it('Contractors tells a candidate with no company whose list it is and where her own work is', () => {
    expect(NOT_AT_A_COMPANY).toBe(
      'This is a company’s list of the people who work for it, and you are not signed in at a company. Your own work is under Your work.'
    )
    expect(NOT_AT_A_COMPANY).not.toMatch(/bench/)
  })

  it('the Contractors route asks for a company before it calls anybody a bench consultant', () => {
    const route = src('app/api/people/route.ts')
    expect(route.indexOf('NOT_AT_A_COMPANY } }')).toBeLessThan(route.indexOf("staffOnly(caller, 'The register')"))
  })

  it('Submissions tells somebody with no company where their own work is instead of loading for ever', () => {
    expect(SUBMISSIONS_NOT_AT_A_COMPANY).toMatch(/you are not signed in at a firm/)
    expect(page('submissions')).toMatch(/!sessionLoading && !company && !urlRequirementId/)
  })

  it('the program pages no longer say "No company context. You must belong to a company."', () => {
    expect(src('lib/resolve-client-company.ts')).not.toMatch(/You must belong to a company/)
  })
})

describe('18: the pile heads with the reader’s own menu section', () => {
  it('the pile’s eyebrow is read from the menu, never a typed "Program"', () => {
    const p = page('requirements/[id]/pile')
    expect(p).not.toMatch(/<p className="eyebrow">Program<\/p>/)
    expect(p).toMatch(/usePageSection\('\/dashboard\/requisitions'\)/)
  })

  it('a client’s job requests sit under a section on the client’s own menu', () => {
    expect(sectionOfHref('CLIENT', '/dashboard/requisitions')).toBe('Workforce')
  })

  it('a supplier’s job requests sit under its own selling section', () => {
    expect(sectionOfHref('VENDOR', '/dashboard/requirements')).toBe('Sell')
  })
})
