'use client'

import { useEffect, useState } from 'react'
import { ListSurface, type Column } from '@/components/list-surface'
import { plainDate } from '@/lib/plain-date'
import { eligibleWords, limitDayWords, limitLine, runsPastWords, statusLabel, tenureSubtitle } from './words'

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
    runsPast: number
  }
}

interface TenurePerson {
  personId: string
  name: string
  /**
   * The firms on this row, folded so a chain reads as one firm and a
   * count rather than as the same name twice. `parts` is one label per
   * firm the reader may name; `withheld` is how many below them it may
   * not.
   */
  firms: { parts: string[]; says: string; withheld: number }
  cumulativeMonths: number
  cumulativeDays: number
  /** The days the limit counts — since the last break served. */
  countedDays: number
  /** Where they stand against the limit, never capped at 100%. Null with no limit set. */
  againstLimit: {
    percent: number
    barPercent: number
    limitDays: number
    over: boolean
    overByDays: number
    overBy: string | null
  } | null
  /** The day the days on site reach the limit on the contracts booked; null where they end first. */
  limitReachedOn: string | null
  /** Live contracts booked past that day. */
  runsPast: { contractId: string; firm: string; endDate: string | null; daysPast: number | null }[]
  contractCount: number
  status: 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE'
  eligibleDate: string | null
  hasActive: boolean
  /** On site today, under any live contract. */
  onSite?: boolean
  contracts: {
    id: string
    vendorName: string
    startDate: string
    endDate: string | null
    state: string
    /** Days served on this contract, to today or its end. */
    daysWorked: number
    /** Days booked, start to booked end; null where it has no end. */
    daysBooked: number | null
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

/**
 * Tenure against the cap is a state, not a quantity — inside, near,
 * past — so it wears the reserved status colors and each one ships
 * with the percentage beside it rather than standing on color alone.
 */
function tenureBarColor(pct: number): string {
  if (pct < 75) return 'bg-etyme-verified'
  if (pct <= 100) return 'bg-etyme-attention'
  return 'bg-etyme-danger'
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

  const summary = data?.summary ?? { totalTracked: 0, ok: 0, warning: 0, breakRequired: 0, inBreak: 0, eligible: 0, runsPast: 0 }
  const today = new Date()
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
      label: 'Supplier(s)',
      render: (row) => (
        <div>
          <span className="text-etyme-muted">{row.firms.parts.join(', ')}</span>
          {/* Cross-vendor means two firms the client pays — two separate
              suppliers billing for one person — not two rungs of one
              chain, where the client pays once and the prime pays the
              rest. Keyed off the firms it may name for that reason. */}
          {row.firms.parts.length > 1 && (
            <span className="chip chip--action ml-1">more than one supplier</span>
          )}
        </div>
      ),
      sortValue: (row) => row.firms.says,
    },
    {
      key: 'cumulativeMonths',
      label: 'Time on site',
      render: (row) => {
        // The bar stops at full; the number does not. Kwame Mensah's 740
        // days against 548 read "100%" here, hiding six months past the
        // limit.
        const limit = row.againstLimit
        const pct = limit?.barPercent ?? 0
        return (
          <div className="flex items-center gap-3">
            <span className="font-medium text-etyme-ink tabular-nums w-10">
              {row.cumulativeMonths}mo
            </span>
            {capMonths && limit && (
              <div className="flex-1 min-w-[80px] max-w-[200px]">
                <div className="h-1.5 bg-etyme-rule/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${tenureBarColor(limit.percent)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className={`text-[10px] mt-0.5 tabular-nums ${limit.overByDays > 0 ? 'text-etyme-danger' : 'text-etyme-faint'}`}>
                  {limitLine({ days: row.countedDays ?? row.cumulativeDays, capMonths, percent: limit.percent, limitDays: limit.limitDays, overBy: limit.overBy })}
                </div>
                {/* A contract already booked past the limit, in a
                    sentence. Lucía Fernández's ran seven months past it
                    and the row said only "Approaching". */}
                {row.limitReachedOn && row.runsPast.map((r) => (
                  <div key={r.contractId} className="text-[11px] mt-1 text-etyme-attention">
                    {runsPastWords({ firm: r.firm, personName: row.name, endDate: r.endDate, daysPast: r.daysPast, reachedOn: row.limitReachedOn!, today })}
                  </div>
                ))}
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
        return <span className={`chip ${config.chipClass}`}>{statusLabel(row.status, row.onSite ?? row.hasActive)}</span>
      },
    },
    {
      key: 'limitReachedOn',
      label: 'Reaches the limit',
      render: (row) => (
        <span className={`text-xs tabular-nums ${row.runsPast.length > 0 ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
          {capMonths ? limitDayWords({ reachedOn: row.limitReachedOn, today, live: row.hasActive }) : '—'}
        </span>
      ),
      sortValue: (row) => row.limitReachedOn ?? '9999',
    },
    {
      key: 'contractCount',
      label: 'Contracts',
      align: 'right',
      sortValue: (row) => row.contractCount,
    },
    {
      key: 'eligibleDate',
      label: 'May come back',
      render: (row) => (
        <span className="text-etyme-muted text-xs">
          {eligibleWords(row.eligibleDate)}
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
        <h1>Time on site</h1>
        {/* ── The sentence waits for the name ──
            It read "Cross-vendor tenure at … ." until the fetch
            returned, which is a screen asserting a fact about a company
            it cannot yet name. An ellipsis in the middle of a sentence
            is not a loading state; it is a sentence with a hole in it.
            The half that does not depend on the name is said straight
            away, because it is true of every client. */}
        <p>
          {tenureSubtitle({
            clientName: data?.client.name,
            capMonths,
            breakDays: data?.breakDays ?? null,
          })}
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
          <p className="stat-label">Over the limit</p>
          <p className={`stat-value ${summary.breakRequired > 0 ? 'text-etyme-danger' : 'text-etyme-ink'}`}>
            {summary.breakRequired}
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Booked past the limit</p>
          <p className={`stat-value ${summary.runsPast > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {summary.runsPast}
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
      <ListSurface
        columns={columns}
        data={data?.people ?? []}
        rowKey={(row) => row.personId}
        loading={loading}
        error={error}
        searchPlaceholder="Search by person or supplier…"
        searchFilter={(row, q) =>
          row.name.toLowerCase().includes(q) ||
          row.firms.says.toLowerCase().includes(q)
        }
        emptyMessage={`Nobody has worked at ${data?.client.name ?? 'this client'} yet.`}
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
                  {person.contracts.length} contract{person.contracts.length !== 1 ? 's' : ''} through{' '}
                  {person.firms.parts.length} supplier{person.firms.parts.length !== 1 ? 's' : ''} you pay
                  {person.firms.withheld > 0
                    ? `, with ${person.firms.withheld} firm${person.firms.withheld !== 1 ? 's' : ''} below them`
                    : ''}
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
                    <th style={{ textAlign: 'right' }}>Days served</th>
                    <th style={{ textAlign: 'right' }}>Days booked</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {person.contracts.map(c => (
                    <tr key={c.id}>
                      <td>{c.vendorName}</td>
                      <td className="tabular-nums">
                        {plainDate(c.startDate)}
                      </td>
                      <td className="tabular-nums">
                        {c.endDate
                          ? plainDate(c.endDate)
                          : 'present'}
                      </td>
                      <td style={{ textAlign: 'right' }} className="tabular-nums">{c.daysWorked}</td>
                      <td style={{ textAlign: 'right' }} className="tabular-nums text-etyme-muted">{c.daysBooked ?? 'no end'}</td>
                      <td>
                        <span className={`chip ${c.state === 'IN_PROGRESS' ? 'chip--verified' : 'chip--passive'}`}>
                          {c.state === 'IN_PROGRESS' ? 'Active' : c.state === 'ENDED' ? 'Ended' : c.state === 'PAUSED' ? 'Paused' : c.state.charAt(0) + c.state.slice(1).toLowerCase().replace(/_/g, ' ')}
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
