import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readerZone, headline, type Interview } from '@/lib/interviews'
import { noticesFor, timeFor, type NoticeContext } from '@/lib/interview-notices'
import { pageFraming, notificationsFraming } from '@/lib/page-framing'
import { notChosenNotices, notChosenSaid, type StoodDown, type FilledJob } from '@/lib/notify/not-chosen'
import { notificationHref } from '@/lib/notify'

// The owner, who holds every desk: these sentences are about what a
// company's menu heads a page with. `pageFraming` with no reader says
// only what every reader at the company would see (sign-up walk, round
// seven, problem 3).
const OWNER = { permissions: ['*'] as string[] }

/**
 * The client tester's walk of Northbend Athletic on e80773ab9, the
 * conversation side's findings:
 *
 *   - interview times read in UTC on the Interviews page
 *   - the Interviews page was headed "Operate" on a client screen
 *   - the client's Submissions page was titled "Candidates"
 *   - a supplier whose candidate never reached an interview heard
 *     nothing when the job was filled
 *   - bench stay notices were filed under Submissions
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// Tue Oct 6 2026, 16:00 UTC — 9:00 AM in Portland, 11:00 AM in Chicago.
const AT = new Date('2026-10-06T16:00:00Z')

describe('an interview time is said in the reader’s own time zone, and the zone is named', () => {
  it('the reader’s saved time zone wins over the one their browser is in', () => {
    expect(readerZone('America/Chicago', 'America/Los_Angeles')).toBe('America/Chicago')
  })

  it('where the reader never set a time zone, the zone their browser is in is used', () => {
    expect(readerZone(null, 'America/Los_Angeles')).toBe('America/Los_Angeles')
  })

  it('a time zone nobody can read is ignored rather than breaking the page', () => {
    expect(readerZone('Mars/Olympus', 'not a zone')).toBeNull()
    expect(readerZone(undefined, '')).toBeNull()
  })

  it('the round on the Interviews page reads 9:00 AM Pacific for a reader in Portland, not 16:00 UTC', () => {
    const i = {
      round: 1, stage: 'TECHNICAL', mode: 'VIDEO', state: 'CONFIRMED',
      proposedSlots: [], proposedAt: new Date('2026-10-01T00:00:00Z'), scheduledAt: AT, durationMins: 60,
      client: null, vendor: null, consultant: null, noShowBy: null, outcome: null,
    } as unknown as Interview
    const names = { vendor: 'Brightmoor Staffing', client: 'Northbend Athletic', consultant: 'Rajesh Iyer' }
    const says = headline(i, new Date('2026-10-03T00:00:00Z'), names, readerZone(null, 'America/Los_Angeles'))
    expect(says).toContain('PDT')
    expect(says).not.toContain('UTC')
  })

  it('where no zone is known at all, the time says UTC out loud rather than pretending to be local', () => {
    expect(timeFor(AT, null)).toMatch(/4:00\s?PM UTC/)
  })

  it('a time in a letter is written the American way, with the zone named', () => {
    expect(timeFor(AT, 'America/Los_Angeles')).toMatch(/^Tue, Oct 6, 9:00\s?AM PDT$/)
  })

  it('the Interviews page asks the server for its sentences in the browser’s own zone', () => {
    const page = read('src/app/dashboard/interviews/page.tsx')
    expect(page).toMatch(/\/api\/interviews\?tz=/)
    // Through the one door for a moment, so the zone is always named.
    expect(page).toContain('momentFor(new Date(iso), readerZone())')
    expect(page).not.toContain("'en-GB'")
  })
})

const ctx: NoticeContext = {
  interviewId: 'iv1',
  submissionId: 'sub1',
  round: 1,
  stage: 'Technical',
  role: 'HCM integration lead',
  consultant: { id: 'p-rajesh', name: 'Rajesh Iyer' },
  client: { id: 'c-northbend', name: 'Northbend Athletic' },
  vendor: { id: 'c-brightmoor', name: 'Brightmoor Staffing' },
  requesterId: 'p-marcus',
  vendorStaffIds: ['p-recruiter'],
  slotCount: 2,
  when: AT,
  reason: null,
  noShowBy: null,
  timezone: 'America/Los_Angeles',
  zones: { 'p-rajesh': 'America/Chicago', 'p-recruiter': 'America/New_York' },
  slots: [AT, new Date('2026-10-07T16:00:00Z')],
  state: 'CONFIRMED',
}

describe('a candidate’s letter gives the time in their own day', () => {
  it('the letter offering a round lists each time offered in the candidate’s own zone', () => {
    const letter = noticesFor('PROPOSED', ctx).find((n) => n.personId === 'p-rajesh')!
    expect(letter.channel).toBe('EMAIL')
    expect(letter.body).toContain('Tue, Oct 6, 11:00 AM CDT')
    expect(letter.body).toContain('Wed, Oct 7, 11:00 AM CDT')
  })

  it('once all three have said yes, the candidate is told the booked time in their own zone, by email', () => {
    const letter = noticesFor('CONFIRMED', ctx).find((n) => n.personId === 'p-rajesh')!
    expect(letter.channel).toBe('EMAIL')
    expect(letter.title).toBe('Your round 1 with Northbend Athletic is booked')
    expect(letter.body).toContain('Tue, Oct 6, 11:00 AM CDT')
  })

  it('the candidate is not told a round is booked while it still waits on somebody', () => {
    const notices = noticesFor('CONFIRMED', { ...ctx, state: 'PROPOSED' })
    expect(notices.map((n) => n.personId)).toEqual(['p-marcus'])
  })

  it('a candidate who never set a zone reads the time in the client’s zone, named, rather than in UTC', () => {
    const letter = noticesFor('CONFIRMED', { ...ctx, zones: {} }).find((n) => n.personId === 'p-rajesh')!
    expect(letter.body).toContain('9:00 AM PDT')
  })

  it('the client and the supplier each read a booked round in their own zone', () => {
    const notices = noticesFor('ANSWERED_YES', ctx)
    expect(notices.find((n) => n.personId === 'p-marcus')!.body).toContain('9:00 AM PDT')
    expect(notices.find((n) => n.personId === 'p-recruiter')!.body).toContain('12:00 PM EDT')
  })
})

describe('the Interviews and Submissions pages are headed in the reader’s own words', () => {
  it('a client’s Interviews page is headed by the section its own menu puts Submissions under, never Operate', () => {
    const f = pageFraming('CLIENT', 'interviews', null, OWNER)
    expect(f.eyebrow).toBe(pageFraming('CLIENT', 'submissions', null, OWNER).eyebrow)
    expect(f.eyebrow).not.toBe('Operate')
    expect(f.eyebrow).toBeTruthy()
  })

  it('a supplier’s Interviews page is headed by the section its own menu lists Interviews under', () => {
    expect(pageFraming('VENDOR', 'interviews', null, OWNER).eyebrow).toBe('Sell')
    expect(pageFraming('GSI', 'interviews', null, OWNER).eyebrow).toBe('Deliver')
    expect(pageFraming('MSP', 'interviews', null, OWNER).eyebrow).toBe('Demand')
  })

  it('the Interviews page takes its heading from the framing and types no section name of its own', () => {
    const page = read('src/app/dashboard/interviews/page.tsx')
    // And no section at all until the session says whose menu it is:
    // a guessed supplier's word must never flash over a client's page.
    expect(page).toContain("pageFraming(company.kind, 'interviews', null, sidebarPropsFrom(session))")
    expect(page).not.toContain("?? 'VENDOR', 'interviews'")
    expect(page).not.toMatch(/className="eyebrow">\s*Operate/)
  })

  it('a client’s Submissions page is titled Submissions, the word on its own menu', () => {
    expect(pageFraming('CLIENT', 'submissions', null, OWNER).title).toBe('Submissions')
  })

  it('a client reads candidates on its Interviews page, never consultants or vendors', () => {
    const f = pageFraming('CLIENT', 'interviews', null, OWNER)
    expect(f.subtitle).not.toMatch(/consultant|vendor/i)
    expect(f.create).toBeNull()
  })
})

const job: FilledJob = { requirementId: 'req-hcm', filledBy: 'Northbend Athletic', roleTitle: 'HCM integration lead' }
const priya: StoodDown = {
  submissionId: 'sub-priya',
  supplierId: 'c-pinnacle',
  personName: 'Priya Raman',
  submitterId: 'p-recruiter',
  deskIds: ['p-owner', 'p-recruiter', 'p-account'],
  roundCalledOff: false,
}

describe('a supplier whose candidate was not chosen is told when the job is filled', () => {
  it('says in one sentence who filled which job and that their candidate was not chosen, then the one thing to do', () => {
    const said = notChosenSaid(job, 'Priya Raman')
    expect(said.title).toBe('Priya Raman was not chosen for HCM integration lead')
    expect(said.body).toBe(
      'Northbend Athletic filled the HCM integration lead job with another candidate; Priya Raman was not chosen. Please let Priya know.'
    )
  })

  it('names neither the person who was placed nor any rate', () => {
    const [n] = notChosenNotices(job, [priya])
    expect(`${n.title} ${n.body}`).not.toMatch(/\$|\d+\s*(an hour|\/hr)|Daniel/)
  })

  it('the recruiter who put the candidate forward hears on the firm’s channel, and the other desks in the app only', () => {
    const notices = notChosenNotices(job, [priya])
    expect(notices.map((n) => n.personId)).toEqual(['p-recruiter', 'p-owner', 'p-account'])
    expect(notices[0].channel).toBe('TEAMS')
    expect(notices.slice(1).every((n) => n.channel === undefined)).toBe(true)
    expect(notices.every((n) => n.companyId === 'c-pinnacle')).toBe(true)
  })

  it('where nobody knows who submitted, one desk carries the outside copy, so the firm’s channel hears it once', () => {
    const notices = notChosenNotices(job, [{ ...priya, submitterId: null }])
    expect(notices.filter((n) => n.channel === 'TEAMS').map((n) => n.personId)).toEqual(['p-owner'])
  })

  it('a supplier already told that its candidate’s round was called off is not told the same news twice', () => {
    expect(notChosenNotices(job, [{ ...priya, roundCalledOff: true }])).toEqual([])
  })

  it('a supplier with nobody at a desk that puts people forward gets no notice addressed to nobody', () => {
    expect(notChosenNotices(job, [{ ...priya, deskIds: [], submitterId: null }])).toEqual([])
  })

  it('the candidate is not written to: a rejection reaches them through their supplier', () => {
    const notices = notChosenNotices(job, [priya])
    expect(notices.some((n) => n.channel === 'EMAIL')).toBe(false)
  })
})

describe('bench stay notices are filed under Bench', () => {
  it('a bench notice has a type of its own, and clicking it opens the bench', () => {
    expect(notificationHref('BENCH')).toBe('/dashboard/bench')
  })

  it('the notifications page can filter to bench and interview notices, and shows each type as a word', () => {
    // The filters are the reader's own, from one door (lib/page-framing);
    // the page draws whatever that door offers, after "All".
    const page = read('src/app/dashboard/notifications/page.tsx')
    expect(page).toContain('...framing.kinds')
    const supplier = notificationsFraming('VENDOR', false).kinds
    expect(supplier).toContainEqual({ key: 'BENCH', label: 'Bench' })
    expect(supplier).toContainEqual({ key: 'INTERVIEW', label: 'Interviews' })
    const worker = notificationsFraming('VENDOR', true).kinds
    expect(worker).toContainEqual({ key: 'BENCH', label: 'Your bench listing' })
    expect(worker).toContainEqual({ key: 'INTERVIEW', label: 'Interviews' })
    expect(page).not.toMatch(/>\{n\.type\}</)
  })
})
