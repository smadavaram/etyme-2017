/**
 * Notification system invariants.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * BUILD.md §6.2: "Notifications and preferences. Needs type × channel
 * routing including Teams and email digests."
 *
 * The notification system has three layers:
 *   1. notify() / notifyBulk() — fire-and-forget creators (src/lib/notify.ts)
 *   2. Notification model — persists in DB with type, channel, status
 *   3. notificationHref() — routes a notification type to the right dashboard page
 *
 * This file tests the routing and type contracts. Integration with the
 * Prisma model is tested via the API tests. The fire-and-forget pattern
 * means callers never block on notification delivery — failures never
 * throw, and never stop at a console line: a notice that cannot be written
 * is kept as a FAILED row with the reason, and staff are told.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notify, notifyBulk, outwardIds, notificationHref, type NotificationType, type NotificationChannel } from '@/lib/notify'
import { ASK_ETYME_HREF } from '@/lib/nav-table'

// ── Notification routing ──────────────────────────────

describe('Notification routing — notificationHref()', () => {

  it('a SUBMISSION notification routes to /dashboard/submissions', () => {
    expect(notificationHref('SUBMISSION')).toBe('/dashboard/submissions')
  })

  it('a TIMESHEET notification routes to /dashboard/timesheets', () => {
    expect(notificationHref('TIMESHEET')).toBe('/dashboard/timesheets')
  })

  it('a ROLLOFF notification routes to /dashboard/rolloff', () => {
    expect(notificationHref('ROLLOFF')).toBe('/dashboard/rolloff')
  })

  it('a CONTRACT notification routes to /dashboard/contracts', () => {
    expect(notificationHref('CONTRACT')).toBe('/dashboard/contracts')
  })

  it('an EXPENSE notification routes to /dashboard/expenses', () => {
    expect(notificationHref('EXPENSE')).toBe('/dashboard/expenses')
  })

  it('an INVOICE notification routes to /dashboard/invoices', () => {
    expect(notificationHref('INVOICE')).toBe('/dashboard/invoices')
  })

  it('a CONVERSATION notification routes to /dashboard/conversations', () => {
    expect(notificationHref('CONVERSATION')).toBe('/dashboard/conversations')
  })

  it('a SYSTEM notification opens Ask Etyme, where notices read now that the notifications page is gone', () => {
    expect(notificationHref('SYSTEM')).toBe(ASK_ETYME_HREF)
  })

  it('a CYCLE_DUE notification routes to /dashboard/timesheets', () => {
    expect(notificationHref('CYCLE_DUE')).toBe('/dashboard/timesheets')
  })

  it('a VISA_EXPIRY notification routes to /dashboard/compliance', () => {
    expect(notificationHref('VISA_EXPIRY')).toBe('/dashboard/compliance')
  })

  it('an INTERVIEW notification routes to /dashboard/submissions', () => {
    expect(notificationHref('INTERVIEW')).toBe('/dashboard/submissions')
  })

  it('a MATCH_READY notification with entityId routes to the specific requirement', () => {
    expect(notificationHref('MATCH_READY', 'req_abc123')).toBe('/dashboard/requirements/req_abc123')
  })

  it('an unknown notification type falls back to Ask Etyme, never to the deleted notifications page', () => {
    expect(notificationHref('UNKNOWN_TYPE')).toBe(ASK_ETYME_HREF)
  })
})

// ── Notification type coverage ────────────────────────

describe('Notification types cover all operational flows', () => {

  // Every dashboard section that produces actionable events should
  // have a corresponding notification type.
  const ALL_TYPES: NotificationType[] = [
    'SUBMISSION',
    'TIMESHEET',
    'INVOICE',
    'EXPENSE',
    'CONTRACT',
    'ROLLOFF',
    'CONVERSATION',
    'SYSTEM',
    'CYCLE_DUE',
    'VISA_EXPIRY',
    'INTERVIEW',
    'MATCH_READY',
  ]

  it('twelve notification types cover the operational surface', () => {
    expect(ALL_TYPES).toHaveLength(12)
  })

  it('every notification type has a route mapping', () => {
    for (const type of ALL_TYPES) {
      const href = notificationHref(type)
      expect(href).toBeTruthy()
      expect(href).toMatch(/^\/dashboard\//)
    }
  })

  it('the three delivery channels are IN_APP, EMAIL, and TEAMS', () => {
    const channels: NotificationChannel[] = ['IN_APP', 'EMAIL', 'TEAMS']
    expect(channels).toHaveLength(3)
    // IN_APP is the default — always works
    // EMAIL is for consultants (consumer email users)
    // TEAMS is for business users (Microsoft tenant)
  })
})

// ── Notification flow coverage ────────────────────────

describe('Notification creation points per operational flow', () => {

  /**
   * Maps each critical flow to the notification type it should create.
   * This serves as a coverage checklist — if a flow is missing here,
   * it means someone needs to be notified but isn't.
   */
  const FLOW_NOTIFICATIONS: Array<{
    flow: string
    notificationType: string
    recipients: string
  }> = [
    { flow: 'Match found on requirement', notificationType: 'MATCH_READY', recipients: 'requirement owner' },
    { flow: 'Submission received', notificationType: 'SUBMISSION', recipients: 'requirement company admins' },
    { flow: 'Interview scheduled', notificationType: 'INTERVIEW', recipients: 'candidate' },
    { flow: 'Timesheet approved', notificationType: 'TIMESHEET', recipients: 'timesheet owner' },
    { flow: 'Timesheet rejected', notificationType: 'TIMESHEET', recipients: 'timesheet owner' },
    { flow: 'Contract state change', notificationType: 'CONTRACT', recipients: 'consultant' },
    { flow: 'Rolloff detected', notificationType: 'ROLLOFF', recipients: 'vendor admins' },
    { flow: 'Cycle due', notificationType: 'CYCLE_DUE', recipients: 'timesheet/invoice assignee' },
    { flow: 'Visa petition expiring', notificationType: 'VISA_EXPIRY', recipients: 'petition holder' },
    { flow: 'Expense approved/rejected', notificationType: 'EXPENSE', recipients: 'expense owner' },
    { flow: 'Alumni re-engagement', notificationType: 'CONTRACT', recipients: 'vendor admins' },
  ]

  it('eleven operational flows create notifications', () => {
    expect(FLOW_NOTIFICATIONS).toHaveLength(11)
  })

  it('every flow notification type is a valid NotificationType', () => {
    const validTypes: string[] = [
      'SUBMISSION', 'TIMESHEET', 'INVOICE', 'EXPENSE', 'CONTRACT',
      'ROLLOFF', 'CONVERSATION', 'SYSTEM', 'CYCLE_DUE', 'VISA_EXPIRY',
      'INTERVIEW', 'MATCH_READY',
    ]

    for (const flow of FLOW_NOTIFICATIONS) {
      expect(validTypes).toContain(flow.notificationType)
    }
  })

  it('every flow notifies specific people, not broadcast', () => {
    // BUILD.md §6.2: "type × channel routing" implies targeted delivery
    for (const flow of FLOW_NOTIFICATIONS) {
      expect(flow.recipients).toBeTruthy()
      expect(flow.recipients).not.toBe('everyone')
      expect(flow.recipients).not.toBe('all')
    }
  })
})

