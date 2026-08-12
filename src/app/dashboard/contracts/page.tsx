'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Contracts working surface — sell and buy side.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *
 * Contracts are grouped by state (active, draft, ended) because users
 * operate on a state group at a time — "approve all drafts" or "review
 * active rolloffs." This makes grouped tables the right pattern here
 * rather than a single flat DataTable.
 *
 * Sell contracts → what you bill clients (revenue).
 * Buy contracts → what you pay talent (cost).
 * Rolloff warning: contracts ending within 28 days surface a banner.
 */

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
    PENDING_VERIFICATION: 'Pending',
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

function stateChipClass(state: string): string {
  switch (state) {
    case 'IN_PROGRESS':
    case 'VERIFIED':
      return 'chip--verified'
    case 'PENDING_VERIFICATION':
    case 'DRAFT':
      return 'chip--action'
    case 'BENCH_PAID':
    case 'TRAINING':
      return 'chip--attention'
    case 'INTERNAL':
      return 'chip--action'
    case 'PAUSED':
    case 'ENDED':
    case 'CANCELLED':
    default:
      return 'chip--passive'
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

  // Stats
  const activeCount = contracts.filter((c) =>
    ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'].includes(c.state)
  ).length
  const totalRevenue = tab === 'sell'
    ? contracts
        .filter((c) => ['IN_PROGRESS', 'VERIFIED'].includes(c.state))
        .reduce((sum, c) => sum + (c.rate / 100), 0)
    : 0

  const rateLabel = tab === 'sell' ? 'Bill rate' : 'Pay rate'
  const counterpartyLabel = tab === 'sell' ? 'Client' : 'Vendor'

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle */}
      <div className="page-head">
        <p className="eyebrow">{tab === 'sell' ? 'Sell' : 'Procure'}</p>
        <h1>{tab === 'sell' ? 'Sell' : 'Buy'} Contracts</h1>
        <p>
          {tab === 'sell'
            ? 'What you bill clients. Revenue side — track active engagements, pending verifications, and upcoming rolloffs.'
            : 'What you pay for talent. Cost side — bench payments, internal contracts, and vendor agreements.'}
        </p>
      </div>

      {/* Sell / Buy tabs — prototype filter-tab pattern */}
      <div className="flex gap-1.5 mb-6">
        {(['sell', 'buy'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`filter-tab ${tab === t ? 'filter-tab--active' : 'filter-tab--inactive'}`}
          >
            {t === 'sell' ? 'Sell' : 'Buy'}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Active</p>
          <p className="stat-value text-etyme-ink">{activeCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">contracts</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Rolloffs</p>
          <p className={`stat-value ${rolloffWarnings.length > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {rolloffWarnings.length}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">within 28 days</p>
        </div>
        {tab === 'sell' && (
          <div className="panel flex-1 min-w-[140px]">
            <p className="stat-label">Active bill rates</p>
            <p className="stat-value text-etyme-verified">
              ${totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-etyme-faint mt-0.5">total $/hr</p>
          </div>
        )}
      </div>

      {/* Rolloff warnings banner */}
      {rolloffWarnings.length > 0 && (
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
          <p className="text-sm text-etyme-muted">Loading contracts…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && contracts.length === 0 && !error && (
        <div className="panel text-center py-12">
          <p className="text-sm text-etyme-muted">No {tab} contracts yet.</p>
          <p className="text-xs text-etyme-faint mt-1">
            {tab === 'sell'
              ? 'Sell contracts are created when a submission is accepted or via import.'
              : 'Buy contracts track what you pay — created alongside sell contracts or for bench/internal employees.'}
          </p>
        </div>
      )}

      {/* Grouped tables — each group uses data-table class for prototype styling */}
      {!loading && Object.entries(grouped).map(([groupKey, groupContracts]) => {
        const groupLabel = stateGroups.find((g) => g.key === groupKey)?.label ?? 'Other'
        return (
          <div key={groupKey} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-etyme-ink">{groupLabel}</h2>
              <span className="chip chip--passive">{groupContracts.length}</span>
            </div>

            <div className="bg-etyme-surface border border-etyme-rule rounded-[6px] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table w-full text-[13px]">
                  <thead>
                    <tr>
                      <th>Consultant</th>
                      <th>{counterpartyLabel}</th>
                      <th className="!text-right">{rateLabel}</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupContracts.map((c) => {
                      const isRolloff = c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= 28
                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-etyme-canvas/50 cursor-pointer transition-colors ${
                            isRolloff ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td>
                            <p className="font-medium text-etyme-ink">{c.personName}</p>
                          </td>
                          <td className="text-etyme-muted">
                            {c.counterpartyName ?? <span className="text-etyme-faint">—</span>}
                          </td>
                          <td className="!text-right tabular-nums text-etyme-ink">
                            ${(c.rate / 100).toFixed(0)}<span className="text-etyme-faint">/hr</span>
                          </td>
                          <td className="tabular-nums text-etyme-muted text-[12px]">
                            {new Date(c.startDate).toLocaleDateString()}
                          </td>
                          <td className="tabular-nums text-[12px]">
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
                              <span className="text-etyme-faint">Open-ended</span>
                            )}
                          </td>
                          <td>
                            <span className={`chip ${stateChipClass(c.state)}`}>
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
        <p className="text-xs text-etyme-faint tabular-nums">
          {contracts.length} {tab} contract{contracts.length !== 1 ? 's' : ''}
        </p>
      )}
    </>
  )
}
