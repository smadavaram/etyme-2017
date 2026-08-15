'use client'

import { useEffect, useState, useCallback } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Contracts working surface — sell and buy side.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *
 * Sell contracts → what you bill clients (revenue).
 * Buy contracts → what you pay talent (cost).
 * Filter tabs partition by state group (Active, Draft, Ended).
 */

// ── Types ──────────────────────────────────────────────────

interface Contract {
  id: string
  side: 'sell' | 'buy'
  personName: string
  counterpartyName: string | null
  endClientName: string | null  // where the consultant actually works
  viaName: string | null        // paying customer when different from end client
  workLocationLabel: string | null
  rate: number
  currency: string
  state: string
  startDate: string
  endDate: string | null
  daysUntilEnd: number | null
}

// ── Helpers ────────────────────────────────────────────────

type ViewTab = 'sell' | 'buy'
type StateFilter = 'all' | 'active' | 'draft' | 'ended' | 'bench'

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

const ACTIVE_STATES = ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION']
const DRAFT_STATES = ['DRAFT']
const ENDED_STATES = ['ENDED', 'CANCELLED', 'PAUSED']
const BENCH_STATES = ['BENCH_PAID', 'INTERNAL', 'TRAINING']

function matchesFilter(state: string, filter: StateFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return ACTIVE_STATES.includes(state)
  if (filter === 'draft') return DRAFT_STATES.includes(state)
  if (filter === 'ended') return ENDED_STATES.includes(state)
  if (filter === 'bench') return BENCH_STATES.includes(state)
  return true
}

