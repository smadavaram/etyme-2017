'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────

interface Contract {
  id: string
  side: 'sell' | 'buy'
  personName: string
  counterpartyName: string | null
  rate: number
  currency: string
  state: string
  startDate: string
  endDate: string | null
  daysUntilEnd: number | null
}

// ── Helpers ────────────────────────────────────────────────

type ViewTab = 'sell' | 'buy'

const SELL_STATE_GROUPS: { key: string; label: string; states: string[] }[] = [
  { key: 'active', label: 'Active', states: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] },
  { key: 'draft', label: 'Draft', states: ['DRAFT'] },
  { key: 'ended', label: 'Ended', states: ['ENDED', 'CANCELLED', 'PAUSED'] },
]

const BUY_STATE_GROUPS: { key: string; label: string; states: string[] }[] = [
  { key: 'active', label: 'Active', states: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] },
  { key: 'bench', label: 'Bench & Internal', states: ['BENCH_PAID', 'INTERNAL', 'TRAINING'] },
  { key: 'draft', label: 'Draft', states: ['DRAFT'] },
  { key: 'ended', label: 'Ended', states: ['ENDED', 'CANCELLED', 'PAUSED'] },
]

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_VERIFICATION: 'Pending Verification',
    VERIFIED: 'Verified',
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
    case 'VERIFIED':
      return 'bg-emerald-50 text-etyme-verified border border-emerald-200'
    case 'PENDING_VERIFICATION':
    case 'DRAFT':
      return 'bg-etyme-action/5 text-etyme-action border border-etyme-action/20'
    case 'BENCH_PAID':
    case 'TRAINING':
      return 'bg-amber-50 text-etyme-attention border border-amber-200'
    case 'INTERNAL':
      return 'bg-purple-50 text-purple-700 border border-purple-200'
    case 'PAUSED':
      return 'bg-etyme-canvas text-etyme-muted border border-etyme-rule'
    case 'ENDED':
    case 'CANCELLED':
      return 'bg-etyme-canvas text-etyme-muted'
    default:
      return 'bg-etyme-canvas text-etyme-muted'
  }
}

