'use client'

import { useEffect, useState } from 'react'

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

const STATE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  placed:    { label: 'Placed',    bg: 'bg-etyme-verified/10', text: 'text-etyme-verified' },
  available: { label: 'Available', bg: 'bg-etyme-action/10',   text: 'text-etyme-action' },
  ended:     { label: 'Ended',     bg: 'bg-etyme-rule/40',     text: 'text-etyme-muted' },
}

// ── Page ───────────────────────────────────────────────────

export default function AlumniPage() {
  const [data, setData] = useState<AlumniData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'placed' | 'available' | 'ended'>('all')

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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-etyme-rule/50 rounded animate-pulse" />
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

  const { summary } = data
  const filtered = filter === 'all'
    ? data.alumni
    : data.alumni.filter(a => a.state === filter)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="eyebrow mb-2">Program</div>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          {summary.total} {summary.total === 1 ? 'person has' : 'people have'} worked here.{' '}
          {summary.available > 0 && (
            <span className="text-etyme-action">
              {summary.available} {summary.available === 1 ? 'is' : 'are'} available now.
            </span>
          )}
        </h1>
        <p className="text-sm text-etyme-muted mt-1 max-w-2xl">
          Institutional memory at {data.client.name} — every person who has held a contract here,
          across all vendors. Re-engagement is gated by tenure policy.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total alumni" value={summary.total} />
        <StatCard label="Placed" value={summary.placed} tone="verified" />
        <StatCard label="Available" value={summary.available} tone={summary.available > 0 ? 'action' : undefined} />
        <StatCard label="Ended" value={summary.ended} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'available', 'placed', 'ended'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`
              px-3 py-1.5 text-xs rounded-full border transition-colors
              ${filter === f
                ? 'bg-etyme-ink text-white border-etyme-ink'
                : 'bg-transparent text-etyme-muted border-etyme-rule hover:text-etyme-ink hover:border-etyme-muted'
              }
            `}
          >
            {f === 'all' ? `All (${summary.total})` :
             f === 'available' ? `Available (${summary.available})` :
             f === 'placed' ? `Placed (${summary.placed})` :
             `Ended (${summary.ended})`}
          </button>
        ))}
      </div>

      {/* Alumni table */}
      {filtered.length === 0 ? (
        <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-8 text-center">
          <p className="text-etyme-muted text-sm">No alumni match this filter.</p>
        </div>
      ) : (
        <div className="bg-etyme-surface rounded-lg border border-etyme-rule overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-etyme-rule">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Person</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Department</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Months</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Hours</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Extensions</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((person) => {
                  const config = STATE_CONFIG[person.state]
                  return (
                    <tr
                      key={person.personId}
                      className="border-b border-etyme-rule/50 hover:bg-etyme-canvas/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-etyme-ink">{person.name}</div>
                        {person.skill && (
                          <div className="text-xs text-etyme-muted mt-0.5">{person.skill}</div>
                        )}
                        {person.vendors.length > 1 && (
                          <span className="text-[10px] text-etyme-action font-medium">
                            {person.vendors.length} vendors
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-etyme-muted">
                        {person.department ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-etyme-ink font-medium">
                        {person.totalMonths}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-etyme-muted">
                        {person.totalHours.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-etyme-muted">
                        {person.extensions}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${config.bg} ${config.text}`}>
                          {config.label}
                        </span>
                        <div className="text-[11px] text-etyme-muted mt-0.5 max-w-[200px]">
                          {person.detail}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AlumniAction person={person} />
                      </td>
                    </tr>
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

// ── Alumni action — the critical re-engagement gate ───────

function AlumniAction({ person }: { person: AlumniPerson }) {
  if (person.state === 'placed') {
    return (
      <span className="text-[11px] text-etyme-verified">
        ● On contract
      </span>
    )
  }

  if (person.canReengage) {
    return (
      <button className="text-xs px-3 py-1.5 bg-etyme-action text-white rounded hover:bg-etyme-action/90 transition-colors whitespace-nowrap">
        Ask back
      </button>
    )
  }

  // Blocked by break period — show eligibility date
  return (
    <div className="text-right">
      {person.eligibleDate && (
        <div className="text-[11px] text-etyme-attention font-medium whitespace-nowrap">
          Eligible {new Date(person.eligibleDate + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      )}
      {person.reengageBlockReason && (
        <div className="text-[10px] text-etyme-muted mt-0.5 max-w-[180px] ml-auto">
          {person.reengageBlockReason}
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
