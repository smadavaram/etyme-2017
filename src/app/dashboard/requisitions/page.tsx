'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Requisitions — the demand side.
 *
 * A hiring manager says what they need; the system either clears it or
 * routes it, and says which and why. CLAUDE.md calls for progressive
 * explanation: "One line by default, reasoning on click."
 *
 * Addendum E: "Most requisitions must clear without human approval.
 * Governance slower than the workaround produces the workaround." So the
 * screen is built for the common case — raise it, watch it clear, get on
 * with the day — with the checks available but folded away.
 *
 * The decision itself lives in src/lib/requisition-approval.ts and is
 * tested there. This page only shows it.
 */

interface Check { code: string; outcome: string; reason: string }
interface Approval {
  id: string
  approver: { id: string; name: string } | null
  rank: number
  outcome: string
  reason: string
  decidedAt: string | null
}
interface Requisition {
  id: string
  title: string
  skills: string[]
  location: string | null
  headcount: number
  billMin: number | null
  billMax: number | null
  months: number | null
  neededBy: string | null
  justification: string | null
  status: string
  approvalState: string
  raisedBy: { id: string; name: string } | null
  orgUnit: { id: string; name: string } | null
  costCenter: { id: string; code: string; name: string } | null
  approvals: Approval[]
  counts: { submissions: number; invitations: number }
  createdAt: string
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
      {children}
    </div>
  )
}

