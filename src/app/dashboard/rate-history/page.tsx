'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { amount as formatRate, rate as perHour, rateMovement } from '@/lib/money-display'
import { ListSurface, type Column } from '@/components/list-surface'
import { decimalsFor } from '@/lib/money'

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

/** A line this seat may change a rate on, as the route says. */
interface ChangeableLine {
  contractType: 'SELL' | 'BUY'
  contractId: string
  label: string
  rateCents: number
  currency: string
}

// ── Helpers ────────────────────────────────────────────────


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
  const [changeable, setChangeable] = useState<ChangeableLine[]>([])

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
      setChangeable(body.data?.changeable ?? [])
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
        const delta = rateMovement(row.rate, row.previousRate)
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
    let j: any
    try {
      j = await readJson(res)
    } catch (e: any) {
      // The server's own words where it sent any, and a sentence
      // rather than a parser error where it sent nothing.
      alert(e.message)
      return
    }
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

      {/* Only desks the route would accept see this, and only the lines it
          would accept from them. The server says which. */}
      {changeable.length > 0 && <ChangeRate lines={changeable} onDone={fetchHistory} />}

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
                    {r.personName} — {r.previousRate ? formatRate(r.previousRate) : '—'}
                    {' → '}
                    <span className="font-medium">{perHour(r.rate)}</span>
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
      <ListSurface
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

// ── Change a rate ──────────────────────────────────────────────────────
//
// The line, the new rate, the day it takes effect and why. A change
// within five per cent clears on its own; anything larger waits above for
// a second desk, and the one who proposed it cannot approve it.

function ChangeRate({ lines, onDone }: { lines: ChangeableLine[]; onDone: () => Promise<void> }) {
  const [lineKey, setLineKey] = useState('')
  const [newRate, setNewRate] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const line = lines.find((l) => `${l.contractType}:${l.contractId}` === lineKey) ?? null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!line) return
    const units = Number(newRate)
    if (!Number.isFinite(units) || units <= 0) {
      setSaid({ ok: false, text: 'Say the new rate per hour as a number, for example 70 or 70.50.' })
      return
    }
    setBusy(true)
    setSaid(null)
    try {
      const res = await fetch('/api/rate-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractType: line.contractType,
          contractId: line.contractId,
          rate: Math.round(units * 10 ** decimalsFor(line.currency)),
          fromDate,
          reason: reason.trim() || null,
        }),
      })
      await readJson(res)
      setSaid({
        ok: true,
        text: `Recorded. A change of more than five per cent waits for a second desk to approve it; a smaller one applies from ${fromDate}.`,
      })
      setNewRate('')
      setReason('')
      await onDone()
    } catch (err: any) {
      setSaid({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="panel mb-6">
      <p className="stat-label">Change a rate</p>
      <p className="text-sm text-etyme-muted mt-1 mb-3">
        Every day before the date keeps the old rate. Every day from it is paid or billed at the new one.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-etyme-muted sm:col-span-2">
          Line
          <select
            required
            value={lineKey}
            onChange={(e) => setLineKey(e.target.value)}
            className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink bg-etyme-raised"
          >
            <option value="">Choose a line…</option>
            {lines.map((l) => (
              <option key={`${l.contractType}:${l.contractId}`} value={`${l.contractType}:${l.contractId}`}>
                {l.label} — now {perHour(l.rateCents, l.currency)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-etyme-muted">
          New rate per hour{line ? ` (${line.currency})` : ''}
          <input
            required
            inputMode="decimal"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            placeholder="70.00"
            className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm tabular-nums text-etyme-ink bg-etyme-raised"
          />
        </label>
        <label className="text-xs text-etyme-muted">
          Effective from
          <input
            required
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm tabular-nums text-etyme-ink bg-etyme-raised"
          />
        </label>
        <label className="text-xs text-etyme-muted sm:col-span-2">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Six-month review"
            className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink bg-etyme-raised"
          />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          type="submit"
          disabled={busy || !line || !fromDate}
          className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Recording…' : 'Record the change'}
        </button>
        {said && (
          <p className={`text-xs ${said.ok ? 'text-etyme-verified' : 'text-etyme-danger'}`}>{said.text}</p>
        )}
      </div>
    </form>
  )
}
