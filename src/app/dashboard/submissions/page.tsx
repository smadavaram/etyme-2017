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

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  SUBMITTED:   { bg: 'bg-etyme-action/8',    text: 'text-etyme-action' },
  SHORTLISTED: { bg: 'bg-amber-50',          text: 'text-amber-700' },
  INTERVIEW:   { bg: 'bg-violet-50',         text: 'text-violet-700' },
  OFFERED:     { bg: 'bg-emerald-50',        text: 'text-etyme-verified' },
  PLACED:      { bg: 'bg-emerald-100',       text: 'text-etyme-verified' },
  REJECTED:    { bg: 'bg-red-50',            text: 'text-etyme-danger' },
  WITHDRAWN:   { bg: 'bg-etyme-canvas',      text: 'text-etyme-faint' },
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

function KindChip({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    INTERNAL: 'bg-etyme-canvas text-etyme-muted',
    BENCH:    'bg-etyme-action/8 text-etyme-action',
    NETWORK:  'bg-amber-50 text-amber-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                      font-semibold uppercase tracking-wider
                      ${styles[kind] ?? 'bg-etyme-canvas text-etyme-muted'}`}>
      {kind}
    </span>
  )
}

// ── Stats row ────────────────────────────────────────

function StatChip({ label, value, active }: { label: string; value: number; active?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px]
                     font-medium border transition-colors
                     ${active
                       ? 'bg-etyme-ink text-white border-etyme-ink'
                       : 'bg-etyme-surface text-etyme-muted border-etyme-rule'}`}>
      <span className="tabular-nums">{value}</span>
      <span>{label}</span>
    </div>
  )
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

  // In production, companyId comes from session context.
  // For now, use a placeholder that the API needs.
  const companyId = 'placeholder-company-id'

  const fetchSubmissions = useCallback(async () => {
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
  }, [direction, statusFilter])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  // ── Stats ──────────────────────────────────────────
  const stats = {
    total: submissions.length,
    submitted: submissions.filter((s) => s.status === 'SUBMITTED').length,
    shortlisted: submissions.filter((s) => s.status === 'SHORTLISTED').length,
    interview: submissions.filter((s) => s.status === 'INTERVIEW').length,
    offered: submissions.filter((s) => s.status === 'OFFERED').length,
    placed: submissions.filter((s) => s.status === 'PLACED').length,
    rejected: submissions.filter((s) => s.status === 'REJECTED').length,
  }

  // ── Filter by status (client-side from fetched set) ──
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
              <span key={skill} className="pill bg-etyme-action/5 text-etyme-action text-[10px]">
                {skill}
              </span>
            ))}
            {row.requirement.skills.length > 2 && (
              <span className="pill bg-etyme-canvas text-etyme-faint text-[10px]">
                +{row.requirement.skills.length - 2}
              </span>
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
      render: (row) => <KindChip kind={row.kind} />,
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
      render: (row) => <StatusChip status={row.status} />,
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

  // ── Status filter pills ────────────────────────────
  const statusOptions: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All', count: stats.total },
    { key: 'SUBMITTED', label: 'Submitted', count: stats.submitted },
    { key: 'SHORTLISTED', label: 'Shortlisted', count: stats.shortlisted },
    { key: 'INTERVIEW', label: 'Interview', count: stats.interview },
    { key: 'OFFERED', label: 'Offered', count: stats.offered },
    { key: 'PLACED', label: 'Placed', count: stats.placed },
    { key: 'REJECTED', label: 'Rejected', count: stats.rejected },
  ]

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Submissions</h1>
          <p className="text-sm text-etyme-muted mt-1">
            {direction === 'sent'
              ? 'Candidates submitted to client requirements.'
              : 'Candidates received from other vendors.'}
          </p>
        </div>

        {/* Direction toggle */}
        <div className="flex bg-etyme-canvas rounded-lg p-0.5">
          <button
            onClick={() => { setDirection('sent'); setStatusFilter('ALL') }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              direction === 'sent'
                ? 'bg-white shadow-sm text-etyme-ink'
                : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            Sent
          </button>
          <button
            onClick={() => { setDirection('received'); setStatusFilter('ALL') }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              direction === 'received'
                ? 'bg-white shadow-sm text-etyme-ink'
                : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            Received
          </button>
        </div>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <StatChip label="Total" value={stats.total} />
        {stats.submitted > 0 && <StatChip label="Pending" value={stats.submitted} />}
        {stats.shortlisted > 0 && <StatChip label="Shortlisted" value={stats.shortlisted} />}
        {stats.interview > 0 && <StatChip label="Interview" value={stats.interview} />}
        {stats.offered > 0 && <StatChip label="Offered" value={stats.offered} />}
        {stats.placed > 0 && <StatChip label="Placed" value={stats.placed} active />}
      </div>

      {/* Status filters */}
      <div className="flex gap-1 mb-5 flex-wrap">
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
            {opt.count != null && opt.count > 0 && (
              <span className={`ml-1 tabular-nums ${statusFilter === opt.key ? 'text-white/70' : 'text-etyme-faint'}`}>
                {opt.count}
              </span>
            )}
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