function Stat({ label, value, tone = 'default', sub }: {
  label: string; value: string | number; tone?: 'default' | 'attention' | 'verified'; sub?: string
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

function stateChip(state: string) {
  if (state === 'AUTO_APPROVED') return <Chip tone="verified">Cleared automatically</Chip>
  if (state === 'APPROVED') return <Chip tone="verified">Approved</Chip>
  if (state === 'PENDING_APPROVAL') return <Chip tone="attention">Waiting on approval</Chip>
  if (state === 'REJECTED') return <Chip tone="attention">Rejected</Chip>
  return <Chip>Draft</Chip>
}

/**
 * Progressive explanation — the summary line always, the checks on click.
 * A manager whose requisition cleared does not need the arithmetic; one
 * whose requisition routed needs exactly it.
 */
function Why({ approvals }: { approvals: Approval[] }) {
  const [open, setOpen] = useState(false)
  if (approvals.length === 0) return null
  const headline = approvals[0]

  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <p className="text-sm text-etyme-muted flex-1">{headline.reason}</p>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs text-etyme-action hover:underline shrink-0 mt-0.5"
        >
          {open ? 'Hide' : 'Why'}
        </button>
      </div>
      {open && (
        <div className="mt-3 border-l-2 border-etyme-rule pl-4 space-y-2">
          {approvals.map(a => (
            <div key={a.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-etyme-ink">
                  {a.approver?.name ?? 'Cleared by rule'}
                </span>
                <Chip tone={
                  a.outcome === 'APPROVED' || a.outcome === 'AUTO_CLEARED' ? 'verified'
                  : a.outcome === 'REJECTED' ? 'attention' : 'passive'
                }>
                  {a.outcome === 'AUTO_CLEARED' ? 'no human needed' : a.outcome.toLowerCase()}
                </Chip>
                {a.rank > 0 && <span className="text-xs text-etyme-faint">rank {a.rank}</span>}
              </div>
              <p className="text-etyme-muted mt-0.5">{a.reason}</p>
              {a.decidedAt && (
                <p className="text-xs text-etyme-faint mt-0.5">
                  {new Date(a.decidedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The decision the system just made, shown immediately after raising one. */
function DecisionPanel({ decision, onDismiss }: {
  decision: { state: string; summary: string; checks: Check[]; route: { name: string }[] }
  onDismiss: () => void
}) {
  const cleared = decision.state === 'AUTO_APPROVED'
  return (
    <div className={`border rounded-lg p-6 mb-6 ${
      cleared ? 'border-etyme-verified/30 bg-etyme-verified/5' : 'border-etyme-attention/30 bg-etyme-attention/5'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Lbl>{cleared ? 'Open' : 'Sent for approval'}</Lbl>
          <p className="font-serif text-lg text-etyme-ink mt-1 text-balance">
            {decision.summary}
          </p>
        </div>
        <button onClick={onDismiss} className="text-etyme-faint hover:text-etyme-ink text-sm">
          ✕
        </button>
      </div>
      <div className="mt-4 space-y-1.5">
        {decision.checks.map(c => (
          <div key={c.code} className="flex items-baseline gap-3 text-sm">
            <span className={`w-4 shrink-0 ${
              c.outcome === 'PASS' ? 'text-etyme-verified' : 'text-etyme-attention'
            }`}>
              {c.outcome === 'PASS' ? '✓' : '!'}
            </span>
            <span className="text-etyme-muted">{c.reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RaiseModal({ onClose, onRaised }: {
  onClose: () => void
  onRaised: (decision: any) => void
}) {
  const [form, setForm] = useState({
    title: '', skills: '', location: '', headcount: '1',
    billMax: '', months: '', neededBy: '', justification: '', costCenterId: '',
  })
  const [costCenters, setCostCenters] = useState<{ id: string; code: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/program/org')
      .then(r => r.json())
      .then(j => {
        const ccs = j?.data?.costCenters ?? []
        setCostCenters(ccs.map((c: any) => ({ id: c.id, code: c.code, name: c.name })))
      })
      .catch(() => {})
  }, [])

  async function submit() {
    if (form.title.trim().length < 3) {
      setError('Give the role a title')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
          location: form.location.trim() || null,
          headcount: parseInt(form.headcount, 10) || 1,
          // Rates are entered in dollars and stored in cents.
          billMax: form.billMax ? Math.round(parseFloat(form.billMax) * 100) : null,
          months: form.months ? parseInt(form.months, 10) : null,
          neededBy: form.neededBy || null,
          justification: form.justification.trim() || null,
          costCenterId: form.costCenterId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not raise the requisition')
      onRaised(json.data.decision)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action'

  return (
    <div className="fixed inset-0 bg-etyme-ink/30 flex items-start justify-center p-6 z-50 overflow-y-auto">
      <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-6 max-w-xl w-full my-8">
        <Lbl>New requisition</Lbl>
        <h2 className="font-serif text-2xl text-etyme-ink mt-1 mb-1 tracking-[-0.02em]">
          What do you need?
        </h2>
        <p className="text-sm text-etyme-muted mb-5">
          Most requisitions clear without anyone having to approve them. You will
          see which, and why, as soon as you raise it.
        </p>

        <div className="space-y-4">
          <label className="block">
            <Lbl>Role</Lbl>
            <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="SAP MM Consultant" className={`${field} mt-1`} />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <Lbl>How many</Lbl>
              <input type="number" min="1" value={form.headcount}
                onChange={e => setForm({ ...form, headcount: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block">
              <Lbl>For how long (months)</Lbl>
              <input type="number" min="1" value={form.months}
                onChange={e => setForm({ ...form, months: e.target.value })}
                placeholder="6" className={`${field} mt-1`} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <Lbl>Most you will pay ($/hr)</Lbl>
              <input type="number" min="0" step="1" value={form.billMax}
                onChange={e => setForm({ ...form, billMax: e.target.value })}
                placeholder="130" className={`${field} mt-1 tabular-nums`} />
            </label>
            <label className="block">
              <Lbl>Needed by</Lbl>
              <input type="date" value={form.neededBy}
                onChange={e => setForm({ ...form, neededBy: e.target.value })} className={`${field} mt-1`} />
            </label>
          </div>

          <label className="block">
            <Lbl>Which budget pays for it</Lbl>
            <select value={form.costCenterId} onChange={e => setForm({ ...form, costCenterId: e.target.value })}
              className={`${field} mt-1`}>
              <option value="">— not stated —</option>
              {costCenters.map(c => (
                <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
              ))}
            </select>
            <p className="text-xs text-etyme-muted mt-1">
              Without one, nobody owns the spend and it goes for approval.
            </p>
          </label>

          <label className="block">
            <Lbl>Skills (comma separated)</Lbl>
            <input value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })}
              placeholder="SAP MM, S/4HANA" className={`${field} mt-1`} />
          </label>

          <label className="block">
            <Lbl>Where</Lbl>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
              placeholder="Lakewood, CO" className={`${field} mt-1`} />
          </label>

          <label className="block">
            <Lbl>Why you need it (optional)</Lbl>
            <textarea value={form.justification} rows={2}
              onChange={e => setForm({ ...form, justification: e.target.value })}
              placeholder="Backfill for the Q4 validation programme" className={`${field} mt-1 resize-none`} />
          </label>
        </div>

        {error && <div className="mt-4 text-sm text-etyme-attention">{error}</div>}

        <div className="mt-6 flex items-center gap-3">
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {busy ? 'Raising…' : 'Raise requisition'}
          </button>
          <button onClick={onClose} className="text-sm text-etyme-muted hover:text-etyme-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RequisitionsPage() {
  const [reqs, setReqs] = useState<Requisition[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [raising, setRaising] = useState(false)
  const [decision, setDecision] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/requisitions')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load requisitions')
      setReqs(json.data.requisitions)
      setSummary(json.data.summary)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(id: string, action: 'approve' | 'reject') {
    const reason = action === 'reject'
      ? window.prompt('Why are you rejecting this? The person who raised it will see this.')
      : window.prompt('Any note for the record? (optional)') ?? ''
    if (action === 'reject' && !reason) return
    const res = await fetch(`/api/requisitions/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const json = await res.json()
    if (!res.ok) { alert(json.error?.message ?? 'Could not record your decision'); return }
    await load()
  }

  const term = q.trim().toLowerCase()
  const visible = reqs.filter(r =>
    term.length === 0 ||
    r.title.toLowerCase().includes(term) ||
    (r.costCenter?.code ?? '').toLowerCase().includes(term) ||
    (r.location ?? '').toLowerCase().includes(term) ||
    r.skills.some(s => s.toLowerCase().includes(term))
  )

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Lbl>Program</Lbl>
          <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">
            Requisitions
          </h1>
          <p className="text-etyme-muted mt-2 max-w-2xl">
            What your managers need. Most clear the moment they are raised — only
            those over plan, over budget or above the going rate go to a person.
          </p>
        </div>
        <button onClick={() => setRaising(true)}
          className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 shrink-0">
          Raise one
        </button>
      </div>

      {decision && <DecisionPanel decision={decision} onDismiss={() => setDecision(null)} />}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
          <Stat label="Open" value={summary.open} />
          <Stat label="Cleared automatically" value={summary.autoCleared} tone="verified"
            sub="no human needed" />
          <Stat label="Waiting on a person" value={summary.awaitingApproval}
            tone={summary.awaitingApproval > 0 ? 'attention' : 'default'} />
          <Stat label="All requisitions" value={summary.total} />
        </div>
      )}

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by role, budget code, skill or location…"
        className="w-full px-3 py-2 mb-6 border border-etyme-rule rounded bg-etyme-surface text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action"
      />

      {loading && <div className="text-etyme-muted py-12 text-center">Loading…</div>}

      {!loading && error && (
        <div className="border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
          <div className="text-etyme-attention font-medium">{error}</div>
          <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="border border-etyme-rule rounded-lg p-12 text-center">
          <p className="font-serif text-lg text-etyme-ink">
            {term ? 'Nothing matches that search' : 'No requisitions yet'}
          </p>
          <p className="text-sm text-etyme-muted mt-2 max-w-md mx-auto">
            {term ? 'Try a different role or budget code.'
                  : 'Raise one and it will either open straight away or go to whoever needs to see it.'}
          </p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="space-y-4">
          {visible.map(r => {
            const pending = r.approvals.find(a => a.outcome === 'PENDING')
            return (
              <div key={r.id} className="bg-etyme-surface border border-etyme-rule rounded-lg p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <a href={`/dashboard/requisitions/${r.id}`}
                      className="font-serif text-xl text-etyme-ink tracking-[-0.02em] text-balance hover:text-etyme-action">
                      {r.title}
                    </a>
                    <div className="text-sm text-etyme-muted mt-1">
                      {r.headcount} position{r.headcount === 1 ? '' : 's'}
                      {r.location && ` · ${r.location}`}
                      {r.costCenter && ` · ${r.costCenter.code}`}
                      {r.raisedBy && ` · raised by ${r.raisedBy.name}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    {stateChip(r.approvalState)}
                    {r.billMax != null && (
                      <div className="font-serif text-lg text-etyme-ink tabular-nums">
                        ${Math.round(r.billMax / 100)}
                        <span className="text-xs text-etyme-muted font-sans">/hr max</span>
                      </div>
                    )}
                  </div>
                </div>

                <Why approvals={r.approvals} />

                <div className="mt-4 pt-4 border-t border-etyme-rule flex items-center justify-between gap-4">
                  <div className="text-xs text-etyme-muted">
                    {r.counts.invitations} vendor{r.counts.invitations === 1 ? '' : 's'} invited
                    {' · '}{r.counts.submissions} candidate{r.counts.submissions === 1 ? '' : 's'} submitted
                  </div>
                  {pending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => decide(r.id, 'approve')}
                        className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                        Approve
                      </button>
                      <button onClick={() => decide(r.id, 'reject')}
                        className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {raising && (
        <RaiseModal onClose={() => setRaising(false)} onRaised={d => { setDecision(d); load() }} />
      )}
    </div>
  )
}
