'use client'

import { readJson } from '@/lib/read-response'
import Link from 'next/link'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'
import { rate as showRate } from '@/lib/money-display'
import { useSession } from '@/components/session-provider'
import { hasPermission } from '@/lib/permissions'
import { pageFraming } from '@/lib/page-framing'
import { recall, remember } from '@/lib/remember'
import { ProposeInterviewDialog } from '@/components/propose-interview'

/**
 * Submissions working surface — the vendor's outbound pipeline.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Direction toggle: sent (default — "what we submitted to clients")
 *   vs received ("what other vendors submitted to our requirements").
 *
 * Status lifecycle: SUBMITTED → SHORTLISTED → INTERVIEW → OFFERED → PLACED
 *   or → REJECTED / WITHDRAWN at any point.
 */

// ── Types ────────────────────────────────────────────

/** A round, as much of it as both sides of the trade may read. */
interface RoundBrief {
  id: string
  round: number
  state: string
  outcome: string | null
  scheduledAt: string | null
}

interface Submission {
  id: string
  person: { id: string; name: string }
  requirement: { id: string; title: string; skills: string[] }
  fromCompany: { id: string; name: string }
  toCompany: { id: string; name: string }
  kind: 'INTERNAL' | 'BENCH' | 'NETWORK'
  rate: number
  status: string
  submittedAt: string
  forwardedAt: string | null
  forwardedVia: string | null
  forwardedToEmail: string | null
  /** Rounds so far, oldest first. Absent on an older cached response. */
  interviews?: RoundBrief[]
}

type StatusFilter = 'ALL' | 'SUBMITTED' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFERED' | 'PLACED' | 'REJECTED' | 'WITHDRAWN'
type DirectionFilter = 'sent' | 'received'
/** The list of valid stored values, so a stale one is ignored not obeyed. */
const DIRECTIONS: readonly DirectionFilter[] = ['sent', 'received']

// ── Where a candidate is, and what the client does next ───────────

/**
 * The interview step, from the client's side.
 *
 * The model has had rounds since it existed and the route that books one
 * was walked end to end in the integration test. No screen called it, so
 * a hiring manager looking at a candidate they wanted to meet had nothing
 * to click — which is the same as not having built it.
 *
 * One rule, read off the rounds already on the row:
 *   nobody in yet              → ask for the first
 *   the last one said advance  → ask for the next, by number
 *   the last one is still open → say who it is waiting on, and do not
 *                                offer a button that would double-book
 *   offered, rejected, closed  → nothing; the status already says it
 *
 * A round that was called off or missed is not ahead of anybody, so it
 * does not hold up the next one. The route refuses the same cases in the
 * same words, so a stale page cannot book what the screen would not.
 */
const CLOSED = ['PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']

/** What a round that has not been decided is waiting on, in the trade's words. */
const WAITING_ON: Record<string, string> = {
  PROPOSED: 'waiting on the supplier',
  CONFIRMED: 'booked',
  DONE: 'waiting on your decision',
}

type Move =
  | { kind: 'propose'; round: number }
  | { kind: 'waiting'; round: number; words: string }
  | { kind: 'none' }

// Pinned by __tests__/invariants/client-interviews.test.ts, which reads
// this function out of the file and runs it. Plain JavaScript in the
// body, deliberately — no types, no imports.
function nextMove(row: Submission, isClient: boolean): Move {
  if (!isClient) return { kind: 'none' }
  if (CLOSED.indexOf(row.status) !== -1) return { kind: 'none' }

  const rounds = row.interviews || []
  if (rounds.length === 0) return { kind: 'propose', round: 1 }

  let latest = rounds[0]
  for (const r of rounds) if (r.round > latest.round) latest = r

  if (!latest.outcome) {
    if (latest.state === 'PROPOSED' || latest.state === 'CONFIRMED') {
      return { kind: 'waiting', round: latest.round, words: WAITING_ON[latest.state] }
    }
    // Called off, or nobody turned up. Nothing is ahead of them.
    return { kind: 'propose', round: latest.round + 1 }
  }

  if (latest.outcome === 'ADVANCE') return { kind: 'propose', round: latest.round + 1 }

  // OFFER or REJECT. The status chip on the same row already says so.
  return { kind: 'none' }
}

