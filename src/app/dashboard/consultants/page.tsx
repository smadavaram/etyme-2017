'use client'

import { useEffect, useState, useCallback } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Consultants working surface — the company's talent pool.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Consultants live on the sell side — retained and marketing bench.
 * The page surfaces availability, skills, work auth, and tier at a glance.
 * Row click opens a detail drawer (right-side slide).
 */

// ── Types ──────────────────────────────────────────────────

interface Consultant {
  id: string
  personId: string
  name: string
  email: string
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  availableFrom: string | null
  visibility: string
  tier: string | null
  rateMin: number | null
  rateMax: number | null
}

// ── Add Consultant Modal ───────────────────────────────────

function AddConsultantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    headline: '',
    skills: '',
    location: '',
    workAuth: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/consultants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          headline: form.headline || null,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          location: form.location || null,
          workAuth: form.workAuth || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error?.message ?? 'Failed to create consultant')
        return
      }

      onCreated()
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
          <h2 className="text-lg font-semibold">Add consultant</h2>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Full name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="jane@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Headline</label>
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Senior SAP BRIM Consultant"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Skills (comma-separated)</label>
            <input
              type="text"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="SAP BRIM, S/4HANA, ABAP, Revenue Accounting"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="Dallas, TX"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Work authorization</label>
              <select
                value={form.workAuth}
                onChange={(e) => setForm({ ...form, workAuth: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="">Select…</option>
                <option value="US_CITIZEN">US Citizen</option>
                <option value="GC">Green Card</option>
                <option value="H1B">H-1B</option>
                <option value="OPT">OPT</option>
                <option value="EAD">EAD</option>
                <option value="TN">TN</option>
                <option value="L1">L-1</option>
                <option value="GBP_SW">UK Skilled Worker</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Creating…' : 'Add consultant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Consultant Detail Drawer ───────────────────────────────

function ConsultantDrawer({ consultant, onClose }: { consultant: Consultant; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <h2 className="text-lg font-semibold">{consultant.name}</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact */}
          <div>
            <p className="eyebrow mb-2">Contact</p>
            <p className="text-sm">{consultant.email}</p>
          </div>

          {/* Headline */}
          {consultant.headline && (
            <div>
              <p className="eyebrow mb-2">Headline</p>
              <p className="text-sm">{consultant.headline}</p>
            </div>
          )}

          {/* Skills */}
          <div>
            <p className="eyebrow mb-2">Skills</p>
            {consultant.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {consultant.skills.map((skill) => (
                  <span key={skill} className="chip chip--action">{skill}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-etyme-muted">No skills listed</p>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="eyebrow mb-1">Location</p>
              <p className="text-sm">{consultant.location ?? 'Not specified'}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Work auth</p>
              <p className="text-sm">{formatWorkAuth(consultant.workAuth)}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Tier</p>
              <p className="text-sm">{consultant.tier ?? 'Unset'}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Visibility</p>
              <span className={`chip ${
                consultant.visibility === 'VERIFIED' ? 'chip--verified' :
                consultant.visibility === 'FEED' ? 'chip--action' :
                'chip--passive'
              }`}>
                {consultant.visibility}
              </span>
            </div>
          </div>

          {/* Availability */}
          {consultant.availableFrom && (
            <div>
              <p className="eyebrow mb-1">Available from</p>
              <p className="text-sm">{new Date(consultant.availableFrom).toLocaleDateString()}</p>
            </div>
          )}

          {/* Rate */}
          {consultant.rateMin != null && (
            <div>
              <p className="eyebrow mb-1">Rate range</p>
              <p className="text-sm tabular-nums">
                ${consultant.rateMin}/hr
                {consultant.rateMax != null && ` – $${consultant.rateMax}/hr`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────

function formatWorkAuth(auth: string | null): string {
  if (!auth) return 'Not specified'
  const labels: Record<string, string> = {
    US_CITIZEN: 'US Citizen',
    GC: 'Green Card',
    H1B: 'H-1B',
    OPT: 'OPT',
    EAD: 'EAD',
    TN: 'TN',
    L1: 'L-1',
    GBP_SW: 'UK Skilled Worker',
  }
  return labels[auth] ?? auth
}

// ── Page ───────────────────────────────────────────────────

export default function ConsultantsPage() {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Consultant | null>(null)
  const [hasCostPermission, setHasCostPermission] = useState(false)

  const fetchConsultants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/consultants')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      // API returns nested person object; flatten for the table
      const mapped = (body.data?.consultants ?? []).map((c: any) => ({
        ...c,
        name: c.person?.name ?? c.name ?? 'Unknown',
        email: c.person?.email ?? c.email ?? '',
        tier: c.listings?.[0]?.tier ?? c.tier ?? null,
        rateMin: c.listings?.[0]?.rateMin ?? c.rateMin ?? null,
        rateMax: c.listings?.[0]?.rateMax ?? c.rateMax ?? null,
      }))
      setConsultants(mapped)
      setHasCostPermission(body.data?.permissions?.includes('consultants.cost') ?? false)
    } catch (err: any) {
      setError(err.message)
      setConsultants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConsultants()
  }, [fetchConsultants])

  // ── Stats ──────────────────────────────────────────
  const retainedCount = consultants.filter((c) => c.tier === 'RETAINED').length
  const availableNow = consultants.filter(
    (c) => c.availableFrom && new Date(c.availableFrom) <= new Date()
  ).length

  // ── Column definitions ─────────────────────────────
  const columns: Column<Consultant>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.name}</p>
          <p className="text-[11px] text-etyme-faint">{row.email}</p>
        </div>
      ),
      sortValue: (row) => row.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'skills',
      label: 'Skills',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {row.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="chip chip--action">{skill}</span>
          ))}
          {row.skills.length > 3 && (
            <span className="chip chip--passive">+{row.skills.length - 3}</span>
          )}
        </div>
      ),
      sortable: false,
      hideOnMobile: true,
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => (
        <span className="text-etyme-muted">{row.location ?? '—'}</span>
      ),
      sortValue: (row) => row.location ?? '',
      hideOnMobile: true,
    },
    {
      key: 'workAuth',
      label: 'Work auth',
      render: (row) => (
        row.workAuth ? (
          <span className="chip chip--passive">{formatWorkAuth(row.workAuth)}</span>
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) => row.workAuth ?? '',
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'Pay rate',
      render: (row) => (
        hasCostPermission ? (
          row.rateMin != null ? (
            <span className="tabular-nums">
              ${row.rateMin}<span className="text-etyme-faint">/hr</span>
            </span>
          ) : (
            <span className="text-etyme-faint">—</span>
          )
        ) : (
          <span className="text-etyme-faint text-[11px] italic">Restricted</span>
        )
      ),
      sortValue: (row) => row.rateMin ?? 0,
      align: 'right' as const,
    },
    {
      key: 'availability',
      label: 'Availability',
      render: (row) => (
        row.availableFrom ? (
          new Date(row.availableFrom) <= new Date() ? (
            <span className="flex items-center gap-1.5">
              <span className="evidence-dot" />
              <span className="text-[12px] text-etyme-verified font-medium">Now</span>
            </span>
          ) : (
            <span className="text-[12px] tabular-nums text-etyme-muted">
              {new Date(row.availableFrom).toLocaleDateString()}
            </span>
          )
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) =>
        row.availableFrom ? new Date(row.availableFrom).getTime() : Infinity,
    },
    {
      key: 'tier',
      label: 'Tier',
      render: (row) => (
        row.tier ? (
          <span className={`chip ${
            row.tier === 'RETAINED' ? 'chip--verified' : 'chip--attention'
          }`}>
            {row.tier}
          </span>
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) => row.tier ?? '',
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Consultant, q: string) =>
    row.name.toLowerCase().includes(q) ||
    row.email.toLowerCase().includes(q) ||
    row.skills.some((s) => s.toLowerCase().includes(q)) ||
    (row.location ?? '').toLowerCase().includes(q) ||
    (row.headline ?? '').toLowerCase().includes(q) ||
    (row.workAuth ?? '').toLowerCase().includes(q)

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + actions */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Sell</p>
          <h1>Consultants</h1>
          <p>Your talent pool. Imported, retained, and marketing bench — with skills, availability, and work authorization at a glance.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary mt-3 shrink-0">
          Add consultant
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total</p>
          <p className="stat-value text-etyme-ink">{consultants.length}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">consultants</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Retained</p>
          <p className="stat-value text-etyme-verified">{retainedCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">on bench</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Available now</p>
          <p className={`stat-value ${availableNow > 0 ? 'text-etyme-verified' : 'text-etyme-ink'}`}>
            {availableNow}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">ready to deploy</p>
        </div>
      </div>

      {/* Data table */}
      <DataTable<Consultant>
        columns={columns}
        data={consultants}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by name, email, skill, location, or work auth…"
        emptyMessage="No consultants found."
        emptyDetail="Import your team from CSV or add consultants one at a time."
        onRowClick={(row) => setSelected(row)}
        exportName="consultants"
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && consultants.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {consultants.length} consultant{consultants.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Modals */}
      {showAdd && <AddConsultantModal onClose={() => setShowAdd(false)} onCreated={fetchConsultants} />}
      {selected && <ConsultantDrawer consultant={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
