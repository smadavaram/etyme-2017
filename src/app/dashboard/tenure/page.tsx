'use client'

import { useEffect, useState } from 'react'

/**
 * Tenure Tracking — Governance section
 *
 * Addendum E's core differentiator: cross-vendor tenure aggregation.
 * "Tenure accrues to the person at the client, aggregated across all
 * vendors. Twelve months via one vendor plus twelve via another is
 * twenty-four months of exposure."
 *
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

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  OK:             { label: 'OK',             bg: 'bg-etyme-verified/10', text: 'text-etyme-verified' },
  WARNING:        { label: 'Approaching',    bg: 'bg-etyme-attention/10', text: 'text-etyme-attention' },
  BREAK_REQUIRED: { label: 'Break required', bg: 'bg-red-500/10',        text: 'text-red-600' },
  IN_BREAK:       { label: 'In break',       bg: 'bg-etyme-action/10',   text: 'text-etyme-action' },
  ELIGIBLE:       { label: 'Eligible',       bg: 'bg-etyme-verified/10', text: 'text-etyme-verified' },
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-etyme-rule/50 rounded animate-pulse" />
        <div className="h-64 bg-etyme-surface rounded-lg border border-etyme-rule animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { summary, tenureCapMonths } = data

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="eyebrow mb-2">Governance</div>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          Tenure tracking
        </h1>
        <p className="text-sm text-etyme-muted mt-1 max-w-2xl">
          Cross-vendor tenure at {data.client.name}. Aggregated across all vendors — twelve months via one
          plus twelve via another is twenty-four months of exposure.
          {tenureCapMonths && ` Cap: ${tenureCapMonths} months.`}
          {data.breakDays && ` Break: ${data.breakDays} days.`}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Tracked" value={summary.totalTracked} />
        <StatCard label="OK" value={summary.ok} tone="verified" />
        <StatCard label="Approaching" value={summary.warning} tone={summary.warning > 0 ? 'attention' : undefined} />
        <StatCard label="Break req." value={summary.breakRequired} tone={summary.breakRequired > 0 ? 'danger' : undefined} />
        <StatCard label="In break" value={summary.inBreak} tone={summary.inBreak > 0 ? 'action' : undefined} />
        <StatCard label="Eligible" value={summary.eligible} tone="verified" />
      </div>

      {/* Tenure table */}
      {data.people.length === 0 ? (
        <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-8 text-center">
          <p className="text-etyme-muted text-sm">No tenure records found at {data.client.name}.</p>
        </div>
      ) : (
        <div className="bg-etyme-surface rounded-lg border border-etyme-rule overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-etyme-rule">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Person</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Vendor(s)</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Tenure</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Contracts</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Eligible</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((person) => {
                  const pct = tenureCapMonths
                    ? Math.min(100, Math.round((person.cumulativeMonths / tenureCapMonths) * 100))
                    : 0
                  const config = STATUS_CONFIG[person.status]
                  const isExpanded = expanded === person.personId

                  return (
                    <tbody key={person.personId}>
                      <tr
                        className="border-b border-etyme-rule/50 hover:bg-etyme-canvas/50 cursor-pointer transition-colors"
                        onClick={() => setExpanded(isExpanded ? null : person.personId)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-etyme-ink">{person.name}</div>
                          {person.hasActive && (
                            <span className="text-[10px] text-etyme-verified">● active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-etyme-muted">
                          {person.vendors.map(v => v.name).join(', ')}
                          {person.vendors.length > 1 && (
                            <span className="ml-1 text-[10px] text-etyme-action font-medium">
                              cross-vendor
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-etyme-ink tabular-nums w-12">
                              {person.cumulativeMonths}mo
                            </span>
                            {tenureCapMonths && (
                              <div className="flex-1 min-w-[80px] max-w-[120px]">
                                <div className="h-1.5 bg-etyme-rule/30 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${tenureBarColor(pct)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <div className="text-[9px] text-etyme-faint mt-0.5 tabular-nums">
                                  {pct}% of {tenureCapMonths}mo cap
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${config.bg} ${config.text}`}>
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-etyme-muted">
                          {person.contractCount}
                        </td>
                        <td className="px-4 py-3 text-etyme-muted text-xs">
                          {person.eligibleDate ?? '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3 bg-etyme-canvas/50">
                            <div className="text-[10px] uppercase tracking-wider text-etyme-faint font-medium mb-2">
                              Contributing contracts
                            </div>
                            <div className="space-y-1.5">
                              {person.contracts.map((c) => (
                                <div key={c.id} className="flex items-center gap-4 text-xs text-etyme-muted">
                                  <span className="w-40 truncate">{c.vendorName}</span>
                                  <span className="tabular-nums">
                                    {new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                    {' → '}
                                    {c.endDate
                                      ? new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                      : 'present'}
                                  </span>
                                  <span className="tabular-nums">{c.daysWorked}d</span>
                                  <span className={`text-[10px] ${c.state === 'IN_PROGRESS' ? 'text-etyme-verified' : 'text-etyme-faint'}`}>
                                    {c.state === 'IN_PROGRESS' ? 'Active' : c.state === 'ENDED' ? 'Ended' : c.state}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────

function StatCard({ label, value, tone }: {
  label: string
  value: number
  tone?: 'verified' | 'attention' | 'danger' | 'action'
}) {
  const toneClasses = {
    verified: 'text-etyme-verified',
    attention: 'text-etyme-attention',
    danger: 'text-red-600',
    action: 'text-etyme-action',
  }

  return (
    <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-4">
      <div className="text-[10px] uppercase tracking-wider text-etyme-faint font-medium">
        {label}
      </div>
      <div className={`font-serif text-2xl mt-1 ${tone ? toneClasses[tone] : 'text-etyme-ink'}`}>
        {value}
      </div>
    </div>
  )
}