// ── Status styling ───────────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    SUBMITTED:   'chip--action',
    SHORTLISTED: 'chip--attention',
    INTERVIEW:   'chip--action',
    OFFERED:     'chip--verified',
    PLACED:      'chip--verified',
    REJECTED:    'chip--danger',
    WITHDRAWN:   'chip--passive',
  }
  return map[status] ?? 'chip--passive'
}

function kindChipClass(kind: string): string {
  const map: Record<string, string> = {
    INTERNAL: 'chip--passive',
    BENCH:    'chip--action',
    NETWORK:  'chip--attention',
  }
  return map[kind] ?? 'chip--passive'
}

// ── Relative time helper ─────────────────────────────

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

// ── Submit to Requirement Modal ──────────────────────

interface RequirementOption {
  id: string
  title: string
  skills: string[]
  company: { id: string; name: string }
}

interface BenchConsultant {
  listingId: string
  personId: string
  name: string
  skills: string[]
}

function SubmitToRequirementModal({
  companyId,
  onClose,
  onCreated,
}: {
  companyId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [requirements, setRequirements] = useState<RequirementOption[]>([])
  const [consultants, setConsultants] = useState<BenchConsultant[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  const [form, setForm] = useState({
    requirementId: '',
    personId: '',
    rate: '',
    rateCurrency: 'USD',
    coverNote: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch open requirements and bench listings on mount
  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true)
      try {
        const [reqRes, benchRes] = await Promise.all([
          fetch('/api/requirements?status=OPEN&limit=50'),
          fetch('/api/bench?limit=100'),
        ])

        if (reqRes.ok) {
          const body = await reqRes.json()
          setRequirements(
            (body.data?.requirements ?? []).map((r: any) => ({
              id: r.id,
              title: r.title,
              skills: r.skills ?? [],
              company: r.company ?? { id: '', name: 'Unknown' },
            }))
          )
        }

        if (benchRes.ok) {
          const body = await benchRes.json()
          const tiers = body.data?.tiers ?? {}
          const all: BenchConsultant[] = []
          for (const tier of Object.values(tiers) as any[][]) {
            for (const listing of tier) {
              // Deduplicate by personId — a consultant may have multiple listings
              if (!all.some((c) => c.personId === listing.consultant?.personId)) {
                all.push({
                  listingId: listing.id,
                  personId: listing.consultant?.personId ?? listing.consultant?.person?.id,
                  name: listing.consultant?.person?.name ?? 'Unknown',
                  skills: listing.consultant?.skills ?? [],
                })
              }
            }
          }
          setConsultants(all)
        }
      } catch {
        // Options failed to load — form will show empty selects
      } finally {
        setLoadingOptions(false)
      }
    }
    loadOptions()
  }, [])

  // Selected items for match preview
  const selectedReq = requirements.find((r) => r.id === form.requirementId)
  const selectedConsultant = consultants.find((c) => c.personId === form.personId)

  // Compute skill overlap
  const reqSkills = selectedReq?.skills ?? []
  const conSkills = selectedConsultant?.skills ?? []
  const overlapSkills = reqSkills.filter((s) =>
    conSkills.some((cs) => cs.toLowerCase() === s.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const rateNum = parseFloat(form.rate)
    if (isNaN(rateNum) || rateNum <= 0) {
      setError('Rate must be a positive number')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: form.requirementId,
          personIds: [form.personId],
          rate: Math.round(rateNum * 100),
          fromCompanyId: companyId,
          rateCurrency: form.rateCurrency,
          coverNote: form.coverNote || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to submit')
        return
      }

      const body = await res.json()
      const results = body.data?.results ?? []
      const firstResult = results[0]

      if (firstResult?.status === 'error') {
        setError(firstResult.error)
        return
      }
      if (firstResult?.status === 'duplicate') {
        setError(firstResult.error)
        return
      }
      // Somebody else is already representing them at this client. Not an
      // error anybody made — the recruiter may well want to wait for the
      // hold to lapse, and the message says how long that is.
      if (firstResult?.status === 'held') {
        setError(firstResult.error)
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
      <div className="card w-full max-w-2xl mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Submit to requirement</h2>
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

        {loadingOptions ? (
          <div className="py-8 text-center text-sm text-etyme-faint animate-pulse">
            Loading requirements and consultants…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Requirement select */}
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Requirement *</label>
              <select
                required
                value={form.requirementId}
                onChange={(e) => setForm({ ...form, requirementId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="">Select a requirement…</option>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} — {r.company.name}
                  </option>
                ))}
              </select>
              {requirements.length === 0 && (
                <p className="text-[11px] text-etyme-faint mt-1">No open requirements found.</p>
              )}
            </div>

            {/* Consultant select */}
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Consultant *</label>
              <select
                required
                value={form.personId}
                onChange={(e) => setForm({ ...form, personId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="">Select a consultant…</option>
                {consultants.map((c) => (
                  <option key={c.personId} value={c.personId}>
                    {c.name}{c.skills.length > 0 ? ` — ${c.skills.slice(0, 3).join(', ')}` : ''}
                  </option>
                ))}
              </select>
              {consultants.length === 0 && (
                <p className="text-[11px] text-etyme-faint mt-1">
                  No bench listings found. Consultants must grant a bench listing first.
                </p>
              )}
            </div>

            {/* Match preview — shown when both are selected */}
            {selectedReq && selectedConsultant && (
              <div className="rounded-lg border border-etyme-rule bg-etyme-canvas px-4 py-3">
                <p className="text-[11px] font-semibold text-etyme-muted mb-2 uppercase tracking-wider">
                  Skill match
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] text-etyme-faint mb-1">Requirement skills</p>
                    <div className="flex flex-wrap gap-1">
                      {reqSkills.length > 0 ? reqSkills.map((skill) => (
                        <span
                          key={skill}
                          className={`chip ${
                            overlapSkills.some((o) => o.toLowerCase() === skill.toLowerCase())
                              ? 'chip--verified'
                              : 'chip--passive'
                          }`}
                        >
                          {skill}
                        </span>
                      )) : (
                        <span className="text-[11px] text-etyme-faint">No skills listed</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-etyme-faint mb-1">Consultant skills</p>
                    <div className="flex flex-wrap gap-1">
                      {conSkills.length > 0 ? conSkills.map((skill) => (
                        <span
                          key={skill}
                          className={`chip ${
                            overlapSkills.some((o) => o.toLowerCase() === skill.toLowerCase())
                              ? 'chip--verified'
                              : 'chip--passive'
                          }`}
                        >
                          {skill}
                        </span>
                      )) : (
                        <span className="text-[11px] text-etyme-faint">No skills listed</span>
                      )}
                    </div>
                  </div>
                  {reqSkills.length > 0 && conSkills.length > 0 && (
                    <p className="text-[11px] text-etyme-muted mt-1">
                      {overlapSkills.length} of {reqSkills.length} required skill{reqSkills.length !== 1 ? 's' : ''} matched
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Rate + Currency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-etyme-muted mb-1">Rate ($/hr) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                  placeholder="125"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-etyme-muted mb-1">Currency</label>
                <select
                  value={form.rateCurrency}
                  onChange={(e) => setForm({ ...form, rateCurrency: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                >
                  <option value="USD">USD</option>
                  <option value="CAD">CAD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Cover note */}
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Cover note</label>
              <textarea
                rows={3}
                value={form.coverNote}
                onChange={(e) => setForm({ ...form, coverNote: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg resize-y
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="Why this consultant is a good fit for this role."
              />
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit consultant'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Convert to Contract Modal ────────────────────────


// ── Send on ────────────────────────────────────────────────

/**
 * Sending a candidate onward.
 *
 * The route was built and nothing in the product could reach it, which is
 * the same as not having built it. This is the state 2017 called
 * client_submission: a sub-vendor puts somebody forward to a prime, and
 * the prime either sends them to the client or sits on them. Without the
 * button nobody can answer the question every consultant asks — have they
 * actually submitted me, or am I in a spreadsheet.
 *
 * Two ways out, exactly as 2017 had them. The next party is on Etyme, so
 * the hop becomes a real submission with its own rate and its own
 * decision. Or they are not, and it is recorded as emailed, to whom and
 * when — which is worth as much, because the consultant can be told.
 */
function SendOnModal({
  submission,
  onClose,
  onSent,
}: {
  submission: Submission
  onClose: () => void
  onSent: (said: string) => void
}) {
  const [via, setVia] = useState<'ONWARD' | 'EMAIL'>('ONWARD')
  const [companies, setCompanies] = useState<{ id: string; name: string; kind: string }[]>([])
  const [toCompanyId, setToCompanyId] = useState('')
  const [email, setEmail] = useState('')
  // Shown and typed in dollars; sent in cents.
  const [rate, setRate] = useState(String(submission.rate / 100))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((b) => {
        const all = b.data?.companies ?? []
        setCompanies(
          all.filter(
            (c: any) =>
              c.id !== submission.toCompany.id && c.id !== submission.fromCompany.id
          )
        )
      })
      .catch(() => {})
  }, [submission.toCompany.id, submission.fromCompany.id])

  const onwardCents = Math.round(Number(rate) * 100)
  const marginCents = onwardCents - submission.rate

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/submissions/${submission.id}/forward`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          via,
          toCompanyId: via === 'ONWARD' ? toCompanyId : null,
          email: via === 'EMAIL' ? email : null,
          rate: onwardCents,
        }),
      })
      const body = await readJson(res)
      onSent(
        body.data?.message ??
          `${submission.person.name} sent on to ${body.data?.to ?? 'them'}.`
      )
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  const ready = via === 'ONWARD' ? toCompanyId !== '' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="headline-serif mb-1 text-[18px] text-etyme-ink">Send on</h3>
        <p className="mb-4 text-[12px] text-etyme-muted">
          {submission.fromCompany.name} put {submission.person.name} in front of
          you at {showRate(submission.rate)}. Where does it go next?
        </p>

        <div className="mb-4 flex rounded-md bg-etyme-canvas p-0.5">
          {(['ONWARD', 'EMAIL'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVia(v)}
              className={`flex-1 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
                via === v ? 'bg-white text-etyme-ink shadow-sm' : 'text-etyme-muted'
              }`}
            >
              {v === 'ONWARD' ? 'They are on Etyme' : 'By email'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {via === 'ONWARD' ? (
            <div>
              <label className="eyebrow mb-1 block">Send to</label>
              <select
                value={toCompanyId}
                onChange={(e) => setToCompanyId(e.target.value)}
                className="w-full rounded-md border border-etyme-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
              >
                <option value="">Pick a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.kind.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="eyebrow mb-1 block">Their email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hiring.manager@client.com"
                className="w-full rounded-md border border-etyme-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
              />
              <p className="mt-1 text-[11px] text-etyme-faint">
                Recorded as sent, to whom and when — so the consultant can be
                told, and so it is not your word against theirs later.
              </p>
            </div>
          )}

          <div>
            <label className="eyebrow mb-1 block">Rate you send it on at ($/hr)</label>
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full rounded-md border border-etyme-rule px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
            />
            {/* Said out loud, because the onward rate never travels back
                down the chain and the person who sent it to you will never
                see this number. */}
            <p className="mt-1 text-[11px] text-etyme-faint">
              {marginCents > 0
                ? `${showRate(marginCents)} yours. ${submission.fromCompany.name} does not see this.`
                : marginCents === 0
                  ? 'Passed on at the same rate — nothing in it for you.'
                  : `That is ${showRate(Math.abs(marginCents))} below what you were quoted.`}
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-etyme-attention">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-[13px] text-etyme-muted hover:text-etyme-ink">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={busy || !ready}
            className="rounded-md bg-etyme-action px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send on'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConvertToContractModal({
  submission,
  converting,
  onClose,
  onConvert,
}: {
  submission: Submission
  converting: boolean
  onClose: () => void
  onConvert: (billRate: number, startDate: string, payRate?: number) => void
}) {
  // Dollars, because that is what the field says and what onConvert
  // multiplies back up. Seeded from cents, one click made a $130/hr
  // submission into a $13,000/hr contract.
  const [billRate, setBillRate] = useState(submission.rate / 100)
  const [payRate, setPayRate] = useState('')
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
        <h3 className="headline-serif text-[18px] text-etyme-ink mb-4">
          Convert to contract
        </h3>

        <div className="mb-4 px-3 py-2 bg-etyme-canvas rounded-lg">
          <p className="text-[12px] text-etyme-muted">
            <span className="font-medium text-etyme-ink">{submission.person.name}</span>
            {' → '}
            {submission.toCompany.name}
            {' · '}
            {showRate(submission.rate)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {submission.requirement.title}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="eyebrow mb-1 block">Bill rate ($/hr) *</label>
            <input
              type="number"
              step="0.01"
              value={billRate}
              onChange={(e) => setBillRate(Number(e.target.value))}
              className="w-full px-3 py-2 border border-etyme-rule rounded-md text-sm
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
            />
          </div>

          <div>
            <label className="eyebrow mb-1 block">Pay rate ($/hr, optional)</label>
            <input
              type="number"
              step="0.01"
              value={payRate}
              onChange={(e) => setPayRate(e.target.value)}
              placeholder="Leave blank for sell-only contract"
              className="w-full px-3 py-2 border border-etyme-rule rounded-md text-sm
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20
                         placeholder:text-etyme-faint"
            />
          </div>

          <div>
            <label className="eyebrow mb-1 block">Start date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-etyme-rule rounded-md text-sm
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
            />
          </div>

          {billRate > 0 && payRate && Number(payRate) > 0 && (
            <div className="px-3 py-2 bg-emerald-50 rounded-lg text-[12px]">
              <span className="text-etyme-verified font-medium">
                Margin: ${(billRate - Number(payRate)).toFixed(2)}/hr
                ({((1 - Number(payRate) / billRate) * 100).toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={converting}
            className="btn-secondary flex-1 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConvert(billRate, startDate, payRate ? Number(payRate) : undefined)}
            disabled={converting || billRate <= 0 || !startDate}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {converting ? 'Creating…' : 'Create contract'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function SubmissionsPage() {
  const { company, permissions } = useSession()
  const isClient = company?.kind === 'CLIENT'
  // Setting up a round is for whoever is hiring — the permission that
  // raises a requisition. The AP clerk is a party and is not the one
  // interviewing; the route refuses them, so the button is not offered.
  const mayInterview = isClient && hasPermission(permissions, 'requirements.write')
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'submissions')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Null until we know who is reading. A client whose list defaulted to
  // "Sent" saw an empty outbound pipeline they never use and clicked the
  // toggle every morning; a vendor's is the other way round. Resolved in
  // an effect below rather than here, because the seat arrives async.
  const [direction, setDirection] = useState<DirectionFilter | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [acting, setActing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [convertSubmission, setConvertSubmission] = useState<Submission | null>(null)
  const [sendOn, setSendOn] = useState<Submission | null>(null)
  // Who the client is asking to meet, and which round it will be.
  const [propose, setPropose] = useState<{ row: Submission; round: number } | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)

  const [companyId, setCompanyId] = useState<string | null>(null)

  // Read filters from URL params
  const urlRequirementId = searchParams.get('requirementId')

  // Open the submit modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowSubmitModal(true)
      router.replace('/dashboard/submissions', { scroll: false })
    }
  }, [searchParams, router])

  // Resolve the user's company from /api/me
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((body) => {
        const cid = body.data?.activeContext?.company?.id ?? body.data?.contexts?.[0]?.company?.id
        if (cid) setCompanyId(cid)
      })
      .catch(() => {})
  }, [])

  // Which way this list faces, and what they last chose.
  //
  // The default is the side of the trade they are on: a company that buys
  // contract labour reads submissions coming in, a company that supplies
  // it reads the ones going out. An MSP receives on its client's behalf,
  // so it reads inbound too.
  //
  // The default is only ever a starting point. The moment somebody
  // switches, that is the answer for them from then on — which is why the
  // stored choice wins over the company's kind, not the other way round.
  useEffect(() => {
    if (direction !== null || !companyId) return
    const facing: DirectionFilter =
      company?.kind === 'CLIENT' || company?.kind === 'MSP' ? 'received' : 'sent'
    setDirection(recall(`submissions.direction.${companyId}`, facing, DIRECTIONS))
  }, [direction, companyId, company?.kind])

  /** Switch the list, and keep the choice for next time. */
  const faceThisWay = useCallback(
    (next: DirectionFilter) => {
      setDirection(next)
      if (companyId) remember(`submissions.direction.${companyId}`, next)
    },
    [companyId]
  )

  const fetchSubmissions = useCallback(async () => {
    if (!companyId && !urlRequirementId) return
    // Nothing to ask for until we know which way the list faces.
    if (!urlRequirementId && direction === null) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (urlRequirementId) {
        // Filter by specific requirement — skip company/direction
        params.set('requirementId', urlRequirementId)
      } else {
        params.set('direction', direction!)
        params.set('companyId', companyId!)
      }
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/submissions?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setSubmissions(body.data?.submissions ?? [])
    } catch (err: any) {
      setError(err.message)
      setSubmissions([])
    } finally {
      setLoading(false)
    }
  }, [direction, statusFilter, companyId, urlRequirementId])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  // ── Bulk status change ────────────────────────────
  async function handleBulkStatus(selectedIds: Set<string>, newStatus: string) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    setActing(true)
    let succeeded = 0
    let failed = 0

    for (const id of ids) {
      try {
        const res = await fetch(`/api/submissions/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        if (res.ok) {
          succeeded++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setActing(false)
    const label = newStatus.charAt(0) + newStatus.slice(1).toLowerCase()
    const msg = failed > 0
      ? `${label}: ${succeeded} succeeded, ${failed} failed`
      : `${succeeded} submission${succeeded !== 1 ? 's' : ''} ${newStatus.toLowerCase()}`
    setToast({ message: msg, type: failed > 0 ? 'error' : 'success' })
    setTimeout(() => setToast(null), 3500)
    fetchSubmissions()
  }

  // ── Stats ──────────────────────────────────────────
  const stats = {
    total: submissions.length,
    submitted: submissions.filter((s) => s.status === 'SUBMITTED').length,
    shortlisted: submissions.filter((s) => s.status === 'SHORTLISTED').length,
    interview: submissions.filter((s) => s.status === 'INTERVIEW').length,
    placed: submissions.filter((s) => s.status === 'PLACED').length,
  }

  // ── Filter by status ──────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? submissions
    : submissions.filter((s) => s.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Submission>[] = [
    {
      key: 'person',
      label: 'Consultant',
      // The way into a person's rounds, now that Interviews has left the
      // client's menu. Without this the interviews page had nothing at
      // all pointing at it.
      render: (row) => (
        <div>
          <Link
            href={`/dashboard/interviews?submission=${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-etyme-action hover:underline"
          >
            {row.person.name}
          </Link>
          <p className="text-[11px] text-etyme-faint">{row.kind === 'INTERNAL' ? 'Internal' : row.fromCompany.name}</p>
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'requirement',
      label: 'Requirement',
      render: (row) => (
        <div className="max-w-[260px]">
          <p className="font-medium text-etyme-ink truncate">{row.requirement.title}</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {row.requirement.skills.slice(0, 2).map((skill) => (
              <span key={skill} className="chip chip--action">{skill}</span>
            ))}
            {row.requirement.skills.length > 2 && (
              <span className="chip chip--passive">+{row.requirement.skills.length - 2}</span>
            )}
          </div>
        </div>
      ),
      sortValue: (row) => row.requirement.title,
      width: 'min-w-[220px]',
    },
    {
      key: 'counterparty',
      label: direction === 'sent' ? 'Client' : 'From vendor',
      render: (row) => (
        <span className="text-etyme-ink">
          {direction === 'sent' ? row.toCompany.name : row.fromCompany.name}
        </span>
      ),
      sortValue: (row) => direction === 'sent' ? row.toCompany.name : row.fromCompany.name,
      hideOnMobile: true,
    },
    {
      key: 'kind',
      label: 'Kind',
      render: (row) => <span className={`chip ${kindChipClass(row.kind)}`}>{row.kind}</span>,
      sortValue: (row) => row.kind,
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'Rate',
      render: (row) => (
        // Stored in cents like every other money column. Printed raw it
        // read $13000/hr for a $130 submission — and the convert button
        // then multiplied that by a hundred again.
        <span className="tabular-nums">{showRate(row.rate)}</span>
      ),
      sortValue: (row) => row.rate,
      align: 'right' as const,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>
          {row.status === 'PLACED' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConvertSubmission(row)
              }}
              className="text-[10px] font-medium text-etyme-action hover:text-etyme-action/80
                         border border-etyme-action/30 rounded px-2 py-0.5 hover:bg-etyme-action/5
                         transition-colors whitespace-nowrap"
            >
              → Contract
            </button>
          )}

          {/* Only on what was sent to you, and only while it is still
              undecided. A candidate already answered has nowhere to go,
              and sending one twice puts the same name in front of the
              client twice. Never for a client: they are the end of the
              chain and have nobody to send anybody on to. */}
          {!isClient && direction === 'received' &&
            row.forwardedAt === null &&
            !['PLACED', 'REJECTED', 'WITHDRAWN'].includes(row.status) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSendOn(row)
                }}
                className="text-[10px] font-medium text-etyme-action hover:text-etyme-action/80
                           border border-etyme-action/30 rounded px-2 py-0.5 hover:bg-etyme-action/5
                           transition-colors whitespace-nowrap"
              >
                Send on →
              </button>
            )}

          {/* The interview step, client side only. A supplier does not
              book a round into its own client's diary — the route
              refuses it, and offering the button would teach otherwise.
              What is offered is read off the rounds already on the row,
              so nothing double-books. */}
          {(() => {
            const move = nextMove(row, mayInterview)
            if (move.kind === 'propose') {
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPropose({ row, round: move.round })
                  }}
                  className="text-[10px] font-medium text-etyme-action hover:text-etyme-action/80
                             border border-etyme-action/30 rounded px-2 py-0.5 hover:bg-etyme-action/5
                             transition-colors whitespace-nowrap"
                >
                  {move.round === 1 ? 'Interview' : `Round ${move.round}`}
                </button>
              )
            }
            if (move.kind === 'waiting') {
              return (
                <Link
                  href={`/dashboard/interviews?submission=${row.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-etyme-muted hover:text-etyme-ink whitespace-nowrap"
                >
                  Round {move.round} · {move.words}
                </Link>
              )
            }
            return null
          })()}

          {row.forwardedAt !== null && (
            <span
              className="chip chip--verified"
              title={
                row.forwardedToEmail
                  ? `Emailed to ${row.forwardedToEmail} on ${new Date(row.forwardedAt).toLocaleDateString()}`
                  : `Sent on ${new Date(row.forwardedAt).toLocaleDateString()}`
              }
            >
              Sent on
            </span>
          )}
        </div>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'submittedAt',
      label: 'Submitted',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums" title={new Date(row.submittedAt).toLocaleString()}>
          {timeAgo(row.submittedAt)}
        </span>
      ),
      sortValue: (row) => new Date(row.submittedAt).getTime(),
      align: 'right' as const,
      hideOnMobile: true,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Submission, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.requirement.title.toLowerCase().includes(q) ||
    row.requirement.skills.some((s) => s.toLowerCase().includes(q)) ||
    row.fromCompany.name.toLowerCase().includes(q) ||
    row.toCompany.name.toLowerCase().includes(q) ||
    row.kind.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'SHORTLISTED', label: 'Shortlisted' },
    { key: 'INTERVIEW', label: 'Interview' },
    { key: 'OFFERED', label: 'Offered' },
    { key: 'PLACED', label: 'Placed' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + direction toggle */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1>{framing.title}</h1>
          <p>
            {isClient
              ? framing.subtitle
              : direction === 'sent'
                ? 'Candidates submitted to client requirements. Track from submission through to placement.'
                : 'Candidates received from other vendors against your requirements.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:mt-3 md:shrink-0">
          {/* Submit button — a client receives candidates, never submits them */}
          {!isClient && (
            <button onClick={() => setShowSubmitModal(true)} className="btn-primary">
              + Submit
            </button>
          )}

          {/* Direction toggle — prototype segmented control */}
          <div className="flex bg-etyme-canvas rounded-md p-0.5">
            <button
              onClick={() => { faceThisWay('sent'); setStatusFilter('ALL') }}
              className={`px-4 py-2 text-[13px] font-medium rounded transition-colors ${
                direction === 'sent'
                  ? 'bg-white shadow-sm text-etyme-ink'
                  : 'text-etyme-muted hover:text-etyme-ink'
              }`}
            >
              Sent
            </button>
            <button
              onClick={() => { faceThisWay('received'); setStatusFilter('ALL') }}
              className={`px-4 py-2 text-[13px] font-medium rounded transition-colors ${
                direction === 'received'
                  ? 'bg-white shadow-sm text-etyme-ink'
                  : 'text-etyme-muted hover:text-etyme-ink'
              }`}
            >
              Received
            </button>
          </div>
        </div>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total</p>
          <p className="stat-value text-etyme-ink">{stats.total}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">submissions</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending</p>
          <p className={`stat-value ${stats.submitted > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {stats.submitted}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">awaiting review</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">In process</p>
          <p className={`stat-value ${(stats.shortlisted + stats.interview) > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {stats.shortlisted + stats.interview}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">shortlisted + interview</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Placed</p>
          <p className="stat-value text-etyme-verified">{stats.placed}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">placements</p>
        </div>
      </div>

      {/* Status filters — prototype filter-tab pattern */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {statusOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`filter-tab ${
              statusFilter === opt.key ? 'filter-tab--active' : 'filter-tab--inactive'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {said && (
        <div className="mb-4 rounded-md border border-etyme-rule bg-etyme-canvas px-4 py-3 text-[13px] text-etyme-ink">
          {said}
        </div>
      )}

      {/* Data table */}
      <DataTable<Submission>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, requirement, company, or status…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} submissions.` : 'No submissions yet.'}
        emptyDetail={
          statusFilter !== 'ALL'
            ? 'Try "All" to see every submission, or change the direction tab.'
            : direction === 'sent'
              ? 'Submit candidates from the Requirements page to see them here.'
              : 'Submissions from other vendors will appear here.'
        }
        onRowClick={(row) => router.push(`/dashboard/requirements/${row.requirement.id}` as any)}
        exportName={`submissions-${direction}`}
        selectable
        bulkActions={(selected) => (
          <>
            <button
              onClick={() => handleBulkStatus(selected, 'SHORTLISTED')}
              disabled={acting}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                         bg-etyme-attention text-white hover:bg-etyme-attention/90
                         transition-colors disabled:opacity-50"
            >
              {acting ? '…' : `Shortlist (${selected.size})`}
            </button>
            <button
              onClick={() => handleBulkStatus(selected, 'REJECTED')}
              disabled={acting}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                         border border-red-300 text-red-600
                         hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {acting ? '…' : `Reject (${selected.size})`}
            </button>
          </>
        )}
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
          {` · ${direction}`}
        </p>
      )}

      {/* Submit to Requirement modal */}
      {showSubmitModal && companyId && (
        <SubmitToRequirementModal
          companyId={companyId}
          onClose={() => setShowSubmitModal(false)}
          onCreated={() => {
            setToast({ message: 'Consultant submitted successfully', type: 'success' })
            setTimeout(() => setToast(null), 3500)
            fetchSubmissions()
          }}
        />
      )}

      {/* Convert to Contract modal */}
      {sendOn && (
        <SendOnModal
          submission={sendOn}
          onClose={() => setSendOn(null)}
          onSent={(text) => {
            setSaid(text)
            setSendOn(null)
            fetchSubmissions()
          }}
        />
      )}

      {/* Asking for a round. One form, shared with the interviews page,
          so the two cannot drift. It posts for itself and hands back the
          sentence the route wrote. */}
      {propose && (
        <ProposeInterviewDialog
          submissionId={propose.row.id}
          candidate={propose.row.person.name}
          round={propose.round}
          onCancel={() => setPropose(null)}
          onDone={(says) => {
            setPropose(null)
            setSaid(says)
            fetchSubmissions()
          }}
        />
      )}

      {convertSubmission && (
        <ConvertToContractModal
          submission={convertSubmission}
          converting={converting}
          onClose={() => setConvertSubmission(null)}
          onConvert={async (billRate, startDate, payRate) => {
            setConverting(true)
            try {
              const res = await fetch(`/api/submissions/${convertSubmission.id}/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  billRate: Math.round(billRate * 100), // dollars → cents
                  startDate,
                  ...(payRate ? { payRate: Math.round(payRate * 100) } : {}),
                }),
              })
              const body = await readJson(res)

              setToast({ message: body.data?.message ?? 'Contract created', type: 'success' })
              setTimeout(() => setToast(null), 3500)
              setConvertSubmission(null)
              fetchSubmissions()
            } catch (err: any) {
              setToast({ message: `Error: ${err.message}`, type: 'error' })
              setTimeout(() => setToast(null), 5000)
            } finally {
              setConverting(false)
            }
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success'
            ? 'bg-etyme-verified text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
