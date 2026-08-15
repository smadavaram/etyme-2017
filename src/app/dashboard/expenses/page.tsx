'use client'

import { useEffect, useState, useCallback } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Expenses working surface — reimbursable and company expenses.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * BUILD.md §6.3: "Client-billable expenses appear on invoices."
 *
 * LEGACY_RULES.md §4.4:
 *   Three bill types → two kinds: CLIENT_BILLABLE and COMPANY (internal).
 *   Lifecycle: DRAFT → SUBMITTED → APPROVED → INVOICED → PAID or → REJECTED
 *   Amount = sum(unitPrice × quantity) from line items.
 *
 * Categories: TRAVEL · EQUIPMENT · TRAINING · RELOCATION · MEALS · OTHER
 */

// ── Types ────────────────────────────────────────────

interface Expense {
  id: string
  person: { id: string; name: string }
  client: { id: string; name: string }
  sellContractId: string
  category: string
  billable: boolean
  description: string
  periodStart: string
  periodEnd: string
  items: { description: string; quantity: number; unitPrice: number; expenseType?: string }[]
  total: number
  receiptUrl: string | null
  status: string
  submittedAt: string | null
  approvedAt: string | null
  rejectedReason: string | null
  createdAt: string
}

type StatusFilter = 'ALL' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'INVOICED' | 'PAID' | 'REJECTED'
type KindFilter = 'all' | 'billable' | 'internal'

// ── Status styling ───────────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    DRAFT:    'chip--passive',
    SUBMITTED:'chip--attention',
    APPROVED: 'chip--verified',
    INVOICED: 'chip--action',
    PAID:     'chip--verified',
    REJECTED: 'chip--danger',
  }
  return map[status] ?? 'chip--passive'
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    TRAVEL:     '✈ Travel',
    EQUIPMENT:  '🖥 Equipment',
    TRAINING:   '📚 Training',
    RELOCATION: '🏠 Relocation',
    MEALS:      '🍽 Meals',
    OTHER:      '📋 Other',
  }
  return map[cat] ?? cat
}

// ── Currency formatting ──────────────────────────────

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents)
}

// ── Date helpers ─────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

