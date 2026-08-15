'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Requirements working surface — open demand.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Requirements live on the sell side — demand from clients or internal
 * requisitions that consultants are matched and submitted against.
 * Status lifecycle: DRAFT → OPEN → FILLED or → CLOSED at any point.
 */

// ── Types ──────────────────────────────────────────────────

interface Requirement {
  id: string
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  months: number | null
  status: string
  source: string
  matches: number
  createdAt: string
}

type StatusFilter = 'ALL' | 'DRAFT' | 'OPEN' | 'FILLED' | 'CLOSED'

// ── New Requirement Modal ──────────────────────────────────

function NewRequirementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    skills: '',
    location: '',
    billMin: '',
    billMax: '',
    months: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          location: form.location || null,
          billMin: form.billMin ? parseInt(form.billMin) : null,
          billMax: form.billMax ? parseInt(form.billMax) : null,
          months: form.months ? parseInt(form.months) : null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create requirement')
        return
      }

      onCreated()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">New requirement</h2>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Senior SAP BRIM Consultant — Remote"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Required skills (comma-separated)</label>
            <input
              type="text"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="SAP BRIM, Revenue Accounting, S/4HANA"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Bill min ($/hr)</label>
              <input
                type="number"
                value={form.billMin}
                onChange={(e) => setForm({ ...form, billMin: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="80"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Bill max ($/hr)</label>
              <input
                type="number"
                value={form.billMax}
                onChange={(e) => setForm({ ...form, billMax: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="120"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Duration (months)</label>
              <input
                type="number"
                value={form.months}
                onChange={(e) => setForm({ ...form, months: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="12"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Remote / Dallas, TX / Hybrid"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create requirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function RequirementsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showNew, setShowNew] = useState(false)

  // Open the new modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true)
      // Clean the URL so refreshing doesn't re-open the modal
      router.replace('/dashboard/requirements', { scroll: false })
    }
  }, [searchParams, router])

  const fetchRequirements = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/requirements?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      // API returns counts.matches; flatten for the table
      const reqs = (body.data?.requirements ?? []).map((r: any) => ({
        ...r,
        matches: r.counts?.matches ?? r.matches ?? 0,
      }))
      setRequirements(reqs)
    } catch (err: any) {
      setError(err.message)
      setRequirements([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchRequirements()
  }, [fetchRequirements])

  // ── Stats ──────────────────────────────────────────
  const openCount = requirements.filter((r) => r.status === 'OPEN').length
  const totalMatches = requirements.reduce((sum, r) => sum + r.matches, 0)
  const filledCount = requirements.filter((r) => r.status === 'FILLED').length

  // ── Filtered ───────────────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? requirements
    : requirements.filter((r) => r.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Requirement>[] = [
    {
      key: 'title',
      label: 'Title',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.title}</p>
          {row.location && (
            <p className="text-[11px] text-etyme-faint truncate max-w-[200px]">{row.location}</p>
          )}
        </div>
      ),
      sortValue: (row) => row.title,
      width: 'min-w-[200px]',
    },
    {
      key: 'skills',
      label: 'Skills',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {row.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="chip chip--action">{skill}</span>
          ))}
          {row.skills.length > 3 && (
            <span className="chip chip--passive">+{row.skills.length - 3}</span>
          )}
        </div>
      ),
      sortable: false,
      hideOnMobile: true,
    },
    {
      key: 'billRange',
      label: 'Bill range',
      render: (row) => (
        row.billMin != null || row.billMax != null ? (
          <span className="tabular-nums">
            {row.billMin != null && `$${row.billMin}`}
            {row.billMin != null && row.billMax != null && '–'}
            {row.billMax != null && `$${row.billMax}`}
            <span className="text-etyme-faint">/hr</span>
          </span>
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) => row.billMax ?? row.billMin ?? 0,
      align: 'right' as const,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const styles: Record<string, string> = {
          DRAFT:  'chip--passive',
          OPEN:   'chip--action',
          FILLED: 'chip--verified',
          CLOSED: 'chip--passive',
        }
        return <span className={`chip ${styles[row.status] ?? 'chip--passive'}`}>{row.status}</span>
      },
      sortValue: (row) => row.status,
    },
    {
      key: 'matchCount',
      label: 'Matches',
      render: (row) => (
        row.matches > 0 ? (
          <span className="flex items-center justify-end gap-1.5 tabular-nums">
            <span className="evidence-dot" />
            {row.matches}
          </span>
        ) : (
          <span className="text-etyme-faint tabular-nums">0</span>
        )
      ),
      sortValue: (row) => row.matches,
      align: 'right' as const,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
      sortValue: (row) => new Date(row.createdAt).getTime(),
      hideOnMobile: true,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Requirement, q: string) =>
    row.title.toLowerCase().includes(q) ||
    row.skills.some((s) => s.toLowerCase().includes(q)) ||
    (row.location ?? '').toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'DRAFT', label: 'Draft' },
    { key: 'OPEN', label: 'Open' },
    { key: 'FILLED', label: 'Filled' },
    { key: 'CLOSED', label: 'Closed' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + action */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Sell</p>
          <h1>Requirements</h1>
          <p>Open demand. Match consultants, distribute to clients, track submissions through to placement.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary mt-3 shrink-0">
          New requirement
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Open</p>
          <p className={`stat-value ${openCount > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {openCount}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">requirements</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Matches</p>
          <p className={`stat-value ${totalMatches > 0 ? 'text-etyme-verified' : 'text-etyme-ink'}`}>
            {totalMatches}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">across all reqs</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Filled</p>
          <p className="stat-value text-etyme-verified">{filledCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">placements</p>
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
      <DataTable<Requirement>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by title, skill, location, or status…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} requirements.` : 'No requirements yet.'}
        emptyDetail="Create your first requirement to start matching consultants, or import requirements from your VMS."
        onRowClick={(row) => router.push(`/dashboard/requirements/${row.id}` as any)}
        exportName="requirements"
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} requirement{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
        </p>
      )}

      {/* Modal */}
      {showNew && <NewRequirementModal onClose={() => setShowNew(false)} onCreated={fetchRequirements} />}
    </>
  )
}
