'use client'

import { useEffect, useState, useCallback } from 'react'
import { range } from '@/lib/money-display'
import { useParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Requirement detail — the core revenue workflow.
 *
 * Vendor opens a requirement → sees AI match scores against their bench
 * → selects candidates → submits them.
 *
 * CLAUDE.md design system:
 *   Decision surfaces: "Prose, reasoning, confidence, calm. 3–10 items.
 *   Serif headlines, generous space. User decides well and leaves."
 *
 * UX Stress Test #5: "Progressive explanation — one line by default,
 *   reasoning on click."
 *
 * CLAUDE.md invariant: "Match scores always carry factors, basis,
 *   confidence and unknowns. A bare number is a bug."
 */

// ── Types ────────────────────────────────────────────

interface Requirement {
  id: string
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  months: number | null
  startDate: string | null
  status: string
  source: string
  marginClass: string | null
  rateVisible: boolean
  company: { id: string; name: string }
}

interface MatchFactor {
  label: string
  value: number
  weight: number
}

interface MatchResult {
  id: string
  score: number
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  factors: MatchFactor[]
  basis: string
  unknowns: string | null
  consultant: {
    id: string
    personId: string
    name: string
    headline: string | null
    skills: string[]
    location: string | null
    workAuth: string | null
    availability: string | null
  }
  computedAt: string
}

interface ExistingSubmission {
  personId: string
  status: string
}

// ── Helpers ──────────────────────────────────────────

function confidenceColor(c: string): string {
  switch (c) {
    case 'HIGH': return 'text-etyme-verified'
    case 'MODERATE': return 'text-etyme-attention'
    case 'LOW': return 'text-etyme-danger'
    default: return 'text-etyme-muted'
  }
}

function confidenceChip(c: string): { cls: string; text: string } {
  switch (c) {
    case 'HIGH': return { cls: 'chip--verified', text: 'High' }
    case 'MODERATE': return { cls: 'chip--attention', text: 'Moderate' }
    case 'LOW': return { cls: 'chip--danger', text: 'Low' }
    default: return { cls: 'chip--passive', text: c }
  }
}

function statusChip(s: string): { cls: string; text: string } {
  switch (s) {
    case 'OPEN': return { cls: 'chip--verified', text: 'Open' }
    case 'FILLED': return { cls: 'chip--action', text: 'Filled' }
    case 'CLOSED': return { cls: 'chip--passive', text: 'Closed' }
    case 'DRAFT': return { cls: 'chip--attention', text: 'Draft' }
    default: return { cls: 'chip--passive', text: s }
  }
}

function formatRate(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Not specified'
  return range(min, max)
}

function formatAvail(date: string | null): string {
  if (!date) return 'Unknown'
  const d = new Date(date)
  const now = new Date()
  const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Now'
  if (days <= 14) return `${days}d`
  return d.toLocaleDateString()
}

// ── Page ─────────────────────────────────────────────

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [requirement, setRequirement] = useState<Requirement | null>(null)
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [submissions, setSubmissions] = useState<ExistingSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<string | null>(null)
  const [showDistribute, setShowDistribute] = useState(false)
  const [distributeResult, setDistributeResult] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchResult, setMatchResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqRes, matchRes] = await Promise.all([
        fetch(`/api/requirements?id=${id}`),
        fetch(`/api/requirements/${id}/matches`),
      ])

      if (!reqRes.ok) {
        const body = await reqRes.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${reqRes.status}`)
      }

      const reqBody = await reqRes.json()
      // The requirements API returns a list — find ours
      const reqs = reqBody.data?.requirements ?? []
      const req = reqs.find((r: any) => r.id === id)
      if (req) setRequirement(req)

      if (matchRes.ok) {
        const matchBody = await matchRes.json()
        setMatches(matchBody.data?.matches ?? [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleExpand = (matchId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(matchId)) next.delete(matchId)
      else next.add(matchId)
      return next
    })
  }

  const toggleSelect = (personId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  const isAlreadySubmitted = (personId: string) =>
    submissions.some((s) => s.personId === personId)

  const handleSubmit = async () => {
    if (selected.size === 0 || !requirement) return
    setSubmitting(true)
    setSubmitResult(null)

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: requirement.id,
          personIds: Array.from(selected),
          // Cents, matching Submission.rate. Passing dollars here stored
          // a $1.10/hr submission for a $110/hr requirement.
          rate: requirement.billMin ?? 10_000,
          fromCompanyId: requirement.company.id, // placeholder
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Submission failed')
      }

      const results = body.data?.results ?? []
      const succeeded = results.filter((r: any) => r.status === 'created').length
      const duplicates = results.filter((r: any) => r.status === 'duplicate').length
      const failed = results.filter((r: any) => r.status === 'error').length

      setSubmitResult(
        `${succeeded} submitted${duplicates ? `, ${duplicates} already submitted` : ''}${failed ? `, ${failed} failed` : ''}`
      )
      setSelected(new Set())
      // Refresh to show updated state
      fetchData()
    } catch (err: any) {
      setSubmitResult(`Error: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRunMatching = async (forceRefresh = false) => {
    if (!requirement) return
    setMatching(true)
    setMatchResult(null)

    try {
      const res = await fetch(`/api/requirements/${requirement.id}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, forceRefresh }),
      })

      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Match engine failed')
      }

      setMatchResult(body.data?.message ?? `${body.data?.matchCount ?? 0} matches found`)
      // Refresh match data
      fetchData()
    } catch (err: any) {
      setMatchResult(`Error: ${err.message}`)
    } finally {
      setMatching(false)
    }
  }

  // ── Loading / Error ────────────────────────────────

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="panel text-center py-16">
          <p className="text-body-sm text-etyme-muted">Loading requirement…</p>
        </div>
      </div>
    )
  }

  if (error || !requirement) {
    return (
      <div className="animate-fade-in">
        <div className="mb-4">
          <Link href="/dashboard/requirements" className="text-[12px] text-etyme-action hover:underline">
            ← Back to requirements
          </Link>
        </div>
        <div className="panel text-center py-16">
          <p className="text-sm text-etyme-danger">{error ?? 'Requirement not found'}</p>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────

  const { cls: statusCls, text: statusText } = statusChip(requirement.status)

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard/requirements" className="text-[12px] text-etyme-action hover:underline">
          ← Requirements
        </Link>
      </div>

      {/* Requirement header — decision surface */}
      <div className="panel mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="eyebrow mb-2">{requirement.company.name}</div>
            <h1 className="headline-serif text-heading text-etyme-ink mb-2">
              {requirement.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`chip ${statusCls}`}>{statusText}</span>
            {/* What arrived, and what is worth reading. The buyer's half of
                the same role — matching finds people, screening decides
                which of the ones sent are worth an afternoon. */}
            <Link
              href={`/dashboard/requirements/${requirement.id}/pile` as any}
              className="btn-secondary text-[12px] px-4 py-1.5"
            >
              The pile
            </Link>
            {(requirement.status === 'OPEN' || requirement.status === 'DRAFT') && (
              <button
                onClick={() => handleRunMatching(matches.length > 0)}
                disabled={matching}
                className="btn-secondary text-[12px] px-4 py-1.5 flex items-center gap-1.5"
              >
                {matching ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-etyme-action/30 border-t-etyme-action rounded-full animate-spin" />
                    Matching…
                  </>
                ) : matches.length > 0 ? (
                  '↻ Re-match'
                ) : (
                  '🧠 Run AI matching'
                )}
              </button>
            )}
            {requirement.status === 'OPEN' && (
              <button
                onClick={() => setShowDistribute(true)}
                className="btn-primary text-[12px] px-4 py-1.5"
              >
                Distribute →
              </button>
            )}
          </div>
        </div>

        {/* Distribute result banner */}
        {distributeResult && (
          <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${
            distributeResult.startsWith('Error')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-emerald-50 border border-emerald-200 text-etyme-verified'
          }`}>
            {distributeResult}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-etyme-rule">
          <DetailField label="Skills" value={
            <div className="flex flex-wrap gap-1 mt-1">
              {requirement.skills.map((s) => (
                <span key={s} className="chip chip--passive text-[9px]">{s}</span>
              ))}
            </div>
          } />
          <DetailField label="Location" value={requirement.location ?? '—'} />
          <DetailField label="Rate" value={formatRate(requirement.billMin, requirement.billMax)} />
          <DetailField label="Duration" value={requirement.months ? `${requirement.months} months` : '—'} />
          {requirement.startDate && (
            <DetailField label="Start" value={new Date(requirement.startDate).toLocaleDateString()} />
          )}
          <DetailField label="Source" value={requirement.source} />
          {requirement.marginClass && (
            <DetailField label="Margin" value={requirement.marginClass === 'EXPERTISE' ? 'Expertise' : 'Arbitrage'} />
          )}
        </div>
      </div>

      {/* Submit bar — appears when candidates are selected */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-4 px-4 py-3 rounded-lg bg-etyme-action text-white
                        flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} candidate{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(new Set())}
              className="text-[12px] text-white/70 hover:text-white"
            >
              Clear
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-1.5 text-[12px] font-semibold bg-white text-etyme-action
                         rounded-md hover:bg-white/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : `Submit ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Submit result banner */}
      {submitResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          submitResult.startsWith('Error')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-emerald-50 border border-emerald-200 text-etyme-verified'
        }`}>
          {submitResult}
        </div>
      )}

      {/* Match results — the decision surface. Deliberately your own
          bench only (see match-engine.ts) and deliberately placed above
          Distribute: the question this answers is whether you already
          have somebody, before a role goes to anyone outside. */}
      <div className="mb-4">
        <h2 className="headline-serif text-[18px] text-etyme-ink mb-1">
          Your own bench, checked first
        </h2>
        <p className="text-[12px] text-etyme-muted">
          {matches.length} consultant{matches.length !== 1 ? 's' : ''} on your own bench, scored
          against this requirement — before it goes to anyone outside. Click a row to see reasoning.
        </p>
      </div>

      {/* Match result banner */}
      {matchResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          matchResult.startsWith('Error')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-emerald-50 border border-emerald-200 text-etyme-verified'
        }`}>
          {matchResult}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="panel text-center py-12">
          <div className="text-3xl mb-3">🧠</div>
          <p className="text-sm text-etyme-ink font-medium mb-1">No matches yet</p>
          <p className="text-xs text-etyme-muted mb-4">
            Check your own bench for a fit before this goes to anyone outside.
          </p>
          {(requirement.status === 'OPEN' || requirement.status === 'DRAFT') && (
            <button
              onClick={() => handleRunMatching(false)}
              disabled={matching}
              className="btn-primary text-[13px] px-6 py-2"
            >
              {matching ? 'Running match engine…' : 'Run AI matching'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => {
            const isExpanded = expanded.has(match.id)
            const isSelected = selected.has(match.consultant.personId)
            const alreadySubmitted = isAlreadySubmitted(match.consultant.personId)
            const { cls: confCls, text: confText } = confidenceChip(match.confidence)

            return (
              <div
                key={match.id}
                className={`panel transition-all ${
                  isSelected ? 'ring-2 ring-etyme-action ring-offset-1' : ''
                }`}
              >
                {/* Summary row — "one line by default" */}
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => toggleExpand(match.id)}
                >
                  {/* Select checkbox */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={alreadySubmitted}
                      onChange={() => toggleSelect(match.consultant.personId)}
                      className="rounded border-etyme-rule"
                    />
                  </div>

                  {/* Score circle */}
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                    font-serif text-[16px] font-medium tabular-nums
                    ${match.score >= 80 ? 'bg-etyme-verified/10 text-etyme-verified' :
                      match.score >= 60 ? 'bg-etyme-action/10 text-etyme-action' :
                      match.score >= 40 ? 'bg-etyme-attention/10 text-etyme-attention' :
                      'bg-etyme-canvas text-etyme-muted'}
                  `}>
                    {match.score}
                  </div>

                  {/* Consultant info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-etyme-ink">
                        {match.consultant.name}
                      </span>
                      <span className={`chip text-[9px] ${confCls}`}>{confText}</span>
                      {alreadySubmitted && (
                        <span className="chip chip--passive text-[9px]">Submitted</span>
                      )}
                    </div>
                    <p className="text-[11px] text-etyme-muted truncate">
                      {match.consultant.headline ?? match.consultant.skills.slice(0, 3).join(' · ')}
                    </p>
                  </div>

                  {/* Quick stats */}
                  <div className="hidden md:flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] text-etyme-faint">Location</div>
                      <div className="text-[12px] text-etyme-muted">{match.consultant.location ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-etyme-faint">Work Auth</div>
                      <div className="text-[12px] text-etyme-muted">{match.consultant.workAuth ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-etyme-faint">Available</div>
                      <div className="text-[12px] text-etyme-muted">{formatAvail(match.consultant.availability)}</div>
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <svg
                    width="16" height="16" viewBox="0 0 16 16"
                    className={`text-etyme-faint transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>

                {/* Expanded reasoning — "reasoning on click" (UX Stress Test #5) */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-etyme-rule animate-fade-in">
                    {/* Factor bars */}
                    <div className="mb-4">
                      <div className="eyebrow mb-2">Match factors</div>
                      <div className="space-y-2">
                        {(match.factors as MatchFactor[]).map((f, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-[120px] text-[11px] text-etyme-muted truncate">{f.label}</div>
                            <div className="flex-1 h-[6px] bg-etyme-rule/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  f.value >= 80 ? 'bg-etyme-verified/60' :
                                  f.value >= 50 ? 'bg-etyme-action/60' :
                                  'bg-etyme-attention/60'
                                }`}
                                style={{ width: `${f.value}%` }}
                              />
                            </div>
                            <div className="w-8 text-right text-[11px] font-medium text-etyme-ink tabular-nums">
                              {f.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Basis + unknowns */}
                    <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="eyebrow mb-1">Basis</div>
                        <p className="text-[12px] text-etyme-muted leading-relaxed">
                          {match.basis}
                        </p>
                      </div>
                      {match.unknowns && (
                        <div>
                          <div className="eyebrow mb-1">Unknowns</div>
                          <p className="text-[12px] text-etyme-muted leading-relaxed">
                            {match.unknowns}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Skills comparison */}
                    <div className="mt-4">
                      <div className="eyebrow mb-2">Skills</div>
                      <div className="flex flex-wrap gap-1">
                        {match.consultant.skills.map((skill) => {
                          const isMatch = requirement.skills.some(
                            (rs) => rs.toLowerCase() === skill.toLowerCase()
                          )
                          return (
                            <span
                              key={skill}
                              className={`chip text-[9px] ${
                                isMatch ? 'chip--verified' : 'chip--passive'
                              }`}
                            >
                              {skill}
                              {isMatch && ' ✓'}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    <p className="text-[10px] text-etyme-faint mt-3">
                      Computed {new Date(match.computedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Distribute modal */}
      {showDistribute && requirement && (
        <DistributeModal
          requirementId={requirement.id}
          requirementTitle={requirement.title}
          onClose={() => setShowDistribute(false)}
          onSuccess={(msg) => {
            setShowDistribute(false)
            setDistributeResult(msg)
          }}
        />
      )}
    </div>
  )
}

// ── Detail field ─────────────────────────────────────

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      {typeof value === 'string' ? (
        <p className="text-[13px] text-etyme-ink">{value}</p>
      ) : (
        value
      )}
    </div>
  )
}

// ── Distribute modal ────────────────────────────────

interface VendorOption {
  id: string
  name: string
  kind: string
}

function DistributeModal({
  requirementId,
  requirementTitle,
  onClose,
  onSuccess,
}: {
  requirementId: string
  requirementTitle: string
  onClose: () => void
  onSuccess: (message: string) => void
}) {
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [loadingVendors, setLoadingVendors] = useState(true)
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set())
  const [payMin, setPayMin] = useState('')
  const [payMax, setPayMax] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [message, setMessage] = useState('')
  const [distributing, setDistributing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default expiry: 14 days from now
  useEffect(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    setExpiresAt(d.toISOString().split('T')[0])
  }, [])

  // Fetch vendor companies
  useEffect(() => {
    fetch('/api/companies')
      .then((r) => (r.ok ? r.json() : { data: { companies: [] } }))
      .then((body) => {
        const companies = body.data?.companies ?? []
        // Show vendors and MSPs as distribution targets
        const opts = companies.filter(
          (c: any) => c.kind === 'VENDOR' || c.kind === 'MSP' || c.kind === 'GSI'
        )
        setVendors(opts)
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false))
  }, [])

  const toggleVendor = (id: string) => {
    setSelectedVendors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedVendors(new Set(vendors.map((v) => v.id)))
  }

  const handleDistribute = async () => {
    if (selectedVendors.size === 0) {
      setError('Select at least one vendor')
      return
    }
    if (!expiresAt) {
      setError('Expiry date is required')
      return
    }

    setDistributing(true)
    setError(null)

    try {
      const res = await fetch(`/api/requirements/${requirementId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toCompanyIds: Array.from(selectedVendors),
          payMin: payMin ? Number(payMin) : undefined,
          payMax: payMax ? Number(payMax) : undefined,
          expiresAt: new Date(expiresAt).toISOString(),
          message: message || undefined,
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Distribution failed')
      }

      onSuccess(body.data?.message ?? `Distributed to ${body.data?.distributed} vendor(s)`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDistributing(false)
    }
  }

  const kindChip = (kind: string) => {
    switch (kind) {
      case 'VENDOR': return 'chip--action'
      case 'MSP': return 'chip--attention'
      case 'GSI': return 'chip--verified'
      default: return 'chip--passive'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-etyme-rule px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="eyebrow">Sell</p>
            <h2 className="text-[16px] font-semibold text-etyme-ink">Distribute requirement</h2>
          </div>
          <button onClick={onClose} className="text-etyme-faint hover:text-etyme-ink text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Requirement being distributed */}
          <div className="panel bg-etyme-canvas">
            <p className="text-[11px] text-etyme-faint mb-0.5">Distributing</p>
            <p className="text-[13px] font-medium text-etyme-ink">{requirementTitle}</p>
          </div>

          {/* Vendor selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-medium text-etyme-ink">
                Select vendors <span className="text-etyme-attention">*</span>
              </label>
              <button
                onClick={selectAll}
                className="text-[11px] text-etyme-action hover:underline"
              >
                Select all ({vendors.length})
              </button>
            </div>
            {loadingVendors ? (
              <p className="text-[12px] text-etyme-muted py-4 text-center">Loading vendors…</p>
            ) : vendors.length === 0 ? (
              <p className="text-[12px] text-etyme-muted py-4 text-center">No vendor companies found</p>
            ) : (
              <div className="border border-etyme-rule rounded-lg max-h-48 overflow-y-auto">
                {vendors.map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-etyme-canvas/50 border-b border-etyme-rule last:border-b-0 ${
                      selectedVendors.has(v.id) ? 'bg-etyme-action/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedVendors.has(v.id)}
                      onChange={() => toggleVendor(v.id)}
                      className="rounded border-etyme-rule"
                    />
                    <span className="text-[12px] text-etyme-ink flex-1">{v.name}</span>
                    <span className={`chip text-[9px] ${kindChip(v.kind)}`}>{v.kind}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10px] text-etyme-faint mt-1">
              {selectedVendors.size} of {vendors.length} selected
            </p>
          </div>

          {/* Rate band — per CLAUDE.md: "Rate bands live on RequirementInvitation, never on Requirement" */}
          <div>
            <label className="block text-[12px] font-medium text-etyme-ink mb-2">
              Pay rate band <span className="text-[10px] text-etyme-faint font-normal">(optional, $/hr)</span>
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={payMin}
                  onChange={(e) => setPayMin(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 text-[13px] border border-etyme-rule rounded-lg focus:ring-1 focus:ring-etyme-action focus:border-etyme-action outline-none tabular-nums"
                />
              </div>
              <span className="flex items-center text-etyme-faint text-[12px]">to</span>
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="Max"
                  value={payMax}
                  onChange={(e) => setPayMax(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 text-[13px] border border-etyme-rule rounded-lg focus:ring-1 focus:ring-etyme-action focus:border-etyme-action outline-none tabular-nums"
                />
              </div>
            </div>
            <p className="text-[10px] text-etyme-faint mt-1">
              Each vendor sees only their own band — never another vendor's rate.
            </p>
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-[12px] font-medium text-etyme-ink mb-1">
              Expires <span className="text-etyme-attention">*</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-etyme-rule rounded-lg focus:ring-1 focus:ring-etyme-action focus:border-etyme-action outline-none"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-[12px] font-medium text-etyme-ink mb-1">
              Message <span className="text-[10px] text-etyme-faint font-normal">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Additional context for vendors…"
              className="w-full px-3 py-2 text-[13px] border border-etyme-rule rounded-lg focus:ring-1 focus:ring-etyme-action focus:border-etyme-action outline-none resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-etyme-rule px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-[12px]">
            Cancel
          </button>
          <button
            onClick={handleDistribute}
            disabled={distributing || selectedVendors.size === 0}
            className="btn-primary text-[12px] disabled:opacity-50"
          >
            {distributing
              ? 'Distributing…'
              : `Distribute to ${selectedVendors.size} vendor${selectedVendors.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
