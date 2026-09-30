'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback } from 'react'
import { range } from '@/lib/money-display'
import { statusWord, stageWordFor, stageReason } from '../words'
import { mayEdit } from '@/lib/requisition-stage'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MatchList, type MatchRow, type MatchViewerInfo } from './matches'

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
  // The other three columns a stage is read from. Archiving is a date
  // and never overwrites the status, so this page said "Published" about
  // a role the client had put away; approvalState is '' unless this firm
  // raised the role.
  approvalState: string
  archivedAt: string | null
  headcount: number
  cancelReason: string | null
  /** Published, but refusing submissions while the money is re-approved. */
  paused: boolean
  source: string
  marginClass: string | null
  rateVisible: boolean
  company: { id: string; name: string }
}

// ── Helpers ──────────────────────────────────────────

/**
 * The chip on the role itself.
 *
 * The word comes from the one list of words (`./words`) so the role's
 * own page cannot say "Open" while the list it was opened from says
 * "Published" about the same row; only the color is decided here.
 */
function statusChip(s: string): { cls: string; text: string } {
  const cls =
    s === 'OPEN' ? 'chip--verified'
    : s === 'FILLED' ? 'chip--action'
    : s === 'DRAFT' ? 'chip--attention'
    : 'chip--passive'
  return { cls, text: statusWord(s) }
}

/**
 * The same chip, read off where the role actually got to.
 *
 * `statusChip` above reads one column, and one column cannot answer the
 * question: archiving writes a date and deliberately leaves the status
 * alone, so a role the client had put away opened here reading
 * "Published". The word comes from `stageWordFor`, which is what the
 * list this page was opened from now uses, so the two cannot disagree
 * about the same row. Color still follows the word.
 */
function stageChip(r: Requirement): { cls: string; text: string } {
  const text = stageWordFor(r)
  // Waiting on somebody is the one tone the status table has no entry
  // for, because it is not a status.
  if (text === 'Paused' || text === 'Awaiting approval' || text === 'Needs changes') {
    return { cls: 'chip--attention', text }
  }
  // Otherwise the color comes off the same table as before, chosen by
  // the status the word stands for rather than by the column — a role
  // put away while still open is colored as closed, which is what it is.
  const base =
    text === statusWord('OPEN') ? 'OPEN'
    : text === statusWord('FILLED') ? 'FILLED'
    : text === statusWord('DRAFT') ? 'DRAFT'
    : 'CLOSED'
  return { cls: statusChip(base).cls, text }
}

function formatRate(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Not specified'
  return range(min, max)
}

// ── Page ─────────────────────────────────────────────

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [requirement, setRequirement] = useState<Requirement | null>(null)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [matchViewer, setMatchViewer] = useState<MatchViewerInfo | null>(null)
  const [matchBasis, setMatchBasis] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
        setMatchViewer(matchBody.data?.viewer ?? null)
        setMatchBasis(matchBody.data?.basis ?? null)
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

      const body = await readJson(res)

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

  const { cls: statusCls, text: statusText } = stageChip(requirement)
  // Why it was withdrawn, where somebody wrote one. The chip says
  // "Cancelled"; only the row can say the client's budget was cut.
  const stoppedBecause = stageReason(requirement)

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
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="eyebrow mb-2">{requirement.company.name}</div>
            <h1 className="headline-serif text-heading text-etyme-ink mb-2">
              {requirement.title}
            </h1>
            {/* A sentence, not a code. Somebody who opens a role that was
                withdrawn should read why on the way in, rather than find
                out by submitting into it. */}
            {stoppedBecause && (
              <p className="text-[12px] text-etyme-muted">
                {requirement.company.name} withdrew this job — {stoppedBecause}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${statusCls}`}>{statusText}</span>
            {/* What arrived, and what is worth reading. The buyer's half of
                the same job — matching finds people, screening decides
                which of the ones sent are worth an afternoon. */}
            <Link
              href={`/dashboard/requirements/${requirement.id}/pile` as any}
              className="btn-secondary text-[12px] px-4 py-1.5"
            >
              The pile
            </Link>
            {/* A button the role will refuse is a button that lies. The
                status column still says OPEN on a job the client put
                away, so both of these were offered on a dead role —
                matching against it and sending it to more suppliers.
                `mayEdit` is the one place that decides what is past
                working on. */}
            {/* The raiser while the role is live; a supplier it was sent to
                while it is open, matching its own pool against it. */}
            {(((requirement.status === 'OPEN' || requirement.status === 'DRAFT') && mayEdit(requirement)) ||
              (requirement.status === 'OPEN' && matchViewer != null && !matchViewer.raiser)) && (
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
                  'Run matching'
                )}
              </button>
            )}
            {requirement.status === 'OPEN' && mayEdit(requirement) && (
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

      {/* Match results — the decision surface. Since 2026-09-30 the pool
          is your own people first, then your suppliers', then the other
          firms you work with, and on a client's own job request the
          suggestions from firms that are not a supplier yet
          (`lib/match-pool`). Placed above Distribute on purpose: the
          question it answers is who is already available, before a job
          goes anywhere new. */}
      <div className="mb-4">
        <h2 className="headline-serif text-[18px] text-etyme-ink mb-1">
          Matches for this job
        </h2>
        <p className="text-[12px] text-etyme-muted max-w-[75ch]">
          {matchViewer?.buyer
            ? 'Available bench from your suppliers first, then from other firms you work with, then suggestions. Open a row to see why it fits.'
            : 'Your own people first, then the bench your suppliers and partners offered you. Open a row to see why it fits.'}
          {matchBasis ? ` ${matchBasis}` : ''}
        </p>
      </div>

      {/* Match result banner */}
      {matchResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          matchResult.startsWith('Error')
            ? 'bg-etyme-danger/10 border border-etyme-danger/30 text-etyme-danger'
            : 'bg-etyme-verified/10 border border-etyme-verified/30 text-etyme-verified'
        }`}>
          {matchResult}
        </div>
      )}

      {matches.length === 0 || !matchViewer ? (
        <div className="panel text-center py-12">
          <p className="text-sm text-etyme-ink font-medium mb-1">No matches yet</p>
          <p className="text-xs text-etyme-muted mb-4">
            Check who is available before this goes to anyone new.
          </p>
          {(requirement.status === 'OPEN' || requirement.status === 'DRAFT') && (
            <button
              onClick={() => handleRunMatching(false)}
              disabled={matching}
              className="btn-primary text-[13px] px-6 py-2"
            >
              {matching ? 'Matching…' : 'Run matching'}
            </button>
          )}
        </div>
      ) : (
        <MatchList
          requirementId={requirement.id}
          requirementSkills={requirement.skills}
          matches={matches}
          viewer={matchViewer}
          onChanged={fetchData}
        />
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
      // One band typed once, carried per vendor. The band lives on the
      // invitation, never on the requirement, so every recipient can be
      // offered a different number later without this screen changing.
      const res = await fetch(`/api/requisitions/${requirementId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendors: Array.from(selectedVendors).map((companyId) => ({
            companyId,
            payMin: payMin ? Number(payMin) : undefined,
            payMax: payMax ? Number(payMax) : undefined,
            message: message || undefined,
          })),
          expiresAt: new Date(expiresAt).toISOString(),
        }),
      })

      const body = await readJson(res)

      onSuccess(body.data?.message ?? `Sent to ${body.data?.summary?.sent ?? 0} vendor(s)`)
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
