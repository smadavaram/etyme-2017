'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact } from '@/lib/money-display'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface DrawerContract {
  id: string
  side: string
  state: string
  clientName: string | null
  rate: number
  startDate: string
  endDate: string | null
}

interface DrawerSubmission {
  id: string
  requirementTitle: string
  clientName: string
  state: string
  rate: number
  submittedAt: string
}

interface RateProgressionData {
  progression: Array<{
    date: string
    payRate: number | null
    billRate: number | null
    margin: number | null
    marginPercent: number | null
    contractType: string
    state: string
    client: string | null
    vendor: string | null
    currency: string
  }>
  summary: {
    totalPlacements: number
    firstRate: number | null
    currentRate: number | null
    rateGrowth: number | null
    currency: string
  }
}

function ConsultantDrawer({ consultant, onClose }: { consultant: Consultant; onClose: () => void }) {
  const [contracts, setContracts] = useState<DrawerContract[]>([])
  const [submissions, setSubmissions] = useState<DrawerSubmission[]>([])
  const [rateProgression, setRateProgression] = useState<RateProgressionData | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(true)

  useEffect(() => {
    async function fetchActivity() {
      setLoadingActivity(true)
      try {
        // Fetch sell + buy contracts, submissions, and rate progression in parallel
        const [sellRes, buyRes, submissionsRes, rateRes] = await Promise.all([
          fetch(`/api/contracts?side=sell&personId=${consultant.personId}`).catch(() => null),
          fetch(`/api/contracts?side=buy&personId=${consultant.personId}`).catch(() => null),
          fetch(`/api/submissions?personId=${consultant.personId}`).catch(() => null),
          fetch(`/api/consultants/${consultant.id}/rate-progression`).catch(() => null),
        ])

        const allContracts: DrawerContract[] = []

        // Show sell contracts (client engagements) — these are the meaningful ones
        if (sellRes?.ok) {
          const body = await sellRes.json()
          for (const c of body.data?.contracts ?? []) {
            allContracts.push({
              id: c.id,
              side: 'sell',
              state: c.state,
              clientName: c.clientCompany?.name ?? null,
              rate: c.billRate,
              startDate: c.startDate,
              endDate: c.endDate ?? null,
            })
          }
        }

        // Also add buy contracts that have a different context (bench/internal)
        if (buyRes?.ok) {
          const body = await buyRes.json()
          for (const c of body.data?.contracts ?? []) {
            // Only show bench/internal buy contracts — active buy contracts
            // paired with a sell contract are redundant in the drawer
            if (['BENCH_PAID', 'INTERNAL', 'TRAINING'].includes(c.state)) {
              allContracts.push({
                id: c.id,
                side: 'buy',
                state: c.state,
                clientName: c.state === 'BENCH_PAID' ? 'Bench' : c.state === 'TRAINING' ? 'Training' : 'Internal',
                rate: c.payRate,
                startDate: c.startDate,
                endDate: c.endDate ?? null,
              })
            }
          }
        }

        setContracts(allContracts)

        if (submissionsRes?.ok) {
          const body = await submissionsRes.json()
          const raw = body.data?.submissions ?? []
          setSubmissions(raw.slice(0, 5).map((s: any) => ({
            id: s.id,
            requirementTitle: s.requirement?.title ?? 'Unknown',
            clientName: s.toCompany?.name ?? s.fromCompany?.name ?? 'Unknown',
            state: s.status ?? s.state,
            rate: s.billRate,
            submittedAt: s.submittedAt ?? s.createdAt,
          })))
        }

        // Rate progression — Addendum D §D.3.3
        if (rateRes?.ok) {
          const body = await rateRes.json()
          if (body.data) {
            setRateProgression(body.data)
          }
        }
      } catch {
        // Silently fail — activity section is supplementary
      } finally {
        setLoadingActivity(false)
      }
    }
    fetchActivity()
  }, [consultant.personId])

  const activeContracts = contracts.filter(c =>
    ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'].includes(c.state)
  )
  const pastContracts = contracts.filter(c =>
    ['ENDED', 'CANCELLED'].includes(c.state)
  )

  function contractStateLabel(state: string): string {
    const labels: Record<string, string> = {
      IN_PROGRESS: 'Active',
      VERIFIED: 'Verified',
      PENDING_VERIFICATION: 'Pending',
      DRAFT: 'Draft',
      ENDED: 'Ended',
      CANCELLED: 'Cancelled',
      BENCH_PAID: 'Bench',
      PAUSED: 'Paused',
    }
    return labels[state] ?? state
  }

  function submissionStateChip(state: string): { label: string; cls: string } {
    switch (state) {
      case 'PLACED': return { label: 'Placed', cls: 'chip--verified' }
      case 'SHORTLISTED': return { label: 'Shortlisted', cls: 'chip--action' }
      case 'INTERVIEW': return { label: 'Interview', cls: 'chip--action' }
      case 'SUBMITTED': return { label: 'Submitted', cls: 'chip--attention' }
      case 'REJECTED': return { label: 'Rejected', cls: 'chip--passive' }
      case 'OFFERED': return { label: 'Offered', cls: 'chip--verified' }
      default: return { label: state, cls: 'chip--passive' }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{consultant.name}</h2>
            {consultant.headline && (
              <p className="text-[13px] text-etyme-muted mt-0.5">{consultant.headline}</p>
            )}
          </div>
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

          {/* Availability + Rate row */}
          <div className="grid grid-cols-2 gap-4">
            {consultant.availableFrom && (
              <div>
                <p className="eyebrow mb-1">Available from</p>
                <p className="text-sm">
                  {new Date(consultant.availableFrom) <= new Date() ? (
                    <span className="flex items-center gap-1.5">
                      <span className="evidence-dot" />
                      <span className="text-etyme-verified font-medium">Now</span>
                    </span>
                  ) : (
                    <span className="tabular-nums">{new Date(consultant.availableFrom).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
            )}
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

          {/* Divider */}
          <hr className="border-etyme-rule" />

          {/* Active Contracts */}
          <div>
            <p className="eyebrow mb-2">
              Active contracts
              {!loadingActivity && <span className="text-etyme-faint"> ({activeContracts.length})</span>}
            </p>
            {loadingActivity ? (
              <p className="text-sm text-etyme-faint animate-pulse">Loading…</p>
            ) : activeContracts.length === 0 ? (
              <p className="text-sm text-etyme-muted">No active contracts</p>
            ) : (
              <div className="space-y-2">
                {activeContracts.map(c => (
                  <div key={c.id} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-etyme-ink">
                        {c.clientName ?? 'Unknown'}
                      </span>
                      <span className="text-sm tabular-nums text-etyme-ink">
                        {compact(c.rate)}/hr
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="chip chip--verified text-[10px]">
                        {contractStateLabel(c.state)}
                      </span>
                      <span className="text-[11px] tabular-nums text-etyme-faint">
                        {new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past contracts */}
          {!loadingActivity && pastContracts.length > 0 && (
            <div>
              <p className="eyebrow mb-2">
                Past contracts <span className="text-etyme-faint">({pastContracts.length})</span>
              </p>
              <div className="space-y-1.5">
                {pastContracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm text-etyme-muted">
                    <span>{c.clientName ?? 'Unknown'}</span>
                    <span className="tabular-nums text-[12px]">
                      {new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rate Progression — Addendum D §D.3.3 */}
          {!loadingActivity && rateProgression && rateProgression.progression.length > 0 && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-2">
                  Rate progression
                  {rateProgression.summary.rateGrowth != null && (
                    <span className={`ml-2 text-[11px] font-medium ${
                      rateProgression.summary.rateGrowth > 0 ? 'text-etyme-verified' :
                      rateProgression.summary.rateGrowth < 0 ? 'text-etyme-attention' :
                      'text-etyme-muted'
                    }`}>
                      {rateProgression.summary.rateGrowth > 0 ? '+' : ''}
                      {rateProgression.summary.rateGrowth}%
                    </span>
                  )}
                </p>
                {/* Summary stat row */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {rateProgression.summary.firstRate != null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">First</p>
                      <p className="text-sm font-serif tabular-nums">{compact(rateProgression.summary.firstRate)}/hr</p>
                    </div>
                  )}
                  {rateProgression.summary.currentRate != null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Current</p>
                      <p className="text-sm font-serif tabular-nums font-medium">{compact(rateProgression.summary.currentRate)}/hr</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Placements</p>
                    <p className="text-sm font-serif tabular-nums">{rateProgression.summary.totalPlacements}</p>
                  </div>
                </div>
                {/* Timeline */}
                <div className="space-y-1.5">
                  {rateProgression.progression.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span className="tabular-nums text-etyme-faint w-[70px] shrink-0">
                        {new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                      <span className={`chip ${
                        p.state === 'IN_PROGRESS' ? 'chip--verified' :
                        p.state === 'ENDED' ? 'chip--passive' :
                        'chip--attention'
                      } text-[10px]`}>
                        {p.state === 'IN_PROGRESS' ? 'Active' : p.state === 'ENDED' ? 'Ended' : p.state}
                      </span>
                      {p.payRate != null && (
                        <span className="tabular-nums text-etyme-ink font-medium">
                          {compact(p.payRate)}/hr
                        </span>
                      )}
                      {p.billRate != null && (
                        <span className="tabular-nums text-etyme-faint">
                          (bill: {compact(p.billRate)})
                        </span>
                      )}
                      {p.client && (
                        <span className="text-etyme-muted truncate">{p.client}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Recent submissions */}
          {!loadingActivity && submissions.length > 0 && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-2">
                  Recent submissions <span className="text-etyme-faint">({submissions.length})</span>
                </p>
                <div className="space-y-2">
                  {submissions.map(s => {
                    const chip = submissionStateChip(s.state)
                    return (
                      <div key={s.id} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-etyme-ink truncate mr-2">
                            {s.requirementTitle}
                          </span>
                          <span className={`chip ${chip.cls} text-[10px] shrink-0`}>
                            {chip.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-etyme-muted">
                            {s.clientName}
                          </span>
                          {s.rate != null && s.rate > 0 && (
                            <span className="text-[11px] tabular-nums text-etyme-faint">
                              {compact(s.rate)}/hr
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Empty state for no activity */}
          {!loadingActivity && activeContracts.length === 0 && pastContracts.length === 0 && submissions.length === 0 && (
            <p className="text-sm text-etyme-faint text-center py-2">
              No contract or submission history yet.
            </p>
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Consultant | null>(null)
  const [hasCostPermission, setHasCostPermission] = useState(false)

  // Open the add modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAdd(true)
      router.replace('/dashboard/consultants', { scroll: false })
    }
  }, [searchParams, router])

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
