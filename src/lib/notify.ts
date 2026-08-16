import { prisma } from '@/lib/db'

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
      },
      select: { id: true },
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