// ── Page ───────────────────────────────────────────────────

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ViewTab>('sell')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')

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

      setContracts(rawContracts.map((c: any) => {
        // Resolve the display name: end client if set, otherwise paying customer
        const endClientName = tab === 'sell'
          ? (c.endClientCompany?.name ?? c.clientCompany?.name ?? null)
          : null
        // "via" label: show paying customer when it differs from end client
        const viaName = tab === 'sell' && c.endClientCompany && c.clientCompany
          && c.endClientCompany.id !== c.clientCompany.id
          ? c.clientCompany.name
          : null
        // Work location label
        const loc = c.workLocation
        const workLocationLabel = loc
          ? (loc.isRemote ? 'Remote' : [loc.name, loc.city, loc.state].filter(Boolean).join(', '))
          : null

        return {
          id: c.id,
          side: c.side ?? tab,
          personName: c.person?.name ?? 'Unknown',
          counterpartyName: tab === 'sell'
            ? (endClientName ?? c.clientCompany?.name ?? null)
            : c.vendorCompany?.name ?? null,
          endClientName,
          viaName,
          workLocationLabel,
          rate: tab === 'sell' ? c.billRate : c.payRate,
          currency: tab === 'sell' ? (c.billCurrency ?? 'USD') : (c.payCurrency ?? 'USD'),
          state: c.state,
          startDate: c.startDate,
          endDate: c.endDate ?? null,
          daysUntilEnd: c.endDate
            ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null,
        }
      }))
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

  // Reset state filter when switching sell/buy
  useEffect(() => {
    setStateFilter('all')
  }, [tab])

  const filtered = contracts.filter(c => matchesFilter(c.state, stateFilter))

  // Stats
  const activeCount = contracts.filter(c => ACTIVE_STATES.includes(c.state)).length
  const draftCount = contracts.filter(c => DRAFT_STATES.includes(c.state)).length
  const endedCount = contracts.filter(c => ENDED_STATES.includes(c.state)).length
  const benchCount = contracts.filter(c => BENCH_STATES.includes(c.state)).length

  const rolloffWarnings = contracts.filter(
    c => c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= 28 && c.state === 'IN_PROGRESS'
  )

  const totalRate = contracts
    .filter(c => ['IN_PROGRESS', 'VERIFIED'].includes(c.state))
    .reduce((sum, c) => sum + (c.rate / 100), 0)

  const rateLabel = tab === 'sell' ? 'Bill rate' : 'Pay rate'
  const counterpartyLabel = tab === 'sell' ? 'Client' : 'Vendor'

  // ── Column definitions ──
  const columns: Column<Contract>[] = [
    {
      key: 'personName',
      label: 'Consultant',
      render: (row) => (
        <span className="font-medium text-etyme-ink">{row.personName}</span>
      ),
      sortValue: (row) => row.personName,
    },
    {
      key: 'counterpartyName',
      label: counterpartyLabel,
      render: (row) => (
        <div>
          <span className="text-etyme-muted">{row.counterpartyName ?? '—'}</span>
          {row.viaName && (
            <div className="text-[10px] text-etyme-faint">via {row.viaName}</div>
          )}
          {row.workLocationLabel && (
            <div className="text-[10px] text-etyme-faint">{row.workLocationLabel}</div>
          )}
        </div>
      ),
      sortValue: (row) => row.counterpartyName ?? '',
    },
    {
      key: 'rate',
      label: rateLabel,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-etyme-ink">
          ${(row.rate / 100).toFixed(0)}<span className="text-etyme-faint">/hr</span>
        </span>
      ),
      sortValue: (row) => row.rate,
    },
    {
      key: 'startDate',
      label: 'Start',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted text-[12px]">
          {new Date(row.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
      ),
      sortValue: (row) => new Date(row.startDate).getTime(),
      hideOnMobile: true,
    },
    {
      key: 'endDate',
      label: 'End',
      render: (row) => {
        const isRolloff = row.daysUntilEnd != null && row.daysUntilEnd >= 0 && row.daysUntilEnd <= 28
        if (!row.endDate) {
          return <span className="text-etyme-faint text-[12px]">Open-ended</span>
        }
        return (
          <div>
            <span className={`tabular-nums text-[12px] ${isRolloff ? 'text-etyme-attention font-medium' : 'text-etyme-muted'}`}>
              {new Date(row.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
            {isRolloff && (
              <div className="text-[10px] text-etyme-attention">
                {row.daysUntilEnd === 0 ? 'Today' : `${row.daysUntilEnd}d left`}
              </div>
            )}
          </div>
        )
      },
      sortValue: (row) => row.endDate ? new Date(row.endDate).getTime() : Infinity,
      hideOnMobile: true,
    },
    {
      key: 'state',
      label: 'Status',
      render: (row) => (
        <span className={`chip ${stateChipClass(row.state)}`}>
          {stateLabel(row.state)}
        </span>
      ),
      sortValue: (row) => {
        const order: Record<string, number> = {
          IN_PROGRESS: 0, VERIFIED: 1, PENDING_VERIFICATION: 2,
          DRAFT: 3, BENCH_PAID: 4, INTERNAL: 5, TRAINING: 6,
          PAUSED: 7, ENDED: 8, CANCELLED: 9,
        }
        return order[row.state] ?? 10
      },
    },
  ]

  // Build filter tabs
  const SELL_FILTERS: { key: StateFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: contracts.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'ended', label: 'Ended', count: endedCount },
  ]

  const BUY_FILTERS: { key: StateFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: contracts.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'bench', label: 'Bench & Internal', count: benchCount },
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'ended', label: 'Ended', count: endedCount },
  ]

  const filters = tab === 'sell' ? SELL_FILTERS : BUY_FILTERS

  return (
    <>
      {/* Head */}
      <div className="page-head">
        <p className="eyebrow">{tab === 'sell' ? 'Sell' : 'Procure'}</p>
        <h1>{tab === 'sell' ? 'Sell' : 'Buy'} Contracts</h1>
        <p>
          {tab === 'sell'
            ? 'What you bill clients. Revenue side — track active engagements, pending verifications, and upcoming rolloffs.'
            : 'What you pay for talent. Cost side — bench payments, internal contracts, and vendor agreements.'}
        </p>
      </div>

      {/* Sell / Buy tabs */}
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
              ${totalRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}
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

      {/* DataTable with state filter tabs */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchPlaceholder={`Search by consultant${tab === 'sell' ? ', client' : ', vendor'}…`}
        searchFilter={(row, q) =>
          row.personName.toLowerCase().includes(q) ||
          (row.counterpartyName?.toLowerCase().includes(q) ?? false) ||
          stateLabel(row.state).toLowerCase().includes(q)
        }
        emptyMessage={
          stateFilter === 'all'
            ? `No ${tab} contracts yet.`
            : `No ${stateFilter} ${tab} contracts.`
        }
        emptyDetail={
          tab === 'sell'
            ? 'Sell contracts are created when a submission is accepted or via import.'
            : 'Buy contracts track what you pay — created alongside sell contracts or for bench/internal employees.'
        }
        exportName={`${tab}-contracts`}
        filters={
          <div className="flex gap-1.5">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setStateFilter(f.key)}
                className={`filter-tab ${stateFilter === f.key ? 'filter-tab--active' : 'filter-tab--inactive'}`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        }
        rowClassName={(row) =>
          row.daysUntilEnd != null && row.daysUntilEnd >= 0 && row.daysUntilEnd <= 28
            ? '!bg-amber-50/30'
            : ''
        }
      />
    </>
  )
}
