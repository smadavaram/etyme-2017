'use client'

import { useEffect, useState } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Tenure Tracking — Governance section
 *
 * Addendum E's core differentiator: cross-vendor tenure aggregation.
 * "Tenure accrues to the person at the client, aggregated across all
 * vendors. Twelve months via one vendor plus twelve via another is
 * twenty-four months of exposure."
 *
 * This is a working surface: dense, sortable, filterable, exportable.
 * Single-vendor systems structurally cannot show this.
 */

// ── Types ──────────────────────────────────────────────────

interface TenureData {
  client: { id: string; name: string }
  tenureCapMonths: number | null
  breakDays: number | null
  people: TenurePerson[]
  summary: {
    totalTracked: number
    ok: number
    warning: number
    breakRequired: number
    inBreak: number
    eligible: number
  }
}

interface TenurePerson {
  personId: string
  name: string
  vendors: { id: string; name: string }[]
  cumulativeMonths: number
  cumulativeDays: number
  contractCount: number
  status: 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE'
  eligibleDate: string | null
  hasActive: boolean
  contracts: {
    id: string
    vendorName: string
    startDate: string
    endDate: string | null
    state: string
    daysWorked: number
  }[]
}

// ── Status helpers ─────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; chipClass: string }> = {
  OK:             { label: 'OK',             chipClass: 'chip--verified' },
  WARNING:        { label: 'Approaching',    chipClass: 'chip--attention' },
  BREAK_REQUIRED: { label: 'Break required', chipClass: 'chip--danger' },
  IN_BREAK:       { label: 'In break',       chipClass: 'chip--action' },
  ELIGIBLE:       { label: 'Eligible',       chipClass: 'chip--verified' },
}

function tenureBarColor(pct: number): string {
  if (pct < 75) return 'bg-etyme-verified'
  if (pct <= 100) return 'bg-etyme-attention'
  return 'bg-red-500'
}

// ── Page ───────────────────────────────────────────────────

