import { NextRequest } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time notifications.
 * Polls Prisma every 3 seconds for new unread notifications.
 * Used by the NotificationBell component in the shell header.
 *
 * Protocol:
 *   - On connect: sends { type: 'count', unread: N }
 *   - Every 3s:   if new notifications exist, sends { type: 'new', unread: N, notifications: [...] }
 *   - Every 30s:  sends { type: 'heartbeat' } to keep the connection alive
 *
 * Runs on the default Node.js runtime (NOT edge) so Prisma works.
 * Connection closes on client abort, auth failure, or repeated DB errors.
 */

const POLL_INTERVAL_MS = 3_000
const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_CONSECUTIVE_ERRORS = 5

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) {
    return new Response('Unauthorized', { status: 401 })
  }

  const personId = caller.person.id
  const encoder = new TextEncoder()

  // Track whether the stream is still open to avoid writing to a closed controller
  let closed = false

  function safeEnqueue(controller: ReadableStreamDefaultController, chunk: string) {
    if (closed) return
    try {
      controller.enqueue(encoder.encode(chunk))
    } catch {
      // Controller already closed — race between abort and enqueue
      closed = true
    }
  }

  function sendEvent(controller: ReadableStreamDefaultController, data: unknown) {
    safeEnqueue(controller, `data: ${JSON.stringify(data)}\n\n`)
  }

  const stream = new ReadableStream({
    async start(controller) {
      let lastChecked = new Date()
      let consecutiveErrors = 0

      // ── Initial unread count ──────────────────────────
      try {
        const initialCount = await prisma.notification.count({
          where: { personId, status: 'UNREAD' },
        })
        sendEvent(controller, { type: 'count', unread: initialCount })
      } catch (err) {
        console.error('[SSE] Failed to fetch initial notification count:', err)
        // Send zero so the client has something to work with
        sendEvent(controller, { type: 'count', unread: 0 })
      }

      // ── Poll for new notifications ────────────────────
      const pollInterval = setInterval(async () => {
        if (closed) {
          clearInterval(pollInterval)
          return
        }

        try {
          const newNotifications = await prisma.notification.findMany({
            where: {
              personId,
              status: 'UNREAD',
              createdAt: { gt: lastChecked },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              type: true,
              title: true,
              body: true,
              entityId: true,
              createdAt: true,
            },
          })

          if (newNotifications.length > 0) {
            const unreadCount = await prisma.notification.count({
              where: { personId, status: 'UNREAD' },
            })

            sendEvent(controller, {
              type: 'new',
              unread: unreadCount,
              notifications: newNotifications.map((n) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                entityId: n.entityId,
                createdAt: n.createdAt.toISOString(),
              })),
            })
          }

          lastChecked = new Date()
          consecutiveErrors = 0
        } catch (err) {
          consecutiveErrors++
          console.error(
            `[SSE] Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
            err
          )

          // Too many consecutive DB errors — close the stream and let the
          // client reconnect. EventSource will retry automatically.
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            clearInterval(pollInterval)
            clearInterval(heartbeatInterval)
            if (!closed) {
              closed = true
              try { controller.close() } catch { /* already closed */ }
            }
          }
        }
      }, POLL_INTERVAL_MS)

      // ── Heartbeat — keeps proxies and load balancers from timing out ──
      const heartbeatInterval = setInterval(() => {
        if (closed) {
          clearInterval(heartbeatInterval)
          return
        }
        safeEnqueue(controller, ': heartbeat\n\n')
      }, HEARTBEAT_INTERVAL_MS)

      // ── Clean up on client disconnect ─────────────────
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval)
        clearInterval(heartbeatInterval)
        if (!closed) {
          closed = true
          try { controller.close() } catch { /* already closed */ }
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx: do not buffer SSE
    },
  })
}
