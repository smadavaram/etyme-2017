import { prisma } from '@/lib/db'
import { routeFor, attemptDelivery, type Recipient } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'

/**
 * Central notification creator. Used by APIs and cron jobs to create
 * typed notifications with proper routing.
 *
 * CLAUDE.md: "Anything the system does unprompted writes an AutomationLog row"
 * This helper creates the notification record. AutomationLog is separate —
 * callers that are automations must write their own AutomationLog entry.
 *
 * Fire-and-forget pattern — matches logAccess in src/lib/access-log.ts.
 * Never blocks the caller. Failures log to console, never throw.
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

  return prisma.notification
    .create({
      data: {
        personId,
        companyId: companyId ?? null,
        type,
        title,
        body,
        entityId: entityId ?? null,
        data: (data as any) ?? undefined,
        channel,
        status: 'UNREAD',
        // In-app is delivered by being written. Anything else is a claim
        // until something proves it, so it starts as PENDING.
        deliveryState: channel === 'IN_APP' ? 'SENT' : 'PENDING',
        deliveryNote: channel === 'IN_APP' ? 'Shown in the app' : null,
        deliveredAt: channel === 'IN_APP' ? new Date() : null,
      },
      select: { id: true },
    })
    .then((created) => {
      if (channel !== 'IN_APP') {
        // Not awaited: the caller wanted a notification written, not a
        // round trip to an email provider. The row already exists, so a
        // slow or dead sender delays only the delivery status.
        void deliver(created.id, personId, companyId ?? null, title, body)
      }
      return created
    })
    .catch((err) => {
      console.error(
        `[Notify] Failed to create ${type} notification for person ${personId}:`,
        err
      )
      return null
    })
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
  body: string
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
    if (!person) return

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
    const teamsWebhookUrl =
      named?.teamsWebhookUrl ??
      person.contexts.find((c) => c.company?.teamsWebhookUrl)?.company
        ?.teamsWebhookUrl ??
      null

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
      new Date()
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
      .catch(() => {})
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

  const rows = notifications.map((n) => ({
    personId: n.personId,
    companyId: n.companyId ?? null,
    type: n.type,
    title: n.title,
    body: n.body,
    entityId: n.entityId ?? null,
    data: (n.data as any) ?? undefined,
    channel: n.channel ?? 'IN_APP',
    status: 'UNREAD' as const,
    // Bulk is used for fan-out to a working team, which is in-app. Any row
    // asking for an outside channel is left PENDING rather than marked
    // sent, so it shows up as undelivered instead of disappearing.
    deliveryState: (n.channel ?? 'IN_APP') === 'IN_APP' ? 'SENT' : 'PENDING',
    deliveryNote: (n.channel ?? 'IN_APP') === 'IN_APP' ? 'Shown in the app' : null,
    deliveredAt: (n.channel ?? 'IN_APP') === 'IN_APP' ? new Date() : null,
  }))

  return prisma.notification
    .createMany({ data: rows })
    .catch((err) => {
      console.error(
        `[Notify] Failed to bulk-create ${notifications.length} notification(s):`,
        err
      )
      return null
    })
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
  }

  const base = routes[type] ?? '/dashboard/notifications'

  // For requirement-linked types, entityId is the requirement ID
  if (entityId && type === 'MATCH_READY') {
    return `/dashboard/requirements/${entityId}`
  }

  return base
}