export default function TenurePage() {
  const [data, setData] = useState<TenureData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tenure')
      .then(r => r.json())
      .then(body => {
        if (body.error) throw new Error(body.error.message)
        setData(body.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (!data && !loading && !error) return null

  const summary = data?.summary ?? { totalTracked: 0, ok: 0, warning: 0, breakRequired: 0, inBreak: 0, eligible: 0 }
  const capMonths = data?.tenureCapMonths ?? null

  // ── Column definitions — depend on capMonths, so inside the component ──
  const columns: Column<TenurePerson>[] = [
    {
      key: 'name',
      label: 'Person',
      render: (row) => (
        <div>
          <div className="font-medium text-etyme-ink">{row.name}</div>
          {row.hasActive && (
            <span className="chip chip--verified mt-0.5">
              <span className="evidence-dot" style={{ width: 5, height: 5 }} />
              active
            </span>
          )}
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'vendors',
      label: 'Vendor(s)',
      render: (row) => (
        <div>
          <span className="text-etyme-muted">{row.vendors.map(v => v.name).join(', ')}</span>
          {row.vendors.length > 1 && (
            <span className="chip chip--action ml-1">cross-vendor</span>
          )}
        </div>
      ),
      sortValue: (row) => row.vendors.map(v => v.name).join(', '),
    },
    {
      key: 'cumulativeMonths',
      label: 'Tenure',
      render: (row) => {
        const pct = capMonths
          ? Math.min(100, Math.round((row.cumulativeMonths / capMonths) * 100))
          : 0
        return (
          <div className="flex items-center gap-3">
            <span className="font-medium text-etyme-ink tabular-nums w-10">
              {row.cumulativeMonths}mo
            </span>
            {capMonths && (
              <div className="flex-1 min-w-[80px] max-w-[120px]">
                <div className="h-1.5 bg-etyme-rule/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${tenureBarColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[9px] text-etyme-faint mt-0.5 tabular-nums">
                  {pct}% of {capMonths}mo cap
                </div>
              </div>
            )}
          </div>
        )
      },
      sortValue: (row) => row.cumulativeMonths,
    },
    {
      key: 'status',
      label: 'Status',
      sortValue: (row) => {
        const order = { BREAK_REQUIRED: 0, WARNING: 1, IN_BREAK: 2, OK: 3, ELIGIBLE: 4 }
        return order[row.status]
      },
      render: (row) => {
        const config = STATUS_CONFIG[row.status]
        return <span className={`chip ${config.chipClass}`}>{config.label}</span>
      },
    },
    {
      key: 'contractCount',
      label: 'Contracts',
      align: 'right',
      sortValue: (row) => row.contractCount,
    },
    {
      key: 'eligibleDate',
      label: 'Eligible',
      render: (row) => (
        <span className="text-etyme-muted text-xs">
          {row.eligibleDate ?? '—'}
        </span>
      ),
      sortValue: (row) => row.eligibleDate ?? '',
      hideOnMobile: true,
    },
  ]

  return (
    <>
      {/* Head */}
      <div className="page-head">
        <p className="eyebrow">Governance</p>
        <h1>Tenure tracking</h1>
        <p>
          Cross-vendor tenure at {data?.client.name ?? '…'}. Aggregated across all vendors — twelve months via one
          plus twelve via another is twenty-four months of exposure.
          {capMonths != null && ` Cap: ${capMonths} months.`}
          {data?.breakDays != null && ` Break: ${data.breakDays} days.`}
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Tracked</p>
          <p className="stat-value text-etyme-ink">{summary.totalTracked}</p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">OK</p>
          <p className="stat-value text-etyme-verified">{summary.ok}</p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Approaching</p>
          <p className={`stat-value ${summary.warning > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {summary.warning}
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Break req.</p>
          <p className={`stat-value ${summary.breakRequired > 0 ? 'text-etyme-danger' : 'text-etyme-ink'}`}>
            {summary.breakRequired}
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">In break</p>
          <p className={`stat-value ${summary.inBreak > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {summary.inBreak}
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Eligible</p>
          <p className="stat-value text-etyme-verified">{summary.eligible}</p>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={data?.people ?? []}
        rowKey={(row) => row.personId}
        loading={loading}
        error={error}
        searchPlaceholder="Search by person or vendor…"
        searchFilter={(row, q) =>
          row.name.toLowerCase().includes(q) ||
          row.vendors.some(v => v.name.toLowerCase().includes(q))
        }
        emptyMessage={`No tenure records found at ${data?.client.name ?? 'this client'}.`}
        exportName={`tenure-${data?.client.name ?? 'export'}`}
        onRowClick={(row) => setExpanded(expanded === row.personId ? null : row.personId)}
      />

      {/* Expanded contract detail — rendered below the table for the selected person */}
      {expanded && data?.people && (() => {
        const person = data.people.find(p => p.personId === expanded)
        if (!person || person.contracts.length === 0) return null
        return (
          <div className="mt-2 panel">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-etyme-ink">
                  {person.name} — contributing contracts
                </p>
                <p className="text-[11px] text-etyme-faint mt-0.5">
                  {person.contracts.length} contract{person.contracts.length !== 1 ? 's' : ''} across{' '}
                  {person.vendors.length} vendor{person.vendors.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setExpanded(null)}
                className="text-xs text-etyme-muted hover:text-etyme-ink transition-colors"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table w-full text-[13px]">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Start</th>
                    <th>End</th>
                    <th style={{ textAlign: 'right' }}>Days</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {person.contracts.map(c => (
                    <tr key={c.id}>
                      <td>{c.vendorName}</td>
                      <td className="tabular-nums">
                        {new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className="tabular-nums">
                        {c.endDate
                          ? new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                          : 'present'}
                      </td>
                      <td style={{ textAlign: 'right' }} className="tabular-nums">{c.daysWorked}</td>
                      <td>
                        <span className={`chip ${c.state === 'IN_PROGRESS' ? 'chip--verified' : 'chip--passive'}`}>
                          {c.state === 'IN_PROGRESS' ? 'Active' : c.state === 'ENDED' ? 'Ended' : c.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </>
  )
}
