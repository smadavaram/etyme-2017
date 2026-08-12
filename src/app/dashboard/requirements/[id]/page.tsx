'use client'

import { useEffect, useState, useCallback } from 'react'
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
  if (min != null && max != null) return `$${min}–$${max}/hr`
  return `$${min ?? max}/hr`
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
          rate: requirement.billMin ?? 100, // fallback rate
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
          <span className={`chip ${statusCls}`}>{statusText}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-etyme-rule">
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

      {/* Match results — the decision surface */}
      <div className="mb-4">
        <h2 className="headline-serif text-[18px] text-etyme-ink mb-1">
          Bench matches
        </h2>
        <p className="text-[12px] text-etyme-muted">
          {matches.length} consultant{matches.length !== 1 ? 's' : ''} scored against this requirement.
          Click a row to see reasoning.
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="panel text-center py-12">
          <p className="text-sm text-etyme-muted">No matches computed yet.</p>
          <p className="text-xs text-etyme-faint mt-1">
            Matches are computed when the requirement is distributed to your company.
          </p>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
