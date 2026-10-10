'use client'

import { usePageSection } from '@/components/page-section'
import { useEffect, useState, useCallback } from 'react'
import { DecideOvertime, type PendingWeek } from '../timesheets/decide-overtime'
import Link from 'next/link'
import { amount } from '@/lib/money-display'
import { useSession } from '@/components/session-provider'
import { hasPermission } from '@/lib/permissions'
import { chipsFor, emptyBook, type TypeFilter } from './chips'
import { PageHead, Stat, FilterChips, RefusedState, LoadingState, ErrorState, EmptyState } from '@/components/ui'

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


// ── Helpers ──────────────────────────────────────────

function typeIcon(type: string): string {
  const map: Record<string, string> = {
    TIMESHEET_APPROVAL: '▦',
    REQUISITION_APPROVAL: '⊞',
    EXPENSE_APPROVAL:   '◫',
    ROLLOFF_ACTION:     '⚠',
    SUBMISSION_REVIEW:  '◇',
    CONTRACT_PAPERING:  '✎',
    CONTRACT_START:     '▷',
    INVOICE_OVERDUE:    '▧',
    RATE_CONFIRMATION:  '↕',
  }
  return map[type] ?? '●'
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    TIMESHEET_APPROVAL: 'Timesheet',
    // The menu's own word for these is Requirements; "Requisitions" is a
    // retired name and __tests__/invariants/sidebar-nav fails on it.
    REQUISITION_APPROVAL: 'Job request',
    EXPENSE_APPROVAL:   'Expense',
    ROLLOFF_ACTION:     'Rolloff',
    SUBMISSION_REVIEW:  'Submission',
    CONTRACT_PAPERING:  'To paper',
    CONTRACT_START:     'To start',
    INVOICE_OVERDUE:    'Bill',
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
    case 'HIGH': return 'bg-etyme-danger/10 text-etyme-danger'
    case 'MEDIUM': return 'bg-etyme-attention/10 text-etyme-attention'
    case 'LOW': return 'bg-etyme-action/10 text-etyme-action'
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
  const section = usePageSection('/dashboard/decisions')
  const session = useSession()
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Whether the first read has come back; until then no count is drawn,
  // because "Pending 0" before the read is a guess (round four, problem 21).
  const [readOnce, setReadOnce] = useState(false)
  // The door's own sentence when it refused this reader, drawn alone
  // (round four, problem 3).
  const [refused, setRefused] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  // The week that went over the line, and the sentence that asks about it.
  // The supplier answers on its own leg: what it pays for those hours is
  // its agreement with the person, not the client's with it.
  const [deciding, setDeciding] = useState<
    { timesheetId: string; personName: string; weeks: PendingWeek[]; lead: string } | null
  >(null)

  const fetchDecisions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/decisions')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body.error?.message ?? 'Decisions are not part of your seat. Ask your company\'s owner if you need them.')
        setDecisions([])
        return
      }
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
      setReadOnce(true)
    }
  }, [])

  useEffect(() => {
    fetchDecisions()
  }, [fetchDecisions])

  // ── Inline actions ────────────────────────────────

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    // A refusal is a sentence somebody has to read and act on, and three
    // seconds is not long enough to read one. Good news can go quietly.
    setTimeout(() => setToast(null), type === 'success' ? 3000 : 6000)
  }

  async function handleApproveTimesheet(entityId: string, e: React.MouseEvent, title: string) {
    e.preventDefault()
    e.stopPropagation()
    setActing(entityId)
    try {
      const res = await fetch(`/api/timesheets/${entityId}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Over the weekly line is a question, not a failure. Shown as a
        // red toast it read as "something went wrong" and left the week
        // unsignable; asked, it takes ten seconds and decides the money.
        if (body.error?.code === 'OVERTIME_UNDECIDED') {
          setDeciding({
            timesheetId: entityId,
            personName: title.replace(/^(Approve|Review) (timesheet|expense) — /, ''),
            weeks: (body.error.weeks ?? []) as PendingWeek[],
            lead: body.error.message as string,
          })
          return
        }
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
  // Only the chips whose page is on the reader's own menu, plus any with
  // something under them (sign-up walk, round three, item 13). None at
  // all until the session is known, rather than a guessed set.
  const filterOptions = session.loading
    ? []
    : chipsFor(
        {
          kind: session.company?.kind ?? null,
          isConsultant: session.contextType === 'CONSULTANT',
          worker: session.isWorker,
          permissions: session.permissions,
          seatedAtClient: session.seat?.clientName ?? null,
        },
        counts,
        decisions.length,
      )
  const empty = emptyBook(session.company?.kind ?? null, hasPermission(session.permissions, 'assignments.write'))

  if (refused) {
    return <RefusedState says={refused} />
  }

  return (
    <>
      {/* Head — decision surface */}
      <PageHead
        eyebrow={section}
        title="Needs attention"
        subtitle="Items that need your attention right now — approvals, reviews, and actions across all working surfaces."
        actions={
          <button onClick={fetchDecisions} className="btn-secondary text-[13px]">
            Refresh
          </button>
        }
      />

      {/* Stats row — only once the read is back and answered. */}
      {readOnce && !error && (
      <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending" value={decisions.length} sub="decisions" />
        <Stat label="Urgent" value={highCount} tone={highCount > 0 ? 'attention' : 'default'} sub="need immediate action" />
        <Stat label="Soon" value={medCount} sub="this week" />
        {totalAmount > 0 && (
          // Through the one formatter: a hand-rolled one printed "$3,622.4".
          <Stat label="Value" value={amount(Math.round(totalAmount * 100))} sub="at stake" />
        )}
      </div>
      )}

      {/* Type filters */}
      <div className="mb-5">
        <FilterChips<TypeFilter>
          label="What kind"
          value={typeFilter}
          onChange={setTypeFilter}
          options={filterOptions.map((opt) => ({ key: opt.key, label: opt.label, count: opt.count > 0 ? opt.count : undefined }))}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4">
          <ErrorState says={error} action={{ label: 'Try again', onClick: fetchDecisions }} />
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingState says="Opening what needs you…" />}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        decisions.length === 0
          ? <EmptyState
              says={empty.lead}
              detail={empty.says}
              action={empty.href && empty.action ? { label: empty.action, href: empty.href } : undefined}
            />
          : <EmptyState
              says="No items in this category."
              detail="Try a different filter to see other pending items."
              action={{ label: 'Show all', onClick: () => setTypeFilter('all') }}
            />
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
                      onClick={(e) => handleApproveTimesheet(d.entityId, e, d.title)}
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
                      {amount(Math.round(d.amount * 100))}
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

      {/* What happens to a week that went over the line */}
      {deciding && (
        <DecideOvertime
          side="PAYS"
          timesheetId={deciding.timesheetId}
          personName={deciding.personName}
          weeks={deciding.weeks}
          lead={deciding.lead}
          onClose={() => setDeciding(null)}
          onDecided={(message: string) => {
            const signed = deciding.timesheetId
            setDeciding(null)
            showToast(message)
            setDecisions((prev) => prev.filter((d) => !(d.entityType === 'TIMESHEET' && d.entityId === signed)))
          }}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                         ${toast.type === 'success'
                           ? 'bg-etyme-verified text-white'
                           : 'bg-etyme-danger text-white'
                         } animate-slide-up`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
