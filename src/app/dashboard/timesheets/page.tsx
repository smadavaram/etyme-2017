'use client'

import { useEffect, useState, useCallback } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Timesheets working surface — the Operate section.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Timesheets live on the sell side — tracking billable hours against
 * a SellContract. Status lifecycle: OPEN → SUBMITTED → APPROVED
 * or → REJECTED at any point.
 *
 * CLAUDE.md (hard things): "Cycle generation. Nineteen kinds, five
 * frequencies... Port the arithmetic, not the architecture, and
 * write the tests first." Timesheets reference cycle periods but
 * the cycle engine is built separately.
 *
 * Anomaly detection: the API flags > 12hr days and > 60hr weeks.
 * This page surfaces those flags visually.
 */

// ── Types ────────────────────────────────────────────

interface Timesheet {
  id: string
  person: { id: string; name: string }
  sellContract: {
    id: string
    billRate: number
    billCurrency: string
    clientCompany: { id: string; name: string }
    engagement: { id: string; title: string } | null
  }
  periodStart: string
  periodEnd: string
  totalHours: number
  status: string
  anomalyScore: number | null
  anomalyReason: string | null
  approvedAt: string | null
}

type StatusFilter = 'ALL' | 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

// ── Status chip class ───────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    OPEN:      'chip--passive',
    SUBMITTED: 'chip--action',
    APPROVED:  'chip--verified',
    REJECTED:  'chip--danger',
  }
  return map[status] ?? 'chip--passive'
}

// ── Period formatting ────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

  // Same month → "Aug 1 – 15"
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', opts)} – ${e.getDate()}`
  }
  // Different months → "Jul 28 – Aug 10"
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

// ── Page ─────────────────────────────────────────────

export default function TimesheetsPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const fetchTimesheets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/timesheets?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setTimesheets(body.data?.timesheets ?? [])
    } catch (err: any) {
      setError(err.message)
      setTimesheets([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchTimesheets()
  }, [fetchTimesheets])

  // ── Stats ──────────────────────────────────────────
  const totalHours = timesheets.reduce((sum, t) => sum + t.totalHours, 0)
  const pendingApproval = timesheets.filter((t) => t.status === 'SUBMITTED').length
  const anomalies = timesheets.filter((t) => t.anomalyScore != null && t.anomalyScore > 0).length
  const approvedValue = timesheets
    .filter((t) => t.status === 'APPROVED')
    .reduce((sum, t) => sum + (t.totalHours * (t.sellContract.billRate / 100)), 0)

  // ── Filter ─────────────────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? timesheets
    : timesheets.filter((t) => t.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Timesheet>[] = [
    {
      key: 'person',
      label: 'Consultant',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.person.name}</p>
          {row.sellContract.engagement && (
            <p className="text-[11px] text-etyme-faint truncate max-w-[160px]">
              {row.sellContract.engagement.title}
            </p>
          )}
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => (
        <span className="text-etyme-ink">{row.sellContract.clientCompany.name}</span>
      ),
      sortValue: (row) => row.sellContract.clientCompany.name,
      hideOnMobile: true,
    },
    {
      key: 'period',
      label: 'Period',
      render: (row) => (
        <span className="text-[12px] tabular-nums">{formatPeriod(row.periodStart, row.periodEnd)}</span>
      ),
      sortValue: (row) => new Date(row.periodStart).getTime(),
    },
    {
      key: 'totalHours',
      label: 'Hours',
      render: (row) => (
        <span className="tabular-nums font-medium">
          {row.totalHours.toFixed(1)}
          {row.anomalyScore != null && row.anomalyScore > 0 && (
            <span className="ml-1.5 text-etyme-attention" title={row.anomalyReason ?? 'Anomaly detected'}>
              ⚠
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.totalHours,
      align: 'right' as const,
    },
    {
      key: 'billRate',
      label: 'Bill rate',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted">
          ${(row.sellContract.billRate / 100).toFixed(0)}<span className="text-etyme-faint">/hr</span>
        </span>
      ),
      sortValue: (row) => row.sellContract.billRate,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'value',
      label: 'Value',
      render: (row) => {
        const value = row.totalHours * (row.sellContract.billRate / 100)
        return (
          <span className="tabular-nums font-medium">
            ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        )
      },
      sortValue: (row) => row.totalHours * row.sellContract.billRate,
      align: 'right' as const,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>,
      sortValue: (row) => row.status,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Timesheet, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.sellContract.clientCompany.name.toLowerCase().includes(q) ||
    (row.sellContract.engagement?.title ?? '').toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'OPEN', label: 'Open' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle */}
      <div className="page-head">
        <p className="eyebrow">Operate</p>
        <h1>Timesheets</h1>
        <p>Billable hours against sell contracts. Submit, review, and approve — with anomaly detection for flagged entries.</p>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total hours</p>
          <p className="stat-value text-etyme-ink">{totalHours.toFixed(0)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">this period</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending approval</p>
          <p className={`stat-value ${pendingApproval > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {pendingApproval}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{pendingApproval > 0 ? 'need review' : 'all clear'}</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Anomalies</p>
          <p className={`stat-value ${anomalies > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {anomalies}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{anomalies > 0 ? 'flagged by system' : 'none detected'}</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Approved value</p>
          <p className="stat-value text-etyme-verified">
            ${approvedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">billable</p>
        </div>
      </div>

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
          </button>
        ))}
      </div>

      {/* Data table */}
      <DataTable<Timesheet>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, client, or engagement…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} timesheets.` : 'No timesheets yet.'}
        emptyDetail="Timesheets will appear here once consultants start logging hours against sell contracts."
        exportName="timesheets"
        selectable
        bulkActions={(selected) => (
          <>
            <button className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               bg-etyme-verified text-white hover:bg-etyme-verified/90
                               transition-colors">
              Approve ({selected.size})
            </button>
            <button className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               border border-etyme-rule text-etyme-muted
                               hover:bg-etyme-canvas transition-colors">
              Export selected
            </button>
          </>
        )}
        rowClassName={(row) =>
          row.anomalyScore != null && row.anomalyScore > 0
            ? 'bg-amber-50/30'
            : ''
        }
        defaultPageSize={20}
      />

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} timesheet{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
        </p>
      )}
    </>
  )
}
