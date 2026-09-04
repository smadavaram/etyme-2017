'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Notification bell — real-time unread count + dropdown.
 *
 * Connects to /api/notifications/stream via EventSource for live updates.
 * Dropdown shows the most recent notifications with type icons and relative time.
 *
 * CLAUDE.md design system:
 *   "Shell — sticky header (logo + org + role)"
 *   Chip tones: action (blue), attention (clay), verified (green), danger, passive
 *   Notification type icons from the notifications page (sidebar icons)
 *
 * Designed to sit in the header bar between the search input and the plus button.
 */

// ── Types ────────────────────────────────────────────

interface StreamNotification {
  id: string
  type: string
  title: string
  body: string
  entityId?: string | null
  createdAt: string
}

// ── Helpers ──────────────────────────────────────────

function typeIcon(type: string): string {
  const map: Record<string, string> = {
    SUBMISSION:   '\u{1F4CB}', // clipboard
    TIMESHEET:    '⏱',    // stopwatch
    INVOICE:      '\u{1F4B0}', // money bag
    EXPENSE:      '\u{1F4B0}', // money bag
    CONTRACT:     '\u{1F4C4}', // page facing up
    ROLLOFF:      '\u{1F504}', // counterclockwise arrows
    CONVERSATION: '\u{1F4AC}', // speech bubble
    SYSTEM:       '⚙',    // gear
    CYCLE_DUE:    '\u{1F4C5}', // calendar
    VISA_EXPIRY:  '\u{1F6C2}', // passport control
    INTERVIEW:    '\u{1F4C5}', // calendar
    MATCH_READY:  '\u{1F3AF}', // direct hit
  }
  return map[type] ?? '•' // bullet
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    SUBMISSION:   'Submission',
    TIMESHEET:    'Timesheet',
    INVOICE:      'Invoice',
    EXPENSE:      'Expense',
    CONTRACT:     'Contract',
    ROLLOFF:      'Rolloff',
    CONVERSATION: 'Message',
    SYSTEM:       'System',
    CYCLE_DUE:    'Cycle due',
    VISA_EXPIRY:  'Visa',
    INTERVIEW:    'Interview',
    MATCH_READY:  'Match',
  }
  return map[type] ?? type
}

function typeChipClass(type: string): string {
  const map: Record<string, string> = {
    SUBMISSION:   'chip--action',
    TIMESHEET:    'chip--attention',
    INVOICE:      'chip--action',
    EXPENSE:      'chip--attention',
    CONTRACT:     'chip--verified',
    ROLLOFF:      'chip--danger',
    CONVERSATION: 'chip--passive',
    SYSTEM:       'chip--passive',
    CYCLE_DUE:    'chip--attention',
    VISA_EXPIRY:  'chip--danger',
    INTERVIEW:    'chip--action',
    MATCH_READY:  'chip--verified',
  }
  return map[type] ?? 'chip--passive'
}

