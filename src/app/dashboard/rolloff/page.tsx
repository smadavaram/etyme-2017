'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact } from '@/lib/money-display'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'

// ── Types — match API response shape ─────────────────────

interface TrackedRolloff {
  id: string
  sellContractId: string
  endDate: string
  daysLeft: number
  person: { id: string; name: string } | null
  clientCompany: { id: string; name: string } | null
  endClientCompany: { id: string; name: string } | null
  workLocation: { id: string; name: string; city: string | null; state: string | null; isRemote: boolean } | null
  engagement: { id: string; title: string } | null
  billRate: number | null
  checklist: Record<string, boolean> | null
  claimedById: string | null
  outcome: string | null
  notified: boolean
}

interface UntrackedContract {
  sellContractId: string
  endDate: string
  daysLeft: number
  person: { id: string; name: string } | null
  clientCompany: { id: string; name: string } | null
  endClientCompany: { id: string; name: string } | null
  workLocation: { id: string; name: string; city: string | null; state: string | null; isRemote: boolean } | null
  engagement: { id: string; title: string } | null
  billRate: number | null
}

interface RolloffSummary {
  total: number
  tracked: number
  untracked: number
  claimed: number
  resolved: number
}

type WindowDays = 30 | 60 | 90

/** Resolve end client display name — shows "at EndClient via PayingCustomer" when different */
function clientLabel(
  clientCompany: { id: string; name: string } | null,
  endClientCompany: { id: string; name: string } | null,
): string {
  const endName = endClientCompany?.name ?? clientCompany?.name ?? 'No client'
  const viaName = endClientCompany && clientCompany && endClientCompany.id !== clientCompany.id
    ? ` via ${clientCompany.name}`
    : ''
  return endName + viaName
}

