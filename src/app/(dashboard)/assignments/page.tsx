'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────

interface Assignment {
  id: string
  personName: string
  personEmail: string
  clientName: string | null
  payRate: number
  billRate: number | null
  payCurrency: string
  contractType: string
  state: string
  startDate: string
  endDate: string | null
  daysUntilEnd: number | null
}

// ── Helpers ────────────────────────────────────────────────

const STATE_GROUPS: { key: string; label: string; states: string[] }[] = [
  { key: 'active', label: 'Active', states: ['IN_PROGRESS', 'ACCEPTED', 'PENDING'] },
  { key: 'bench', label: 'Bench & Internal', states: ['BENCH_PAID', 'INTERNAL', 'TRAINING'] },
  { key: 'ended', label: 'Ended', states: ['ENDED', 'CANCELLED', 'PAUSED'] },
]

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    IN_PROGRESS: 'Active',
    BENCH_PAID: 'Bench (Paid)',
    INTERNAL: 'Internal',
    TRAINING: 'Training',
    PAUSED: 'Paused',
    ENDED: 'Ended',
    CANCELLED: 'Cancelled',
  }
  return labels[state] ?? state
}

function stateColor(state: string): string {
  switch (state) {
    case 'IN_PROGRESS':
    case 'ACCEPTED':
      return 'bg-emerald-50 text-etyme-green border border-emerald-200'
    case 'PENDING':
      return 'bg-etyme-blue/5 text-etyme-blue border border-etyme-blue/20'
    case 'BENCH_PAID':
    case 'TRAINING':
      return 'bg-amber-50 text-etyme-amber border border-amber-200'
    case 'INTERNAL':
      return 'bg-purple-50 text-etyme-purple border border-purple-200'
    case 'PAUSED':
      return 'bg-slate-100 text-etyme-muted border border-slate-200'
    case 'ENDED':
    case 'CANCELLED':
      return 'bg-etyme-ground text-etyme-muted'
    default:
      return 'bg-etyme-ground text-etyme-muted'
  }
}

// ── Page ───────────────────────────────────────────────────

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasCostPermission, setHasCostPermission] = useState(false)

  const fetchAssignments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/assignments')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setAssignments(body.data?.assignments ?? [])
      setHasCostPermission(body.data?.permissions?.includes('assignments.cost') ?? false)
    } catch (err: any) {
      setError(err.message)
      setAssignments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  // Group assignments by state category
  function getGrouped() {
    const grouped: Record<string, Assignment[]> = {}
    for (const group of STATE_GROUPS) {
      const matching = assignments.filter((a) => group.states.includes(a.state))
      if (matching.length > 0) {
        grouped[group.key] = matching
      }
    }
    // Catch any unmatched states
    const knownStates = STATE_GROUPS.flatMap((g) => g.states)
    const other = assignments.filter((a) => !knownStates.includes(a.state))
    if (other.length > 0) {
      grouped['other'] = other
    }
    return grouped
  }

  const grouped = loading ? {} : getGrouped()

  // Rolloff warnings — assignments ending within 28 days
  const rolloffWarnings = assignments.filter(
    (a) => a.daysUntilEnd != null && a.daysUntilEnd >= 0 && a.daysUntilEnd <= 28 && a.state === 'IN_PROGRESS'
  )

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Assignments</h1>
          <p className="text-sm text-etyme-muted mt-1">
            Active, bench, and historical assignments across your team.
          </p>
        </div>
      </div>

      {/* Rolloff warnings banner */}
      {rolloffWarnings.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="evidence-dot evidence-dot--pending" />
            <span className="text-sm font-semibold text-amber-800">
              {rolloffWarnings.length} assignment{rolloffWarnings.length !== 1 ? 's' : ''} ending within 28 days
            </span>
          </div>
          <div className="ml-4 space-y-1">
            {rolloffWarnings.map((a) => (
              <p key={a.id} className="text-xs text-amber-700">
                <strong>{a.personName}</strong>
                {a.clientName && ` at ${a.clientName}`}
                {' — '}
                {a.daysUntilEnd === 0
                  ? 'ends today'
                  : `${a.daysUntilEnd} day${a.daysUntilEnd !== 1 ? 's' : ''} remaining`}
              </p>
            ))}
          </div>
          <a
            href="/dashboard/rolloff"
            className="inline-block mt-2 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
          >
            View rolloff console
          </a>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Could not load assignments: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card text-center py-12">
          <p className="text-sm text-etyme-muted">Loading assignments...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && assignments.length === 0 && !error && (
        <div className="card text-center py-12">
          <p className="text-sm text-etyme-muted">No assignments yet.</p>
          <p className="text-xs text-etyme-muted/60 mt-1">
            Assignments are created when you import consultant data with start dates and rates,
            or when a submission is accepted on a requirement.
          </p>
        </div>
      )}

      {/* Grouped tables */}
      {!loading && Object.entries(grouped).map(([groupKey, groupAssignments]) => {
        const groupLabel = STATE_GROUPS.find((g) => g.key === groupKey)?.label ?? 'Other'
        return (
          <div key={groupKey} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold">{groupLabel}</h2>
              <span className="pill bg-etyme-ground text-etyme-muted text-[10px]">
                {groupAssignments.length}
              </span>
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="overflow-scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-etyme-border">
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Consultant</th>
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Client</th>
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Pay Rate</th>
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Bill Rate</th>
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Start</th>
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">End</th>
                      <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupAssignments.map((a) => {
                      const isRolloff = a.daysUntilEnd != null && a.daysUntilEnd >= 0 && a.daysUntilEnd <= 28
                      return (
                        <tr
                          key={a.id}
                          className={`border-b border-etyme-border last:border-0 hover:bg-etyme-ground/50
                                     cursor-pointer transition-colors ${isRolloff ? 'bg-amber-50/30' : ''}`}
                        >
                          <td className="px-6 py-3">
                            <div>
                              <p className="font-medium">{a.personName}</p>
                              <p className="text-xs text-etyme-muted">{a.personEmail}</p>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-etyme-muted">
                            {a.clientName ?? <span className="italic">No client</span>}
                          </td>
                          <td className="px-6 py-3 tabular-nums">
                            {hasCostPermission ? (
                              <span>${a.payRate}/hr</span>
                            ) : (
                              <span className="text-etyme-muted text-xs italic">Restricted</span>
                            )}
                          </td>
                          <td className="px-6 py-3 tabular-nums">
                            {hasCostPermission ? (
                              a.billRate != null ? (
                                <span>${a.billRate}/hr</span>
                              ) : (
                                <span className="text-etyme-muted">—</span>
                              )
                            ) : (
                              <span className="text-etyme-muted text-xs italic">Restricted</span>
                            )}
                          </td>
                          <td className="px-6 py-3 tabular-nums text-etyme-muted">
                            {new Date(a.startDate).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 tabular-nums">
                            {a.endDate ? (
                              <span className={isRolloff ? 'text-etyme-amber font-medium' : 'text-etyme-muted'}>
                                {new Date(a.endDate).toLocaleDateString()}
                                {isRolloff && (
                                  <span className="block text-[10px]">
                                    {a.daysUntilEnd === 0 ? 'Today' : `${a.daysUntilEnd}d left`}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-etyme-muted">Open-ended</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`pill text-[10px] ${stateColor(a.state)}`}>
                              {stateLabel(a.state)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}

      {/* Count footer */}
      {!loading && assignments.length > 0 && (
        <p className="text-xs text-etyme-muted">
          {assignments.length} total assignment{assignments.length !== 1 ? 's' : ''}
        </p>
      )}
    </>
  )
}
