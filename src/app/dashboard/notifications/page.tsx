'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from '@/components/session-provider'
import { notificationsFraming } from '@/lib/page-framing'
import { Chip, EmptyState, ErrorState, FilterChips, LoadingState, PageHead, type ChipTone } from '@/components/ui'

/**
 * Notifications page — inbox for all platform activity.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "User finds and acts fast"
 *
 * BUILD.md §6.2: "Needs type × channel routing including Teams and email digests."
 *
 * LEGACY_RULES.md §7.4:
 *   Status: unread/read. Types: chat, application, invitation,
 *   application_status, contract, document_request, job.
 *   "Every notification triggers an email on create."
 *
 * Consolidated types:
 *   SUBMISSION · TIMESHEET · INVOICE · EXPENSE · CONTRACT · ROLLOFF ·
 *   CONVERSATION · SYSTEM
 */

// ── Types ────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  title: string
  body: string
  entityId: string | null
  channel: string
  status: string
  deliveryState: string
  deliveryNote: string | null
  deliveredAt: string | null
  readAt: string | null
  createdAt: string
}

interface DeliveryHealth {
  sent: number
  failed: number
  notConfigured: number
  pending: number
  demoSkipped?: number
  healthy: boolean
}

type StatusFilter = 'all' | 'UNREAD' | 'READ'
/** 'all', or a notice type the reader's framing offers. */
type TypeFilter = string

// ── Helpers ──────────────────────────────────────────

function typeIcon(type: string): string {
  const map: Record<string, string> = {
    SUBMISSION:   '◇',
    INTERVIEW:    '◷',
    BENCH:        '◎',
    TIMESHEET:    '▦',
    INVOICE:      '▧',
    EXPENSE:      '◫',
    CONTRACT:     '▤',
    ROLLOFF:      '⚠',
    CONVERSATION: '💬',
    SYSTEM:       '⚙',
  }
  return map[type] ?? '•'
}

/** The word on the chip. A machine name like CYCLE_DUE is never shown. */
function typeLabel(type: string): string {
  const map: Record<string, string> = {
    SUBMISSION:   'Submission',
    INTERVIEW:    'Interview',
    BENCH:        'Bench',
    TIMESHEET:    'Timesheet',
    INVOICE:      'Bill or invoice',
    EXPENSE:      'Expense',
    CONTRACT:     'Contract',
    ROLLOFF:      'Rolloff',
    CONVERSATION: 'Message',
    SYSTEM:       'System',
    CYCLE_DUE:    'Due date',
    VISA_EXPIRY:  'Visa',
    MATCH_READY:  'Match',
  }
  return map[type] ?? 'Update'
}

