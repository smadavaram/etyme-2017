'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────

interface Requirement {
  id: string
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  months: number | null
  status: string
  source: string
  matchCount: number
  createdAt: string
}

type StatusFilter = 'ALL' | 'DRAFT' | 'OPEN' | 'FILLED' | 'CLOSED'

// ── New Requirement Modal ──────────────────────────────────

function NewRequirementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    skills: '',
    location: '',
    billMin: '',
    billMax: '',
    months: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          location: form.location || null,
          billMin: form.billMin ? parseInt(form.billMin) : null,
          billMax: form.billMax ? parseInt(form.billMax) : null,
          months: form.months ? parseInt(form.months) : null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create requirement')
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
          <h2 className="text-lg font-semibold">New requirement</h2>
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
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-border rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-blue/20 focus:border-etyme-blue"
              placeholder="Senior SAP BRIM Consultant — Remote"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Required skills (comma-separated)</label>
            <input
              type="text"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-border rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-blue/20 focus:border-etyme-blue"
              placeholder="SAP BRIM, Revenue Accounting, S/4HANA"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Bill min ($/hr)</label>
              <input
                type="number"
                value={form.billMin}
                onChange={(e) => setForm({ ...form, billMin: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-blue/20 focus:border-etyme-blue"
                placeholder="80"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Bill max ($/hr)</label>
              <input
                type="number"
                value={form.billMax}
                onChange={(e) => setForm({ ...form, billMax: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-blue/20 focus:border-etyme-blue"
                placeholder="120"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Duration (months)</label>
              <input
                type="number"
                value={form.months}
                onChange={(e) => setForm({ ...form, months: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-blue/20 focus:border-etyme-blue"
                placeholder="12"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-border rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-blue/20 focus:border-etyme-blue"
              placeholder="Remote / Dallas, TX / Hybrid"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-etyme-border
                         hover:bg-etyme-ground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-ink text-white
                         hover:bg-etyme-navy transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create requirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Status pill ────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-etyme-ground text-etyme-muted',
    OPEN: 'bg-etyme-blue/5 text-etyme-blue',
    FILLED: 'bg-emerald-50 text-etyme-green',
    CLOSED: 'bg-slate-100 text-etyme-muted',
  }
  return (
    <span className={`pill text-[10px] ${styles[status] ?? 'bg-etyme-ground text-etyme-muted'}`}>
      {status}
    </span>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function RequirementsPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showNew, setShowNew] = useState(false)

  const fetchRequirements = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/requirements?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setRequirements(body.data?.requirements ?? [])
    } catch (err: any) {
      setError(err.message)
      setRequirements([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchRequirements()
  }, [fetchRequirements])

  const statuses: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'DRAFT', label: 'Draft' },
    { key: 'OPEN', label: 'Open' },
    { key: 'FILLED', label: 'Filled' },
    { key: 'CLOSED', label: 'Closed' },
  ]

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Requirements</h1>
          <p className="text-sm text-etyme-muted mt-1">
            Open demand. Match, distribute, and track submissions.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-ink text-white
                     hover:bg-etyme-navy transition-colors"
        >
          New requirement
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-1 mb-6">
        {statuses.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              statusFilter === s.key
                ? 'bg-etyme-ink text-white'
                : 'text-etyme-muted hover:bg-etyme-ground border border-transparent hover:border-etyme-border'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Could not load requirements: {error}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etyme-border">
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Title</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Skills</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Bill Range</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Status</th>
                <th className="text-right px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Matches</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-etyme-muted">
                    Loading requirements...
                  </td>
                </tr>
              ) : requirements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <p className="text-sm text-etyme-muted">No requirements found.</p>
                    <p className="text-xs text-etyme-muted/60 mt-1">
                      {statusFilter !== 'ALL'
                        ? 'No requirements match this filter. Try "All" to see everything.'
                        : 'Create your first requirement to start matching consultants, or import requirements from your VMS.'}
                    </p>
                  </td>
                </tr>
              ) : (
                requirements.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-etyme-border last:border-0 hover:bg-etyme-ground/50
                               cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-medium">{r.title}</p>
                        {r.location && <p className="text-xs text-etyme-muted">{r.location}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {r.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="pill bg-etyme-blue/5 text-etyme-blue text-[10px]">{skill}</span>
                        ))}
                        {r.skills.length > 3 && (
                          <span className="pill bg-etyme-ground text-etyme-muted text-[10px]">+{r.skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 tabular-nums">
                      {r.billMin != null || r.billMax != null ? (
                        <span>
                          {r.billMin != null && `$${r.billMin}`}
                          {r.billMin != null && r.billMax != null && ' - '}
                          {r.billMax != null && `$${r.billMax}`}
                          <span className="text-etyme-muted">/hr</span>
                        </span>
                      ) : (
                        <span className="text-etyme-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {r.matchCount > 0 ? (
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="evidence-dot" />
                          {r.matchCount}
                        </span>
                      ) : (
                        <span className="text-etyme-muted">0</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-etyme-muted">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Count footer */}
      {!loading && requirements.length > 0 && (
        <p className="text-xs text-etyme-muted mt-3">
          Showing {requirements.length} requirement{requirements.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Placeholder notice */}
      <div className="mt-6 card bg-etyme-blue/5 border-etyme-blue/20">
        <p className="text-xs text-etyme-blue">
          <strong>Week 3 scope.</strong> The requirements API with Claude-powered parsing and matching is under development.
          This page will connect to <code className="font-mono">POST /api/requirements</code> once the API is ready.
        </p>
      </div>

      {/* Modal */}
      {showNew && <NewRequirementModal onClose={() => setShowNew(false)} onCreated={fetchRequirements} />}
    </>
  )
}
