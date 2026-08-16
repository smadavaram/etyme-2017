'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Rate History working surface.
 *
 * BUILD.md §6.9: "Rate changes must be versioned or the timesheet
 * valuation is unreliable."
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   Eyebrow: "Operate" (vendor view)
 */

// ── Types ──────────────────────────────────────────────────

interface RateHistoryRecord {
  id: string
  contractType: string
  contractId: string
  rate: number         // cents
  rateType: string
  overtimeRate: number | null
  fromDate: string
  toDate: string | null
  reason: string | null
  changedById: string
  changedByName: string
  previousRate: number | null  // cents
  createdAt: string
  personName: string
  contractLabel: string
}

type FilterTab = 'all' | 'increases' | 'decreases'

// ── Helpers ────────────────────────────────────────────────

function formatRate(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function computeDelta(current: number, previous: number | null): { dollars: string; pct: string; direction: 'up' | 'down' | 'neutral' } {
  if (previous == null || previous === 0) {
    return { dollars: '—', pct: '—', direction: 'neutral' }
  }
  const diff = current - previous
  const pct = ((diff / previous) * 100).toFixed(1)
  if (diff > 0) return { dollars: `+$${(diff / 100).toFixed(2)}`, pct: `+${pct}%`, direction: 'up' }
  if (diff < 0) return { dollars: `-$${(Math.abs(diff) / 100).toFixed(2)}`, pct: `${pct}%`, direction: 'down' }
  return { dollars: '$0.00', pct: '0.0%', direction: 'neutral' }
}

function matchesFilter(record: RateHistoryRecord, filter: FilterTab): boolean {
  if (filter === 'all') return true
  if (record.previousRate == null) return filter === 'increases' // initial rate treated as increase
  if (filter === 'increases') return record.rate > record.previousRate
  if (filter === 'decreases') return record.rate < record.previousRate
  return true
}

// ── Page ───────────────────────────────────────────────────

export default function RateHistoryPage() {
  const [records, setRecords] = useState<RateHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/rate-history')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      setRecords(body.data?.rateHistory ?? [])
    } catch (err: any) {
      setError(err.message)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // ── Derived data ──

  const filtered = useMemo(
    () => records.filter((r) => matchesFilter(r, filter)),
    [records, filter]
  )

  const stats = useMemo(() => {
    const total = records.length
    const increases = records.filter(
      (r) => r.previousRate != null && r.rate > r.previousRate
    ).length
    const decreases = records.filter(
      (r) => r.previousRate != null && r.rate < r.previousRate
    ).length

    // Average change % (only for records that have a previous rate and a non-zero delta)
    const changesWithPrev = records.filter(
      (r) => r.previousRate != null && r.previousRate > 0 && r.rate !== r.previousRate
    )
    const avgChangePct =
      changesWithPrev.length > 0
        ? changesWithPrev.reduce(
            (sum, r) => sum + Math.abs((r.rate - r.previousRate!) / r.previousRate!) * 100,
            0
          ) / changesWithPrev.length
        : 0

    return { total, increases, decreases, avgChangePct }
  }, [records])

  // ── Column definitions ──

  const columns: Column<RateHistoryRecord>[] = [
    {
      key: 'personName',
      label: 'Consultant',
      render: (row) => (
        <span className="font-medium text-etyme-ink">{row.personName}</span>
      ),
      sortValue: (row) => row.personName,
    },
    {
      key: 'contractLabel',
      label: 'Contract',
      render: (row) => (
        <span className="text-etyme-muted text-[12px]">{row.contractLabel}</span>
      ),
      sortValue: (row) => row.contractLabel,
      hideOnMobile: true,
    },
    {
      key: 'previousRate',
      label: 'Previous',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted">
          {row.previousRate != null ? formatRate(row.previousRate) : '—'}
        </span>
      ),
      sortValue: (row) => row.previousRate ?? 0,
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'New Rate',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-etyme-ink font-medium">
          {formatRate(row.rate)}
          <span className="text-etyme-faint font-normal">/hr</span>
        </span>
      ),
      sortValue: (row) => row.rate,
    },
    {
      key: 'change',
      label: 'Change',
      align: 'right',
      render: (row) => {
        const delta = computeDelta(row.rate, row.previousRate)
        if (delta.direction === 'neutral') {
          return <span className="tabular-nums text-etyme-faint">—</span>
        }
        const chipClass =
          delta.direction === 'up' ? 'chip--verified' : 'chip--attention'
        return (
          <span className={`chip ${chipClass} tabular-nums`}>
            {delta.dollars} ({delta.pct})
          </span>
        )
      },
      sortValue: (row) =>
        row.previousRate != null ? row.rate - row.previousRate : 0,
    },
    {
      key: 'changedByName',
      label: 'Changed By',
      render: (row) => (
        <span className="text-etyme-muted text-[12px]">{row.changedByName}</span>
      ),
      sortValue: (row) => row.changedByName,
      hideOnMobile: true,
    },
    {
      key: 'fromDate',
      label: 'Effective',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted text-[12px]">
          {new Date(row.fromDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
      sortValue: (row) => new Date(row.fromDate).getTime(),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] max-w-[200px] truncate block">
          {row.reason ?? '—'}
        </span>
      ),
      sortValue: (row) => row.reason ?? '',
      hideOnMobile: true,
    },
  ]

  // ── Filter tabs ──

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: records.length },
    { key: 'increases', label: 'Increases', count: stats.increases },
    { key: 'decreases', label: 'Decreases', count: stats.decreases },
  ]

  return (
    <div className="animate-fade-in">
      {/* Head */}
      <div className="page-head mb-6">
        <p className="eyebrow">Operate</p>
        <h1>Rate History</h1>
        <p>
          Track rate changes across all contracts over time. Every adjustment is
          versioned for audit and timesheet valuation.
        </p>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total changes</p>
          <p className="stat-value text-etyme-ink">{stats.total}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">rate adjustments</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Avg change</p>
          <p className="stat-value text-etyme-ink">
            {stats.avgChangePct > 0 ? `${stats.avgChangePct.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">absolute avg</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Increases</p>
          <p className="stat-value text-etyme-verified">{stats.increases}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">rate raises</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Decreases</p>
          <p className={`stat-value ${stats.decreases > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {stats.decreases}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">rate reductions</p>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchPlaceholder="Search by consultant, contract, reason…"
        searchFilter={(row, q) =>
          row.personName.toLowerCase().includes(q) ||
          row.contractLabel.toLowerCase().includes(q) ||
          (row.reason?.toLowerCase().includes(q) ?? false) ||
          (row.changedByName?.toLowerCase().includes(q) ?? false)
        }
        emptyMessage={
          filter === 'all'
            ? 'No rate changes recorded yet.'
            : `No ${filter} found.`
        }
        emptyDetail="Rate changes are recorded when a contract rate is adjusted. Each change is versioned with an effective date and reason."
        exportName="rate-history"
        filters={
          <div className="flex gap-1.5">
            {filterTabs.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`filter-tab ${filter === f.key ? 'filter-tab--active' : 'filter-tab--inactive'}`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        }
      />
    </div>
  )
}
