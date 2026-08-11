'use client'

import { useEffect, useState, useCallback } from 'react'

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

interface ConsultantFilters {
  q: string
  skill: string
  workAuth: string
  tier: string
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
                <option value="">Select...</option>
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
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-etyme-rule
                         hover:bg-etyme-canvas transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-ink text-white
                         hover:bg-etyme-navy transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Add consultant'}
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-2">Contact</p>
            <p className="text-sm">{consultant.email}</p>
          </div>

          {/* Headline */}
          {consultant.headline && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-2">Headline</p>
              <p className="text-sm">{consultant.headline}</p>
            </div>
          )}

          {/* Skills */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-2">Skills</p>
            {consultant.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {consultant.skills.map((skill) => (
                  <span key={skill} className="pill bg-etyme-action/5 text-etyme-action">{skill}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-etyme-muted">No skills listed</p>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">Location</p>
              <p className="text-sm">{consultant.location ?? 'Not specified'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">Work auth</p>
              <p className="text-sm">{formatWorkAuth(consultant.workAuth)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">Tier</p>
              <p className="text-sm">{consultant.tier ?? 'Unset'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">Visibility</p>
              <span className={`pill text-[10px] ${
                consultant.visibility === 'VERIFIED' ? 'bg-emerald-50 text-etyme-verified' :
                consultant.visibility === 'FEED' ? 'bg-etyme-action/5 text-etyme-action' :
                'bg-etyme-canvas text-etyme-muted'
              }`}>
                {consultant.visibility}
              </span>
            </div>
          </div>

          {/* Availability */}
          {consultant.availableFrom && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">Available from</p>
              <p className="text-sm">{new Date(consultant.availableFrom).toLocaleDateString()}</p>
            </div>
          )}

          {/* Rate */}
          {consultant.rateMin != null && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">Rate range</p>
              <p className="text-sm tabular-nums">
                ${consultant.rateMin}/hr
                {consultant.rateMax != null && ` - $${consultant.rateMax}/hr`}
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
  const [filters, setFilters] = useState<ConsultantFilters>({ q: '', skill: '', workAuth: '', tier: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Consultant | null>(null)
  const [hasCostPermission, setHasCostPermission] = useState(false)

  const fetchConsultants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.q) params.set('q', filters.q)
      if (filters.skill) params.set('skill', filters.skill)
      if (filters.workAuth) params.set('workAuth', filters.workAuth)
      if (filters.tier) params.set('tier', filters.tier)

      const res = await fetch(`/api/consultants?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setConsultants(body.data?.consultants ?? [])
      setHasCostPermission(body.data?.permissions?.includes('consultants.cost') ?? false)
    } catch (err: any) {
      setError(err.message)
      setConsultants([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    const timer = setTimeout(fetchConsultants, 300) // debounce search
    return () => clearTimeout(timer)
  }, [fetchConsultants])

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Consultants</h1>
          <p className="text-sm text-etyme-muted mt-1">
            Your talent pool. Imported, retained, and marketing bench.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 text-sm font-medium rounded-lg border border-etyme-rule
                       hover:bg-white transition-colors text-etyme-muted cursor-not-allowed"
            title="CSV export coming soon"
            disabled
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-ink text-white
                       hover:bg-etyme-navy transition-colors"
          >
            Add consultant
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by name, email, or skill..."
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            />
          </div>

          {/* Skill filter */}
          <div className="w-40">
            <input
              type="text"
              placeholder="Skill filter"
              value={filters.skill}
              onChange={(e) => setFilters({ ...filters, skill: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            />
          </div>

          {/* Work auth filter */}
          <select
            value={filters.workAuth}
            onChange={(e) => setFilters({ ...filters, workAuth: e.target.value })}
            className="px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
          >
            <option value="">All work auth</option>
            <option value="US_CITIZEN">US Citizen</option>
            <option value="GC">Green Card</option>
            <option value="H1B">H-1B</option>
            <option value="OPT">OPT</option>
            <option value="EAD">EAD</option>
            <option value="TN">TN</option>
            <option value="L1">L-1</option>
          </select>

          {/* Tier filter */}
          <select
            value={filters.tier}
            onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
            className="px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
          >
            <option value="">All tiers</option>
            <option value="RETAINED">Retained</option>
            <option value="MARKETING">Marketing</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Could not load consultants: {error}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etyme-rule">
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Name</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Skills</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Location</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Work Auth</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Pay Rate</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Availability</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Tier</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-etyme-muted">
                    Loading consultants...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <p className="text-sm text-etyme-muted">No consultants found.</p>
                    <p className="text-xs text-etyme-muted/60 mt-1">
                      {filters.q || filters.skill || filters.workAuth || filters.tier
                        ? 'Try adjusting your filters, or clear them to see all consultants.'
                        : 'Import your team from CSV or add consultants one at a time.'}
                    </p>
                  </td>
                </tr>
              ) : (
                consultants.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="border-b border-etyme-rule last:border-0 hover:bg-etyme-canvas/50
                               cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-etyme-muted">{c.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {c.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="pill bg-etyme-action/5 text-etyme-action text-[10px]">{skill}</span>
                        ))}
                        {c.skills.length > 3 && (
                          <span className="pill bg-etyme-canvas text-etyme-muted text-[10px]">+{c.skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-etyme-muted">{c.location ?? '—'}</td>
                    <td className="px-6 py-3">
                      {c.workAuth ? (
                        <span className="pill bg-purple-50 text-etyme-purple text-[10px]">
                          {formatWorkAuth(c.workAuth)}
                        </span>
                      ) : (
                        <span className="text-etyme-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 tabular-nums">
                      {hasCostPermission ? (
                        c.rateMin != null ? (
                          <span>${c.rateMin}/hr</span>
                        ) : (
                          <span className="text-etyme-muted">—</span>
                        )
                      ) : (
                        <span className="text-etyme-muted text-xs italic">Restricted</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {c.availableFrom ? (
                        <span className="text-xs">
                          {new Date(c.availableFrom) <= new Date() ? (
                            <span className="flex items-center gap-1.5">
                              <span className="evidence-dot" />
                              Now
                            </span>
                          ) : (
                            new Date(c.availableFrom).toLocaleDateString()
                          )}
                        </span>
                      ) : (
                        <span className="text-etyme-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {c.tier ? (
                        <span className={`pill text-[10px] ${
                          c.tier === 'RETAINED'
                            ? 'bg-emerald-50 text-etyme-verified border border-emerald-200'
                            : 'bg-amber-50 text-etyme-attention border border-amber-200'
                        }`}>
                          {c.tier}
                        </span>
                      ) : (
                        <span className="text-etyme-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Count footer */}
      {!loading && consultants.length > 0 && (
        <p className="text-xs text-etyme-muted mt-3">
          Showing {consultants.length} consultant{consultants.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Modals */}
      {showAdd && <AddConsultantModal onClose={() => setShowAdd(false)} onCreated={fetchConsultants} />}
      {selected && <ConsultantDrawer consultant={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
