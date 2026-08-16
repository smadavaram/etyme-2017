'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Invitations — demand arriving from a client.
 *
 * A decision surface, not a working one. CLAUDE.md:
 *   Decision surfaces: "Prose, reasoning, confidence, calm · 3–10 items ·
 *   Serif headlines, generous space · User decides well and leaves"
 *
 * The decision here is genuinely small — work it or decline it — but it is
 * the moment a vendor commits sourcing effort, so it is worth showing the
 * band, the deadline and how many others were asked before asking for an
 * answer.
 *
 * The band shown is this company's own. Another vendor invited to the same
 * requirement sees a different number and cannot see this one
 * (src/lib/invitation-visibility.ts).
 */

interface Invitation {
  id: string
  requirement: {
    id: string
    title: string
    skills: string[]
    location: string | null
    headcount: number
    months: number | null
    neededBy: string | null
    status: string
  }
  from: { id: string; name: string; slug: string }
  band: { payMin: number | null; payMax: number | null }
  message: string | null
  status: string
  expiresAt: string
  expired: boolean
  otherInviteeCount: number
  submittedCount: number
  createdAt: string
}

interface Summary {
  total: number
  awaitingResponse: number
  accepted: number
  declined: number
  expired: number
  openPositions: number
}

// ── Small shared pieces, per the prototype vocabulary ──────

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
      {children}
    </div>
  )
}

