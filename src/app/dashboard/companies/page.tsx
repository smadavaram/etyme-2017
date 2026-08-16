'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Companies working surface — manage vendor, client, MSP, and GSI companies.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Eyebrow: "Operate" — companies are an operational concern.
 */

// ── Types ──────────────────────────────────────────────────

interface Company {
  id: string
  name: string
  slug: string
  kind: 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI'
  entityType: string | null
  domain: string | null
  domainVerified: boolean
  currency: string
  siteLiveAt: string | null
  networkVerifiedAt: string | null
  createdAt: string
}

interface Location {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string
  isRemote: boolean
  isPrimary: boolean
}

type KindFilter = 'ALL' | 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI'

// ── Kind chip mapping ─────────────────────────────────────

function kindChipClass(kind: Company['kind']): string {
  switch (kind) {
    case 'VENDOR': return 'chip--action'
    case 'CLIENT': return 'chip--verified'
    case 'MSP': return 'chip--attention'
    case 'GSI': return 'chip--passive'
  }
}

// ── Slug helper ───────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

// ── Toast ─────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-slide-up">
      <div className="bg-etyme-ink text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {message}
        <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Add Company Modal ─────────────────────────────────────

function AddCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    kind: 'VENDOR' as Company['kind'],
    entityType: '',
    domain: '',
    slug: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate slug from name
  useEffect(() => {
    setForm((prev) => ({ ...prev, slug: slugify(prev.name) }))
  }, [form.name])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error?.message ?? 'Failed to create company')
        return
      }

      const body = await res.json()
      const companyName = body.data?.company?.name ?? form.name
      onCreated(`${companyName} created successfully`)
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
          <h2 className="text-lg font-semibold">Add company</h2>
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
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Company name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Cloudepa Inc."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Kind *</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as Company['kind'] })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="VENDOR">Vendor</option>
                <option value="CLIENT">Client</option>
                <option value="MSP">MSP</option>
                <option value="GSI">GSI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Entity type</label>
              <input
                type="text"
                value={form.entityType}
                onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="LLC, Corp, GmbH…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Domain</label>
              <input
                type="text"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="cloudepa.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Slug</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                             text-etyme-muted"
                  placeholder="cloudepa-inc"
                />
              </div>
              {form.slug && (
                <p className="text-[10px] text-etyme-faint mt-1">{form.slug}.etyme.com</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Creating…' : 'Add company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Company Detail Drawer ─────────────────────────────────

interface TrustSignals {
  medianTenureMonths: number | null
  benchPayHonouredRate: number | null
  medianReplacementDays: number | null
  avgRateGrowthPercent: number | null
  activeBenchSize: number | null
  disclosureRate: number | null
}

function CompanyDrawer({ company, onClose }: { company: Company; onClose: () => void }) {
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [trustSignals, setTrustSignals] = useState<TrustSignals | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoadingLocations(true)
      try {
        // Fetch locations (all companies) + trust signals (vendors only) in parallel
        const fetches: Promise<Response | null>[] = [
          fetch(`/api/companies/${company.id}/locations`).catch(() => null),
        ]

        // Trust signals only apply to vendor companies (Addendum D §D.3.3)
        if (company.kind === 'VENDOR') {
          fetches.push(
            fetch(`/api/vendors/${company.id}/trust-signals`).catch(() => null)
          )
        }

        const [locRes, trustRes] = await Promise.all(fetches)

        if (locRes?.ok) {
          const body = await locRes.json()
          setLocations(body.data?.locations ?? [])
        }

        if (trustRes?.ok) {
          const body = await trustRes.json()
          if (body.data?.signals) {
            setTrustSignals(body.data.signals)
          }
        }
      } catch {
        // Silently fail — supplementary data
      } finally {
        setLoadingLocations(false)
      }
    }
    fetchData()
  }, [company.id, company.kind])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{company.name}</h2>
            <p className="text-[13px] text-etyme-muted mt-0.5">{company.slug}.etyme.com</p>
          </div>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Kind chip */}
          <div>
            <p className="eyebrow mb-2">Type</p>
            <span className={`chip ${kindChipClass(company.kind)}`}>{company.kind}</span>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="eyebrow mb-1">Domain</p>
              <p className="text-sm">{company.domain ?? 'Not set'}</p>
              {company.domain && (
                <span className={`chip mt-1 ${company.domainVerified ? 'chip--verified' : 'chip--attention'}`}>
                  {company.domainVerified ? 'Verified' : 'Unverified'}
                </span>
              )}
            </div>
            <div>
              <p className="eyebrow mb-1">Entity type</p>
              <p className="text-sm">{company.entityType ?? 'Not specified'}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Currency</p>
              <p className="text-sm">{company.currency}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Site live</p>
              <p className="text-sm">
                {company.siteLiveAt ? (
                  <span className="flex items-center gap-1.5">
                    <span className="evidence-dot" />
                    <span className="text-etyme-verified font-medium">Live</span>
                  </span>
                ) : (
                  <span className="text-etyme-faint">Pending</span>
                )}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1">Network verified</p>
              <p className="text-sm">
                {company.networkVerifiedAt ? (
                  <span className="flex items-center gap-1.5">
                    <span className="evidence-dot" />
                    <span className="text-etyme-verified font-medium">Yes</span>
                  </span>
                ) : (
                  <span className="text-etyme-faint">Not yet</span>
                )}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1">Created</p>
              <p className="text-sm tabular-nums">
                {new Date(company.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-etyme-rule" />

          {/* Locations */}
          <div>
            <p className="eyebrow mb-2">
              Locations
              {!loadingLocations && <span className="text-etyme-faint"> ({locations.length})</span>}
            </p>
            {loadingLocations ? (
              <p className="text-sm text-etyme-faint animate-pulse">Loading…</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-etyme-muted">No locations added</p>
            ) : (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <div key={loc.id} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-etyme-ink">
                        {loc.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {loc.isPrimary && (
                          <span className="chip chip--verified text-[10px]">Primary</span>
                        )}
                        {loc.isRemote && (
                          <span className="chip chip--action text-[10px]">Remote</span>
                        )}
                      </div>
                    </div>
                    {(loc.city || loc.state || loc.country) && (
                      <p className="text-[11px] text-etyme-muted mt-1">
                        {[loc.city, loc.state, loc.country].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {loc.address && (
                      <p className="text-[11px] text-etyme-faint mt-0.5">{loc.address}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trust Signals — Addendum D §D.3.3 (vendor companies only) */}
          {trustSignals && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-3">Trust signals</p>
                <div className="grid grid-cols-2 gap-3">
                  {trustSignals.medianTenureMonths != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Median tenure</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.medianTenureMonths}<span className="text-sm text-etyme-muted ml-0.5">mo</span></p>
                    </div>
                  )}
                  {trustSignals.benchPayHonouredRate != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Bench pay</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.benchPayHonouredRate}<span className="text-sm text-etyme-muted ml-0.5">%</span></p>
                    </div>
                  )}
                  {trustSignals.medianReplacementDays != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Re-placement</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.medianReplacementDays}<span className="text-sm text-etyme-muted ml-0.5">days</span></p>
                    </div>
                  )}
                  {trustSignals.avgRateGrowthPercent != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Rate growth</p>
                      <p className={`text-lg font-serif tabular-nums ${
                        trustSignals.avgRateGrowthPercent > 0 ? 'text-etyme-verified' :
                        trustSignals.avgRateGrowthPercent < 0 ? 'text-etyme-attention' :
                        ''
                      }`}>
                        {trustSignals.avgRateGrowthPercent > 0 ? '+' : ''}
                        {trustSignals.avgRateGrowthPercent}%
                      </p>
                    </div>
                  )}
                  {trustSignals.activeBenchSize != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Bench size</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.activeBenchSize}</p>
                    </div>
                  )}
                  {trustSignals.disclosureRate != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Disclosure</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.disclosureRate}<span className="text-sm text-etyme-muted ml-0.5">%</span></p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-etyme-faint mt-2 italic">
                  Addendum D §D.3.3: Trust signals replace disclosure as the measure of vendor quality.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function CompaniesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL')
  const [toast, setToast] = useState<string | null>(null)

  // Open the add modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAdd(true)
      router.replace('/dashboard/companies', { scroll: false })
    }
  }, [searchParams, router])

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/companies')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setCompanies(body.data?.companies ?? [])
    } catch (err: any) {
      setError(err.message)
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  // ── Filtered by kind ──────────────────────────────
  const filtered = useMemo(() => {
    if (kindFilter === 'ALL') return companies
    return companies.filter((c) => c.kind === kindFilter)
  }, [companies, kindFilter])

  // ── Stats ─────────────────────────────────────────
  const vendorCount = companies.filter((c) => c.kind === 'VENDOR').length
  const clientCount = companies.filter((c) => c.kind === 'CLIENT').length
  const mspCount = companies.filter((c) => c.kind === 'MSP').length
  const gsiCount = companies.filter((c) => c.kind === 'GSI').length

  // ── Column definitions ────────────────────────────
  const columns: Column<Company>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.name}</p>
          <p className="text-[11px] text-etyme-faint">{row.slug}.etyme.com</p>
        </div>
      ),
      sortValue: (row) => row.name,
      width: 'min-w-[200px]',
    },
    {
      key: 'slug',
      label: 'Slug',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] font-mono">{row.slug}</span>
      ),
      sortValue: (row) => row.slug,
      hideOnMobile: true,
    },
    {
      key: 'kind',
      label: 'Kind',
      render: (row) => (
        <span className={`chip ${kindChipClass(row.kind)}`}>{row.kind}</span>
      ),
      sortValue: (row) => row.kind,
    },
    {
      key: 'entityType',
      label: 'Entity type',
      render: (row) => (
        <span className="text-etyme-muted">{row.entityType ?? '—'}</span>
      ),
      sortValue: (row) => row.entityType ?? '',
      hideOnMobile: true,
    },
    {
      key: 'domain',
      label: 'Domain',
      render: (row) => (
        row.domain ? (
          <span className="text-sm text-etyme-ink">{row.domain}</span>
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) => row.domain ?? '',
      hideOnMobile: true,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => (
        <span className="text-[12px] tabular-nums text-etyme-muted">
          {new Date(row.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
      sortValue: (row) => new Date(row.createdAt).getTime(),
      hideOnMobile: true,
    },
  ]

  // ── Search filter ─────────────────────────────────
  const searchFilter = (row: Company, q: string) =>
    row.name.toLowerCase().includes(q) ||
    row.slug.toLowerCase().includes(q) ||
    (row.domain ?? '').toLowerCase().includes(q) ||
    (row.entityType ?? '').toLowerCase().includes(q) ||
    row.kind.toLowerCase().includes(q)

  // ── Filter tabs ───────────────────────────────────
  const filterTabs: { key: KindFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: companies.length },
    { key: 'VENDOR', label: 'Vendor', count: vendorCount },
    { key: 'CLIENT', label: 'Client', count: clientCount },
    { key: 'MSP', label: 'MSP', count: mspCount },
    { key: 'GSI', label: 'GSI', count: gsiCount },
  ]

  function handleCreated(msg: string) {
    setToast(msg)
    fetchCompanies()
  }

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + actions */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>Companies</h1>
          <p>Manage vendor, client, MSP, and GSI companies on the platform.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary mt-3 shrink-0">
          Add company
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap animate-fade-in">
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Total</p>
          <p className="stat-value text-etyme-ink">{companies.length}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">companies</p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Vendors</p>
          <p className="stat-value text-etyme-action">{vendorCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">staffing</p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">Clients</p>
          <p className="stat-value text-etyme-verified">{clientCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">enterprise</p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">MSP</p>
          <p className="stat-value text-etyme-attention">{mspCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">managed</p>
        </div>
        <div className="panel flex-1 min-w-[120px]">
          <p className="stat-label">GSI</p>
          <p className="stat-value text-etyme-ink">{gsiCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">integrators</p>
        </div>
      </div>

      {/* Data table with kind filter tabs */}
      <DataTable<Company>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by name, slug, or domain…"
        emptyMessage="No companies found."
        emptyDetail="Create your first company to get started."
        onRowClick={(row) => setSelected(row)}
        exportName="companies"
        defaultPageSize={20}
        filters={
          <div className="flex gap-1 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setKindFilter(tab.key)}
                className={`filter-tab ${kindFilter === tab.key ? 'filter-tab--active' : ''}`}
              >
                {tab.label}
                <span className="ml-1.5 text-[10px] tabular-nums opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
        }
      />

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} compan{filtered.length !== 1 ? 'ies' : 'y'}
          {kindFilter !== 'ALL' && ` (${kindFilter.toLowerCase()})`}
        </p>
      )}

      {/* Modals */}
      {showAdd && <AddCompanyModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      {selected && <CompanyDrawer company={selected} onClose={() => setSelected(null)} />}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  )
}
