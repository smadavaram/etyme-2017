'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

/**
 * Decisions — what needs a person right now.
 *
 * BUILD.md §3 — The machine:
 *   "GET /api/decisions — what needs a person right now"
 *
 * CLAUDE.md design system:
 *   Decision surfaces: "Prose, reasoning, confidence, calm. 3–10 items.
 *   Serif headlines, generous space. User decides well and leaves."
 *
 * This is the daily approval queue. An enterprise procurement leader
 * opens this first to see: timesheets to approve, expenses to review,
 * contracts ending soon, submissions waiting, overdue invoices.
 *
 * Everything here requires a human decision — not an informational notification.
 */

// ── Types ────────────────────────────────────────────

interface Decision {
  type: string
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  entityType: string
  entityId: string
  dueDate: string | null
  actionUrl: string
  amount: number | null
  createdAt: string
}

type TypeFilter = 'all' | 'TIMESHEET_APPROVAL' | 'EXPENSE_APPROVAL' | 'ROLLOFF_ACTION' | 'SUBMISSION_REVIEW' | 'INVOICE_OVERDUE'

// ── Helpers ──────────────────────────────────────────

function typeIcon(type: string): string {
  const map: Record<string, string> = {
    TIMESHEET_APPROVAL: '▦',
    EXPENSE_APPROVAL:   '◫',
    ROLLOFF_ACTION:     '⚠',
    SUBMISSION_REVIEW:  '◇',
    INVOICE_OVERDUE:    '▧',
    RATE_CONFIRMATION:  '↕',
  }
  return map[type] ?? '●'
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    TIMESHEET_APPROVAL: 'Timesheet',
    EXPENSE_APPROVAL:   'Expense',
    ROLLOFF_ACTION:     'Rolloff',
    SUBMISSION_REVIEW:  'Submission',
    INVOICE_OVERDUE:    'Invoice',
    RATE_CONFIRMATION:  'Rate',
  }
  return map[type] ?? type
}

function urgencyClass(urgency: string): string {
  switch (urgency) {
    case 'HIGH': return 'border-l-red-500 bg-red-50/30'
    case 'MEDIUM': return 'border-l-amber-500 bg-amber-50/20'
    case 'LOW': return 'border-l-etyme-action bg-etyme-action/[0.02]'
    default: return 'border-l-etyme-rule'
  }
}

function urgencyChipClass(urgency: string): string {
  switch (urgency) {
    case 'HIGH': return 'bg-red-100 text-red-700'
    case 'MEDIUM': return 'bg-amber-100 text-amber-700'
    case 'LOW': return 'bg-blue-100 text-etyme-action'
    default: return 'chip--passive'
  }
}