function locationLabel(
  workLocation: { name: string; city: string | null; state: string | null; isRemote: boolean } | null,
): string {
  if (!workLocation) return ''
  if (workLocation.isRemote) return ' · Remote'
  const parts = [workLocation.city, workLocation.state].filter(Boolean).join(', ')
  return parts ? ` · ${parts}` : ''
}

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
  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'rolloff')
  const [tracked, setTracked] = useState<TrackedRolloff[]>([])
  const [untracked, setUntracked] = useState<UntrackedContract[]>([])
  const [summary, setSummary] = useState<RolloffSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [window, setWindow] = useState<WindowDays>(30)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

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
      setTracked(body.data?.tracked ?? [])
      setUntracked(body.data?.untracked ?? [])
      setSummary(body.data?.summary ?? null)
    } catch (err: any) {
      setError(err.message)
      setTracked([])
      setUntracked([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [window])

  useEffect(() => {
    fetchRolloffs()
  }, [fetchRolloffs])

  // ── Toggle checklist item ─────────────────────────────────
  async function handleChecklistToggle(rolloffId: string, item: string) {
    // Optimistic update
    setTracked(prev => prev.map(r => {
      if (r.id !== rolloffId) return r
      const cl = { ...(r.checklist ?? {}) }
      cl[item] = !cl[item]
      return { ...r, checklist: cl }
    }))

    try {
      const res = await fetch(`/api/rolloff/${rolloffId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item }),
      })
      if (!res.ok) {
        throw new Error('Failed to update checklist')
      }
      const body = await res.json()
      const itemLabel = item.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
      setToast({
        message: body.data.checklist[item] ? `✓ ${itemLabel}` : `Unchecked ${itemLabel}`,
        type: 'success',
      })
      setTimeout(() => setToast(null), 2500)
    } catch {
      // Revert on failure
      fetchRolloffs()
      setToast({ message: 'Failed to update checklist', type: 'error' })
      setTimeout(() => setToast(null), 3000)
    }
  }

  // ── Claim rolloff ─────────────────────────────────────────
  async function handleClaim(rolloffId: string) {
    setClaiming(rolloffId)
    try {
      const res = await fetch(`/api/rolloff/${rolloffId}/claim`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? 'Claim failed')
      }
      setToast({ message: 'Rolloff claimed — you own this offboarding', type: 'success' })
      setTimeout(() => setToast(null), 3000)
      fetchRolloffs()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setClaiming(null)
    }
  }

  const total = tracked.length + untracked.length

  // Combine all for urgency counts
  const allDays = [
    ...tracked.map((t) => t.daysLeft),
    ...untracked.map((u) => u.daysLeft),
  ]
  const critical = allDays.filter((d) => d <= 7).length
  const urgent = allDays.filter((d) => d > 7 && d <= 14).length
  const upcoming = allDays.filter((d) => d > 14).length

  function checklistProgress(cl: Record<string, boolean> | null): number {
    if (!cl) return 0
    const items = [cl.knowledgeTransfer, cl.finalTimesheet, cl.accessRevocation, cl.assets]
    return items.filter(Boolean).length
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {isClient ? framing.title : 'Rolloff console'}
          </h1>
          <p className="text-sm text-etyme-muted mt-1">
            {isClient
              ? framing.subtitle
              : 'Upcoming contract endings. Triage, complete checklists, redeploy or bench.'}
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
      {!loading && total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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
      {!loading && total === 0 && !error && (
        <div className="card text-center py-12">
          <p className="text-sm text-etyme-muted">No contract endings in the next {window} days.</p>
          <p className="text-xs text-etyme-muted/60 mt-1">
            Rolloff events are created automatically when a sell contract has an end date within 8 weeks,
            either from import or when a contract end date is set.
          </p>
        </div>
      )}

      {/* ── Untracked contracts (need rolloff events) ──── */}
      {!loading && untracked.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="evidence-dot evidence-dot--pending" />
            <h2 className="text-sm font-semibold text-etyme-ink">
              Contracts ending soon — no rolloff event yet
            </h2>
            <span className="pill text-[10px] bg-amber-50 text-etyme-attention border border-amber-200">
              {untracked.length} untracked
            </span>
          </div>
          <div className="space-y-3">
            {[...untracked].sort((a, b) => a.daysLeft - b.daysLeft).map((c) => (
              <div key={c.sellContractId} className={`card border-l-4 ${
                c.daysLeft <= 7 ? 'border-l-red-400' : c.daysLeft <= 14 ? 'border-l-amber-400' : 'border-l-etyme-rule'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold">{c.person?.name ?? 'Unknown'}</h3>
                      <UrgencyBadge daysUntilEnd={c.daysLeft} />
                    </div>
                    <p className="text-xs text-etyme-muted">
                      {clientLabel(c.clientCompany, c.endClientCompany)}
                      {locationLabel(c.workLocation)}
                      {c.engagement && ` · ${c.engagement.title}`}
                      {c.billRate != null && ` · {compact(c.billRate)}/hr`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {new Date(c.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-[10px] text-etyme-muted">End date</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tracked rolloff events ─────────────────────── */}
      {!loading && tracked.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="evidence-dot evidence-dot--ok" />
            <h2 className="text-sm font-semibold text-etyme-ink">
              Tracked rolloff events
            </h2>
            <span className="pill text-[10px] bg-emerald-50 text-etyme-verified">
              {tracked.length} tracked
            </span>
          </div>
          <div className="space-y-3">
            {[...tracked].sort((a, b) => a.daysLeft - b.daysLeft).map((event) => {
              const progress = checklistProgress(event.checklist)
              return (
                <div key={event.id} className={`card ${event.daysLeft <= 7 ? 'border-red-200' : event.daysLeft <= 14 ? 'border-amber-200' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-sm font-semibold">{event.person?.name ?? 'Unknown'}</h3>
                        <UrgencyBadge daysUntilEnd={event.daysLeft} />
                        {event.outcome && (
                          <span className={`pill text-[10px] ${
                            event.outcome === 'REDEPLOYED' ? 'bg-emerald-50 text-etyme-verified' :
                            event.outcome === 'BENCH' ? 'bg-amber-50 text-etyme-attention' :
                            'bg-etyme-canvas text-etyme-muted'
                          }`}>
                            {event.outcome}
                          </span>
                        )}
                        {event.claimedById && (
                          <span className="pill text-[10px] bg-etyme-action/10 text-etyme-action">Claimed</span>
                        )}
                      </div>
                      <p className="text-xs text-etyme-muted">
                        {clientLabel(event.clientCompany, event.endClientCompany)}
                        {locationLabel(event.workLocation)}
                        {event.engagement && ` · ${event.engagement.title}`}
                        {event.billRate != null && ` · {compact(event.billRate)}/hr`}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      {!event.claimedById && !event.outcome && (
                        <button
                          onClick={() => handleClaim(event.id)}
                          disabled={claiming === event.id}
                          className="text-xs px-3 py-1.5 bg-etyme-action text-white rounded
                                     hover:bg-etyme-action/90 transition-colors disabled:opacity-50"
                        >
                          {claiming === event.id ? 'Claiming…' : 'Claim'}
                        </button>
                      )}
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {new Date(event.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-etyme-muted">End date</p>
                      </div>
                    </div>
                  </div>

                  {/* Checklist */}
                  {event.checklist && (
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        <ChecklistItem
                          label="Knowledge transfer"
                          checked={event.checklist.knowledgeTransfer ?? false}
                          onToggle={() => handleChecklistToggle(event.id, 'knowledgeTransfer')}
                        />
                        <ChecklistItem
                          label="Final timesheet"
                          checked={event.checklist.finalTimesheet ?? false}
                          onToggle={() => handleChecklistToggle(event.id, 'finalTimesheet')}
                        />
                        <ChecklistItem
                          label="Access revocation"
                          checked={event.checklist.accessRevocation ?? false}
                          onToggle={() => handleChecklistToggle(event.id, 'accessRevocation')}
                        />
                        <ChecklistItem
                          label="Assets returned"
                          checked={event.checklist.assets ?? false}
                          onToggle={() => handleChecklistToggle(event.id, 'assets')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Count footer */}
      {!loading && total > 0 && (
        <p className="text-xs text-etyme-muted mt-4">
          {total} contract ending{total !== 1 ? 's' : ''} in the next {window} days
          {summary && ` · ${summary.tracked} tracked · ${summary.untracked} untracked`}
        </p>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                         ${toast.type === 'success'
                           ? 'bg-etyme-verified text-white'
                           : 'bg-red-600 text-white'
                         } animate-slide-up`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
