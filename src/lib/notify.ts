import { prisma } from '@/lib/db'
import { routeFor, attemptDelivery, type Recipient } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'
import { reportError } from '@/lib/alerts'
import { appUrl } from '@/lib/supplier-link'

/**
 * Central notification creator. Used by APIs and cron jobs to create
 * typed notifications with proper routing.
 *
 * CLAUDE.md: "Anything the system does unprompted writes an AutomationLog row"
 * This helper creates the notification record. AutomationLog is separate —
 * callers that are automations must write their own AutomationLog entry.
 *
 * Fire-and-forget pattern — matches logAccess in src/lib/access-log.ts.
 * Never blocks the caller and never throws. A failure is never only a
 * console line: the notice is kept as a FAILED row with the reason where
 * one can be written at all, and staff are told through `reportError`.
 *
 * The in-app row is written first and always. If the caller asked for the
 * message to leave the building as well, delivery is attempted afterwards
 * and the outcome is written back to the same row — so a notification is
 * never left claiming a channel it did not travel on. See
 * src/lib/notification-delivery.ts for why that distinction is worth the
 * extra write.
 */

export type NotificationType =
  | 'SUBMISSION'
  | 'TIMESHEET'
  | 'INVOICE'
  | 'EXPENSE'
  | 'CONTRACT'
  | 'ROLLOFF'
  | 'CONVERSATION'
  | 'SYSTEM'
  | 'CYCLE_DUE'
  | 'VISA_EXPIRY'
  | 'INTERVIEW'
  | 'MATCH_READY'
  /**
   * A person's stay on a firm's bench: renewed, about to end, ended, a
   * hold taken back. These were filed under SUBMISSION, so the bench
   * desk found them among submissions it had made and the filter could
   * not separate them (bench tester, 2026-10-03).
   */
  | 'BENCH'

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'TEAMS'

export interface NotifyParams {
  /** Who receives the notification */
  personId: string
  /** Company context (for filtering, routing to Teams channels) */
  companyId?: string
  /** Notification type — drives icon, chip color, and routing rules */
  type: NotificationType
  /** One-line summary shown in the bell dropdown and notification list */
  title: string
  /** Detail text — truncated in the dropdown, full in the notifications page */
  body: string
  /** The entity this notification is about — used for click-to-navigate */
  entityId?: string
  /** Delivery channel. Defaults to IN_APP. */
  channel?: NotificationChannel
  /** Structured metadata (petitionId, cycleId, deep links, template variables) */
  data?: Record<string, unknown>
}

/**
 * Create a single notification. Fire-and-forget — do not await in callers.
 *
 * Usage:
 *   notify({
 *     personId: consultant.id,
 *     companyId: company.id,
 *     type: 'SUBMISSION',
 *     title: 'New submission received',
 *     body: `${person.name} submitted to ${requirement.title}`,
 *     entityId: submission.id,
 *   })
 *
 * Returns a Promise that resolves to the created notification, or null on failure.
 * Callers should NOT await this — let it run in the background.
 */
export function notify(params: NotifyParams): Promise<{ id: string } | null> {
  const {
    personId,
    companyId,
    type,
    title,
    body,
    entityId,
    channel = 'IN_APP',
    data,
  } = params

  return writeOne(params).then((created) => {
    if (created && channel !== 'IN_APP') {
      // Not awaited: the caller wanted a notification written, not a
      // round trip to an email provider. The row already exists, so a
      // slow or dead sender delays only the delivery status.
      void deliver(created.id, personId, companyId ?? null, title, body, pageOf(type, entityId ?? null, data))
    }
    return created
  })
}

/**
 * The page a notice opens, outside the app as well as in it. A caller
 * that names the page in `data.href` has said where the reader acts, so
 * the email link and the Teams button go there too, rather than to the
 * type's general list. Anything that is not a path inside the app is
 * ignored, so a notice can never carry a link off the site.
 */
export function pageOf(type: string, entityId: string | null, data?: Record<string, unknown>): string {
  const href = data?.href
  if (typeof href === 'string' && /^\/dashboard(\/|\?|$)/.test(href) && !href.includes('//')) return href
  return notificationHref(type, entityId)
}

/** The row `notify` writes for one notice — the one shape, used by both doors. */
function rowFor(n: NotifyParams) {
  const channel = n.channel ?? 'IN_APP'
  return {
    personId: n.personId,
    companyId: n.companyId ?? null,
    type: n.type,
    title: n.title,
    body: n.body,
    entityId: n.entityId ?? null,
    data: (n.data as any) ?? undefined,
    channel,
    status: 'UNREAD' as const,
    // In-app is delivered by being written. Anything else is a claim
    // until something proves it, so it starts as PENDING.
    deliveryState: channel === 'IN_APP' ? 'SENT' : 'PENDING',
    deliveryNote: channel === 'IN_APP' ? 'Shown in the app' : null,
    deliveredAt: channel === 'IN_APP' ? new Date() : null,
  }
}

function reasonOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return (text || 'Unknown error').slice(0, 200)
}

/**
 * Write one notice, and never lose it quietly.
 *
 * The full row first. If that cannot be written — a company that no
 * longer exists, data the database refuses — a plain row is written in
 * its place: the person, the title and the body, marked FAILED with the
 * reason, so the person still sees the notice and support can see why it
 * arrived without its details. If even that cannot be written, staff are
 * told, because there is no row left to say so.
 *
 * Returns the full row's id, or null when the full row was not written.
 */
async function writeOne(n: NotifyParams): Promise<{ id: string } | null> {
  try {
    return await prisma.notification.create({ data: rowFor(n), select: { id: true } })
  } catch (err) {
    console.error(`[Notify] Failed to create ${n.type} notification for person ${n.personId}:`, err)
    await recordFailed(n, err)
    return null
  }
}

/**
 * The plain FAILED row for a notice whose full row was refused. Returns
 * whether it was written. Where it was not, staff hear about it here.
 */
async function recordFailed(n: NotifyParams, err: unknown): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: {
        personId: n.personId,
        type: n.type,
        title: n.title,
        body: n.body,
        channel: n.channel ?? 'IN_APP',
        status: 'UNREAD',
        deliveryState: 'FAILED',
        deliveryNote: `Could not be written in full: ${reasonOf(err)}`.slice(0, 200),
        deliveredAt: null,
      },
      select: { id: true },
    })
    return true
  } catch (second) {
    void reportError('notify: a notice could not be written at all', second, {
      personId: n.personId,
      companyId: n.companyId ?? null,
    }).catch(() => {})
    return false
  }
}

/**
 * Send one already-written notification and record what happened.
 *
 * Whether somebody is a consultant is decided by their contexts, not by
 * whether they have a company — a bench consultant belongs to a vendor and
 * still has no Teams tenant of their own.
 */
async function deliver(
  notificationId: string,
  personId: string,
  companyId: string | null,
  title: string,
  body: string,
  page: string
): Promise<void> {
  try {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        primaryEmail: true,
        contexts: {
          where: { revokedAt: null },
          select: { type: true, company: { select: { teamsWebhookUrl: true } } },
        },
      },
    })
    if (!person) {
      // Left PENDING this would read as "still on its way" forever.
      await prisma.notification.update({
        where: { id: notificationId },
        data: { deliveryState: 'FAILED', deliveryNote: 'This person is no longer on the record' },
      })
      return
    }

    const isConsultant = person.contexts.every((c) => c.type === 'CONSULTANT')

    // The company the notification was raised under wins, because that is
    // the channel the message belongs on; otherwise any company this
    // person works through that has one.
    const named = companyId
      ? await prisma.company.findUnique({
          where: { id: companyId },
          select: { teamsWebhookUrl: true },
        })
      : null
    // A company whose saved link is the retired kind still wins here:
    // routing sees the link, sends email instead, and writes why on the
    // row — rather than quietly posting to another company's channel.
    // So does a named company with no link at all: its news goes by
    // email, never into the channel of another firm this person also
    // works through, which would tell that firm somebody else's business.
    const teamsWebhookUrl = named
      ? named.teamsWebhookUrl ?? null
      : person.contexts.find((c) => c.company?.teamsWebhookUrl)?.company
          ?.teamsWebhookUrl ?? null

    const recipient: Recipient = {
      isConsultant,
      email: person.primaryEmail,
      teamsWebhookUrl,
    }
    const route = routeFor(recipient)
    const destination =
      route.channel === 'TEAMS' ? teamsWebhookUrl : recipient.email

    const outcome = await attemptDelivery(
      route,
      destination,
      title,
      body,
      configuredSenders(),
      new Date(),
      appLink(page)
    )

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        // The channel is corrected to the one actually used. A business
        // user with no Teams channel gets an email, and the row should say
        // email rather than the channel somebody hoped for.
        channel: route.channel,
        deliveryState: outcome.state,
        deliveryNote: outcome.note,
        deliveredAt: outcome.deliveredAt,
      },
    })
  } catch (err) {
    console.error(`[Notify] Delivery attempt failed for ${notificationId}:`, err)
    await prisma.notification
      .update({
        where: { id: notificationId },
        data: {
          deliveryState: 'FAILED',
          deliveryNote:
            err instanceof Error ? err.message.slice(0, 200) : 'Delivery failed',
        },
      })
      .catch((second) => {
        // The row says PENDING and cannot be corrected. Somebody has to hear.
        void reportError('notify: delivery failed and could not be recorded', second, {
          personId,
          companyId,
        }).catch(() => {})
      })
  }
}

