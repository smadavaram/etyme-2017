'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────

interface RolloffEvent {
  id: string
  sellContractId: string
  personName: string
  personEmail: string
  clientName: string | null
  billRate: number
  endDate: string
  daysUntilEnd: number
  outcome: string | null
  checklist: {
    knowledgeTransfer: boolean
    finalTimesheet: boolean
    accessRevocation: boolean
    assets: boolean
  }
  claimedById: string | null
}

type WindowDays = 30 | 60 | 90

// ── Checklist item ─────────────────────────────────────────

function ChecklistItem({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 text-xs text-left w-full"
    >
      <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
        checked
          ? 'bg-etyme-verified border-etyme-verified'
          : 'border-etyme-rule hover:border-etyme-muted'
      }`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={checked ? 'line-through text-etyme-muted' : ''}>
        {label}
      </span>
    </button>
  )
}

// ── Urgency indicator ──────────────────────────────────────

function UrgencyBadge({ daysUntilEnd }: { daysUntilEnd: number }) {
  if (daysUntilEnd <= 0) {
    return <span className="pill text-[10px] bg-red-50 text-red-600 border border-red-200">Overdue</span>
  }
  if (daysUntilEnd <= 7) {
    return <span className="pill text-[10px] bg-red-50 text-red-600 border border-red-200">Critical — {daysUntilEnd}d</span>
  }
  if (daysUntilEnd <= 14) {
    return <span className="pill text-[10px] bg-amber-50 text-etyme-attention border border-amber-200">Urgent — {daysUntilEnd}d</span>
  }
  if (daysUntilEnd <= 28) {
    return <span className="pill text-[10px] bg-amber-50 text-etyme-attention border border-amber-200">{daysUntilEnd}d remaining</span>
  }
  return <span className="pill text-[10px] bg-etyme-canvas text-etyme-muted">{daysUntilEnd}d remaining</span>
}

// ── Page ───────────────────────────────────────────────────

export default function RolloffPage() {
  const [events, setEvents] = useState<RolloffEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [window, setWindow] = useState<WindowDays>(30)

  const fetchRolloffs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/rolloff?window=${window}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setEvents(body.data?.events ?? [])
    } catch (err: any) {
      setError(err.message)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [window])

  useEffect(() => {
    fetchRolloffs()
  }, [fetchRolloffs])

  // Sort by urgency (soonest first)
  const sorted = [...events].sort((a, b) => a.daysUntilEnd - b.daysUntilEnd)

  // Summary counts
  const critical = events.filter((e) => e.daysUntilEnd <= 7).length
  const urgent = events.filter((e) => e.daysUntilEnd > 7 && e.daysUntilEnd <= 14).length
  const upcoming = events.filter((e) => e.daysUntilEnd > 14).length

  function checklistProgress(cl: RolloffEvent['checklist']): number {
    const items = [cl.knowledgeTransfer, cl.finalTimesheet, cl.accessRevocation, cl.assets]
    return items.filter(Boolean).length
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Rolloff console</h1>
          <p className="text-sm text-etyme-muted mt-1">
            Upcoming contract endings. Triage, complete checklists, redeploy or bench.
          </p>
        </div>
      </div>

      {/* Window selector */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-semibold text-etyme-muted">Window:</span>
        {([30, 60, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setWindow(d)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              window === d
                ? 'bg-etyme-ink text-white'
                : 'text-etyme-muted hover:bg-etyme-canvas border border-transparent hover:border-etyme-rule'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Summary stats */}
      {!loading && events.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <span className="evidence-dot evidence-dot--blocked" />
              <span className="text-xs font-semibold uppercase tracking-wider text-etyme-muted">Critical (0-7d)</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{critical}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <span className="evidence-dot evidence-dot--pending" />
              <span className="text-xs font-semibold uppercase tracking-wider text-etyme-muted">Urgent (8-14d)</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{urgent}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <span className="evidence-dot" />
              <span className="text-xs font-semibold uppercase tracking-wider text-etyme-muted">Upcoming (15+d)</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{upcoming}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Could not load rolloff events: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card text-center py-12">
          <p className="text-sm text-etyme-muted">Loading rolloff events...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && events.length === 0 && !error && (
        <div className="card text-center py-12">
          <p className="text-sm text-etyme-muted">No rolloff events in the next {window} days.</p>
          <p className="text-xs text-etyme-muted/60 mt-1">
            Rolloff events are created automatically when a sell contract has an end date within 8 weeks,
            either from import or when a contract end date is set.
          </p>
        </div>
      )}

      {/* Rolloff cards */}
      {!loading && sorted.length > 0 && (
        <div className="space-y-4">
          {sorted.map((event) => {
            const progress = checklistProgress(event.checklist)
            return (
              <div key={event.id} className={`card ${event.daysUntilEnd <= 7 ? 'border-red-200' : event.daysUntilEnd <= 14 ? 'border-amber-200' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold">{event.personName}</h3>
                      <UrgencyBadge daysUntilEnd={event.daysUntilEnd} />
                      {event.outcome && (
                        <span className={`pill text-[10px] ${
                          event.outcome === 'REDEPLOYED' ? 'bg-emerald-50 text-etyme-verified' :
                          event.outcome === 'BENCH' ? 'bg-amber-50 text-etyme-attention' :
                          'bg-etyme-canvas text-etyme-muted'
                        }`}>
                          {event.outcome}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-etyme-muted">
                      {event.personEmail}
                      {event.clientName && ` · ${event.clientName}`}
                      {` · $${(event.billRate / 100).toFixed(2)}/hr`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {new Date(event.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-[10px] text-etyme-muted">End date</p>
                  </div>
                </div>

                {/* Checklist */}
                <div className="border-t border-etyme-rule pt-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                      Offboarding checklist
                    </p>
                    <span className={`pill text-[10px] ${
                      progress === 4
                        ? 'bg-emerald-50 text-etyme-verified'
                        : 'bg-etyme-canvas text-etyme-muted'
                    }`}>
                      {progress}/4 complete
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-etyme-canvas rounded-full mb-3">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        progress === 4 ? 'bg-etyme-verified' : 'bg-etyme-action'
                      }`}
                      style={{ width: `${(progress / 4) * 100}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <ChecklistItem
                      label="Knowledge transfer"
                      checked={event.checklist.knowledgeTransfer}
                      onToggle={() => {/* Would PATCH /api/rolloff/:id/checklist */}}
                    />
                    <ChecklistItem
                      label="Final timesheet"
                      checked={event.checklist.finalTimesheet}
                      onToggle={() => {}}
                    />
                    <ChecklistItem
                      label="Access revocation"
                      checked={event.checklist.accessRevocation}
                      onToggle={() => {}}
                    />
                    <ChecklistItem
                      label="Assets returned"
                      checked={event.checklist.assets}
                      onToggle={() => {}}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Count footer */}
      {!loading && events.length > 0 && (
        <p className="text-xs text-etyme-muted mt-4">
          {events.length} rolloff event{events.length !== 1 ? 's' : ''} in the next {window} days
        </p>
      )}
    </>
  )
}
