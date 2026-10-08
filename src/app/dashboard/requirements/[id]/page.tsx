'use client'

import { readJson } from '@/lib/read-response'
import { sectionOfHref } from '@/lib/page-framing'
import { usePageSection } from '@/components/page-section'

import { useEffect, useState, useCallback } from 'react'
import { range } from '@/lib/money-display'
import { statusWord, stageWordFor, stageReason, sourceWord, jobListWord } from '../words'
import { useSession } from '@/components/session-provider'
import { mayEdit } from '@/lib/requisition-stage'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { JobMatches } from './matches'

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
  /** Where the work is, where this reader may know it. */
  endClientCompany?: { id: string; name: string } | null
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
  const { company } = useSession()
  // The word this reader's menu uses for the list — "Job requests" on a
  // client's, the supplier's own word on a supplier's (`lib/page-framing`).
  const listWord = jobListWord(company?.kind).plural
  // The heading is the section of the list this page was opened from, on
  // the reader's own menu; whose job it is moves under the title.
  const listHref = company?.kind === 'CLIENT' ? '/dashboard/requisitions' : '/dashboard/requirements'
  const section = usePageSection(listHref)
  const [requirement, setRequirement] = useState<Requirement | null>(null)
  // Whether this reader raised the job — the matches route answers it.
  const [raiser, setRaiser] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDistribute, setShowDistribute] = useState(false)
  const [distributeResult, setDistributeResult] = useState<string | null>(null)
  const [passing, setPassing] = useState(false)

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
        setRaiser(!!matchBody.data?.viewer?.raiser)
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

  /**
   * A job sent to this firm, sent on to its own suppliers.
   *
   * The prime was shown the release form on the client's job, filled it
   * in, and was refused at the door — only the raising company releases
   * a job. The chain's own way is the prime recording the job as its own,
   * where the work is known, and releasing that to its suppliers; their
   * people come back to the prime, who puts them forward on the client's
   * job. The client's bill range is not copied: what the prime pays below
   * it is the prime's own number, set per supplier when it sends the job.
   */
  const passOn = async () => {
    if (!requirement) return
    setPassing(true)
    setDistributeResult(null)
    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: requirement.title,
          skills: requirement.skills,
          location: requirement.location,
          months: requirement.months,
          startDate: requirement.startDate,
          endClientCompanyId: requirement.endClientCompany?.id ?? requirement.company.id,
        }),
      })
      const body = await readJson(res)
      const id = body.data?.requirement?.id
      if (id) window.location.href = `/dashboard/requirements/${id}`
    } catch (err: any) {
      setDistributeResult(`Error: ${err.message}`)
      setPassing(false)
    }
  }

  // ── Loading / Error ────────────────────────────────

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="panel text-center py-16">
          <p className="text-body-sm text-etyme-muted">Loading job request…</p>
        </div>
      </div>
    )
  }

  if (error || !requirement) {
    return (
      <div className="animate-fade-in">
        <div className="mb-4">
          <Link href="/dashboard/requirements" className="text-[12px] text-etyme-action hover:underline">
            ← {listWord}
          </Link>
        </div>
        <div className="panel text-center py-16">
          <p className="text-sm text-etyme-danger">{error ?? 'Job request not found'}</p>
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
        {/* Back to the list this reader's menu opens, in its word. A
            client's menu opens its job requests at /dashboard/requisitions. */}
        <Link href={(company?.kind === 'CLIENT' ? '/dashboard/requisitions' : '/dashboard/requirements') as any} className="text-[12px] text-etyme-action hover:underline">
          ← {listWord}
        </Link>
      </div>

      {/* Requirement header — decision surface */}
      <div className="panel mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {section && <div className="eyebrow mb-2">{section}</div>}
            <h1 className="headline-serif text-heading text-etyme-ink mb-1">
              {requirement.title}
            </h1>
            <p className="text-[13px] text-etyme-muted mb-2">{requirement.company.name}</p>
            {/* A sentence, not a code. Somebody who opens a role that was
                withdrawn should read why on the way in, rather than find
                out by submitting into it. */}
            {stoppedBecause && (
              <p className="text-[12px] text-etyme-muted">
                {requirement.status === 'CANCELLED'
                  ? `${requirement.company.name} withdrew this job — ${stoppedBecause}`
                  : `This job request is archived — ${stoppedBecause}.`}
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
              Read what was submitted
            </Link>
            {/* A button the role will refuse is a button that lies. The
                status column still says OPEN on a job the client put
                away, so both of these were offered on a dead role —
                matching against it and sending it to more suppliers.
                `mayEdit` is the one place that decides what is past
                working on. */}
            {/* The raiser while the role is live; a supplier it was sent to
                while it is open, matching its own pool against it. */}
            {/* Only the company that raised the job sends it out. A prime
                reading a client's job was shown this form, filled it in and
                was refused at the door; it works its own suppliers through
                the bench they offer it instead. */}
            {requirement.status === 'OPEN' && mayEdit(requirement) && raiser && (
              <button
                onClick={() => setShowDistribute(true)}
                className="btn-primary text-[12px] px-4 py-1.5"
              >
                Send to suppliers
              </button>
            )}
            {/* A firm the job was sent to passes it on through its own
                record of it, never through the client's release form. */}
            {requirement.status === 'OPEN' && !raiser && company?.kind !== 'CLIENT' && (
              <button
                onClick={passOn}
                disabled={passing}
                className="btn-primary text-[12px] px-4 py-1.5 disabled:opacity-50"
              >
                {passing ? 'Opening…' : 'Send to your own suppliers'}
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
          <DetailField label="How it came in" value={sourceWord(requirement.source)} />
          {requirement.marginClass && (
            <DetailField label="Margin" value={requirement.marginClass === 'EXPERTISE' ? 'Expertise' : 'Arbitrage'} />
          )}
        </div>
      </div>

      {/* Match results — the decision surface. Your own people first,
          then your suppliers', then the other firms you work with, and on a
          client's own job request the suggestions from firms that are not
          a supplier yet (`lib/match-pool`). The one section both job
          request pages draw (`JobMatches`). */}
      <JobMatches
        requirementId={requirement.id}
        requirementSkills={requirement.skills}
        mayRun={
          (((requirement.status === 'OPEN' || requirement.status === 'DRAFT') && mayEdit(requirement)) ||
            (requirement.status === 'OPEN' && !raiser))
        }
      />

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
  // The section the reader's own menu puts job requests under, never a
  // typed "Sell" a client would read (lib/page-framing).
  const { company } = useSession()
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
    // This company's own suppliers, and nobody else — never the whole
    // directory, which offered a client the sub-vendors its primes keep
    // to themselves. The release door refuses anybody else too.
    fetch('/api/suppliers')
      .then((r) => (r.ok ? r.json() : { data: { suppliers: [] } }))
      .then((body) => {
        const suppliers = (body.data?.suppliers ?? []) as any[]
        setVendors(
          suppliers
            .filter((s) => !s.blocked)
            .map((s) => ({ id: s.companyId, name: s.name, kind: 'VENDOR' }))
        )
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
      setError('Choose at least one supplier.')
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-etyme-rule px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="eyebrow">{company?.kind ? sectionOfHref(company.kind, '/dashboard/requirements') ?? '' : ''}</p>
            <h2 className="text-[16px] font-semibold text-etyme-ink">Send this job to suppliers</h2>
          </div>
          <button onClick={onClose} className="text-etyme-faint hover:text-etyme-ink text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Requirement being distributed */}
          <div className="panel bg-etyme-canvas">
            <p className="text-[11px] text-etyme-faint mb-0.5">Sending</p>
            <p className="text-[13px] font-medium text-etyme-ink">{requirementTitle}</p>
          </div>

          {/* Vendor selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-medium text-etyme-ink">
                Choose suppliers <span className="text-etyme-attention">*</span>
              </label>
              <button
                onClick={selectAll}
                className="text-[11px] text-etyme-action hover:underline"
              >
                Select all ({vendors.length})
              </button>
            </div>
            {loadingVendors ? (
              <p className="text-[12px] text-etyme-muted py-4 text-center">Reading your suppliers…</p>
            ) : vendors.length === 0 ? (
              <p className="text-[12px] text-etyme-muted py-4 text-center">No suppliers on file yet. Add one from Suppliers first.</p>
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
              ? 'Sending…'
              : `Send to ${selectedVendors.size} supplier${selectedVendors.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
