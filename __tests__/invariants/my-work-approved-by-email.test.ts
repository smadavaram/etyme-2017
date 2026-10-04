import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { waitingWeek, weekSigners, weekDoor, type WaitingSheet } from '@/lib/consultant-portfolio'

/**
 * The worker's own page says who approved her week when the client
 * approved it by email, and links each week she sent to its own page.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"): a week approved by evidence says so
 * — "Approved by email: Dana Whitfield, Oct 2 — evidence attached" — and
 * never that the client signed in Etyme.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

const CHAIN = weekSigners(
  {
    rungs: [
      { companyId: 'techpeple', companyName: 'Techpeple' },
      { companyId: 'csi', companyName: 'Computer Systems Inc' },
    ],
  },
  { id: 'northbend', name: 'Northbend Athletic' }
)

function sent(signedAt: Record<string, string>, clientApproval?: string | null): WaitingSheet {
  return {
    id: 'ts9',
    periodStart: d('2026-09-14'),
    periodEnd: d('2026-09-20'),
    hours: 40,
    submittedAt: d('2026-09-18'),
    signers: CHAIN.map((x) => ({ ...x, signedAt: signedAt[x.companyId] ? d(signedAt[x.companyId]) : null })),
    clientApproval,
  }
}

const BY_EMAIL = 'Approved by email: Marcus Oyelaran, Sep 21 — evidence attached'

describe('the worker reads who approved her week when the client approved it by email', () => {
  it('a week the client approved by email says who approved it and when, and not that the client signed', () => {
    const w = waitingWeek(sent({ northbend: '2026-09-21' }, BY_EMAIL), d('2026-09-22'))!
    expect(w.stage).toBe('WAITING_FOR_EMPLOYER')
    expect(w.says).toBe(
      'Approved by email: Marcus Oyelaran, Sep 21 — evidence attached. ' +
        'Waiting for Computer Systems Inc to accept it, then Techpeple. It is owed to you once Techpeple accepts it.'
    )
    expect(w.says).not.toContain('Northbend Athletic signed it')
  })

  it('a week the client signed in Etyme still reads as signed by the client', () => {
    const w = waitingWeek(sent({ northbend: '2026-09-21' }, null), d('2026-09-22'))!
    expect(w.says).toContain('Northbend Athletic signed it on Sep 21.')
  })

  it('the approval by email replaces only the client’s line: a firm in the middle that accepted still reads as accepted', () => {
    const w = waitingWeek(sent({ northbend: '2026-09-21', csi: '2026-09-22' }, BY_EMAIL), d('2026-09-23'))!
    expect(w.says).toContain(`${BY_EMAIL}. Computer Systems Inc accepted it on Sep 22. Waiting for Techpeple to accept it.`)
  })

  it('a week still waiting for the client carries no approval sentence, even if one is passed', () => {
    const w = waitingWeek(sent({}, BY_EMAIL), d('2026-09-19'))!
    expect(w.stage).toBe('WAITING_FOR_CLIENT')
    expect(w.says).toBe('Sent to Northbend Athletic on Sep 18. Waiting for them to sign.')
  })

  it('the approval sentence carries a name and a day and no money', () => {
    const w = waitingWeek(sent({ northbend: '2026-09-21' }, BY_EMAIL), d('2026-09-22'))!
    expect(w.says).not.toMatch(/\$|rate|cents/i)
    expect(Object.keys(w).filter((k) => /cents|owed|rate/i.test(k))).toEqual([])
  })
})

describe('each week she sent links to its own page', () => {
  it('a week waiting for the client links to its page to ask the client to approve by email', () => {
    expect(weekDoor({ id: 'ts1', status: 'SUBMITTED', clientApproved: false, approvedBy: null })).toEqual({
      href: '/dashboard/weeks/ts1',
      says: 'Ask the client to approve by email',
    })
  })

  it('a week approved by email links to its page to see the approval and its evidence', () => {
    expect(weekDoor({ id: 'ts2', status: 'APPROVED', clientApproved: true, approvedBy: BY_EMAIL })).toEqual({
      href: '/dashboard/weeks/ts2',
      says: 'See the approval and its evidence',
    })
  })

  it('a week signed in Etyme, or sent back, still links to its own page', () => {
    expect(weekDoor({ id: 'ts3', status: 'APPROVED', clientApproved: true, approvedBy: null })?.says).toBe('Open this week')
    expect(weekDoor({ id: 'ts4', status: 'SUBMITTED', clientApproved: true, approvedBy: null })?.says).toBe('Open this week')
    expect(weekDoor({ id: 'ts5', status: 'REJECTED', clientApproved: false, approvedBy: null })?.href).toBe('/dashboard/weeks/ts5')
  })

  it('a week she has not sent has no link: the form to file it is the way in', () => {
    expect(weekDoor({ id: 'ts6', status: 'OPEN', clientApproved: false, approvedBy: null })).toBeNull()
  })
})

describe('the worker’s page reads approvals through the one door and shows no rate it should not', () => {
  const route = readFileSync(join(__dirname, '../../src/app/api/me/work/route.ts'), 'utf8')
  const page = readFileSync(join(__dirname, '../../src/app/dashboard/my-work/page.tsx'), 'utf8')

  it('the worker’s page asks lib/week-approval who approved her weeks, rather than working it out a second way', () => {
    expect(route).toMatch(/import \{ approvalWordsFor[^}]*\} from '@\/lib\/week-approval'/)
    expect(route).toContain('approvalWords.get(t.id)')
    expect(route).not.toMatch(/prisma\.weekApproval/)
  })

  it('her list of weeks carries the approval sentence and the link, and no bill rate', () => {
    const list = route.slice(route.indexOf('timesheets: timesheets.map('), route.indexOf('sharedAboutMe:'))
    expect(list).toContain('approvedBy:')
    expect(list).toContain('door: weekDoor(')
    expect(list).not.toMatch(/billRate|rateCents|payRate/)
  })

  it('the page links her weeks to /dashboard/weeks', () => {
    expect(page).toContain('/dashboard/weeks/${w.sheetId}')
    expect(page).toContain('t.door.href')
    expect(page).toContain('t.approvedBy')
  })
})