// ── Page ───────────────────────────────────────────────────

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ViewTab>('sell')

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts?side=${tab}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      const rawContracts = body.data?.contracts ?? []

      // Normalise into common shape
      setContracts(rawContracts.map((c: any) => ({
        id: c.id,
        side: c.side ?? tab,
        personName: c.person?.name ?? 'Unknown',
        counterpartyName: tab === 'sell'
          ? c.clientCompany?.name ?? null
          : c.vendorCompany?.name ?? null,
        rate: tab === 'sell' ? c.billRate : c.payRate,
        currency: tab === 'sell' ? (c.billCurrency ?? 'USD') : (c.payCurrency ?? 'USD'),
        state: c.state,
        startDate: c.startDate,
        endDate: c.endDate ?? null,
        daysUntilEnd: c.endDate
          ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          : null,
      })))
    } catch (err: any) {
      setError(err.message)
      setContracts([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    fetchContracts()
  }, [fetchContracts])

  const stateGroups = tab === 'sell' ? SELL_STATE_GROUPS : BUY_STATE_GROUPS

  function getGrouped() {
    const grouped: Record<string, Contract[]> = {}
    for (const group of stateGroups) {
      const matching = contracts.filter((c) => group.states.includes(c.state))
      if (matching.length > 0) {
        grouped[group.key] = matching
      }
    }
    const knownStates = stateGroups.flatMap((g) => g.states)
    const other = contracts.filter((c) => !knownStates.includes(c.state))
    if (other.length > 0) {
      grouped['other'] = other
    }
    return grouped
  }

  const grouped = loading ? {} : getGrouped()

  // Rolloff warnings — contracts ending within 28 days
  const rolloffWarnings = contracts.filter(
    (c) => c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= 28 && c.state === 'IN_PROGRESS'
  )

  const rateLabel = tab === 'sell' ? 'Bill Rate' : 'Pay Rate'
  const counterpartyLabel = tab === 'sell' ? 'Client' : 'Vendor'

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="headline-serif text-heading text-etyme-ink">
            {tab === 'sell' ? 'Sell' : 'Buy'} Contracts
          </h1>
          <p className="text-body-sm text-etyme-muted mt-1">
            {tab === 'sell'
              ? 'What you bill clients. Revenue side.'
              : 'What you pay for talent. Cost side.'}
          </p>
        </div>
      </div>

      {/* Sell / Buy tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-etyme-canvas rounded-lg w-fit">
        {(['sell', 'buy'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? 'bg-white text-etyme-ink shadow-sm'
                : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            {t === 'sell' ? 'Sell' : 'Buy'}
          </button>
        ))}
      </div>

      {/* Rolloff warnings banner (sell side only) */}
      {tab === 'sell' && rolloffWarnings.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="evidence-dot evidence-dot--pending" />
            <span className="text-sm font-semibold text-amber-800">
              {rolloffWarnings.length} contract{rolloffWarnings.length !== 1 ? 's' : ''} ending within 28 days
            </span>
          </div>
          <div className="ml-4 space-y-1">
            {rolloffWarnings.map((c) => (
              <p key={c.id} className="text-xs text-amber-700">
                <strong>{c.personName}</strong>
                {c.counterpartyName && ` at ${c.counterpartyName}`}
                {' — '}
                {c.daysUntilEnd === 0
                  ? 'ends today'
                  : `${c.daysUntilEnd} day${c.daysUntilEnd !== 1 ? 's' : ''} remaining`}
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
          Could not load contracts: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="panel text-center py-12">
          <p className="text-body-sm text-etyme-muted">Loading contracts...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && contracts.length === 0 && !error && (
        <div className="panel text-center py-12">
          <p className="text-body-sm text-etyme-muted">No {tab} contracts yet.</p>
          <p className="text-xs text-etyme-faint mt-1">
            {tab === 'sell'
              ? 'Sell contracts are created when a submission is accepted or via import.'
              : 'Buy contracts track what you pay — created alongside sell contracts or for bench/internal employees.'}
          </p>
        </div>
      )}

      {/* Grouped tables */}
      {!loading && Object.entries(grouped).map(([groupKey, groupContracts]) => {
        const groupLabel = stateGroups.find((g) => g.key === groupKey)?.label ?? 'Other'
        return (
          <div key={groupKey} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-etyme-ink">{groupLabel}</h2>
              <span className="chip chip--passive text-[10px]">
                {groupContracts.length}
              </span>
            </div>

            <div className="panel p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-etyme-rule">
                      <th className="text-left px-6 py-3 lbl">Consultant</th>
                      <th className="text-left px-6 py-3 lbl">{counterpartyLabel}</th>
                      <th className="text-left px-6 py-3 lbl">{rateLabel}</th>
                      <th className="text-left px-6 py-3 lbl">Start</th>
                      <th className="text-left px-6 py-3 lbl">End</th>
                      <th className="text-left px-6 py-3 lbl">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupContracts.map((c) => {
                      const isRolloff = c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= 28
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-etyme-rule last:border-0 hover:bg-etyme-canvas/50
                                     cursor-pointer transition-colors ${isRolloff ? 'bg-amber-50/30' : ''}`}
                        >
                          <td className="px-6 py-3">
                            <p className="font-medium text-etyme-ink">{c.personName}</p>
                          </td>
                          <td className="px-6 py-3 text-etyme-muted">
                            {c.counterpartyName ?? <span className="italic">—</span>}
                          </td>
                          <td className="px-6 py-3 tabular-nums text-etyme-ink">
                            ${(c.rate / 100).toFixed(2)}/hr
                          </td>
                          <td className="px-6 py-3 tabular-nums text-etyme-muted">
                            {new Date(c.startDate).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 tabular-nums">
                            {c.endDate ? (
                              <span className={isRolloff ? 'text-etyme-attention font-medium' : 'text-etyme-muted'}>
                                {new Date(c.endDate).toLocaleDateString()}
                                {isRolloff && (
                                  <span className="block text-[10px]">
                                    {c.daysUntilEnd === 0 ? 'Today' : `${c.daysUntilEnd}d left`}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-etyme-muted">Open-ended</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`chip text-[10px] ${stateColor(c.state)}`}>
                              {stateLabel(c.state)}
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
      {!loading && contracts.length > 0 && (
        <p className="text-xs text-etyme-faint">
          {contracts.length} {tab} contract{contracts.length !== 1 ? 's' : ''}
        </p>
      )}
    </>
  )
}