function urgencyLabel(urgency: string): string {
  switch (urgency) {
    case 'HIGH': return 'Urgent'
    case 'MEDIUM': return 'Soon'
    case 'LOW': return 'Low'
    default: return urgency
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return `in ${Math.abs(days)}d`
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Page ─────────────────────────────────────────────

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchDecisions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/decisions')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      setDecisions(body.data?.decisions ?? [])
      setCounts(body.data?.counts ?? {})
    } catch (err: any) {
      setError(err.message)
      setDecisions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDecisions()
  }, [fetchDecisions])

  // ── Inline actions ────────────────────────────────

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleApproveTimesheet(entityId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setActing(entityId)
    try {
      const res = await fetch(`/api/timesheets/${entityId}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? 'Approval failed')
      }
      showToast('Timesheet approved')
      // Remove from local list immediately
      setDecisions(prev => prev.filter(d => !(d.entityType === 'TIMESHEET' && d.entityId === entityId)))
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleApproveExpense(entityId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setActing(entityId)
    try {
      const res = await fetch('/api/expenses/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', expenseIds: [entityId] }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? 'Approval failed')
      }
      showToast('Expense approved')
      setDecisions(prev => prev.filter(d => !(d.entityType === 'EXPENSE' && d.entityId === entityId)))
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setActing(null)
    }
  }

  // ── Filtered list ─────────────────────────────────
  const filtered = typeFilter === 'all'
    ? decisions
    : decisions.filter((d) => d.type === typeFilter)

  // ── Counts ────────────────────────────────────────
  const highCount = decisions.filter((d) => d.urgency === 'HIGH').length
  const medCount = decisions.filter((d) => d.urgency === 'MEDIUM').length
  const totalAmount = decisions
    .filter((d) => d.amount != null)
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)

  // ── Filter options ────────────────────────────────
  const filterOptions: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: decisions.length },
    { key: 'TIMESHEET_APPROVAL', label: 'Timesheets', count: counts.TIMESHEET_APPROVAL ?? 0 },
    { key: 'EXPENSE_APPROVAL', label: 'Expenses', count: counts.EXPENSE_APPROVAL ?? 0 },
    { key: 'ROLLOFF_ACTION', label: 'Rolloff', count: counts.ROLLOFF_ACTION ?? 0 },
    { key: 'SUBMISSION_REVIEW', label: 'Submissions', count: counts.SUBMISSION_REVIEW ?? 0 },
    { key: 'INVOICE_OVERDUE', label: 'Invoices', count: counts.INVOICE_OVERDUE ?? 0 },
  ]

  return (
    <>
      {/* Head — decision surface */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Today</p>
          <h1>Decisions</h1>
          <p>Items that need your attention right now — approvals, reviews, and actions across all working surfaces.</p>
        </div>

        <button
          onClick={fetchDecisions}
          className="btn-secondary text-[13px] mt-3 shrink-0"
        >
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending</p>
          <p className="stat-value text-etyme-ink">{decisions.length}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">decisions</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Urgent</p>
          <p className={`stat-value ${highCount > 0 ? 'text-red-600' : 'text-etyme-ink'}`}>{highCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">need immediate action</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Soon</p>
          <p className={`stat-value ${medCount > 0 ? 'text-amber-600' : 'text-etyme-ink'}`}>{medCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">this week</p>
        </div>
        {totalAmount > 0 && (
          <div className="panel flex-1 min-w-[140px]">
            <p className="stat-label">Value</p>
            <p className="stat-value text-etyme-ink">
              ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-etyme-faint mt-0.5">at stake</p>
          </div>
        )}
      </div>

      {/* Type filters */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setTypeFilter(opt.key)}
            className={`filter-tab ${
              typeFilter === opt.key ? 'filter-tab--active' : 'filter-tab--inactive'
            }`}
          >
            {opt.label}
            {opt.count > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold opacity-70 tabular-nums">{opt.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-etyme-muted">Loading decisions…</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="panel text-center py-16">
          <p className="text-lg text-etyme-verified font-medium mb-1">
            {decisions.length === 0 ? 'All clear.' : 'No items in this category.'}
          </p>
          <p className="text-sm text-etyme-faint">
            {decisions.length === 0
              ? 'Nothing needs your attention right now. Check back later.'
              : 'Try a different filter to see other pending items.'}
          </p>
        </div>
      )}

      {/* Decision list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((d, i) => (
            <Link
              key={`${d.entityType}-${d.entityId}-${i}`}
              href={d.actionUrl as any}
              className={`block px-4 py-4 rounded-lg border-l-4 transition-colors hover:shadow-sm ${urgencyClass(d.urgency)}`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <span className="text-[14px] mt-0.5 opacity-50 w-5 text-center shrink-0">
                  {typeIcon(d.type)}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[13px] font-medium text-etyme-ink truncate">
                      {d.title}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${urgencyChipClass(d.urgency)}`}>
                      {urgencyLabel(d.urgency)}
                    </span>
                    <span className="chip chip--passive text-[9px]">{typeLabel(d.type)}</span>
                  </div>

                  <p className="text-[12px] text-etyme-muted">{d.subtitle}</p>
                </div>

                {/* Inline actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {d.type === 'TIMESHEET_APPROVAL' && (
                    <button
                      onClick={(e) => handleApproveTimesheet(d.entityId, e)}
                      disabled={acting === d.entityId}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-md
                                 bg-etyme-verified text-white hover:bg-etyme-verified/90
                                 transition-colors disabled:opacity-50"
                    >
                      {acting === d.entityId ? '…' : 'Approve'}
                    </button>
                  )}
                  {d.type === 'EXPENSE_APPROVAL' && (
                    <button
                      onClick={(e) => handleApproveExpense(d.entityId, e)}
                      disabled={acting === d.entityId}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-md
                                 bg-etyme-verified text-white hover:bg-etyme-verified/90
                                 transition-colors disabled:opacity-50"
                    >
                      {acting === d.entityId ? '…' : 'Approve'}
                    </button>
                  )}
                </div>

                {/* Amount + time */}
                <div className="text-right shrink-0">
                  {d.amount != null && (
                    <p className="text-[13px] font-medium text-etyme-ink tabular-nums">
                      ${d.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  <p className="text-[10px] text-etyme-faint tabular-nums mt-0.5">
                    {d.dueDate ? `Due ${timeAgo(d.dueDate)}` : timeAgo(d.createdAt)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-4 tabular-nums">
          {filtered.length} decision{filtered.length !== 1 ? 's' : ''}
          {typeFilter !== 'all' && ` · ${typeLabel(typeFilter).toLowerCase()}`}
        </p>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                         ${toast.type === 'success'
                           ? 'bg-etyme-verified text-white'
                           : 'bg-red-600 text-white'
                         } animate-slide-up`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
