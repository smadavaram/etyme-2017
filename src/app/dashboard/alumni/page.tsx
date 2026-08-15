'use client'

import { useEffect, useState } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Alumni — "Worked here before"
 *
 * BRD + Addendum D: Alumni re-engagement is the strongest demand-side
 * feature in the platform. The page shows every person who has ever
 * had a contract at this client, aggregated across all vendors.
 *
 * Addendum E §E.2.3: "Ask them back" checks the tenure ledger
 * before the action is offered. Inside a break period, show the
 * eligibility date instead of a button.
 *
 * This is a working surface: dense, sortable, filterable, exportable.
 */

// ── Types ──────────────────────────────────────────────────

interface AlumniData {
  client: { id: string; name: string }
  alumni: AlumniPerson[]
  summary: {
    total: number
    placed: number
    available: number
    ended: number
  }
}

interface AlumniPerson {
  personId: string
  name: string
  skill: string | null
  department: string | null
  totalMonths: number
  totalHours: number
  extensions: number
  state: 'placed' | 'available' | 'ended'
  detail: string
  currentVendor: { id: string; name: string } | null
  vendors: { id: string; name: string }[]
  canReengage: boolean
  reengageBlockReason: string | null
  eligibleDate: string | null
}

// ── Status helpers ─────────────────────────────────────────

const STATE_CONFIG: Record<string, { label: string; chipClass: string }> = {
  placed:    { label: 'Placed',    chipClass: 'chip--verified' },
  available: { label: 'Available', chipClass: 'chip--action' },
  ended:     { label: 'Ended',     chipClass: 'chip--passive' },
}

// ── Columns ────────────────────────────────────────────────

const COLUMNS: Column<AlumniPerson>[] = [
  {
    key: 'name',
    label: 'Person',
    render: (row) => (
      <div>
        <div className="font-medium text-etyme-ink">{row.name}</div>
        {row.skill && <div className="text-[11px] text-etyme-muted mt-0.5">{row.skill}</div>}
        {row.vendors.length > 1 && (
          <span className="chip chip--action mt-1">{row.vendors.length} vendors</span>
        )}
      </div>
    ),
    sortValue: (row) => row.name,
  },
  {
    key: 'department',
    label: 'Department',
    render: (row) => (
      <span className="text-etyme-muted">{row.department ?? '—'}</span>
    ),
    sortValue: (row) => row.department ?? '',
    hideOnMobile: true,
  },
  {
    key: 'totalMonths',
    label: 'Months',
    align: 'right',
    sortValue: (row) => row.totalMonths,
    render: (row) => (
      <span className="font-medium text-etyme-ink">{row.totalMonths}</span>
    ),
  },
  {
    key: 'totalHours',
    label: 'Hours',
    align: 'right',
    sortValue: (row) => row.totalHours,
    render: (row) => (
      <span>{row.totalHours.toLocaleString()}</span>
    ),
    hideOnMobile: true,
  },
  {
    key: 'extensions',
    label: 'Extensions',
    align: 'right',
    sortValue: (row) => row.extensions,
    hideOnMobile: true,
  },
  {
    key: 'state',
    label: 'Status',
    sortValue: (row) => {
      const order = { available: 0, placed: 1, ended: 2 }
      return order[row.state]
    },
    render: (row) => {
      const config = STATE_CONFIG[row.state]
      return (
        <div>
          <span className={`chip ${config.chipClass}`}>{config.label}</span>
          <div className="text-[11px] text-etyme-muted mt-1 max-w-[200px]">{row.detail}</div>
        </div>
      )
    },
  },
  {
    key: 'action',
    label: 'Action',
    align: 'right',
    sortable: false,
    render: (row) => <AlumniAction person={row} />,
  },
]

// ── Page ───────────────────────────────────────────────────

type StateFilter = 'all' | 'placed' | 'available' | 'ended'

