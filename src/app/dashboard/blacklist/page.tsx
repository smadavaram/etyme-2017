'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Blacklist — working surface for managing blocked candidates and companies.
 *
 * BUILD.md §6.10: "black_lister — filters candidates and companies out of
 * search, feeds and contracts."
 *
 * LEGACY_RULES.md §8.1: "black_list — blocks candidates or companies from
 * appearing in search, feeds or contracts for that company."
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   Section: Operate (vendor nav)
 */

// ── Types ────────────────────────────────────────────

interface BlacklistEntry {
  id: string
  targetType: 'PERSON' | 'COMPANY'
  targetId: string
  reason: string
  blockedById: string
  blockedAt: string
  expiresAt: string | null
  liftedAt: string | null
  liftedById: string | null
  liftReason: string | null
  isActive: boolean
}

type FilterTab = 'all' | 'active' | 'expired' | 'people' | 'companies'

// ── Helpers ──────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return id.slice(0, 6) + '…' + id.slice(-4)
}

// ── Add to Blacklist Modal ──────────────────────────

function AddBlacklistModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (msg: string) => void
}) {
  const [targetType, setTargetType] = useState<'PERSON' | 'COMPANY'>('PERSON')
  const [targetId, setTargetId] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!targetId.trim()) {
      setError('Subject ID is required.')
      return
    }
    if (!reason.trim()) {
      setError('Reason is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD',
          targetType,
          targetId: targetId.trim(),
          reason: reason.trim(),
          expiresAt: expiresAt || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to add to blacklist')
        return
      }

      onCreated(`${targetType === 'PERSON' ? 'Person' : 'Company'} added to blacklist.`)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add to blacklist</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject type */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Subject type *</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as 'PERSON' | 'COMPANY')}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            >
              <option value="PERSON">Person</option>
              <option value="COMPANY">Company</option>
            </select>
          </div>

          {/* Subject ID */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Subject ID *</label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => { setTargetId(e.target.value); setError(null) }}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder={targetType === 'PERSON' ? 'Person ID' : 'Company ID'}
              autoComplete="off"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null) }}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg resize-none
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Why is this person or company being blocked?"
            />
          </div>

          {/* Expiry date (optional) */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">
              Expiry date <span className="text-etyme-faint font-normal">(optional — leave blank for permanent)</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Adding…' : 'Add to blacklist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function BlacklistPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [entries, setEntries] = useState<BlacklistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Open modal from ?new=1 link
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true)
      router.replace('/dashboard/blacklist')
    }
  }, [searchParams, router])

  const fetchBlacklist = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/blacklist?includeInactive=true')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setEntries(body.data?.blacklist ?? [])
    } catch (err: any) {
      setError(err.message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBlacklist()
  }, [fetchBlacklist])

  // ── Filtered data ──────────────────────────────────

  const filtered = useMemo(() => {
    switch (filterTab) {
      case 'active':
        return entries.filter((e) => e.isActive)
      case 'expired':
        return entries.filter((e) => !e.isActive)
      case 'people':
        return entries.filter((e) => e.targetType === 'PERSON')
      case 'companies':
        return entries.filter((e) => e.targetType === 'COMPANY')
      default:
        return entries
    }
  }, [entries, filterTab])

  // ── Stats ──────────────────────────────────────────

  const stats = useMemo(() => {
    const active = entries.filter((e) => e.isActive).length
    const expired = entries.filter((e) => !e.isActive).length
    const people = entries.filter((e) => e.targetType === 'PERSON').length
    const companies = entries.filter((e) => e.targetType === 'COMPANY').length
    return { total: entries.length, active, expired, people, companies }
  }, [entries])

  // ── Columns ────────────────────────────────────────

  const columns: Column<BlacklistEntry>[] = [
    {
      key: 'targetId',
      label: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
              row.targetType === 'PERSON'
                ? 'bg-etyme-action/10 text-etyme-action'
                : 'bg-etyme-attention/10 text-etyme-attention'
            }`}>
              {row.targetType === 'PERSON' ? '⊘' : '⊘'}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-etyme-ink truncate font-mono text-[12px]" title={row.targetId}>
                {truncateId(row.targetId)}
              </p>
            </div>
          </div>
        </div>
      ),
      sortValue: (row) => row.targetId,
      width: 'min-w-[180px]',
    },
    {
      key: 'targetType',
      label: 'Type',
      render: (row) => (
        <span className={`chip text-[9px] ${
          row.targetType === 'PERSON' ? 'chip--action' : 'chip--attention'
        }`}>
          {row.targetType === 'PERSON' ? 'Person' : 'Company'}
        </span>
      ),
      sortValue: (row) => row.targetType,
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted truncate max-w-[240px] block" title={row.reason}>
          {row.reason}
        </span>
      ),
      sortValue: (row) => row.reason,
      width: 'min-w-[160px]',
    },
    {
      key: 'blockedById',
      label: 'Added By',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted font-mono" title={row.blockedById}>
          {truncateId(row.blockedById)}
        </span>
      ),
      sortValue: (row) => row.blockedById,
      hideOnMobile: true,
    },
    {
      key: 'blockedAt',
      label: 'Added Date',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted tabular-nums">
          {formatDate(row.blockedAt)}
        </span>
      ),
      sortValue: (row) => new Date(row.blockedAt).getTime(),
      hideOnMobile: true,
    },
    {
      key: 'expiresAt',
      label: 'Expires',
      render: (row) => {
        if (!row.expiresAt) return <span className="text-[12px] text-etyme-faint">Permanent</span>
        return (
          <span className="text-[12px] text-etyme-muted tabular-nums">
            {formatDate(row.expiresAt)}
          </span>
        )
      },
      sortValue: (row) => row.expiresAt ? new Date(row.expiresAt).getTime() : Infinity,
      hideOnMobile: true,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`chip text-[9px] ${row.isActive ? 'chip--danger' : 'chip--passive'}`}>
          {row.isActive ? 'Active' : 'Expired'}
        </span>
      ),
      sortValue: (row) => (row.isActive ? 0 : 1),
    },
  ]

  // ── Handlers ───────────────────────────────────────

  function handleCreated(msg: string) {
    setToast({ message: msg, type: 'success' })
    setTimeout(() => setToast(null), 3500)
    fetchBlacklist()
  }

  // ── Filter tabs ────────────────────────────────────

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'expired', label: 'Expired', count: stats.expired },
    { key: 'people', label: 'People', count: stats.people },
    { key: 'companies', label: 'Companies', count: stats.companies },
  ]

  // ── Render ─────────────────────────────────────────

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="eyebrow mb-2">Operate</div>
          <h1 className="headline-serif text-heading text-etyme-ink mb-1">
            Blacklist
          </h1>
          <p className="text-body-sm text-etyme-muted">
            Manage blocked candidates and companies — prevent them from appearing in search, feeds, or contracts.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary mt-3 shrink-0">
          Add to blacklist
        </button>
      </div>

      {/* Stats row */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatChip label="Total Entries" value={stats.total} />
          <StatChip label="Active" value={stats.active} tone="attention" />
          <StatChip label="Expired" value={stats.expired} />
          <StatChip label="People" value={stats.people} tone="action" />
          <StatChip label="Companies" value={stats.companies} tone="attention" />
        </div>
      )}

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={(row, q) =>
          row.targetId.toLowerCase().includes(q) ||
          row.reason.toLowerCase().includes(q) ||
          row.targetType.toLowerCase().includes(q)
        }
        searchPlaceholder="Search by subject, reason…"
        emptyMessage="No blacklist entries."
        emptyDetail="No candidates or companies have been blocked. Use the button above to add an entry."
        exportName="etyme-blacklist"
        filters={
          <div className="flex items-center gap-1 bg-etyme-canvas rounded-md p-0.5 flex-wrap">
            {filterTabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilterTab(key)}
                className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                  filterTab === key
                    ? 'bg-white text-etyme-ink shadow-sm'
                    : 'text-etyme-muted hover:text-etyme-ink'
                }`}
              >
                {label}
                <span className="ml-1 tabular-nums text-[10px] text-etyme-faint">{count}</span>
              </button>
            ))}

            {filterTab !== 'all' && (
              <button
                onClick={() => setFilterTab('all')}
                className="text-[11px] text-etyme-action hover:underline ml-2"
              >
                Clear
              </button>
            )}
          </div>
        }
      />

      {/* Add modal */}
      {showAddModal && (
        <AddBlacklistModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success'
            ? 'bg-etyme-verified text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ── Stat chip ────────────────────────────────────────

function StatChip({
  label, value, tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'verified' | 'action' | 'attention'
}) {
  const color = {
    default: 'text-etyme-ink',
    verified: 'text-etyme-verified',
    action: 'text-etyme-action',
    attention: 'text-etyme-attention',
  }[tone]

  return (
    <div className="panel py-3 px-4">
      <div className="stat-label text-[9px] mb-1">{label}</div>
      <div className={`text-xl font-serif font-medium tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  )
}
