'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact } from '@/lib/money-display'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'

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

// ── Create Timesheet Modal ──────────────────────────

interface ContractOption {
  id: string
  personName: string
  clientName: string
  billRate: number
}

function getWeekDates(start: Date): string[] {
  const dates: string[] = []
  const d = new Date(start)
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function CreateTimesheetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (msg: string) => void
}) {
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [contractId, setContractId] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const mon = getMonday(new Date())
    return mon.toISOString().slice(0, 10)
  })
  const [hours, setHours] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch active sell contracts for the dropdown
  useEffect(() => {
    fetch('/api/contracts?side=sell&state=IN_PROGRESS&limit=100')
      .then((r) => r.json())
      .then((body) => {
        const list = (body.data?.contracts ?? []).map((c: any) => ({
          id: c.id,
          personName: c.person?.name ?? 'Unknown',
          clientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? 'Unknown',
          billRate: c.billRate,
        }))
        setContracts(list)
        if (list.length === 1) setContractId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const weekDates = getWeekDates(new Date(weekStart + 'T00:00:00'))
  const totalHrs = Object.values(hours).reduce((s, h) => s + h, 0)
  const selectedContract = contracts.find((c) => c.id === contractId)
  const estimatedValue = selectedContract
    ? totalHrs * (selectedContract.billRate / 100)
    : 0

  function setDayHours(date: string, val: string) {
    const num = parseFloat(val)
    if (val === '' || isNaN(num)) {
      const next = { ...hours }
      delete next[date]
      setHours(next)
    } else {
      setHours({ ...hours, [date]: Math.max(0, Math.min(24, num)) })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contractId) {
      setError('Select a sell contract')
      return
    }
    if (totalHrs === 0) {
      setError('Enter at least some hours')
      return
    }

    setSubmitting(true)
    setError(null)

    // Build days object — only include dates with hours > 0
    const days: Record<string, number> = {}
    for (const [date, h] of Object.entries(hours)) {
      if (h > 0) days[date] = h
    }

    const periodEnd = weekDates[weekDates.length - 1]

    try {
      const res = await fetch('/api/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellContractId: contractId,
          periodStart: weekStart,
          periodEnd,
          days,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create timesheet')
        return
      }

      const body = await res.json()
      const msg = body.data?.message ?? `Timesheet created: ${totalHrs}h`
      onCreated(msg)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-2xl mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Create timesheet</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Contract selector */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Sell contract *</label>
            <select
              required
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            >
              <option value="">Select a contract…</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.personName} — {c.clientName} ({compact(c.billRate)}/hr)
                </option>
              ))}
            </select>
          </div>

          {/* Week selector */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Week starting</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T00:00:00')
                const mon = getMonday(d)
                setWeekStart(mon.toISOString().slice(0, 10))
                setHours({})
              }}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            />
          </div>

          {/* Daily hours grid */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-2">Hours per day</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weekDates.map((date, i) => {
                const isWeekend = i >= 5
                return (
                  <div key={date} className="text-center">
                    <div className={`text-[10px] font-semibold mb-1 ${isWeekend ? 'text-etyme-faint' : 'text-etyme-muted'}`}>
                      {DAY_LABELS[i]}
                    </div>
                    <div className={`text-[10px] tabular-nums mb-1.5 ${isWeekend ? 'text-etyme-faint' : 'text-etyme-muted'}`}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={hours[date] ?? ''}
                      onChange={(e) => setDayHours(date, e.target.value)}
                      placeholder={isWeekend ? '0' : '8'}
                      className={`w-full px-1 py-2 text-sm text-center tabular-nums border rounded-lg
                                  focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                                  ${isWeekend ? 'border-etyme-rule/50 bg-etyme-canvas/50' : 'border-etyme-rule'}`}
                    />
                  </div>
                )
              })}
            </div>

            {/* Quick fill buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  const filled: Record<string, number> = {}
                  weekDates.forEach((d, i) => { if (i < 5) filled[d] = 8 })
                  setHours(filled)
                }}
                className="text-[11px] text-etyme-action hover:underline"
              >
                Fill 40h (8×5)
              </button>
              <button
                type="button"
                onClick={() => setHours({})}
                className="text-[11px] text-etyme-muted hover:underline"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-etyme-canvas">
            <div>
              <span className="text-sm font-medium tabular-nums">{totalHrs.toFixed(1)}h</span>
              <span className="text-etyme-muted text-sm ml-1">total</span>
            </div>
            {selectedContract && totalHrs > 0 && (
              <div className="text-sm text-etyme-verified font-medium tabular-nums">
                ≈ ${estimatedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} billable
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !contractId || totalHrs === 0}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create timesheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function TimesheetsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'timesheets')

  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [approving, setApproving] = useState(false)
  const [acting, setActing] = useState<string | null>(null)  // ID of the timesheet being acted on
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Open modal from ?new=1 link
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowCreate(true)
      router.replace('/dashboard/timesheets')
    }
  }, [searchParams, router])

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

  // ── Approve handler ────────────────────────────────
  async function handleBulkApprove(selectedIds: Set<string>) {
    const submittedIds = Array.from(selectedIds).filter(id => {
      const ts = timesheets.find(t => t.id === id)
      return ts?.status === 'SUBMITTED'
    })

    if (submittedIds.length === 0) {
      setToast({ message: 'No submitted timesheets selected — only submitted timesheets can be approved.', type: 'error' })
      setTimeout(() => setToast(null), 4000)
      return
    }

    setApproving(true)
    let approved = 0
    let failed = 0

    for (const id of submittedIds) {
      try {
        const res = await fetch(`/api/timesheets/${id}/approve`, { method: 'POST' })
        if (res.ok) {
          approved++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setApproving(false)
    const msg = failed > 0
      ? `Approved ${approved}, ${failed} failed`
      : `Approved ${approved} timesheet${approved !== 1 ? 's' : ''}`
    setToast({ message: msg, type: failed > 0 ? 'error' : 'success' })
    setTimeout(() => setToast(null), 4000)

    // Refresh the list
    fetchTimesheets()
  }

  // ── Individual timesheet actions ──────────────────
  async function handleSubmitTimesheet(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/timesheets/${id}/submit`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setToast({ message: body.error?.message ?? 'Failed to submit', type: 'error' })
      } else {
        setToast({ message: 'Timesheet submitted for approval', type: 'success' })
        fetchTimesheets()
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setActing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  async function handleApproveTimesheet(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/timesheets/${id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setToast({ message: body.error?.message ?? 'Failed to approve', type: 'error' })
      } else {
        const body = await res.json()
        setToast({ message: body.data?.message ?? 'Timesheet approved', type: 'success' })
        fetchTimesheets()
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setActing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  async function handleRejectTimesheet(id: string, reason: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/timesheets/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setToast({ message: body.error?.message ?? 'Failed to reject', type: 'error' })
      } else {
        setToast({ message: 'Timesheet rejected — returned to consultant', type: 'success' })
        setRejectTarget(null)
        setRejectReason('')
        fetchTimesheets()
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setActing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

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
          {compact(row.sellContract.billRate)}<span className="text-etyme-faint">/hr</span>
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
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>
          {row.status === 'OPEN' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSubmitTimesheet(row.id) }}
              disabled={acting === row.id}
              className="text-[11px] text-etyme-action hover:underline disabled:opacity-50 whitespace-nowrap"
            >
              {acting === row.id ? '…' : '→ Submit'}
            </button>
          )}
          {row.status === 'SUBMITTED' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleApproveTimesheet(row.id) }}
                disabled={acting === row.id}
                className="text-[11px] text-etyme-verified hover:underline disabled:opacity-50"
              >
                {acting === row.id ? '…' : '✓'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRejectTarget(row.id) }}
                disabled={acting === row.id}
                className="text-[11px] text-red-500 hover:underline disabled:opacity-50"
              >
                ✕
              </button>
            </>
          )}
        </div>
      ),
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
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1>{framing.title}</h1>
          <p>{framing.subtitle}</p>
        </div>
        {/* A client approves hours; the consultant's vendor raises them. */}
        {!isClient && (
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-3 shrink-0">
            + New
          </button>
        )}
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
            <button
              onClick={() => handleBulkApprove(selected)}
              disabled={approving}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                         bg-etyme-verified text-white hover:bg-etyme-verified/90
                         transition-colors disabled:opacity-50"
            >
              {approving ? 'Approving…' : `Approve (${selected.size})`}
            </button>
            <button
              onClick={() => {
                const rows = filtered.filter((t) => selected.has(t.id))
                if (rows.length === 0) return
                const header = ['Consultant','Client','Engagement','Period Start','Period End','Hours','Bill Rate','Billable Value','Status']
                const csvRows = rows.map((t) => {
                  const value = t.totalHours * (t.sellContract.billRate / 100)
                  return [
                    t.person.name,
                    t.sellContract.clientCompany.name,
                    t.sellContract.engagement?.title ?? '',
                    t.periodStart,
                    t.periodEnd,
                    t.totalHours.toFixed(1),
                    (t.sellContract.billRate / 100).toFixed(2),
                    value.toFixed(2),
                    t.status,
                  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
                })
                const csv = [header.join(','), ...csvRows].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `timesheets-export-${new Date().toISOString().slice(0, 10)}.csv`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               border border-etyme-rule text-etyme-muted
                               hover:bg-etyme-canvas transition-colors"
            >
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

      {/* Create timesheet modal */}
      {showCreate && (
        <CreateTimesheetModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => {
            setToast({ message: msg, type: 'success' })
            setTimeout(() => setToast(null), 4000)
            fetchTimesheets()
          }}
        />
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => { setRejectTarget(null); setRejectReason('') }}
        >
          <div className="card w-full max-w-sm mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Reject timesheet</h3>
            <p className="text-sm text-etyme-muted mb-4">
              This will return the timesheet to the consultant for correction.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg mb-4
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                         resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRejectTarget(null); setRejectReason('') }} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => handleRejectTimesheet(rejectTarget, rejectReason)}
                disabled={!rejectReason.trim() || acting === rejectTarget}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white
                           hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {acting === rejectTarget ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
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
