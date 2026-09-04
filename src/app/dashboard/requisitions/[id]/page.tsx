'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { compact as money } from '@/lib/money-display'

/**
 * One requisition, worked end to end.
 *
 * The list said what exists; this is where a requisition is actually
 * filled. Four moments, in the order they happen:
 *
 *   approval      cleared itself, or waiting on a named person
 *   distribution  which vendors were asked, at what band
 *   responses     who is working it, who declined, who went quiet
 *   candidates    who was put forward, and who gets the job
 *
 * The quiet vendors get their own count. A requisition with three silent
 * suppliers looks identical to one with three working it, and the client
 * finds out the difference the week the role was supposed to start.
 */

interface Band { payMin: number | null; payMax: number | null }
interface Invitation {
  id: string
  vendor: { id: string; name: string }
  band: Band
  status: string
  expiresAt: string
  message: string | null
  submittedCount: number
}
interface FitFactor { label: string; value: number; weight: number; detail: string }
interface Fit {
  score: number
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  factors: FitFactor[]
  basis: string
  unknowns: string | null
}
interface Candidate {
  id: string
  fit: Fit
  person: { id: string; name: string; headline: string | null; skills: string[] }
  vendor: { id: string; name: string }
  rate: number
  kind: string
  status: string
  submittedAt: string
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
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
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

function Panel({ title, count, children }: {
  title: string; count?: number; children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="font-serif text-lg text-etyme-ink">{title}</h2>
        {count != null && <span className="text-xs text-etyme-faint tabular-nums">{count}</span>}
      </div>
      <div className="bg-etyme-surface border border-etyme-rule rounded-lg">{children}</div>
    </section>
  )
}


/**
 * The score, and everything behind it on click.
 *
 * CLAUDE.md wants progressive explanation and forbids a bare number. The
 * confidence label sits next to the score rather than under the fold,
 * because a 74 the system is unsure about must not read like a 74 it is
 * certain of.
 */
function Why({ fit }: { fit: Fit }) {
  const [open, setOpen] = useState(false)
  const tone = fit.score >= 75 ? 'text-etyme-verified'
    : fit.score >= 45 ? 'text-etyme-ink' : 'text-etyme-attention'
  const conf = fit.confidence === 'HIGH' ? 'confident'
    : fit.confidence === 'MODERATE' ? 'some gaps' : 'thin data'

  return (
    <div className="text-right">
      <button onClick={() => setOpen(o => !o)} className="group">
        <div className={`font-serif text-2xl tabular-nums ${tone}`}>{fit.score}</div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-etyme-faint group-hover:text-etyme-action">
          {conf} · why
        </div>
      </button>
      {open && (
        <div className="mt-3 text-left border-l-2 border-etyme-rule pl-4 space-y-2 w-full">
          {fit.factors.map(f => (
            <div key={f.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-etyme-ink">{f.label}</span>
                <span className="text-xs tabular-nums text-etyme-muted">{f.value}</span>
              </div>
              <div className="h-1 bg-etyme-rule rounded mt-0.5">
                <div className="h-1 bg-etyme-action/50 rounded" style={{ width: `${f.value}%` }} />
              </div>
              <p className="text-xs text-etyme-muted mt-0.5">{f.detail}</p>
            </div>
          ))}
          <p className="text-xs text-etyme-faint pt-1">Based on {fit.basis}.</p>
          {fit.unknowns && (
            <p className="text-xs text-etyme-attention">Could not judge: {fit.unknowns}.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sending it to vendors ──────────────────────────────────

function DistributePanel({ reqId, billMax, invited, onSent }: {
  reqId: string
  billMax: number | null
  invited: Set<string>
  onSent: () => void
}) {
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])
  const [picked, setPicked] = useState<Record<string, { on: boolean; min: string; max: string }>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Suppliers come from the company directory; there is no separate
    // vendor list endpoint, and inventing one would be a second source of
    // truth for the same rows.
    fetch('/api/companies')
      .then(r => r.json())
      .then(j => {
        const list = (j?.data?.companies ?? []) as any[]
        setVendors(
          list
            .filter(c => c.kind === 'VENDOR' || c.kind === 'GSI')
            .map(c => ({ id: c.id, name: c.name }))
        )
      })
      .catch(() => {})
  }, [])

  const available = vendors.filter(v => !invited.has(v.id))

  async function send() {
    const chosen = Object.entries(picked).filter(([, v]) => v.on)
    if (chosen.length === 0) { setError('Pick at least one vendor'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/requisitions/${reqId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendors: chosen.map(([id, v]) => ({
            companyId: id,
            // Entered in dollars, stored in cents like every other rate.
            payMin: v.min ? Math.round(parseFloat(v.min) * 100) : null,
            payMax: v.max ? Math.round(parseFloat(v.max) * 100) : null,
          })),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not send')
      setPicked({})
      onSent()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (available.length === 0) {
    return (
      <div className="p-4 text-sm text-etyme-muted">
        {vendors.length === 0 ? 'No vendors on file yet.' : 'Every vendor on file has already been asked.'}
      </div>
    )
  }

  const field = 'w-20 px-2 py-1 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink tabular-nums focus:outline-none focus:border-etyme-action'

  return (
    <div className="p-4">
      <p className="text-sm text-etyme-muted mb-3">
        Each vendor gets its own band and cannot see anyone else&apos;s.
        {billMax != null && ` Your ceiling is ${money(billMax)}/hr.`}
      </p>
      <div className="divide-y divide-etyme-rule">
        {available.map(v => {
          const p = picked[v.id] ?? { on: false, min: '', max: '' }
          return (
            <div key={v.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox" checked={p.on}
                onChange={e => setPicked({ ...picked, [v.id]: { ...p, on: e.target.checked } })}
                className="accent-etyme-action"
              />
              <span className="flex-1 text-sm text-etyme-ink">{v.name}</span>
              <input value={p.min} placeholder="min"
                onChange={e => setPicked({ ...picked, [v.id]: { ...p, min: e.target.value } })}
                className={field} />
              <input value={p.max} placeholder="max"
                onChange={e => setPicked({ ...picked, [v.id]: { ...p, max: e.target.value } })}
                className={field} />
              <span className="text-xs text-etyme-faint w-8">/hr</span>
            </div>
          )
        })}
      </div>
      {error && <div className="mt-3 text-sm text-etyme-attention">{error}</div>}
      <button onClick={send} disabled={busy}
        className="mt-4 px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {busy ? 'Sending…' : 'Send to selected vendors'}
      </button>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function RequisitionDetail() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/requisitions/${id}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not load')
      setData(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  async function decide(action: 'approve' | 'reject') {
    const reason = action === 'reject'
      ? window.prompt('Why are you rejecting this? Whoever raised it will see this.')
      : (window.prompt('Note for the record? (optional)') ?? '')
    if (action === 'reject' && !reason) return
    const res = await fetch(`/api/requisitions/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error?.message ?? 'Could not record that'); return }
    await load()
  }

  async function award(c: Candidate) {
    const rate = window.prompt(
      `Place ${c.person.name}. Rate in dollars per hour:`,
      String(Math.round(c.rate / 100))
    )
    if (rate === null) return
    const cents = Math.round(parseFloat(rate) * 100)
    if (!Number.isFinite(cents) || cents <= 0) { alert('That is not a rate'); return }

    const res = await fetch(`/api/submissions/${c.id}/award`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rate: cents }),
    })
    const j = await res.json()
    if (!res.ok) {
      const checks = (j.error?.checks ?? []).map((x: any) => `· ${x.reason}`).join('\n')
      alert(`${j.error?.message ?? 'Could not place them'}${checks ? '\n\n' + checks : ''}`)
      return
    }
    const d = j.data
    const notes = d.notes?.length ? '\n\n' + d.notes.map((n: string) => `· ${n}`).join('\n') : ''
    alert(`${d.message}${notes}${d.requisitionFilled ? `\n\n${d.vendorsStoodDown} vendor(s) stood down.` : ''}`)
    await load()
  }

  if (loading) return <div className="text-etyme-muted py-12 text-center">Loading…</div>
  if (error) return (
    <div className="max-w-3xl border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
      <div className="text-etyme-attention font-medium">{error}</div>
      <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
    </div>
  )
  if (!data) return null

  const r = data.requisition
  const s = data.summary
  const pending = data.approvals.find((a: any) => a.outcome === 'PENDING')
  const approved = r.approvalState === 'APPROVED' || r.approvalState === 'AUTO_APPROVED'
  const invitedIds = new Set<string>(data.invitations.map((i: Invitation) => i.vendor.id))

  return (
    <div className="max-w-3xl">
      <a href="/dashboard/requisitions" className="text-sm text-etyme-action hover:underline">← Requisitions</a>

      <div className="mt-4 mb-8">
        <Lbl>{r.costCenter ? `${r.costCenter.code} · ${r.costCenter.name}` : 'No cost centre'}</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">{r.title}</h1>
        <div className="text-etyme-muted mt-2">
          {r.headcount} position{r.headcount === 1 ? '' : 's'}
          {r.location && ` · ${r.location}`}
          {r.months && ` · ${r.months} months`}
          {r.billMax != null && ` · up to ${money(r.billMax)}/hr`}
          {r.raisedBy && ` · raised by ${r.raisedBy.name}`}
        </div>
        {r.justification && <p className="text-sm text-etyme-muted mt-3 italic">{r.justification}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
        <div><Lbl>Vendors asked</Lbl><div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.invited}</div></div>
        <div><Lbl>Working it</Lbl><div className="font-serif text-3xl mt-1 tabular-nums text-etyme-verified">{s.accepted}</div></div>
        <div>
          <Lbl>Gone quiet</Lbl>
          <div className={`font-serif text-3xl mt-1 tabular-nums ${s.silent > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{s.silent}</div>
          <div className="text-xs text-etyme-muted">no answer yet</div>
        </div>
        <div><Lbl>Candidates</Lbl><div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.candidates}</div></div>
      </div>

      {/* 1 — Approval */}
      <Panel title="Approval">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {r.approvalState === 'AUTO_APPROVED' && <Chip tone="verified">Cleared automatically</Chip>}
              {r.approvalState === 'APPROVED' && <Chip tone="verified">Approved</Chip>}
              {r.approvalState === 'PENDING_APPROVAL' && <Chip tone="attention">Waiting on approval</Chip>}
              {r.approvalState === 'REJECTED' && <Chip tone="attention">Rejected</Chip>}
              {r.approvalState === 'DRAFT' && <Chip>Draft</Chip>}
            </div>
            {pending && (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => decide('approve')}
                  className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">Approve</button>
                <button onClick={() => decide('reject')}
                  className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">Reject</button>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {data.approvals.map((a: any) => (
              <div key={a.id} className="text-sm">
                <span className="font-medium text-etyme-ink">{a.approver?.name ?? 'Cleared by rule'}</span>
                <span className="ml-2 text-xs text-etyme-faint">{a.outcome.toLowerCase().replace(/_/g, ' ')}</span>
                <p className="text-etyme-muted">{a.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* 2 — Distribution */}
      <Panel title="Send to vendors">
        {approved
          ? <DistributePanel reqId={id} billMax={r.billMax} invited={invitedIds} onSent={load} />
          : <div className="p-4 text-sm text-etyme-muted">
              This requisition is {r.approvalState.toLowerCase().replace(/_/g, ' ')}. Vendors see it once it is approved.
            </div>}
      </Panel>

      {/* 3 — Responses */}
      {data.invitations.length > 0 && (
        <Panel title="Who was asked" count={data.invitations.length}>
          <div className="divide-y divide-etyme-rule">
            {data.invitations.map((i: Invitation) => (
              <div key={i.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-etyme-ink">{i.vendor.name}</div>
                  <div className="text-xs text-etyme-muted tabular-nums">
                    {money(i.band.payMin)}–{money(i.band.payMax)}/hr · closes {i.expiresAt.slice(0, 10)}
                  </div>
                </div>
                <div className="text-xs text-etyme-muted tabular-nums w-20 text-right">
                  {i.submittedCount} put forward
                </div>
                <div className="w-24 text-right shrink-0">
                  {i.status === 'ACCEPTED' && <Chip tone="verified">Working it</Chip>}
                  {i.status === 'DECLINED' && <Chip>Declined</Chip>}
                  {i.status === 'EXPIRED' && <Chip>Closed</Chip>}
                  {i.status === 'SENT' && <Chip tone="attention">No answer</Chip>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 4 — Candidates */}
      <Panel title="Candidates" count={data.candidates.length}>
        {data.candidates.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-etyme-muted">
              {s.invited === 0
                ? 'Nobody has been asked yet.'
                : 'Asked, but nobody has been put forward yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-etyme-rule">
            {[...data.candidates]
              .sort((a: Candidate, b: Candidate) => b.fit.score - a.fit.score)
              .map((c: Candidate) => (
              <div key={c.id} className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-etyme-ink">{c.person.name}</div>
                  <div className="text-xs text-etyme-muted">
                    {c.person.headline ?? c.person.skills.slice(0, 3).join(', ')} · via {c.vendor.name}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-serif text-lg text-etyme-ink tabular-nums">
                      {money(c.rate)}<span className="text-xs text-etyme-muted font-sans">/hr</span>
                    </span>
                    <Chip tone={
                      c.status === 'PLACED' ? 'verified'
                      : c.status === 'NOT_SELECTED' ? 'passive' : 'action'
                    }>
                      {c.status.toLowerCase().replace(/_/g, ' ')}
                    </Chip>
                    {c.status !== 'PLACED' && c.status !== 'NOT_SELECTED' && s.remaining > 0 && (
                      <button onClick={() => award(c)}
                        className="px-3 py-1 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                        Place
                      </button>
                    )}
                  </div>
                </div>
                <div className="shrink-0 w-56"><Why fit={c.fit} /></div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
