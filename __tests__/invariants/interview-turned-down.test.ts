import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { noticesFor, turnedDownReason, openRounds, type NoticeContext } from '@/lib/interview-notices'
import { timeFor, headline, type Interview } from '@/lib/interviews'
import { pageFraming, sectionOfHref } from '@/lib/page-framing'

/**
 * A candidate turned down has their open rounds called off, and the
 * people who would have been in the room are told.
 *
 * The client tester, 2026-10-03: after an award, the other candidates'
 * rounds still read "In all three diaries", and a time offered read
 * "16:00 UTC" to a hiring manager in Tualatin.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** 9:00 AM in Portland on a Tuesday in October. */
const AT = new Date('2026-10-06T16:00:00Z')

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
  slotCount: 1,
  when: AT,
  reason: turnedDownReason('NOT_SELECTED'),
  noShowBy: null,
  timezone: 'America/Los_Angeles',
  zones: { 'p-rajesh': 'America/Chicago', 'p-recruiter': 'America/New_York' },
  state: 'CANCELLED',
}

describe('a client’s Interviews and AP pages read Workforce, never Operate', () => {
  it('a client’s Interviews page is headed Workforce', () => {
    expect(pageFraming('CLIENT', 'interviews').eyebrow).toBe('Workforce')
  })

  it('a client’s accounts payable page is headed Workforce, the section its own menu lists it under', () => {
    expect(sectionOfHref('CLIENT', '/dashboard/ap')).toBe('Workforce')
  })

  it('no shared page reads Operate, Sell or Procure to a client', () => {
    const keys = ['contracts.sell', 'contracts.buy', 'requirements', 'submissions', 'interviews', 'rolloff', 'timesheets', 'invoices', 'expenses', 'consultants'] as const
    for (const k of keys) expect([k, pageFraming('CLIENT', k).eyebrow]).toEqual([k, 'Workforce'])
  })

  it('the Interviews page shows no section until it knows whose menu the reader has', () => {
    const page = read('src/app/dashboard/interviews/page.tsx')
    expect(page).toContain("company ? pageFraming(company.kind, 'interviews') : null")
  })
})

describe('an interview time is shown in the reader’s own zone', () => {
  it('a hiring manager in Tualatin reads a 9am round as 9:00 AM PDT, not 16:00 UTC', () => {
    expect(timeFor(AT, 'America/Los_Angeles')).toBe('Tue, Oct 6, 9:00 AM PDT')
  })

  it('a reader outside the US is given the place beside the offset, through the shared formatter', () => {
    expect(timeFor(AT, 'Asia/Kolkata')).toMatch(/^Tue, Oct 6, 9:30 PM (IST|GMT\+5:30 \(Kolkata time\))$/)
  })

  it('a reader whose zone nobody knows is told the time in UTC, and the line says UTC', () => {
    expect(timeFor(AT, null)).toBe('Tue, Oct 6, 4:00 PM UTC')
    expect(timeFor(AT, 'Not/AZone')).toBe('Tue, Oct 6, 4:00 PM UTC')
  })

  it('a booked round’s headline names the reader’s own time and zone', () => {
    const i = { round: 1, state: 'CONFIRMED', scheduledAt: AT } as unknown as Interview
    expect(headline(i, AT, { vendor: 'Brightmoor Staffing', client: 'Northbend Athletic', consultant: 'Rajesh Iyer' }, 'America/Los_Angeles'))
      .toBe('Round 1, Tue, Oct 6, 9:00 AM PDT. In all three diaries.')
  })

  it('the Interviews page prints a time through the shared formatter in the reader’s own zone', () => {
    const page = read('src/app/dashboard/interviews/page.tsx')
    expect(page).toContain("import { momentFor, readerZone } from '@/lib/when'")
    expect(page).not.toMatch(/toLocaleString\(/)
  })
})

describe('when a candidate is turned down their open rounds are cancelled and both the supplier and the candidate are told', () => {
  it('a candidate not chosen is told the job went to someone else, in one sentence', () => {
    expect(turnedDownReason('NOT_SELECTED')).toBe('The job went to someone else, so this interview is cancelled.')
  })

  it('a rejected candidate’s round is called off without the reason, because the supplier tells them', () => {
    expect(turnedDownReason('REJECTED')).toBe('This interview is cancelled.')
  })

  it('a withdrawn candidate’s round says they were withdrawn', () => {
    expect(turnedDownReason('WITHDRAWN')).toBe('The candidate was withdrawn, so this interview is cancelled.')
  })

  it('only a round still ahead is called off; one already held, missed or called off is left alone', () => {
    const rounds = ['PROPOSED', 'CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELLED'].map((state, i) => ({ id: `r${i}`, state }))
    expect(openRounds(rounds).map((r) => r.id)).toEqual(['r0', 'r1'])
  })

  it('the supplier’s desk is told in the app, with the booked time in its own zone', () => {
    const n = noticesFor('CANCELLED', ctx).find((x) => x.personId === 'p-recruiter')!
    expect(n.channel).toBeUndefined()
    expect(n.type).toBe('INTERVIEW')
    expect(n.title).toBe('Round 1 for Rajesh Iyer at Northbend Athletic is off')
    expect(n.body).toBe('For HCM integration lead, Tue, Oct 6, 12:00 PM EDT. The job went to someone else, so this interview is cancelled.')
  })

  it('the candidate is told by email, in their own zone, and that their supplier will be in touch', () => {
    const n = noticesFor('CANCELLED', ctx).find((x) => x.personId === 'p-rajesh')!
    expect(n.channel).toBe('EMAIL')
    expect(n.title).toBe('Your round 1 with Northbend Athletic is off')
    expect(n.body).toBe('For HCM integration lead, Tue, Oct 6, 11:00 AM CDT. The job went to someone else, so this interview is cancelled. Brightmoor Staffing will be in touch.')
  })

  it('a round that was never booked is called off without a time', () => {
    const n = noticesFor('CANCELLED', { ...ctx, when: null }).find((x) => x.personId === 'p-recruiter')!
    expect(n.body).toBe('For HCM integration lead. The job went to someone else, so this interview is cancelled.')
  })

  it('a title starts with a capital, the way a sentence does', () => {
    for (const n of noticesFor('CANCELLED', ctx)) expect(n.title[0]).toBe(n.title[0].toUpperCase())
  })

  it('each of the three is told once', () => {
    const ids = noticesFor('CANCELLED', ctx).map((n) => n.personId).sort()
    expect(ids).toEqual(['p-marcus', 'p-rajesh', 'p-recruiter'])
  })
})