/** Route a notification type to its dashboard page */
function notificationRoute(type: string, entityId?: string | null): string {
  const routes: Record<string, string> = {
    SUBMISSION:   '/dashboard/submissions',
    TIMESHEET:    '/dashboard/timesheets',
    INVOICE:      '/dashboard/invoices',
    EXPENSE:      '/dashboard/expenses',
    CONTRACT:     '/dashboard/contracts',
    ROLLOFF:      '/dashboard/rolloff',
    CONVERSATION: '/dashboard/conversations',
    SYSTEM:       '/dashboard/notifications',
    CYCLE_DUE:    '/dashboard/timesheets',
    VISA_EXPIRY:  '/dashboard/compliance',
    INTERVIEW:    '/dashboard/submissions',
    MATCH_READY:  '/dashboard/requirements',
  }

  const base = routes[type] ?? '/dashboard/notifications'

  if (entityId && type === 'MATCH_READY') {
    return `/dashboard/requirements/${entityId}`
  }

  return base
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── Component ────────────────────────────────────────

export function NotificationBell() {
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<StreamNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // ── SSE connection ──────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/api/notifications/stream')
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'count') {
          setUnread(data.unread)
        } else if (data.type === 'new') {
          setUnread(data.unread)
          // Prepend new notifications, deduplicate by id, keep most recent 20
          setNotifications((prev) => {
            const incoming = data.notifications as StreamNotification[]
            const existingIds = new Set(prev.map((n) => n.id))
            const fresh = incoming.filter((n) => !existingIds.has(n.id))
            return [...fresh, ...prev].slice(0, 20)
          })
        }
        // heartbeat events have no data field — silently ignored
      } catch {
        // Malformed SSE data — ignore
      }
    }

    es.onerror = () => {
      // EventSource reconnects automatically. If the connection is truly
      // dead (server down, auth expired), it will keep retrying with
      // exponential backoff built into the browser.
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [])

  // ── Fetch full notification list when dropdown opens ──
  const fetchRecent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=15')
      if (!res.ok) return
      const body = await res.json()
      const items = body.data?.notifications ?? []
      setNotifications(items)
      setUnread(body.data?.unreadCount ?? 0)
    } catch {
      // Network error — keep whatever we have from SSE
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch when opening
  useEffect(() => {
    if (open) {
      fetchRecent()
    }
  }, [open, fetchRecent])

  // ── Close on outside click ────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Close on Escape ───────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // ── Mark all read ─────────────────────────────────────
  async function handleMarkAllRead() {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      if (res.ok) {
        setUnread(0)
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, status: 'READ' }))
        )
      }
    } catch {
      // Silently fail — user can retry
    }
  }

  // ── Mark one read + navigate ──────────────────────────
  async function handleNotificationClick(n: StreamNotification) {
    // Mark this notification as read
    try {
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [n.id] }),
      }).catch(() => {
        // Fire-and-forget — navigate regardless
      })
    } catch {
      // Navigate regardless
    }

    setUnread((prev) => Math.max(0, prev - 1))
    setOpen(false)
    router.push(notificationRoute(n.type, n.entityId) as any)
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className={`relative w-8 h-8 rounded-md flex items-center justify-center
                   transition-colors hover:bg-etyme-canvas
                   ${open ? 'bg-etyme-canvas' : ''}`}
        title={unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : 'Notifications'}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        {/* Bell SVG icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-etyme-muted"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread badge */}
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1
                       rounded-full bg-etyme-attention text-white
                       text-[10px] font-bold flex items-center justify-center
                       tabular-nums leading-none"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-10 w-80 bg-white rounded-lg
                     shadow-lg border border-etyme-rule overflow-hidden z-50
                     animate-fade-in"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-etyme-rule flex items-center justify-between">
            <span className="text-[13px] font-semibold text-etyme-ink">
              Notifications
            </span>
            {unread > 0 && (
              <span className="text-[11px] text-etyme-attention font-medium tabular-nums">
                {unread} unread
              </span>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-etyme-muted">
                Loading...
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] text-etyme-muted">All caught up</p>
                <p className="text-[11px] text-etyme-faint mt-1">
                  No recent notifications.
                </p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className="w-full text-left px-4 py-3 hover:bg-etyme-canvas/60
                           transition-colors border-b border-[#EDE9DF] last:border-b-0
                           flex items-start gap-2.5"
              >
                {/* Type icon */}
                <span className="text-[13px] mt-0.5 w-5 text-center shrink-0 opacity-60">
                  {typeIcon(n.type)}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[13px] font-medium text-etyme-ink truncate">
                      {n.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-etyme-faint truncate leading-relaxed">
                    {n.body}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`chip text-[9px] ${typeChipClass(n.type)}`}>
                      {typeLabel(n.type)}
                    </span>
                    <span className="text-[10px] text-etyme-faint tabular-nums">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-etyme-rule flex items-center justify-between">
            <button
              onClick={() => {
                setOpen(false)
                router.push('/dashboard/notifications' as any)
              }}
              className="text-[11px] font-medium text-etyme-action hover:underline"
            >
              View all
            </button>

            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-etyme-muted hover:text-etyme-ink
                           transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