/**
 * Create multiple notifications in a single database call.
 * Fire-and-forget — do not await in callers.
 *
 * Uses createMany for efficiency. Does not return individual IDs
 * (Prisma createMany returns only the count).
 *
 * Usage:
 *   notifyBulk([
 *     { personId: pm.id, type: 'ROLLOFF', title: '...', body: '...' },
 *     { personId: recruiter.id, type: 'ROLLOFF', title: '...', body: '...' },
 *   ])
 */
export function notifyBulk(
  notifications: NotifyParams[]
): Promise<{ count: number } | null> {
  if (notifications.length === 0) return Promise.resolve({ count: 0 })

  // Bulk is mostly fan-out to a working team, in the app, and that half
  // stays one database call. A row asking for Teams or email used to be
  // written PENDING here and then nothing ever sent it — the exact "the
  // row says it went and it did not" this file exists to stop. So each of
  // those goes through `notify`, which writes it and then delivers it and
  // records what happened, the same as a single notice.
  const inApp = notifications.filter((n) => (n.channel ?? 'IN_APP') === 'IN_APP')
  const outward = notifications.filter((n) => (n.channel ?? 'IN_APP') !== 'IN_APP')

  const rows = inApp.map(rowFor)

  const written =
    rows.length === 0
      ? Promise.resolve({ count: 0 })
      : prisma.notification.createMany({ data: rows }).catch((err) => writeEach(inApp, err))

  return Promise.all([written, Promise.all(outward.map((n) => notify(n)))]).then(
    ([bulk, singles]) => {
      const sent = singles.filter((x) => x !== null).length
      if (bulk === null && sent === 0) return null
      return { count: (bulk?.count ?? 0) + sent }
    }
  )
}

/**
 * The bulk write was refused. One bad row — a company id that no longer
 * exists, a value the database will not take — fails the whole insert, so
 * every recipient is written again one at a time through the same door
 * `notify` uses. The good rows land; a bad one becomes a FAILED row with
 * the reason (or, failing that, an incident). Staff are told once, for the
 * batch, so a broken fan-out is heard rather than found.
 */
async function writeEach(
  notices: NotifyParams[],
  err: unknown
): Promise<{ count: number } | null> {
  console.error(`[Notify] Failed to bulk-create ${notices.length} notification(s):`, err)
  let count = 0
  for (const n of notices) {
    if (await writeOne(n)) count++
  }
  void reportError('notify: bulk in-app write failed', err, {
    companyId: notices.find((n) => n.companyId)?.companyId ?? null,
  }).catch(() => {})
  return count === 0 ? null : { count }
}

/**
 * Helper to route notification type to the appropriate dashboard page.
 * Used by the notification bell component for click-to-navigate.
 *
 * Returns the path segment after /dashboard/. The entityId is appended
 * by the caller when the page supports deep linking.
 */
export function notificationHref(type: string, entityId?: string | null): string {
  const routes: Record<string, string> = {
    SUBMISSION: '/dashboard/submissions',
    TIMESHEET: '/dashboard/timesheets',
    INVOICE: '/dashboard/invoices',
    EXPENSE: '/dashboard/expenses',
    CONTRACT: '/dashboard/contracts',
    ROLLOFF: '/dashboard/rolloff',
    CONVERSATION: '/dashboard/conversations',
    SYSTEM: '/dashboard/notifications',
    CYCLE_DUE: '/dashboard/timesheets',
    VISA_EXPIRY: '/dashboard/compliance',
    INTERVIEW: '/dashboard/submissions',
    MATCH_READY: '/dashboard/requirements',
    BENCH: '/dashboard/bench',
  }

  const base = routes[type] ?? '/dashboard/notifications'

  // For requirement-linked types, entityId is the requirement ID
  if (entityId && type === 'MATCH_READY') {
    return `/dashboard/requirements/${entityId}`
  }
  // The thread itself, open, the way the bell opens it.
  if (entityId && type === 'CONVERSATION') {
    return `/dashboard/conversations?open=${entityId}`
  }

  return base
}

/**
 * The page a notice is about, as an address somebody outside the app can
 * open — the "Open in Etyme" button on a Teams card. Null where this
 * deployment does not know its own address, because a button to
 * localhost in somebody's Teams channel is a button to nowhere.
 */
export function appLink(path: string): string | null {
  // The same base every other mailed link uses (`appUrl` in
  // lib/supplier-link), so a card's button and the email beside it agree.
  // Its last resort is localhost, which is not https and so returns null.
  const base = appUrl()
  if (!/^https:\/\//i.test(base)) return null
  return `${base}${path}`
}