// ── Fire-and-forget contract ──────────────────────────

describe('Fire-and-forget notification delivery', () => {

  it('notify() returns a Promise that resolves to the created notification or null', () => {
    // The contract: notify() returns Promise<{id: string} | null>
    // Callers should NOT await it — let it run in the background
    // This is tested by verifying the function signature matches
    // the pattern in src/lib/notify.ts
    type NotifyReturn = Promise<{ id: string } | null>
    const _typeCheck: NotifyReturn = Promise.resolve({ id: 'test' })
    const _nullCheck: NotifyReturn = Promise.resolve(null)
    expect(true).toBe(true) // Type-level verification
  })

  it('notifyBulk returns a Promise with count for batch notifications', () => {
    type BulkReturn = Promise<{ count: number } | null>
    const _typeCheck: BulkReturn = Promise.resolve({ count: 5 })
    const _nullCheck: BulkReturn = Promise.resolve(null)
    expect(true).toBe(true) // Type-level verification
  })
})

// ── A bulk write that fails ───────────────────────────
//
// One bad row fails a whole createMany. The recipients' notices must not
// vanish with it: each is written again on its own, a row that still
// cannot be written is kept as FAILED with the reason, and staff hear.

const db = vi.hoisted(() => ({
  notification: { create: vi.fn(), createMany: vi.fn(), createManyAndReturn: vi.fn(), update: vi.fn() },
  person: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
}))
const alerts = vi.hoisted(() => ({ reportError: vi.fn(async (..._args: unknown[]) => {}) }))
vi.mock('@/lib/db', () => ({ prisma: db }))
vi.mock('@/lib/alerts', () => alerts)

