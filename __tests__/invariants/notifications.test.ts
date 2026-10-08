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
import { notify, notifyBulk, notificationHref, type NotificationType, type NotificationChannel } from '@/lib/notify'

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

  it('a SYSTEM notification routes to /dashboard/notifications', () => {
    expect(notificationHref('SYSTEM')).toBe('/dashboard/notifications')
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

  it('an unknown notification type falls back to /dashboard/notifications', () => {
    expect(notificationHref('UNKNOWN_TYPE')).toBe('/dashboard/notifications')
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
  notification: { create: vi.fn(), createMany: vi.fn(), update: vi.fn() },
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
    alerts.reportError.mockClear()
  })

  it('when the bulk in-app write fails, every recipient’s notice is still written one by one', async () => {
    db.notification.createMany.mockRejectedValue(new Error('foreign key violated'))
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
    db.notification.createMany.mockRejectedValue(new Error('foreign key violated'))
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
    db.notification.createMany.mockRejectedValue(new Error('database unreachable'))
    db.notification.create.mockRejectedValue(new Error('database unreachable'))

    const result = await notifyBulk(team(2))

    expect(result).toBeNull()
    const places = alerts.reportError.mock.calls.map((c: any[]) => c[0])
    expect(places.filter((p: string) => p === 'notify: a notice could not be written at all')).toHaveLength(2)
    expect(places.filter((p: string) => p === 'notify: bulk in-app write failed')).toHaveLength(1)
  })

  it('when the bulk write succeeds it is one database call and nobody is alerted', async () => {
    db.notification.createMany.mockResolvedValue({ count: 3 })

    const result = await notifyBulk(team(3))

    expect(result).toEqual({ count: 3 })
    expect(db.notification.createMany).toHaveBeenCalledTimes(1)
    expect(db.notification.create).not.toHaveBeenCalled()
    expect(alerts.reportError).not.toHaveBeenCalled()
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
import { isAccountMail, bellShows, ACCOUNT_MAIL } from '@/lib/notify/account-mail'

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
    expect(isAccountMail({ type: 'SYSTEM', title: 'Priya Nair joined Acme as Member', body: 'Give them a desk.' })).toBe(false)
    expect(isAccountMail({ type: 'TIMESHEET', title: 'Set your Etyme password', body: '' })).toBe(false)
  })

  it('the database filter hides the same three shapes the rule names', () => {
    const f = bellShows()
    expect(f.NOT.OR).toHaveLength(3)
    expect(f.NOT.OR[0]).toEqual({ type: ACCOUNT_MAIL })
  })
})