function typeTone(type: string): ChipTone {
  const map: Record<string, ChipTone> = {
    SUBMISSION:   'action',
    INTERVIEW:    'action',
    BENCH:        'verified',
    TIMESHEET:    'attention',
    INVOICE:      'action',
    EXPENSE:      'attention',
    CONTRACT:     'verified',
    ROLLOFF:      'danger',
    CONVERSATION: 'passive',
    SYSTEM:       'passive',
  }
  return map[type] ?? 'passive'
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

// ── Page ─────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [delivery, setDelivery] = useState<DeliveryHealth | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('type', typeFilter)

      const res = await fetch(`/api/notifications?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setNotifications(body.data?.notifications ?? [])
      setUnreadCount(body.data?.unreadCount ?? 0)
      setDelivery(body.data?.delivery ?? null)
    } catch (err: any) {
      setError(err.message)
      setNotifications([])
      setDelivery(null)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // ── Mark all as read ──────────────────────────────
  async function handleMarkAllRead() {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      await fetchNotifications()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ── Mark one as read ──────────────────────────────
  async function handleMarkRead(id: string) {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [id] }),
      })
      await fetchNotifications()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ── Filtered list ─────────────────────────────────
  const filtered = notifications.filter((n) => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    return true
  })

  // ── Type filter options ───────────────────────────
  // The reader's own kinds: a worker is offered her own work, never a
  // firm's bills (lib/page-framing, notificationsFraming).
  const session = useSession()
  const framing = notificationsFraming(session.company?.kind ?? null, session.contextType === 'CONSULTANT')
  const typeOptions: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...framing.kinds,
  ]

  return (
    <>
      <PageHead
        eyebrow={framing.eyebrow}
        title={framing.title}
        subtitle={framing.subtitle || undefined}
        actions={
          <>
            {unreadCount > 0 && (
              <span className="text-[13px] text-etyme-attention font-medium tabular-nums">
                {unreadCount} unread
              </span>
            )}
            <button
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="btn-secondary text-[13px] disabled:opacity-50"
            >
              Mark all read
            </button>
          </>
        }
      />

      {/* What did not leave the building. Only shown when something did
          not, because a healthy system should not narrate itself. */}
      {delivery && !delivery.healthy && (
        <div className="mb-5 rounded-md border border-etyme-rule bg-etyme-surface p-3">
          <p className="text-[13px] text-etyme-ink">
            {delivery.notConfigured > 0 && (
              <>
                <span className="tabular-nums font-medium">{delivery.notConfigured}</span>{' '}
                of these were only shown here — email and Teams are not set up yet, so nothing
                was sent outside the app.
              </>
            )}
            {delivery.notConfigured > 0 && delivery.failed > 0 && ' '}
            {delivery.failed > 0 && (
              <>
                <span className="tabular-nums font-medium text-etyme-attention">
                  {delivery.failed}
                </span>{' '}
                could not be sent. The address or the channel needs a look.
              </>
            )}
          </p>
        </div>
      )}

      {/* Status toggle */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 mb-5">
        <div className="flex bg-etyme-canvas rounded-md p-0.5">
          {(['all', 'UNREAD', 'READ'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-[13px] font-medium rounded transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-white shadow-sm text-etyme-ink'
                  : 'text-etyme-muted hover:text-etyme-ink'
              }`}
            >
              {s === 'all' ? 'All' : s === 'UNREAD' ? 'Unread' : 'Read'}
            </button>
          ))}
        </div>

        {/* Type filters: the reader's own kinds, after "All". */}
        <div className="w-full md:w-auto">
          <FilterChips
            label="Kind of notification"
            options={typeOptions}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </div>
      </div>

      {error && <div className="mb-4"><ErrorState says={error} action={{ label: 'Try again', onClick: () => { void fetchNotifications() } }} /></div>}

      {loading && <LoadingState says="Opening notifications…" />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          says={statusFilter === 'UNREAD' ? 'All caught up!' : 'No notifications yet.'}
          detail={statusFilter === 'UNREAD'
            ? 'You have no unread notifications.'
            : 'Notifications will appear here as activity happens across your platform.'}
        />
      )}

      {/* Notification list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-1">
          {filtered.map((n) => (
            <div
              key={n.id}
              onClick={() => n.status === 'UNREAD' && handleMarkRead(n.id)}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                n.status === 'UNREAD'
                  ? 'bg-etyme-action/[0.03] border border-etyme-action/10 hover:bg-etyme-action/[0.06]'
                  : 'hover:bg-etyme-canvas/60'
              }`}
            >
              {/* Unread dot */}
              <div className="mt-1.5 w-2 shrink-0">
                {n.status === 'UNREAD' && (
                  <span className="block w-2 h-2 rounded-full bg-etyme-action" />
                )}
              </div>

              {/* Icon */}
              <span className="text-[14px] mt-0.5 opacity-50 w-5 text-center shrink-0">
                {typeIcon(n.type)}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={`text-[13px] font-medium truncate ${
                    n.status === 'UNREAD' ? 'text-etyme-ink' : 'text-etyme-muted'
                  }`}>
                    {n.title}
                  </p>
                  <Chip tone={typeTone(n.type)}>{typeLabel(n.type)}</Chip>
                </div>
                <p className="text-[12px] text-etyme-faint truncate">{n.body}</p>
                {n.deliveryState === 'DEMO_SKIPPED' && (
                  <p className="text-[11px] text-etyme-faint mt-0.5">
                    Shown here only — this is a demo address, so no email was sent.
                  </p>
                )}
                {n.deliveryState !== 'SENT' && n.deliveryState !== 'DEMO_SKIPPED' && (
                  <p className="text-[11px] text-etyme-attention mt-0.5">
                    {n.deliveryState === 'FAILED'
                      ? `Not sent — ${n.deliveryNote ?? 'delivery failed'}`
                      : n.deliveryState === 'NOT_CONFIGURED'
                        ? `Shown here only — ${n.deliveryNote ?? 'that channel is not set up'}`
                        : 'Waiting to send'}
                  </p>
                )}
              </div>

              {/* Time */}
              <span className="text-[11px] text-etyme-faint tabular-nums shrink-0 mt-0.5">
                {timeAgo(n.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-4 tabular-nums">
          {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'all' && ` · ${statusFilter.toLowerCase()}`}
          {typeFilter !== 'all' && ` · ${(typeOptions.find((o) => o.key === typeFilter)?.label ?? typeLabel(typeFilter)).toLowerCase()}`}
        </p>
      )}
    </>
  )
}
