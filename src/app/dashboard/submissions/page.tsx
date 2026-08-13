'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Submissions working surface — the vendor's outbound pipeline.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Direction toggle: sent (default — "what we submitted to clients")
 *   vs received ("what other vendors submitted to our requirements").
 *
 * Status lifecycle: SUBMITTED → SHORTLISTED → INTERVIEW → OFFERED → PLACED
 *   or → REJECTED / WITHDRAWN at any point.
 */

// ── Types ────────────────────────────────────────────

interface Submission {
  id: string
  person: { id: string; name: string }
  requirement: { id: string; title: string; skills: string[] }
  fromCompany: { id: string; name: string }
  toCompany: { id: string; name: string }
  kind: 'INTERNAL' | 'BENCH' | 'NETWORK'
  rate: number
  status: string
  submittedAt: string
}

type StatusFilter = 'ALL' | 'SUBMITTED' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFERED' | 'PLACED' | 'REJECTED' | 'WITHDRAWN'
type DirectionFilter = 'sent' | 'received'

// ── Status styling ───────────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    SUBMITTED:   'chip--action',
    SHORTLISTED: 'chip--attention',
    INTERVIEW:   'chip--action',
    OFFERED:     'chip--verified',
    PLACED:      'chip--verified',
    REJECTED:    'chip--danger',
    WITHDRAWN:   'chip--passive',
  }
  return map[status] ?? 'chip--passive'
}

function kindChipClass(kind: string): string {
  const map: Record<string, string> = {
    INTERNAL: 'chip--passive',
    BENCH:    'chip--action',
    NETWORK:  'chip--attention',
  }
  return map[kind] ?? 'chip--passive'
}

// ── Relative time helper ─────────────────────────────

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

export default function SubmissionsPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<DirectionFilter>('sent')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const [companyId, setCompanyId] = useState<string | null>(null)

  // Resolve the user's company from /api/me
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((body) => {
        const cid = body.data?.activeContext?.company?.id ?? body.data?.contexts?.[0]?.company?.id
        if (cid) setCompanyId(cid)
      })
      .catch(() => {})
  }, [])

  const fetchSubmissions = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        direction,
        companyId,
        limit: '50',
      })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/submissions?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setSubmissions(body.data?.submissions ?? [])
    } catch (err: any) {
      setError(err.message)
      setSubmissions([])
    } finally {
      setLoading(false)
    }
  }, [direction, statusFilter, companyId])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  // ── Stats ──────────────────────────────────────────
  const stats = {
    total: submissions.length,
    submitted: submissions.filter((s) => s.status === 'SUBMITTED').length,
    shortlisted: submissions.filter((s) => s.status === 'SHORTLISTED').length,
    interview: submissions.filter((s) => s.status === 'INTERVIEW').length,
    placed: submissions.filter((s) => s.status === 'PLACED').length,
  }

  // ── Filter by status ──────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? submissions
    : submissions.filter((s) => s.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Submission>[] = [
    {
      key: 'person',
      label: 'Consultant',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.person.name}</p>
          <p className="text-[11px] text-etyme-faint">{row.kind === 'INTERNAL' ? 'Internal' : row.fromCompany.name}</p>
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'requirement',
      label: 'Requirement',
      render: (row) => (
        <div className="max-w-[260px]">
          <p className="font-medium text-etyme-ink truncate">{row.requirement.title}</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {row.requirement.skills.slice(0, 2).map((skill) => (
              <span key={skill} className="chip chip--action">{skill}</span>
            ))}
            {row.requirement.skills.length > 2 && (
              <span className="chip chip--passive">+{row.requirement.skills.length - 2}</span>
            )}
          </div>
        </div>
      ),
      sortValue: (row) => row.requirement.title,
      width: 'min-w-[220px]',
    },
    {
      key: 'counterparty',
      label: direction === 'sent' ? 'Client' : 'From vendor',
      render: (row) => (
        <span className="text-etyme-ink">
          {direction === 'sent' ? row.toCompany.name : row.fromCompany.name}
        </span>
      ),
      sortValue: (row) => direction === 'sent' ? row.toCompany.name : row.fromCompany.name,
      hideOnMobile: true,
    },
    {
      key: 'kind',
      label: 'Kind',
      render: (row) => <span className={`chip ${kindChipClass(row.kind)}`}>{row.kind}</span>,
      sortValue: (row) => row.kind,
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'Rate',
      render: (row) => (
        <span className="tabular-nums">
          ${row.rate}<span className="text-etyme-faint">/hr</span>
        </span>
      ),
      sortValue: (row) => row.rate,
      align: 'right' as const,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>,
      sortValue: (row) => row.status,
    },
    {
      key: 'submittedAt',
      label: 'Submitted',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums" title={new Date(row.submittedAt).toLocaleString()}>
          {timeAgo(row.submittedAt)}
        </span>
      ),
      sortValue: (row) => new Date(row.submittedAt).getTime(),
      align: 'right' as const,
      hideOnMobile: true,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Submission, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.requirement.title.toLowerCase().includes(q) ||
    row.requirement.skills.some((s) => s.toLowerCase().includes(q)) ||
    row.fromCompany.name.toLowerCase().includes(q) ||
    row.toCompany.name.toLowerCase().includes(q) ||
    row.kind.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'SHORTLISTED', label: 'Shortlisted' },
    { key: 'INTERVIEW', label: 'Interview' },
    { key: 'OFFERED', label: 'Offered' },
    { key: 'PLACED', label: 'Placed' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + direction toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Sell</p>
          <h1>Submissions</h1>
          <p>
            {direction === 'sent'
              ? 'Candidates submitted to client requirements. Track from submission through to placement.'
              : 'Candidates received from other vendors against your requirements.'}
          </p>
        </div>

        {/* Direction toggle — prototype segmented control */}
        <div className="flex bg-etyme-canvas rounded-md p-0.5 mt-3 shrink-0">
          <button
            onClick={() => { setDirection('sent'); setStatusFilter('ALL') }}
            className={`px-4 py-2 text-[13px] font-medium rounded transition-colors ${
              direction === 'sent'
                ? 'bg-white shadow-sm text-etyme-ink'
                : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            Sent
          </button>
          <button
            onClick={() => { setDirection('received'); setStatusFilter('ALL') }}
            className={`px-4 py-2 text-[13px] font-medium rounded transition-colors ${
              direction === 'received'
                ? 'bg-white shadow-sm text-etyme-ink'
                : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            Received
          </button>
        </div>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total</p>
          <p className="stat-value text-etyme-ink">{stats.total}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">submissions</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending</p>
          <p className={`stat-value ${stats.submitted > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {stats.submitted}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">awaiting review</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">In process</p>
          <p className={`stat-value ${(stats.shortlisted + stats.interview) > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {stats.shortlisted + stats.interview}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">shortlisted + interview</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Placed</p>
          <p className="stat-value text-etyme-verified">{stats.placed}</p>
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
      <DataTable<Submission>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, requirement, company, or status…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} submissions.` : 'No submissions yet.'}
        emptyDetail={
          statusFilter !== 'ALL'
            ? 'Try "All" to see every submission, or change the direction tab.'
            : direction === 'sent'
              ? 'Submit candidates from the Requirements page to see them here.'
              : 'Submissions from other vendors will appear here.'
        }
        onRowClick={(row) => router.push(`/dashboard/requirements/${row.requirement.id}` as any)}
        exportName={`submissions-${direction}`}
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
          {` · ${direction}`}
        </p>
      )}
    </>
  )
}