export default function AlumniPage() {
  const [data, setData] = useState<AlumniData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StateFilter>('all')

  useEffect(() => {
    fetch('/api/alumni')
      .then(r => r.json())
      .then(body => {
        if (body.error) throw new Error(body.error.message)
        setData(body.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (!data && !loading && !error) return null

  const summary = data?.summary ?? { total: 0, placed: 0, available: 0, ended: 0 }
  const filtered = data?.alumni
    ? filter === 'all'
      ? data.alumni
      : data.alumni.filter(a => a.state === filter)
    : []

  const FILTERS: { key: StateFilter; label: string; count: number }[] = [
    { key: 'all',       label: 'All',       count: summary.total },
    { key: 'available', label: 'Available', count: summary.available },
    { key: 'placed',    label: 'Placed',    count: summary.placed },
    { key: 'ended',     label: 'Ended',     count: summary.ended },
  ]

  return (
    <>
      {/* Head */}
      <div className="page-head">
        <p className="eyebrow">Program</p>
        <h1>
          {summary.total} {summary.total === 1 ? 'person has' : 'people have'} worked here.{' '}
          {summary.available > 0 && (
            <span style={{ color: 'var(--color-action)' }}>
              {summary.available} {summary.available === 1 ? 'is' : 'are'} available now.
            </span>
          )}
        </h1>
        <p>
          Institutional memory at {data?.client.name ?? '…'} — every person who has held a contract here,
          across all vendors. Re-engagement is gated by tenure policy.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Total alumni</p>
          <p className="stat-value text-etyme-ink">{summary.total}</p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Placed</p>
          <p className="stat-value text-etyme-verified">{summary.placed}</p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Available</p>
          <p className={`stat-value ${summary.available > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {summary.available}
          </p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Ended</p>
          <p className="stat-value text-etyme-ink">{summary.ended}</p>
        </div>
      </div>

      {/* DataTable with filter tabs */}
      <DataTable
        columns={COLUMNS}
        data={filtered}
        rowKey={(row) => row.personId}
        loading={loading}
        error={error}
        searchPlaceholder="Search alumni by name, skill, department…"
        searchFilter={(row, q) =>
          row.name.toLowerCase().includes(q) ||
          (row.skill?.toLowerCase().includes(q) ?? false) ||
          (row.department?.toLowerCase().includes(q) ?? false) ||
          row.vendors.some(v => v.name.toLowerCase().includes(q)) ||
          row.detail.toLowerCase().includes(q)
        }
        emptyMessage={filter === 'all' ? 'No alumni records found.' : `No ${filter} alumni.`}
        emptyDetail="Alumni appear once a person has had at least one contract at this client."
        exportName={`alumni-${data?.client.name ?? 'export'}`}
        filters={
          <div className="flex gap-1.5">
            {FILTERS.map(f => (
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
        rowClassName={(row) =>
          row.state === 'available' ? '!bg-[#EDEFFC]/30' : ''
        }
      />
    </>
  )
}

// ── Alumni action — the critical re-engagement gate ───────

function AlumniAction({ person }: { person: AlumniPerson }) {
  if (person.state === 'placed') {
    return (
      <span className="chip chip--verified">
        <span className="evidence-dot" style={{ width: 5, height: 5 }} />
        On contract
      </span>
    )
  }

  if (person.canReengage) {
    return (
      <button className="btn-primary !py-1.5 !px-3 !text-[12px] whitespace-nowrap">
        Ask back
      </button>
    )
  }

  // Blocked by break period — show eligibility date instead of button
  return (
    <div className="text-right">
      {person.eligibleDate && (
        <div className="text-[11px] text-etyme-attention font-semibold whitespace-nowrap">
          Eligible {new Date(person.eligibleDate + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      )}
      {person.reengageBlockReason && (
        <div className="text-[10px] text-etyme-muted mt-0.5 max-w-[180px] ml-auto leading-tight">
          {person.reengageBlockReason}
        </div>
      )}
    </div>
  )
}