function Stat({ label, value, sub, tone = 'default' }: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'attention' | 'verified'
}) {
  const colour =
    tone === 'attention' ? 'text-etyme-attention'
    : tone === 'verified' ? 'text-etyme-verified'
    : 'text-etyme-ink'
  return (
    <div>
      <Lbl>{label}</Lbl>
      <div className={`font-serif text-3xl mt-1 tabular-nums ${colour}`}>{value}</div>
      {sub && <div className="text-xs text-etyme-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function Chip({ children, tone = 'passive' }: {
  children: React.ReactNode
  tone?: 'attention' | 'verified' | 'action' | 'passive'
}) {
  const tones = {
    attention: 'bg-etyme-attention/10 text-etyme-attention',
    verified: 'bg-etyme-verified/10 text-etyme-verified',
    action: 'bg-etyme-action/10 text-etyme-action',
    passive: 'bg-etyme-rule/50 text-etyme-muted',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

function money(cents: number | null): string {
  if (cents == null) return '—'
  return `$${Math.round(cents / 100)}`
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

// ── One invitation ─────────────────────────────────────────

function InvitationCard({ inv, onRespond }: {
  inv: Invitation
  onRespond: (id: string, action: 'accept' | 'decline', reason?: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const days = daysUntil(inv.expiresAt)
  const open = inv.status === 'SENT'
  const accepted = inv.status === 'ACCEPTED'

  async function act(action: 'accept' | 'decline') {
    setBusy(true)
    setError(null)
    try {
      await onRespond(inv.id, action, action === 'decline' ? reason : undefined)
    } catch (e: any) {
      setError(e.message ?? 'Could not send your answer')
    } finally {
      setBusy(false)
      setDeclining(false)
    }
  }

  return (
    <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Lbl>{inv.from.name}</Lbl>
          <h3 className="font-serif text-xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">
            {inv.requirement.title}
          </h3>
          <div className="text-sm text-etyme-muted mt-1">
            {inv.requirement.headcount} position{inv.requirement.headcount === 1 ? '' : 's'}
            {inv.requirement.location && ` · ${inv.requirement.location}`}
            {inv.requirement.months && ` · ${inv.requirement.months} months`}
          </div>
        </div>
        <div className="shrink-0">
          {accepted && <Chip tone="verified">Working it</Chip>}
          {inv.status === 'DECLINED' && <Chip>Declined</Chip>}
          {inv.status === 'EXPIRED' && <Chip>Closed</Chip>}
          {open && (
            <Chip tone={days <= 3 ? 'attention' : 'action'}>
              {days <= 0 ? 'Closes today' : `${days} day${days === 1 ? '' : 's'} left`}
            </Chip>
          )}
        </div>
      </div>

      {/* Your band — the number this vendor may actually work to. */}
      <div className="mt-5 flex flex-wrap items-end gap-8 border-t border-etyme-rule pt-4">
        <div>
          <Lbl>Your rate band</Lbl>
          <div className="font-serif text-2xl text-etyme-ink mt-1 tabular-nums">
            {inv.band.payMin == null && inv.band.payMax == null
              ? <span className="text-etyme-faint text-base">Not stated</span>
              : `${money(inv.band.payMin)}–${money(inv.band.payMax)}`}
            {(inv.band.payMin != null || inv.band.payMax != null) && (
              <span className="text-sm text-etyme-muted font-sans">/hr</span>
            )}
          </div>
        </div>
        <div>
          <Lbl>Also asked</Lbl>
          <div className="font-serif text-2xl text-etyme-ink mt-1 tabular-nums">
            {inv.otherInviteeCount}
          </div>
          <div className="text-xs text-etyme-muted">
            {inv.otherInviteeCount === 0
              ? 'you alone'
              : inv.otherInviteeCount === 1 ? 'other vendor' : 'other vendors'}
          </div>
        </div>
        <div>
          <Lbl>You have submitted</Lbl>
          <div className="font-serif text-2xl text-etyme-ink mt-1 tabular-nums">
            {inv.submittedCount}
          </div>
        </div>
      </div>

      {inv.requirement.skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {inv.requirement.skills.map(s => <Chip key={s}>{s}</Chip>)}
        </div>
      )}

      {inv.message && (
        <p className="mt-4 text-sm text-etyme-muted italic border-l-2 border-etyme-rule pl-3">
          {inv.message}
        </p>
      )}

      {error && (
        <div className="mt-4 text-sm text-etyme-attention">{error}</div>
      )}

      {/* Answering. A decline asks why, because that is the useful signal. */}
      {open && !declining && (
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => act('accept')}
            disabled={busy}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Work this requirement'}
          </button>
          <button
            onClick={() => setDeclining(true)}
            disabled={busy}
            className="px-4 py-2 border border-etyme-rule text-etyme-muted rounded text-sm hover:text-etyme-ink disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}

      {open && declining && (
        <div className="mt-5">
          <label className="block">
            <Lbl>Why are you declining?</Lbl>
            <p className="text-xs text-etyme-muted mt-1 mb-2">
              The client sees this. Telling them you have nobody at this rate is
              more useful to them — and to you next time — than silence.
            </p>
            <input
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="No available SAP MM consultants at this rate"
              className="w-full px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => act('decline')}
              disabled={busy}
              className="px-4 py-2 bg-etyme-ink text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send decline'}
            </button>
            <button
              onClick={() => { setDeclining(false); setReason('') }}
              className="text-sm text-etyme-muted hover:text-etyme-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {accepted && (
        <div className="mt-5 flex items-center gap-3">
          <a
            href={`/dashboard/submissions?requirementId=${inv.requirement.id}`}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90"
          >
            Submit candidates
          </a>
          <span className="text-xs text-etyme-muted">
            Closes {new Date(inv.expiresAt).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'OPEN' | 'ALL'>('OPEN')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/invitations')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load invitations')
      setInvitations(json.data.invitations)
      setSummary(json.data.summary)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function respond(id: string, action: 'accept' | 'decline', reason?: string) {
    const res = await fetch(`/api/invitations/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error?.message ?? 'Could not send your answer')
    await load()
  }

  // Search on every list — the first of the eight things (CLAUDE.md).
  const term = q.trim().toLowerCase()
  const visible = invitations
    .filter(i => filter === 'ALL' || i.status === 'SENT' || i.status === 'ACCEPTED')
    .filter(i =>
      term.length === 0 ||
      i.requirement.title.toLowerCase().includes(term) ||
      i.from.name.toLowerCase().includes(term) ||
      (i.requirement.location ?? '').toLowerCase().includes(term) ||
      i.requirement.skills.some(s => s.toLowerCase().includes(term))
    )

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Lbl>Sell</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">
          Invitations
        </h1>
        <p className="text-etyme-muted mt-2 max-w-2xl">
          Requirements clients have put in front of you. The rate band on each is
          yours — other vendors asked to the same requirement see their own, and
          cannot see this one.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
          <Stat
            label="Awaiting your answer"
            value={summary.awaitingResponse}
            tone={summary.awaitingResponse > 0 ? 'attention' : 'default'}
          />
          <Stat label="You are working" value={summary.accepted} tone="verified" />
          <Stat label="Open positions" value={summary.openPositions} sub="across live invitations" />
          <Stat label="Declined" value={summary.declined} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by role, client, skill or location…"
          className="flex-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-surface text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action"
        />
        <button
          onClick={() => setFilter(f => (f === 'OPEN' ? 'ALL' : 'OPEN'))}
          className="px-3 py-2 border border-etyme-rule rounded text-sm text-etyme-muted hover:text-etyme-ink whitespace-nowrap"
        >
          {filter === 'OPEN' ? 'Show all' : 'Live only'}
        </button>
      </div>

      {/* The missing states, per CLAUDE.md's eighth thing. */}
      {loading && <div className="text-etyme-muted py-12 text-center">Loading…</div>}

      {!loading && error && (
        <div className="border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
          <div className="text-etyme-attention font-medium">{error}</div>
          <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="border border-etyme-rule rounded-lg p-12 text-center">
          <p className="font-serif text-lg text-etyme-ink">
            {term
              ? 'Nothing matches that search'
              : filter === 'OPEN'
                ? 'No open invitations'
                : 'No invitations yet'}
          </p>
          <p className="text-sm text-etyme-muted mt-2 max-w-md mx-auto">
            {term
              ? 'Try a different role, client or skill.'
              : 'When a client sends you a requirement it arrives here, with the rate band they are offering you.'}
          </p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="space-y-4">
          {visible.map(inv => (
            <InvitationCard key={inv.id} inv={inv} onRespond={respond} />
          ))}
        </div>
      )}
    </div>
  )
}
