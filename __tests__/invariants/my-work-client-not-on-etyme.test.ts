import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  weekSigners, signingOrder, waitingWeek, weekDoor, clientWaitingLinks,
  clientOffEtymeBeforeSays, clientOffEtymeAfterSays, type WaitingSheet,
} from '@/lib/consultant-portfolio'

/**
 * The founder, 2026-11-14: "Why can't candidate submit timesheet to
 * client? What if client uses their own system and candidates is forced
 * to use the attachment as evidence." The client approves the hours in
 * its own timesheet system, she saves that approval, and sends it with
 * her week to the firm that employs her. A walk found her own page said
 * the week was "Sent to" a client that is not on Etyme, and hid the
 * attachment behind "Ask the client to approve by email".
 *
 * A world made here: a contractor at a hospital that is not on Etyme,
 * placed by a staffing firm that is.
 */

const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

const LINE = { rungs: [{ companyId: 'emp', companyName: 'Brightmoor Staffing' }] }
const NOT_ON_ETYME = { id: 'cl', name: 'Halden Health', claimedAt: null }
const ON_ETYME = { id: 'cl', name: 'Halden Health', claimedAt: new Date('2026-01-05T00:00:00Z') }

const sheet = (client: { id: string; name: string; claimedAt?: Date | null }, extra: Partial<WaitingSheet> = {}): WaitingSheet => ({
  id: 'ts1',
  periodStart: new Date('2026-11-08T00:00:00Z'),
  periodEnd: new Date('2026-11-14T00:00:00Z'),
  hours: 40,
  submittedAt: new Date('2026-11-14T12:00:00Z'),
  signers: weekSigners(LINE, client).map((s) => ({ ...s, signedAt: null })),
  ...extra,
})
const TODAY = new Date('2026-11-14T18:00:00Z')
const words = (s: string) => s.split(/(?<=\.)\s+/).map((x) => x.split(/\s+/).length)

describe('a client not on Etyme is read once, through lib/off-system', () => {
  it('a client nobody has claimed is marked not on Etyme on the week’s signers, and a claimed client is not', () => {
    expect(weekSigners(LINE, NOT_ON_ETYME)[0]).toMatchObject({ role: 'CLIENT_APPROVAL', offEtyme: true })
    expect(weekSigners(LINE, ON_ETYME)[0].offEtyme).toBeUndefined()
  })

  it('a client whose record was not read is never called not on Etyme', () => {
    expect(weekSigners(LINE, { id: 'cl', name: 'Halden Health' })[0].offEtyme).toBeUndefined()
  })

  it('the worker’s page decides who is not on Etyme through isShell, and its route reads each client’s claim', () => {
    expect(src('lib/consultant-portfolio.ts')).toContain("import { isShell } from '@/lib/off-system'")
    const route = src('app/api/me/work/route.ts')
    expect(route).toContain('claimedAt: client.claimedAt')
    expect(route).toContain('endClientCompany: { select: { id: true, name: true, claimedAt: true } }')
  })
})

describe('before she files', () => {
  it('a worker whose client is not on Etyme is told the client approves in its own system and that she attaches its approval', () => {
    const says = signingOrder(weekSigners(LINE, NOT_ON_ETYME))
    expect(says).toBe(`${clientOffEtymeBeforeSays('Halden Health')} Then Brightmoor Staffing accepts them.`)
    expect(says).toContain('Halden Health is not on Etyme')
    expect(says).toContain('in their own system')
    expect(says).toContain('attach the timesheet they approved')
    expect(says).not.toContain('approves them first')
  })

  it('a client on Etyme still reads as approving the hours first', () => {
    expect(signingOrder(weekSigners(LINE, ON_ETYME))).toBe(
      'After you send, Halden Health approves them first. Then Brightmoor Staffing accepts them.'
    )
  })
})

