import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { deliverySummary } from '@/lib/notification-delivery'

/**
 * GET /api/notifications
 *
 * BUILD.md §6.2: "Needs type × channel routing including Teams and email digests."
 *
 * LEGACY_RULES.md §7.4:
 *   Status: unread/read
 *   Types: chat, application, invitation, application_status, contract,
 *          document_request, job
 *
 * Consolidated types:
 *   SUBMISSION · TIMESHEET · INVOICE · EXPENSE · CONTRACT · ROLLOFF ·
 *   CONVERSATION · SYSTEM
 *
 * Channels: IN_APP · EMAIL · TEAMS
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const status = url.searchParams.get('status') // UNREAD | READ
  const type = url.searchParams.get('type')
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

  const where: any = {
    personId: caller.person.id,
  }

  if (status) where.status = status.toUpperCase()
  if (type) where.type = type.toUpperCase()

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: {
        personId: caller.person.id,
        status: 'UNREAD',
      },
    }),
  ])

  return NextResponse.json({
    data: {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        entityId: n.entityId,
        channel: n.channel,
        status: n.status,
        // Whether it left is a separate fact from whether it was read, and
        // the person looking at this list is entitled to both.
        deliveryState: n.deliveryState,
        deliveryNote: n.deliveryNote,
        deliveredAt: n.deliveredAt?.toISOString() ?? null,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      // The honest header line. A pile of NOT_CONFIGURED is a setup job;
      // a pile of FAILED needs somebody to look at an address.
      delivery: deliverySummary(
        notifications.map((n) => ({ deliveryState: n.deliveryState }))
      ),
    },
  })
}

/**
 * POST /api/notifications
 *
 * Mark notifications as read.
 * Body: { notificationIds: string[] } or { markAllRead: true }
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { notificationIds, markAllRead } = body

  const now = new Date()

  if (markAllRead) {
    const result = await prisma.notification.updateMany({
      where: {
        personId: caller.person.id,
        status: 'UNREAD',
      },
      data: {
        status: 'READ',
        readAt: now,
      },
    })
    return NextResponse.json({ data: { marked: result.count } })
  }

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'notificationIds[] or markAllRead is required' } },
      { status: 422 }
    )
  }

  const result = await prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      personId: caller.person.id,
      status: 'UNREAD',
    },
    data: {
      status: 'READ',
      readAt: now,
    },
  })

  return NextResponse.json({ data: { marked: result.count } })
}
