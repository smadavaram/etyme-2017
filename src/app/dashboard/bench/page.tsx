'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { range, compact } from '@/lib/money-display'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Bench — working surface for the company's consultant bench.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows. User finds and acts fast."
 *
 * Shows retained and marketing bench listings with skills, availability,
 * work auth, rates. Uses the DataTable component (UX Stress Test #3).
 *
 * Phase 1: fetches from /api/bench, renders in the shared DataTable.
 */

// ── Types ────────────────────────────────────────────

interface ConsultantOption {
  id: string
  personId: string
  name: string
  email: string
  headline: string | null
}

interface BenchEntry {
  id: string
  tier: 'RETAINED' | 'MARKETING'
  consultantId: string
  personId: string
  name: string
  email: string
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  rateMin: number | null
  rateMax: number | null
  availableFrom: string | null
  visibility: string
  grantedAt: string
}

interface BurnData {
  burn: { daily: number; weekly: number; monthly: number; toDate: number }
  benchSize: number
  benchSizeTotal: number
  retained: { count: number; dailyBurn: number }
  marketing: { count: number; dailyBurn: number }
  openRequirements: number
  entries: Array<{
    personId: string
    personName: string
    headline: string | null
    skills: string[]
    tier: string
    payRate: number
    dailyCost: number
    weeklyCost: number
    monthlyCost: number
    contractType: string
    daysOnBench: number
    totalBurnToDate: number
    availableFrom: string | null
  }>
}

type TierFilter = 'all' | 'RETAINED' | 'MARKETING'
type AvailFilter = 'all' | 'now' | 'soon' | 'later'

// ── Helpers ──────────────────────────────────────────

function workAuthLabel(auth: string | null): string {
  const labels: Record<string, string> = {
    US_CITIZEN: 'US Citizen',
    GC: 'Green Card',
    H1B: 'H-1B',
    OPT: 'OPT',
    GBP_SW: 'Skilled Worker',
    EAD: 'EAD',
    TN: 'TN Visa',
    L1: 'L-1',
  }
  return auth ? labels[auth] ?? auth : '—'
}

function visibilityChip(v: string): { text: string; cls: string } {
  switch (v) {
    case 'VERIFIED':       return { text: 'Verified',  cls: 'chip--verified' }
    case 'CLIENT_VISIBLE': return { text: 'Visible',   cls: 'chip--action' }
    case 'FEED':           return { text: 'Feed',      cls: 'chip--passive' }
    case 'INTERNAL':       return { text: 'Internal',  cls: 'chip--attention' }
    default:               return { text: v,           cls: 'chip--passive' }
  }
}

function availabilityStatus(availableFrom: string | null): { text: string; cls: string; group: AvailFilter } {
  if (!availableFrom) return { text: 'Unknown', cls: 'text-etyme-faint', group: 'later' }
  const date = new Date(availableFrom)
  const now = new Date()
  const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntil <= 0) return { text: 'Available now', cls: 'text-etyme-verified font-medium', group: 'now' }
  if (daysUntil <= 14) return { text: `${daysUntil}d`, cls: 'text-etyme-attention font-medium', group: 'soon' }
  return { text: date.toLocaleDateString(), cls: 'text-etyme-muted', group: 'later' }
}

/**
 * Bench rates are stored in cents, and this used to render them raw — a
 * consultant asking $110/hr appeared on the bench as "$11000". Every other
 * screen divided by a hundred; this one forgot, and nothing caught it
 * because a plain number carries no unit.
 */
function formatRate(min: number | null, max: number | null): string {
  return range(min, max)
}

// ── Add Bench Listing Modal ─────────────────────────

function AddBenchListingModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ConsultantOption[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedConsultant, setSelectedConsultant] = useState<ConsultantOption | null>(null)
  const [tier, setTier] = useState<'RETAINED' | 'MARKETING'>('RETAINED')
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Debounced consultant search
  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setSelectedConsultant(null)
    setError(null)

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (value.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/consultants?q=${encodeURIComponent(value.trim())}&limit=10`)
        if (res.ok) {
          const body = await res.json()
          const results = (body.data?.consultants ?? []).map((c: any) => ({
            id: c.id,
            personId: c.personId,
            name: c.person?.name ?? c.name ?? 'Unknown',
            email: c.person?.email ?? c.email ?? '',
            headline: c.headline ?? null,
          }))
          setSearchResults(results)
          setShowDropdown(results.length > 0)
        }
      } catch {
        // Silently fail — user can retry
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  function selectConsultant(c: ConsultantOption) {
    setSelectedConsultant(c)
    setSearchQuery(c.name)
    setShowDropdown(false)
    setError(null)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedConsultant) {
      setError('Please select a consultant from the search results.')
      return
    }

    const minVal = rateMin.trim() ? Math.round(parseFloat(rateMin) * 100) : null
    const maxVal = rateMax.trim() ? Math.round(parseFloat(rateMax) * 100) : null

    if (minVal != null && maxVal != null && minVal > maxVal) {
      setError('Rate min cannot exceed rate max.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/bench/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultantId: selectedConsultant.id,
          tier,
          rateMin: minVal,
          rateMax: maxVal,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create bench listing')
        return
      }

      const body = await res.json()
      onCreated(body.data?.message ?? `Bench listing created for "${selectedConsultant.name}".`)
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
          <h2 className="text-lg font-semibold">Add to bench</h2>
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
          {/* Consultant search */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Consultant *</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && !selectedConsultant && setShowDropdown(true)}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Search by name or email…"
              autoComplete="off"
            />
            {searching && (
              <div className="absolute right-3 top-[30px] text-[11px] text-etyme-faint animate-pulse">
                Searching…
              </div>
            )}
            {selectedConsultant && (
              <div className="mt-1.5 flex items-center gap-2 px-3 py-2 bg-etyme-canvas rounded-lg">
                <div className="w-6 h-6 rounded-full bg-etyme-action/10 text-etyme-action
                                text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {selectedConsultant.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-etyme-ink truncate">{selectedConsultant.name}</p>
                  <p className="text-[11px] text-etyme-faint truncate">{selectedConsultant.headline ?? selectedConsultant.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedConsultant(null); setSearchQuery('') }}
                  className="ml-auto text-etyme-muted hover:text-etyme-ink p-0.5"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* Search results dropdown */}
            {showDropdown && !selectedConsultant && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-etyme-rule rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectConsultant(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-etyme-canvas flex items-center gap-2
                               border-b border-etyme-rule/50 last:border-0 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-etyme-action/10 text-etyme-action
                                    text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-etyme-ink truncate">{c.name}</p>
                      <p className="text-[11px] text-etyme-faint truncate">{c.headline ?? c.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tier */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Tier *</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as 'RETAINED' | 'MARKETING')}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            >
              <option value="RETAINED">Retained</option>
              <option value="MARKETING">Marketing</option>
            </select>
          </div>

          {/* Rate range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Rate min ($/hr)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rateMin}
                onChange={(e) => setRateMin(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="e.g. 75"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Rate max ($/hr)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rateMax}
                onChange={(e) => setRateMax(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="e.g. 95"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !selectedConsultant} className="btn-primary disabled:opacity-50">
              {submitting ? 'Creating…' : 'Add to bench'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function BenchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [entries, setEntries] = useState<BenchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [burnData, setBurnData] = useState<BurnData | null>(null)
  const [burnLoading, setBurnLoading] = useState(true)

  // Open modal from ?new=1 link
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true)
      router.replace('/dashboard/bench')
    }
  }, [searchParams, router])

  const fetchBench = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bench?scope=company')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      const tiers = body.data?.tiers ?? {}

      // Flatten tiers into a single list
      const flat: BenchEntry[] = []
      for (const [tier, listings] of Object.entries(tiers)) {
        for (const l of listings as any[]) {
          flat.push({
            id: l.id,
            tier: tier as 'RETAINED' | 'MARKETING',
            consultantId: l.consultant.id,
            personId: l.consultant.personId,
            name: l.consultant.person.name,
            email: l.consultant.person.email,
            headline: l.consultant.headline,
            skills: l.consultant.skills ?? [],
            location: l.consultant.location,
            workAuth: l.consultant.workAuth,
            rateMin: l.rateMin ?? null,
            rateMax: l.rateMax ?? null,
            availableFrom: l.consultant.availableFrom,
            visibility: l.consultant.visibility,
            grantedAt: l.grantedAt,
          })
        }
      }

      setEntries(flat)
    } catch (err: any) {
      setError(err.message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBench()
  }, [fetchBench])

  // Fetch bench burn data (separate endpoint — requires cost permission)
  useEffect(() => {
    let cancelled = false
    async function fetchBurn() {
      setBurnLoading(true)
      try {
        const res = await fetch('/api/bench/burn')
        if (res.ok) {
          const body = await res.json()
          if (!cancelled) setBurnData(body.data ?? null)
        }
        // 403 = user lacks cost permission — silently hide the panel
      } catch {
        // Network error — silently hide
      } finally {
        if (!cancelled) setBurnLoading(false)
      }
    }
    fetchBurn()
    return () => { cancelled = true }
  }, [])

  // ── Filtered data ──────────────────────────────────

  const filtered = useMemo(() => {
    let result = entries
    if (tierFilter !== 'all') {
      result = result.filter((e) => e.tier === tierFilter)
    }
    if (availFilter !== 'all') {
      result = result.filter((e) => availabilityStatus(e.availableFrom).group === availFilter)
    }
    return result
  }, [entries, tierFilter, availFilter])

  // ── Stats ──────────────────────────────────────────

  const stats = useMemo(() => {
    const retained = entries.filter((e) => e.tier === 'RETAINED').length
    const marketing = entries.filter((e) => e.tier === 'MARKETING').length
    const availNow = entries.filter((e) => availabilityStatus(e.availableFrom).group === 'now').length
    const availSoon = entries.filter((e) => availabilityStatus(e.availableFrom).group === 'soon').length
    return { total: entries.length, retained, marketing, availNow, availSoon }
  }, [entries])

  // ── Columns ────────────────────────────────────────

  const columns: Column<BenchEntry>[] = [
    {
      key: 'name',
      label: 'Consultant',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-etyme-action/10 text-etyme-action
                            text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {row.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-etyme-ink truncate">{row.name}</p>
              <p className="text-[11px] text-etyme-faint truncate">{row.headline ?? row.email}</p>
            </div>
          </div>
        </div>
      ),
      sortValue: (row) => row.name,
      width: 'min-w-[200px]',
    },
    {
      key: 'skills',
      label: 'Skills',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[240px]">
          {row.skills.slice(0, 3).map((s) => (
            <span key={s} className="chip chip--passive text-[9px]">{s}</span>
          ))}
          {row.skills.length > 3 && (
            <span className="text-[10px] text-etyme-faint">+{row.skills.length - 3}</span>
          )}
        </div>
      ),
      sortValue: (row) => row.skills[0] ?? '',
      hideOnMobile: true,
    },
    {
      key: 'workAuth',
      label: 'Work Auth',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted">{workAuthLabel(row.workAuth)}</span>
      ),
      sortValue: (row) => row.workAuth ?? '',
      hideOnMobile: true,
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted truncate max-w-[120px] block">
          {row.location ?? '—'}
        </span>
      ),
      sortValue: (row) => row.location ?? '',
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'Rate',
      align: 'right',
      render: (row) => (
        <span className="text-[12px] text-etyme-ink tabular-nums">
          {formatRate(row.rateMin, row.rateMax)}
        </span>
      ),
      sortValue: (row) => row.rateMin ?? row.rateMax ?? 0,
    },
    {
      key: 'availability',
      label: 'Available',
      render: (row) => {
        const status = availabilityStatus(row.availableFrom)
        return <span className={`text-[12px] ${status.cls}`}>{status.text}</span>
      },
      sortValue: (row) => row.availableFrom ? new Date(row.availableFrom).getTime() : Infinity,
    },
    {
      key: 'tier',
      label: 'Tier',
      render: (row) => (
        <span className={`chip text-[9px] ${row.tier === 'RETAINED' ? 'chip--verified' : 'chip--action'}`}>
          {row.tier === 'RETAINED' ? 'Retained' : 'Marketing'}
        </span>
      ),
      sortValue: (row) => row.tier,
    },
    {
      key: 'visibility',
      label: 'Status',
      render: (row) => {
        const { text, cls } = visibilityChip(row.visibility)
        return <span className={`chip text-[9px] ${cls}`}>{text}</span>
      },
      sortValue: (row) => row.visibility,
      hideOnMobile: true,
    },
  ]

  // ── Render ─────────────────────────────────────────

  function handleListingCreated(msg: string) {
    setToast({ message: msg, type: 'success' })
    setTimeout(() => setToast(null), 3500)
    fetchBench()
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="eyebrow mb-2">Procure</div>
          <h1 className="headline-serif text-heading text-etyme-ink mb-1">
            Bench
          </h1>
          <p className="text-body-sm text-etyme-muted">
            Your consultant bench — retained and marketing listings.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary mt-3 shrink-0">
          Add to bench
        </button>
      </div>

      {/* Stats row */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="Retained" value={stats.retained} tone="verified" />
          <StatChip label="Marketing" value={stats.marketing} tone="action" />
          <StatChip label="Available Now" value={stats.availNow} tone="verified" />
          <StatChip label="Available ≤14d" value={stats.availSoon} tone="attention" />
        </div>
      )}

      {/* Bench burn panel — visible only if the user has cost permission */}
      {burnData && burnData.benchSize > 0 && (
        <BenchBurnPanel data={burnData} />
      )}

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        selectable
        searchFilter={(row, q) =>
          row.name.toLowerCase().includes(q) ||
          row.email.toLowerCase().includes(q) ||
          row.skills.some((s) => s.toLowerCase().includes(q)) ||
          (row.headline?.toLowerCase().includes(q) ?? false) ||
          (row.location?.toLowerCase().includes(q) ?? false)
        }
        searchPlaceholder="Search by name, skill, location…"
        emptyMessage="No consultants on bench."
        emptyDetail="Import consultant data or add them manually to start building your bench."
        exportName="etyme-bench"
        bulkActions={(selected) => (
          <>
            <button
              onClick={() => {
                const count = selected.size
                setToast({ message: `Share ${count} consultant${count !== 1 ? 's' : ''} — coming soon`, type: 'success' })
                setTimeout(() => setToast(null), 3000)
              }}
              className="chip chip--action text-[10px] hover:opacity-80"
            >
              Share ({selected.size})
            </button>
            <button
              onClick={() => router.push('/dashboard/submissions?new=1')}
              className="chip chip--verified text-[10px] hover:opacity-80"
            >
              Submit ({selected.size})
            </button>
          </>
        )}
        filters={
          <div className="flex items-center gap-3 flex-wrap">
            {/* Tier filter */}
            <div className="flex items-center gap-1 bg-etyme-canvas rounded-md p-0.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'RETAINED', label: 'Retained' },
                { key: 'MARKETING', label: 'Marketing' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTierFilter(key as TierFilter)}
                  className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                    tierFilter === key
                      ? 'bg-white text-etyme-ink shadow-sm'
                      : 'text-etyme-muted hover:text-etyme-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Availability filter */}
            <div className="flex items-center gap-1 bg-etyme-canvas rounded-md p-0.5">
              {[
                { key: 'all', label: 'Any' },
                { key: 'now', label: 'Now' },
                { key: 'soon', label: '≤14d' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setAvailFilter(key as AvailFilter)}
                  className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                    availFilter === key
                      ? 'bg-white text-etyme-ink shadow-sm'
                      : 'text-etyme-muted hover:text-etyme-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(tierFilter !== 'all' || availFilter !== 'all') && (
              <button
                onClick={() => { setTierFilter('all'); setAvailFilter('all') }}
                className="text-[11px] text-etyme-action hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        }
      />

      {/* Add bench listing modal */}
      {showAddModal && (
        <AddBenchListingModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleListingCreated}
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

// ── Bench burn panel ────────────────────────────────

/**
 * Bench burn dashboard — the daily cost of having unplaced consultants.
 *
 * CLAUDE.md: "a vendor with 10 bench-paid consultants at $40/hr
 *             burns $3,200/day. Proactive matching reduces that to near-zero.
 *             This endpoint turns that abstract cost into a visible number."
 *
 * Decision surface: uses serif headline numbers, reasoning on click,
 * clay/attention tone for cost, verified/green for opportunities.
 */
function BenchBurnPanel({ data }: { data: BurnData }) {
  const [expanded, setExpanded] = useState(false)

  const fmtDollars = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString()}`
  const fmtDollarsFull = (n: number) => `$${n.toLocaleString()}`

  // Top 3 highest-cost bench sitters
  const topBurners = data.entries.slice(0, 3)

  return (
    <div className="panel mb-6 overflow-hidden">
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="stat-label text-[9px] mb-0.5">Bench Cost</div>
            <h3 className="text-base font-serif font-medium text-etyme-ink">
              Bench Burn
            </h3>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-etyme-action hover:underline"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>

        {/* Burn stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="stat-label text-[9px] mb-0.5">Daily Burn</div>
            <div className="text-2xl font-serif font-medium text-etyme-attention tabular-nums">
              {fmtDollarsFull(data.burn.daily)}
            </div>
            <div className="text-[10px] text-etyme-faint">per working day</div>
          </div>
          <div>
            <div className="stat-label text-[9px] mb-0.5">Weekly</div>
            <div className="text-xl font-serif font-medium text-etyme-ink tabular-nums">
              {fmtDollars(data.burn.weekly)}
            </div>
            <div className="text-[10px] text-etyme-faint">5-day week</div>
          </div>
          <div>
            <div className="stat-label text-[9px] mb-0.5">Monthly</div>
            <div className="text-xl font-serif font-medium text-etyme-ink tabular-nums">
              {fmtDollars(data.burn.monthly)}
            </div>
            <div className="text-[10px] text-etyme-faint">22 working days</div>
          </div>
          <div>
            <div className="stat-label text-[9px] mb-0.5">Total to Date</div>
            <div className="text-xl font-serif font-medium text-etyme-attention tabular-nums">
              {fmtDollars(data.burn.toDate)}
            </div>
            <div className="text-[10px] text-etyme-faint">since bench start</div>
          </div>
        </div>

        {/* Tier breakdown */}
        <div className="flex items-center gap-6 text-[12px]">
          <div className="flex items-center gap-1.5">
            <span className="chip chip--verified text-[9px]">Retained</span>
            <span className="text-etyme-muted">
              {data.retained.count} · {fmtDollarsFull(data.retained.dailyBurn)}/day
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="chip chip--action text-[9px]">Marketing</span>
            <span className="text-etyme-muted">
              {data.marketing.count} · {fmtDollarsFull(data.marketing.dailyBurn)}/day
            </span>
          </div>
          {data.openRequirements > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-etyme-verified font-medium">
                {data.openRequirements} open req{data.openRequirements !== 1 ? 's' : ''}
              </span>
              <span className="text-etyme-faint">for matching</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: top bench sitters by cost */}
      {expanded && topBurners.length > 0 && (
        <div className="border-t border-etyme-rule">
          <div className="px-5 py-3">
            <div className="stat-label text-[9px] mb-2">Highest Daily Cost</div>
            <div className="space-y-2">
              {topBurners.map((e, i) => (
                <div key={e.personId} className="flex items-center gap-3 text-[12px]">
                  <span className="w-4 text-etyme-faint font-mono text-[10px]">{i + 1}</span>
                  <div className="w-6 h-6 rounded-full bg-etyme-attention/10 text-etyme-attention
                                  text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                    {e.personName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-etyme-ink">{e.personName}</span>
                    {e.headline && (
                      <span className="text-etyme-faint ml-1.5 hidden md:inline">· {e.headline}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 tabular-nums">
                    <span className="text-etyme-muted">
                      {compact(e.payRate)}/hr
                    </span>
                    <span className="text-etyme-attention font-medium">
                      {fmtDollarsFull(e.dailyCost)}/day
                    </span>
                    <span className="text-etyme-faint text-[11px] hidden md:inline">
                      {e.daysOnBench}d on bench
                    </span>
                    <span className="text-etyme-attention/70 text-[11px] hidden lg:inline">
                      {fmtDollars(e.totalBurnToDate)} burned
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Visual burn bar */}
      {data.burn.daily > 0 && (
        <div className="border-t border-etyme-rule px-5 py-3">
          <div className="flex items-center gap-2 text-[10px] text-etyme-faint mb-1">
            <span>Retained share of daily burn</span>
          </div>
          <div className="h-2 rounded-full bg-etyme-canvas overflow-hidden flex">
            <div
              className="h-full bg-etyme-verified rounded-l-full transition-all"
              style={{ width: `${Math.round((data.retained.dailyBurn / data.burn.daily) * 100)}%` }}
            />
            <div
              className="h-full bg-etyme-action rounded-r-full transition-all"
              style={{ width: `${Math.round((data.marketing.dailyBurn / data.burn.daily) * 100)}%` }}
            />
          </div>
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
