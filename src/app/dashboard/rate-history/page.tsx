'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { amount as formatRate, compact } from '@/lib/money-display'
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
  approvalState: string        // PROPOSED · APPROVED · REJECTED
  approvedAt: string | null
  createdAt: string
  personName: string
  contractLabel: string
}

type FilterTab = 'all' | 'increases' | 'decreases'

// ── Helpers ────────────────────────────────────────────────


function computeDelta(current: number, previous: number | null): { dollars: string; pct: string; direction: 'up' | 'down' | 'neutral' } {
  if (previous == null || previous === 0) {
    return { dollars: '—', pct: '—', direction: 'neutral' }
  }
  const diff = current - previous
  const pct = ((diff / previous) * 100).toFixed(1)
  if (diff > 0) return { dollars: `+{compact(diff)}`, pct: `+${pct}%`, direction: 'up' }
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

  // Amendments still waiting on somebody. These are the ones holding
  // invoices up, so they are surfaced above the history rather than buried
  // in it.
  const pending = records.filter(r => r.approvalState === 'PROPOSED')

  async function decideAmendment(id: string, action: 'approve' | 'reject') {
    const reason = action === 'reject'
      ? window.prompt('Why are you rejecting this rate change?')
      : (window.prompt('Note for the record? (optional)') ?? '')
    if (action === 'reject' && !reason) return

    const res = await fetch(`/api/rate-history/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error?.message ?? 'Could not record that'); return }
    // Say what the decision just unblocked — an approval that quietly makes
    // three held invoices payable is worth stating.
    alert(j.data.message)
    await fetchHistory()
  }

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

      {/* Waiting on procurement.
          The invoice match refuses a rate variance and tells the clerk to
          amend the contract instead. That instruction is only honest if the
          amendment can actually be decided somewhere, so it is decided
          here — and until it is approved it does not bill. */}
      {pending.length > 0 && (
        <div className="border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg mb-6">
          <div className="p-4 border-b border-etyme-rule">
            <p className="stat-label">Waiting on procurement</p>
            <p className="text-sm text-etyme-muted mt-1">
              A proposed rate does not bill. Until one of these is approved, invoices
              at the new rate keep failing the price check.
            </p>
          </div>
          <div className="divide-y divide-etyme-rule">
            {pending.map(r => (
              <div key={r.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-etyme-ink">
                    {r.personName} — {r.previousRate ? `$${Math.round(r.previousRate / 100)}` : '—'}
                    {' → '}
                    <span className="font-medium">${Math.round(r.rate / 100)}/hr</span>
                  </p>
                  <p className="text-xs text-etyme-muted">
                    from {r.fromDate.slice(0, 10)} · proposed by {r.changedByName}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => decideAmendment(r.id, 'approve')}
                    className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                    Approve
                  </button>
                  <button onClick={() => decideAmendment(r.id, 'reject')}
                    className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