// ── Page ─────────────────────────────────────────────

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [totals, setTotals] = useState({ grand: 0, billable: 0, billableCount: 0, internal: 0, internalCount: 0 })
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (kindFilter !== 'all') params.set('billable', kindFilter === 'billable' ? 'true' : 'false')

      const res = await fetch(`/api/expenses?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setExpenses(body.data?.expenses ?? [])
      setTotals(body.data?.totals ?? { grand: 0, billable: 0, billableCount: 0, internal: 0, internalCount: 0 })
    } catch (err: any) {
      setError(err.message)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, kindFilter])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // ── Batch actions ──────────────────────────────────

  async function handleBatchAction(action: string, ids?: string[]) {
    const targetIds = ids ?? expenses.filter((e) => {
      if (action === 'submit') return e.status === 'DRAFT'
      if (action === 'approve') return e.status === 'SUBMITTED'
      return false
    }).map((e) => e.id)

    if (targetIds.length === 0) return

    setActionLoading(true)
    try {
      const res = await fetch('/api/expenses/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expenseIds: targetIds }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `Action failed`)
      }

      const body = await res.json()
      const processed = body.data?.processed ?? targetIds.length
      const errors = body.data?.errors ?? 0
      const label = action === 'submit' ? 'Submitted' : action === 'approve' ? 'Approved' : action.charAt(0).toUpperCase() + action.slice(1)
      const msg = errors > 0
        ? `${label} ${processed}, ${errors} failed`
        : `${label} ${processed} expense${processed !== 1 ? 's' : ''}`
      setToast({ message: msg, type: errors > 0 ? 'error' : 'success' })
      setTimeout(() => setToast(null), 3500)

      await fetchExpenses()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setActionLoading(false)
    }
  }

  // ── Stats ──────────────────────────────────────────
  const stats = {
    total: expenses.length,
    pending: expenses.filter((e) => e.status === 'SUBMITTED').length,
    approved: expenses.filter((e) => e.status === 'APPROVED').length,
    totalAmount: expenses.reduce((sum, e) => sum + e.total, 0),
  }

  // ── Filter by status ──────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? expenses
    : expenses.filter((e) => e.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Expense>[] = [
    {
      key: 'person',
      label: 'Consultant',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.person.name}</p>
          <p className="text-[11px] text-etyme-faint truncate max-w-[180px]">{row.description}</p>
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[200px]',
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => (
        <span className="text-etyme-ink">{row.client.name}</span>
      ),
      sortValue: (row) => row.client.name,
      hideOnMobile: true,
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span className="text-[13px]">{categoryLabel(row.category)}</span>
      ),
      sortValue: (row) => row.category,
    },
    {
      key: 'kind',
      label: 'Kind',
      render: (row) => (
        <span className={`chip ${row.billable ? 'chip--action' : 'chip--passive'}`}>
          {row.billable ? 'Billable' : 'Internal'}
        </span>
      ),
      sortValue: (row) => row.billable ? 'Billable' : 'Internal',
      hideOnMobile: true,
    },
    {
      key: 'items',
      label: 'Items',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted">
          {row.items.length} item{row.items.length !== 1 ? 's' : ''}
        </span>
      ),
      sortValue: (row) => row.items.length,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'total',
      label: 'Amount',
      render: (row) => (
        <span className="tabular-nums font-medium">
          {formatUSD(row.total)}
        </span>
      ),
      sortValue: (row) => row.total,
      align: 'right' as const,
    },
    {
      key: 'period',
      label: 'Period',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums">
          {formatPeriod(row.periodStart, row.periodEnd)}
        </span>
      ),
      sortValue: (row) => new Date(row.periodStart).getTime(),
      hideOnMobile: true,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums" title={new Date(row.createdAt).toLocaleString()}>
          {timeAgo(row.createdAt)}
        </span>
      ),
      sortValue: (row) => new Date(row.createdAt).getTime(),
      align: 'right' as const,
      hideOnMobile: true,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Expense, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.client.name.toLowerCase().includes(q) ||
    row.category.toLowerCase().includes(q) ||
    row.description.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q) ||
    (row.billable ? 'billable' : 'internal').includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'DRAFT', label: 'Draft', count: expenses.filter((e) => e.status === 'DRAFT').length },
    { key: 'SUBMITTED', label: 'Submitted', count: expenses.filter((e) => e.status === 'SUBMITTED').length },
    { key: 'APPROVED', label: 'Approved', count: expenses.filter((e) => e.status === 'APPROVED').length },
    { key: 'INVOICED', label: 'Invoiced' },
    { key: 'PAID', label: 'Paid' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + kind toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>Expenses</h1>
          <p>Consultant expenses — travel, equipment, training, relocation. Client-billable expenses appear on invoices.</p>
        </div>

        {/* Kind toggle — billable / internal / all */}
        <div className="flex bg-etyme-canvas rounded-md p-0.5 mt-3 shrink-0">
          {(['all', 'billable', 'internal'] as KindFilter[]).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`px-4 py-2 text-[13px] font-medium rounded transition-colors capitalize ${
                kindFilter === k
                  ? 'bg-white shadow-sm text-etyme-ink'
                  : 'text-etyme-muted hover:text-etyme-ink'
              }`}
            >
              {k === 'all' ? 'All' : k === 'billable' ? 'Billable' : 'Internal'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total expenses</p>
          <p className="stat-value text-etyme-ink">{formatUSD(totals.grand)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{stats.total} reports</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Client-billable</p>
          <p className={`stat-value ${totals.billable > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {formatUSD(totals.billable)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{totals.billableCount} reports</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Internal</p>
          <p className="stat-value text-etyme-ink">{formatUSD(totals.internal)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{totals.internalCount} reports</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending approval</p>
          <p className={`stat-value ${stats.pending > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {stats.pending}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">awaiting review</p>
        </div>
      </div>

      {/* Action bar */}
      {(stats.pending > 0 || expenses.some((e) => e.status === 'DRAFT')) && (
        <div className="flex gap-2 mb-4">
          {expenses.some((e) => e.status === 'DRAFT') && (
            <button
              onClick={() => handleBatchAction('submit')}
              disabled={actionLoading}
              className="btn-secondary text-[13px] disabled:opacity-50"
            >
              {actionLoading ? 'Processing…' : `Submit all drafts (${expenses.filter((e) => e.status === 'DRAFT').length})`}
            </button>
          )}
          {stats.pending > 0 && (
            <button
              onClick={() => handleBatchAction('approve')}
              disabled={actionLoading}
              className="btn-primary text-[13px] disabled:opacity-50"
            >
              {actionLoading ? 'Processing…' : `Approve all submitted (${stats.pending})`}
            </button>
          )}
        </div>
      )}

      {/* Status filters — prototype filter-tab pattern */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {statusOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`filter-tab ${
              statusFilter === opt.key ? 'filter-tab--active' : 'filter-tab--inactive'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && opt.count > 0 && (
              <span className="ml-1 text-[10px] opacity-60">({opt.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Data table */}
      <DataTable<Expense>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, client, category, or status…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} expenses.` : 'No expenses yet.'}
        emptyDetail="Expenses are created when consultants submit reimbursable costs against their sell contracts."
        exportName={`expenses-${kindFilter}`}
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
          {kindFilter !== 'all' && ` · ${kindFilter}`}
          {` · ${formatUSD(filtered.reduce((sum, e) => sum + e.total, 0))}`}
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
