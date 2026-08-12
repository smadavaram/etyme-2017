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

// ── Status styling ───────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  OPEN:      { bg: 'bg-etyme-canvas',      text: 'text-etyme-muted' },
  SUBMITTED: { bg: 'bg-etyme-action/8',    text: 'text-etyme-action' },
  APPROVED:  { bg: 'bg-emerald-50',        text: 'text-etyme-verified' },
  REJECTED:  { bg: 'bg-red-50',            text: 'text-etyme-danger' },
}

function StatusChip({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-etyme-canvas', text: 'text-etyme-muted' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                      font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}>
      {status}
    </span>
  )
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

// ── Stat box ─────────────────────────────────────────

function StatBox({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'attention' | 'verified'
}) {
  const toneColor = tone === 'attention'
    ? 'text-etyme-attention'
    : tone === 'verified'
      ? 'text-etyme-verified'
      : 'text-etyme-ink'

  return (
    <div className="panel flex-1 min-w-[140px]">
      <p className="lbl mb-1">{label}</p>
      <p className={`text-xl font-serif tabular-nums ${toneColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-etyme-faint mt-0.5">{sub}</p>}
    </div>
  )
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
      render: (row) => <StatusChip status={row.status} />,
      sortValue: (row) => row.status,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Timesheet, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.sellContract.clientCompany.name.toLowerCase().includes(q) ||
    (row.sellContract.engagement?.title ?? '').toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter pills ────────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'OPEN', label: 'Open' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Timesheets</h1>
        <p className="text-sm text-etyme-muted mt-1">
          Billable hours against sell contracts. Submit, review, and approve.
        </p>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <StatBox label="Total hours" value={totalHours.toFixed(0)} sub="this period" />
        <StatBox
          label="Pending approval"
          value={String(pendingApproval)}
          sub={pendingApproval > 0 ? 'need review' : 'all clear'}
          tone={pendingApproval > 0 ? 'attention' : 'default'}
        />
        <StatBox
          label="Anomalies"
          value={String(anomalies)}
          sub={anomalies > 0 ? 'flagged by system' : 'none detected'}
          tone={anomalies > 0 ? 'attention' : 'default'}
        />
        <StatBox
          label="Approved value"
          value={`$${approvedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          sub="billable"
          tone="verified"
        />
      </div>

      {/* Status filters */}
      <div className="flex gap-1 mb-5">
        {statusOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
              statusFilter === opt.key
                ? 'bg-etyme-ink text-white'
                : 'text-etyme-muted hover:bg-etyme-canvas border border-transparent hover:border-etyme-rule'
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