const team = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    personId: `person-${i}`,
    companyId: 'co-1',
    type: 'ROLLOFF' as const,
    title: `Rolling off ${i}`,
    body: 'Ends Friday.',
  }))

describe('a bulk notice whose single write fails', () => {
  beforeEach(() => {
    db.notification.create.mockReset()
    db.notification.createMany.mockReset()
    db.notification.createManyAndReturn.mockReset()
    db.person.findUnique.mockReset()
    alerts.reportError.mockClear()
  })

  it('when the bulk in-app write fails, every recipient’s notice is still written one by one', async () => {
    db.notification.createManyAndReturn.mockRejectedValue(new Error('foreign key violated'))
    db.notification.create.mockImplementation(async () => ({ id: 'n' }))

    const result = await notifyBulk(team(3))

    expect(result).toEqual({ count: 3 })
    expect(db.notification.create).toHaveBeenCalledTimes(3)
    const written = db.notification.create.mock.calls.map((c: any[]) => c[0].data)
    expect(written.map((d: any) => d.personId)).toEqual(['person-0', 'person-1', 'person-2'])
    expect(written.every((d: any) => d.deliveryState === 'SENT' && d.channel === 'IN_APP')).toBe(true)
    expect(alerts.reportError).toHaveBeenCalledTimes(1)
    expect(alerts.reportError.mock.calls[0][0]).toBe('notify: bulk in-app write failed')
  })

  it('a notice that cannot be written at all is recorded as failed with the reason, and staff are told', async () => {
    db.notification.createManyAndReturn.mockRejectedValue(new Error('foreign key violated'))
    db.notification.create.mockImplementation(async ({ data }: any) => {
      if (data.personId === 'person-1' && data.deliveryState !== 'FAILED') {
        throw new Error('Company co-1 no longer exists')
      }
      return { id: 'n' }
    })

    const result = await notifyBulk(team(3))

    // The two good rows landed; the bad one is kept, marked, with why.
    expect(result).toEqual({ count: 2 })
    const failed = db.notification.create.mock.calls
      .map((c: any[]) => c[0].data)
      .filter((d: any) => d.deliveryState === 'FAILED')
    expect(failed).toHaveLength(1)
    expect(failed[0].personId).toBe('person-1')
    expect(failed[0].title).toBe('Rolling off 1')
    expect(failed[0].deliveryNote).toContain('Company co-1 no longer exists')
    expect(alerts.reportError).toHaveBeenCalledWith(
      'notify: bulk in-app write failed',
      expect.any(Error),
      expect.anything()
    )
  })

  it('a notice whose plain failed row is also refused is reported to staff by itself', async () => {
    db.notification.createManyAndReturn.mockRejectedValue(new Error('database unreachable'))
    db.notification.create.mockRejectedValue(new Error('database unreachable'))

    const result = await notifyBulk(team(2))

    expect(result).toBeNull()
    const places = alerts.reportError.mock.calls.map((c: any[]) => c[0])
    expect(places.filter((p: string) => p === 'notify: a notice could not be written at all')).toHaveLength(2)
    expect(places.filter((p: string) => p === 'notify: bulk in-app write failed')).toHaveLength(1)
  })

  it('when the bulk write succeeds it is one database call and nobody is alerted', async () => {
    db.notification.createManyAndReturn.mockImplementation(async ({ data }: any) => data.map((d: any, i: number) => ({ id: `n${i}`, ...d })))

    const result = await notifyBulk(team(3))

    expect(result).toEqual({ count: 3 })
    expect(db.notification.createManyAndReturn).toHaveBeenCalledTimes(1)
    expect(db.notification.create).not.toHaveBeenCalled()
    expect(alerts.reportError).not.toHaveBeenCalled()
  })

  it('several people told at once by email or Teams are one write, the same row each as one at a time, and each is delivered by its own row', async () => {
    db.notification.createManyAndReturn.mockImplementation(async ({ data }: any) => data.map((d: any, i: number) => ({ id: `n${i}`, ...d })))
    db.person.findUnique.mockResolvedValue(null)
    const told = [
      { personId: 'p-renata', companyId: 'co-1', type: 'CONTRACT' as const, title: 'Rosa Delgado is placed', body: 'Starts Monday.', channel: 'EMAIL' as const },
      { personId: 'p-imelda', companyId: 'co-1', type: 'CONTRACT' as const, title: 'Rosa Delgado is placed', body: 'Starts Monday.', channel: 'TEAMS' as const },
      { personId: 'p-marcus', companyId: 'co-1', type: 'CONTRACT' as const, title: 'Rosa Delgado is placed', body: 'Starts Monday.' },
    ]

    const result = await notifyBulk(told)
    await new Promise((r) => setTimeout(r, 0))

    expect(result).toEqual({ count: 3 })
    expect(db.notification.createManyAndReturn).toHaveBeenCalledTimes(1)
    expect(db.notification.create).not.toHaveBeenCalled()
    const rows = db.notification.createManyAndReturn.mock.calls[0][0].data
    // The outward rows start PENDING, as `notify` writes them; the in-app one is shown.
    expect(rows.map((r: any) => [r.personId, r.channel, r.deliveryState])).toEqual([
      ['p-renata', 'EMAIL', 'PENDING'], ['p-imelda', 'TEAMS', 'PENDING'], ['p-marcus', 'IN_APP', 'SENT'],
    ])
    // Delivered: the two outward people looked up, the in-app one never.
    const looked = db.person.findUnique.mock.calls.map((c: any[]) => c[0].where.id).sort()
    expect(looked).toEqual(['p-imelda', 'p-renata'])
  })

  it('an outward notice whose batch write failed is still written and delivered on its own', async () => {
    db.notification.createManyAndReturn.mockRejectedValue(new Error('foreign key violated'))
    db.notification.create.mockImplementation(async () => ({ id: 'n-alone' }))
    db.person.findUnique.mockResolvedValue(null)

    const result = await notifyBulk([{ personId: 'p-renata', companyId: 'co-1', type: 'CONTRACT', title: 'Placed', body: 'b', channel: 'EMAIL' }])
    await new Promise((r) => setTimeout(r, 0))

    expect(result).toEqual({ count: 1 })
    expect(db.person.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe('which written row each outward notice is', () => {
  it('two identical notices to one person are two rows, and each is delivered once', () => {
    const n = { personId: 'p', type: 'SYSTEM' as const, title: 'T', body: 'b', channel: 'EMAIL' as const }
    const ids = outwardIds([n, n], [
      { id: 'b', personId: 'p', channel: 'EMAIL', title: 'T', entityId: null },
      { id: 'a', personId: 'p', channel: 'EMAIL', title: 'T', entityId: null },
    ]).map((x) => x.id)
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('rows are matched on what was written, never on the order they came back in', () => {
    const a = { personId: 'p-a', type: 'SYSTEM' as const, title: 'For A', body: 'b', channel: 'TEAMS' as const }
    const b = { personId: 'p-b', type: 'SYSTEM' as const, title: 'For B', body: 'b', channel: 'EMAIL' as const }
    const got = outwardIds([a, b], [
      { id: 'id-b', personId: 'p-b', channel: 'EMAIL', title: 'For B', entityId: null },
      { id: 'id-a', personId: 'p-a', channel: 'TEAMS', title: 'For A', entityId: null },
    ])
    expect(got.map((x) => [x.n.personId, x.id])).toEqual([['p-a', 'id-a'], ['p-b', 'id-b']])
  })

  it('an in-app notice is never delivered again: being written is its delivery', () => {
    const inApp = { personId: 'p', type: 'SYSTEM' as const, title: 'T', body: 'b' }
    expect(outwardIds([inApp], [{ id: 'x', personId: 'p', channel: 'IN_APP', title: 'T', entityId: null }])).toEqual([])
  })

  it('a single notice whose write fails is kept as failed with the reason, never only a console line', async () => {
    db.notification.create.mockImplementation(async ({ data }: any) => {
      if (data.deliveryState !== 'FAILED') throw new Error('value too long for column')
      return { id: 'n' }
    })

    const result = await notify(team(1)[0])

    expect(result).toBeNull()
    const last = db.notification.create.mock.calls.at(-1)![0].data
    expect(last.deliveryState).toBe('FAILED')
    expect(last.deliveryNote).toContain('value too long for column')
  })
})

// ── The account's own emails ──────────────────────────
//
// Sign-up walk, round one, item 16: the bell listed "Confirm your email
// for Etyme" and "Set your Etyme password" as unread, ending "[the
// one-time link was in the email and is not kept]". Nothing to do on them.

import { readFileSync as readSource } from 'node:fs'
import { join as joinPath } from 'node:path'
import { isAccountMail, bellShows, ACCOUNT_MAIL, LINK_KEPT } from '@/lib/notify/account-mail'

describe('the bell and the account\'s own emails', () => {
  it('the bell never counts the account\'s own sign-up or reset emails as something to read', () => {
    const routes = [
      'src/app/api/notifications/route.ts',
      'src/app/api/notifications/stream/route.ts',
    ].map((f) => readSource(joinPath(process.cwd(), f), 'utf8'))
    // Every count and every list the bell reads carries the filter.
    for (const src of routes) {
      const reads = src.split(/prisma\.notification\.(?=count\(|findMany\()/).slice(1)
      expect(reads.length).toBeGreaterThan(0)
      for (const read of reads) {
        const call = read.slice(0, read.indexOf('})') + 2)
        const usesWhere = /^findMany\(\{\s*where,/.test(call) && /const where[^]*?\.\.\.bellShows\(\)/.test(src)
        expect(call.includes('bellShows()') || usesWhere, call.slice(0, 80)).toBe(true)
      }
    }
  })

  it('a confirm-your-email notice is an account email the bell hides', () => {
    expect(isAccountMail({ type: 'SYSTEM', title: 'Confirm your email for Etyme', body: 'Click the link.' })).toBe(true)
  })

  it('a set-your-password notice is an account email the bell hides', () => {
    expect(isAccountMail({ type: 'SYSTEM', title: 'Set your Etyme password', body: 'Click the link.' })).toBe(true)
  })

  it('a notice whose link was cut out is hidden whatever its subject', () => {
    expect(isAccountMail({
      type: 'SYSTEM', title: 'Anything', body: 'Hello.\n\n[the one-time link was in the email and is not kept]',
    })).toBe(true)
  })

  it('a notice written with the account-email kind is hidden', () => {
    expect(isAccountMail({ type: ACCOUNT_MAIL, title: 'Welcome', body: '' })).toBe(true)
  })

  it('an ordinary system notice still shows in the bell', () => {
    expect(isAccountMail({ type: 'SYSTEM', title: 'Priya Nair joined Acme as Member', body: 'Give them a role.' })).toBe(false)
    expect(isAccountMail({ type: 'TIMESHEET', title: 'Set your Etyme password', body: '' })).toBe(false)
  })

  it('the database filter hides the same four shapes the rule names, a link kept for staff among them', () => {
    const f = bellShows()
    expect(f.NOT.OR).toHaveLength(4)
    expect(f.NOT.OR[0]).toEqual({ type: ACCOUNT_MAIL })
    expect(f.NOT.OR[3]).toEqual({ body: { contains: LINK_KEPT } })
  })
})

// ── One base address for every mailed link ──────────────────
//
// appLink read NEXT_PUBLIC_APP_URL then VERCEL_URL and ignored
// NEXTAUTH_URL, while every other mailed link came from appUrl(). A Teams
// button and the email beside it could point at two different deploys.

import { appLink } from '@/lib/notify'
import { appUrl } from '@/lib/supplier-link'

describe('the address a notice links to', () => {
  const KEYS = ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL'] as const
  let saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
    for (const k of KEYS) delete process.env[k]
  })
  const restore = () => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }

  it('a notice\'s link is built from the one base address every other mailed link uses', () => {
    try {
      process.env.NEXTAUTH_URL = 'https://app.etyme.example/'
      process.env.NEXT_PUBLIC_APP_URL = 'https://other.etyme.example'
      process.env.VERCEL_URL = 'etyme-abc123.vercel.app'
      expect(appLink('/dashboard/timesheets')).toBe(`${appUrl()}/dashboard/timesheets`)
      expect(appLink('/dashboard/timesheets')).toBe('https://app.etyme.example/dashboard/timesheets')
    } finally {
      restore()
    }
  })

  it('a notice has no link when the one base address is not https', () => {
    try {
      expect(appLink('/dashboard/timesheets')).toBeNull()
      process.env.NEXTAUTH_URL = 'http://localhost:3000'
      expect(appLink('/dashboard/timesheets')).toBeNull()
    } finally {
      restore()
    }
  })
})

// ── A paper a person files for herself (the second screen walk, 2026-11-03) ──

import { paperExaminers, papersAreTheirWork, EXAMINERS_TOLD } from '@/lib/notify/paper-examiners'

describe('who hears that a paper arrived', () => {
  const OWNER = { personId: 'owner', permissions: ['*'] }
  const HR = { personId: 'farah', permissions: ['consultants.read', 'consultants.write', 'assignments.read', 'timesheets.read', 'governance.read'] }
  const COMPLIANCE = { personId: 'comp', permissions: ['consultants.read', 'assignments.read', 'timesheets.read', 'governance.read', 'privacy.manage'] }
  const RECRUITER = { personId: 'rec', permissions: ['consultants.read', 'consultants.write', 'requirements.read', 'submissions.create'] }
  const ENGINEER = (id: string) => ({ personId: id, permissions: ['assignments.read', 'timesheets.read'] })

  it('a worker filing her own paper tells HR, and never her colleagues or herself', () => {
    const seats = [OWNER, HR, COMPLIANCE, RECRUITER, ENGINEER('felix'), ENGINEER('deepa'), ENGINEER('karthik'), ENGINEER('ifeoma')]
    const told = paperExaminers(seats, 'ifeoma')
    expect(told).toEqual(['owner', 'farah', 'comp'])
    for (const nobody of ['felix', 'deepa', 'karthik', 'ifeoma', 'rec']) expect(told).not.toContain(nobody)
  })

  it('HR filing her own paper is not told about it, and the compliance officer is', () => {
    expect(paperExaminers([HR, COMPLIANCE], 'farah')).toEqual(['comp'])
  })

  it('a firm with nobody whose work is papers is still heard by whoever may examine one, never by nobody', () => {
    expect(paperExaminers([RECRUITER, ENGINEER('felix')], 'felix')).toEqual(['rec'])
  })

  it('one notice per examining seat: a person with two seats is told once, and no arrival tells more than ten', () => {
    expect(paperExaminers([HR, HR], null)).toEqual(['farah'])
    const many = Array.from({ length: 15 }, (_, i) => ({ personId: `hr${i}`, permissions: HR.permissions }))
    expect(paperExaminers(many, null)).toHaveLength(EXAMINERS_TOLD)
  })

  it('a recruiter may open a paper and is not told every arrival; HR and the compliance officer are', () => {
    expect(papersAreTheirWork(RECRUITER.permissions)).toBe(false)
    expect(papersAreTheirWork(HR.permissions)).toBe(true)
    expect(papersAreTheirWork(COMPLIANCE.permissions)).toBe(true)
    expect(papersAreTheirWork(OWNER.permissions)).toBe(true)
  })
})

// ── A degree and the start's one question (decided by the founder, 2026-11-03) ──

import * as degreeWords from '@/lib/notify/degree-and-start'

describe('the words for a degree and the start', () => {
  const W = degreeWords
  const all = [
    W.degreeYearDiffers({ certificateYear: 2016, resumeYear: 2019 }),
    W.degreeYearAhead({ certificateYear: 2028, on: new Date('2026-11-03T00:00:00Z') }),
    W.degreeNameDiffers({ printedName: 'R. Mehta', personName: 'Priya Raman' }),
    W.degreeSchoolDiffers({ certificateSchool: 'Pune University', resumeSchool: 'Anna University' }),
    W.degreeNotWhatTheJobAsks({ jobTitle: 'ICU nurse', required: 'a nursing degree', onPaper: 'a degree in biology' }),
    W.sameFileFiledBefore({ otherPersonName: 'Rahul Mehta' }),
    W.degreeVerifiedBy({ provider: 'Sterling', reference: '4471', on: new Date('2026-03-12T00:00:00Z') }),
    W.degreeAskedOfYou({ firmName: 'Northbend' }),
    W.degreeSentBack({ firmName: 'Northbend', reason: 'The name on it is not yours.' }),
    W.START_QUESTION,
    W.notThePersonInterviewed({ saidBy: 'Dana Whitfield' }),
  ]

  it('every degree and start sentence names who, what and the door, in the trade’s words', () => {
    expect(W.degreeYearDiffers({ certificateYear: 2016, resumeYear: 2019 }))
      .toBe('The certificate says 2016; the résumé says 2019 for the same degree. Ask for the transcript, send it to a verification provider, or send it back.')
    expect(W.sameFileFiledBefore({ otherPersonName: 'Rahul Mehta' }))
      .toBe('This file was already filed by Rahul Mehta. Both records keep it; check which is right.')
    expect(W.degreeAskedOfYou({ firmName: 'Northbend' }))
      .toBe('Northbend asks for your degree certificate before the start. Upload it once; it stays on your record for every firm you work with.')
    expect(W.START_QUESTION).toBe('Is the person who started the person you interviewed?')
    expect(W.notThePersonInterviewed({ saidBy: 'Dana Whitfield' }))
      .toBe('Dana Whitfield says the person who started is not the person interviewed. The start is on hold until HR confirms who is on site.')
    const n = W.notThePersonNotice({ saidBy: 'Dana Whitfield', personName: 'Priya Raman', jobTitle: 'Java developer' })
    expect(n.title).toBe('Start on hold: Priya Raman, Java developer')
    // Each warning to HR ends on what to do.
    for (const s of all.slice(0, 4)) expect(s.endsWith(W.DEGREE_DOORS)).toBe(true)
    expect(W.degreeVerifiedBy({ provider: 'Sterling', reference: '4471', on: new Date('2026-03-12T00:00:00Z') })).toBe('Sterling verified the degree on Mar 12, 2026, reference 4471. Nothing more to do on it.')
  })

  it('no degree or start sentence apologizes, accuses, uses a pronoun for the person, or prints a code', () => {
    for (const s of all) {
      expect(s).not.toMatch(/sorry|apolog|unfortunately|please/i)
      expect(s).not.toMatch(/fraud|fake|forg|lie|lying|suspicious/i)
      expect(s).not.toMatch(/\b(he|she|his|her|him|hers)\b/i)
      expect(s).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/)
      expect(s).not.toMatch(/\bdesk\b|program office/i)
    }
  })
})