describe('after she files', () => {
  it('a worker whose client is not on Etyme is told to attach the client’s approval, and is never told her week was sent to them', () => {
    const w = waitingWeek(sheet(NOT_ON_ETYME), TODAY)!
    expect(w.stage).toBe('WAITING_FOR_CLIENT')
    expect(w.says).toBe(clientOffEtymeAfterSays('Halden Health', 'Nov 14'))
    expect(w.says).toMatch(/^Filed on Nov 14\. Halden Health is not on Etyme/)
    expect(w.says).toContain('Attach the timesheet Halden Health approved')
    expect(w.says).not.toMatch(/Sent to|Waiting for them to sign/)
    expect(w.clientOffEtyme).toBe(true)
  })

  it('a week waiting for a client not on Etyme offers attaching its timesheet first and asking by email second, each opening its own tab', () => {
    expect(waitingWeek(sheet(NOT_ON_ETYME), TODAY)!.links).toEqual([
      { href: '/dashboard/weeks/ts1?mode=EVIDENCE', says: 'Attach the timesheet Halden Health approved' },
      { href: '/dashboard/weeks/ts1?mode=LINK', says: 'Ask Halden Health to approve by email' },
    ])
  })

  it('a week waiting for a client on Etyme keeps its one link and its words', () => {
    const w = waitingWeek(sheet(ON_ETYME), TODAY)!
    expect(w.says).toBe('Sent to Halden Health on Nov 14. Waiting for them to sign.')
    expect(w.links).toEqual(clientWaitingLinks({ id: 'ts1', clientName: 'Halden Health', offEtyme: false }))
    expect(w.links).toEqual([{ href: '/dashboard/weeks/ts1', says: 'Ask the client to approve by email' }])
  })

  it('a week the client not on Etyme approved, waiting for her employer, keeps Open this week', () => {
    const s = sheet(NOT_ON_ETYME)
    s.signers[0].signedAt = new Date('2026-11-14T15:00:00Z')
    const w = waitingWeek(s, TODAY)!
    expect(w.stage).toBe('WAITING_FOR_EMPLOYER')
    expect(w.links).toEqual([{ href: '/dashboard/weeks/ts1', says: 'Open this week' }])
  })

  it('every sentence a worker reads about a client not on Etyme is under twenty-five words', () => {
    for (const s of [clientOffEtymeBeforeSays('Halden Health'), clientOffEtymeAfterSays('Halden Health', 'Nov 14')]) {
      for (const n of words(s)) expect(n).toBeLessThanOrEqual(25)
    }
  })
})

describe('her list of weeks', () => {
  const base = { id: 'ts1', status: 'SUBMITTED', clientApproved: false, approvedBy: null }
  const client = { name: 'Halden Health', offEtyme: true }

  it('a week for a client not on Etyme offers attaching its timesheet first and asking by email beside it', () => {
    expect(weekDoor({ ...base, client, email: { clientName: 'Halden Health', refused: null, linkWaiting: null } })).toEqual({
      href: '/dashboard/weeks/ts1?mode=EVIDENCE',
      says: 'Attach the timesheet Halden Health approved',
      also: { href: '/dashboard/weeks/ts1?mode=LINK', says: 'Ask Halden Health to approve by email' },
    })
  })

  it('the two links are offered even where the week’s page could not be asked', () => {
    expect(weekDoor({ ...base, client })?.also?.says).toBe('Ask Halden Health to approve by email')
  })

  it('once a link has gone to the client’s approver, the second link names who it went to', () => {
    const door = weekDoor({ ...base, client, email: { clientName: 'Halden Health', refused: null, linkWaiting: { to: 'Dana Whitfield', on: 'Nov 14' }, emailLeaves: true } })
    expect(door?.says).toBe('Attach the timesheet Halden Health approved')
    expect(door?.also).toEqual({ href: '/dashboard/weeks/ts1?mode=LINK', says: 'Link sent to Dana Whitfield, Nov 14' })
  })

  it('where no email can leave this deployment, a week for a client not on Etyme never says a link was sent and still offers to ask by email', () => {
    const door = weekDoor({ ...base, client, email: { clientName: 'Halden Health', refused: null, linkWaiting: { to: 'Dana Whitfield', on: 'Nov 14' }, emailLeaves: false } })
    expect(door?.says).toBe('Attach the timesheet Halden Health approved')
    expect(door?.also).toEqual({ href: '/dashboard/weeks/ts1?mode=LINK', says: 'Ask Halden Health to approve by email' })
  })

  it('the worker’s list reads whether email can leave from mailLeaves, the one answer, in its route and never on the page', () => {
    const route = src('app/api/me/work/route.ts')
    expect(route).toContain("import { mailLeaves } from '@/lib/notify/mail-leaves'")
    expect(route).toContain('emailLeaves: mailLeaves()')
    expect(src('lib/consultant-portfolio.ts')).not.toContain('mail-leaves')
  })

  it('a week a client not on Etyme cannot approve this way is never said to be signed in Etyme', () => {
    const door = weekDoor({ ...base, client, email: { clientName: 'Halden Health', refused: 'A week like this is signed in Etyme …', linkWaiting: null } })
    expect(door).toEqual({ href: '/dashboard/weeks/ts1', says: 'See what this week needs' })
  })

  it('a week for a client on Etyme keeps its one link', () => {
    expect(weekDoor({ ...base, client: { name: 'Halden Health', offEtyme: false } })).toEqual({
      href: '/dashboard/weeks/ts1', says: 'Ask the client to approve by email',
    })
  })
})

describe('on a phone, 390 wide', () => {
  const page = src('app/dashboard/my-work/page.tsx')

  it('the page draws every link a waiting week carries, one a line, and both links on a row of her hours', () => {
    expect(page).toContain('(w.links ?? [')
    expect(page).toContain('t.door.also &&')
    expect(page).toContain('flex flex-col items-start gap-1')
  })

  it('a row of her hours puts the week and its links on a line of their own, so nothing is pushed off the right edge', () => {
    expect(page).toContain('flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1')
    expect(page).toContain('flex-1 min-w-0 basis-full sm:basis-0')
  })
})
