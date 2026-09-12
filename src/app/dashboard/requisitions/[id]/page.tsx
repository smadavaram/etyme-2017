'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { compact as money } from '@/lib/money-display'
import {
  Chain, DecideModal, EditRequisition, clearedForSentence, deskOf, myRow, whoFor,
} from '../chain'
import { mayEdit } from '@/lib/requisition-stage'
import { useSession } from '@/components/session-provider'
import { hasPermission } from '@/lib/permissions'

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

/**
 * The thread on the requisition.
 *
 * `Conversation` has carried `topic: 'REQUIREMENT'` with a `topicId`
 * since the model existed and nothing created one, so the argument about
 * a role — "can we take the rate to 130?", "Priya's notice is four
 * weeks" — happened in email and was gone by the time anybody asked why
 * the band moved.
 *
 * The client's own people only, and that is the API's decision rather
 * than this screen's: /api/conversations scopes every read and write to
 * the caller's own company. A supplier working the role has a thread of
 * its own and cannot see this one.
 *
 * The thread is made by the first message, not by the requisition. A row
 * of empty threads on every requisition ever raised is noise nobody
 * reads.
 */
function Discussion({ requisitionId, title }: { requisitionId: string; title: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<
    { id: string; authorName: string | null; body: string; createdAt: string }[]
  >([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/conversations?topic=REQUIREMENT&topicId=${requisitionId}`)
      const j = await readJson(res)
      const thread = (j?.data?.conversations ?? [])[0] ?? null
      setConversationId(thread?.id ?? null)
      if (!thread) {
        setMessages([])
        return
      }
      const m = await fetch(`/api/conversations/messages?conversationId=${thread.id}`)
      const mj = await readJson(m)
      setMessages(mj?.data?.messages ?? [])
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [requisitionId])

  useEffect(() => { load() }, [load])

  async function post() {
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setErr(null)
    try {
      let threadId = conversationId
      if (!threadId) {
        // Create-or-get: the route hands back the existing thread when
        // there is one, so two people typing at once do not make two.
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ topic: 'REQUIREMENT', topicId: requisitionId, title }),
        })
        const j = await readJson(res)
        threadId = j?.data?.conversation?.id ?? null
        setConversationId(threadId)
      }
      if (!threadId) throw new Error('That thread could not be started.')
      const sent = await fetch('/api/conversations/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: threadId, body }),
      })
      await readJson(sent)
      setText('')
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Discussion" count={messages.length > 0 ? messages.length : undefined}>
      <div className="p-4">
        {loading && <p className="text-sm text-etyme-muted">Loading…</p>}

        {!loading && messages.length === 0 && (
          <p className="text-sm text-etyme-muted">
            Nothing said yet. Notes here stay with your own people — no supplier sees them.
          </p>
        )}

        {messages.length > 0 && (
          <div className="space-y-4">
            {messages.map(m => (
              <div key={m.id}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm text-etyme-ink">{m.authorName ?? 'Somebody here'}</span>
                  <span className="text-xs text-etyme-faint tabular-nums">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-etyme-muted whitespace-pre-line mt-0.5">{m.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-etyme-rule">
          <label htmlFor="say" className="sr-only">Say something about this role</label>
          <textarea
            id="say"
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Anything your own people should know about this role."
            className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action"
          />
          {err && <p className="mt-2 text-sm text-etyme-attention">{err}</p>}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-etyme-faint">Your own people only. Suppliers never see this.</span>
            <button
              onClick={post}
              disabled={busy || text.trim().length === 0}
              className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

// ── Sending it to vendors ──────────────────────────────────

function DistributePanel({ reqId, billMax, invited, clearedIds, onSent }: {
  reqId: string
  billMax: number | null
  invited: Set<string>
  /** The suppliers Procurement's yes named. Empty = every approved one. */
  clearedIds: string[]
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

  // Procurement's yes is a ceiling on this list, not a suggestion. The
  // release route refuses a vendor outside it, so offering one here would
  // be offering a choice the server throws away.
  const cleared = new Set(clearedIds)
  const available = vendors
    .filter(v => !invited.has(v.id))
    .filter(v => cleared.size === 0 || cleared.has(v.id))

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
      const j = await readJson(res)
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
        {cleared.size > 0 && ' Only the suppliers Procurement cleared are listed.'}
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
  /** Who is reading — so only your own row offers you a decision. */
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  // Editors: the manager it is for, whoever raised it, the programme
  // office. The approvers ask for changes instead. Same rule as the
  // route; a button that would only refuse is not offered.
  const { permissions } = useSession()
  const [editing, setEditing] = useState(false)
  /** The desks for this unit, for placing rows and for naming people. */
  const [team, setTeam] = useState<any | null>(null)
  const [suppliers, setSuppliers] = useState<{ companyId: string; name: string }[]>([])
  const [deciding, setDeciding] = useState<'approve' | 'reject' | 'changes' | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/requisitions/${id}`)
      const j = await readJson(res)
      setData(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  // Read once, all optional: without them the page still shows the
  // requisition, it just offers fewer decisions.
  useEffect(() => {
    fetch('/api/me').then(r => r.json())
      .then(j => { const p = j?.data?.person; if (p?.id) setMe({ id: p.id, name: p.name }) })
      .catch(() => {})
    fetch('/api/program/team').then(r => r.json())
      .then(j => { if (j?.data?.company) setTeam(j.data) })
      .catch(() => {})
    fetch('/api/suppliers').then(r => r.json())
      .then(j => setSuppliers(
        (j?.data?.suppliers ?? []).map((s: any) => ({ companyId: s.companyId, name: s.name }))
      ))
      .catch(() => {})
  }, [])


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
    // A safe parse rather than readJson: this branch needs the
    // error object itself (lists the failed checks), and readJson throws an
    // Error, which would lose it. An empty body must still
    // not produce a parser error on screen.
    const j = await res.json().catch(() => ({}) as any)
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

  // The desks for this requisition's own unit. Used to place an approval
  // under the right heading where the row does not carry its stage, and
  // to know whether the row in play is the sourcing desk's.
  const unitId =
    r.orgUnit?.id
    ?? (team?.budgets ?? []).find((b: any) => b.id === r.costCenter?.id)?.department?.id
    ?? null
  const deskIds = (() => {
    const d = (team?.desks ?? []).find((x: any) => x.unit.id === unitId)
    return {
      hrPersonId: d?.hr?.person?.id ?? null,
      procurementPersonId: d?.procurement?.person?.id ?? null,
    }
  })()
  // Only your own row, at the rank in play — the rule the route enforces.
  const mine = myRow(data.approvals, me?.id ?? null)
  const mineIsSourcing = mine ? deskOf(mine, deskIds) === 'SOURCING' : false
  const supplierNames: Record<string, string> = Object.fromEntries(
    suppliers.map(v => [v.companyId, v.name])
  )
  const clearedFor = clearedForSentence(r.clearedSupplierIds, supplierNames)

  return (
    <div className="max-w-3xl">
      <a href="/dashboard/requisitions" className="text-sm text-etyme-action hover:underline">← Requirements</a>

      <div className="mt-4 mb-8">
        <Lbl>{r.costCenter ? `${r.costCenter.code} · ${r.costCenter.name}` : 'No cost centre'}</Lbl>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">{r.title}</h1>
          {mayEdit(r) &&
            (me?.id === r.owner?.id || me?.id === r.raisedBy?.id || hasPermission(permissions, 'governance.write')) && (
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary self-start shrink-0 md:mt-1">
              Edit
            </button>
          )}
        </div>
        {editing && (
          <EditRequisition req={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
        )}
        <div className="text-etyme-muted mt-2">
          {r.headcount} position{r.headcount === 1 ? '' : 's'}
          {r.location && ` · ${r.location}`}
          {r.months && ` · ${r.months} months`}
          {r.billMax != null && ` · up to ${money(r.billMax)}/hr`}
          {/* Whose need it is, then who typed it — said twice only when
              they are two different people. */}
          {whoFor(r) && ` · ${whoFor(r)}`}
        </div>
        {r.description && (
          <div className="mt-4 text-sm text-etyme-ink whitespace-pre-line max-w-prose">{r.description}</div>
        )}
        {r.justification && <p className="text-sm text-etyme-muted mt-3 italic">{r.justification}</p>}

        {/* Who is interviewing. Named on the requirement, so every round
            starts with them rather than being retyped per round. */}
        {(r.interviewers ?? []).length > 0 && (
          <div className="mt-4">
            <Lbl>Who is interviewing</Lbl>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(r.interviewers as string[]).map((n: string) => (
                <Chip key={n}>{n}</Chip>
              ))}
            </div>
          </div>
        )}
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

      {/* 1 — Approval, read by desk */}
      <Panel title="Approval">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              {r.approvalState === 'AUTO_APPROVED' && <Chip tone="verified">Cleared automatically</Chip>}
              {r.approvalState === 'APPROVED' && <Chip tone="verified">Approved</Chip>}
              {r.approvalState === 'PENDING_APPROVAL' && <Chip tone="attention">Waiting on approval</Chip>}
              {r.approvalState === 'CHANGES_REQUESTED' && <Chip tone="attention">Sent back for changes</Chip>}
              {r.approvalState === 'REJECTED' && <Chip tone="attention">Rejected</Chip>}
              {r.approvalState === 'DRAFT' && <Chip>Draft</Chip>}
            </div>
            {/* Only the row that is actually yours. The old buttons showed
                on anybody's pending approval and returned a 403 the person
                reading it could do nothing about. */}
            {mine && (
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button onClick={() => setDeciding('approve')}
                  className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                  {mineIsSourcing ? 'Approve and name suppliers' : 'Approve'}
                </button>
                {/* The middle answer: a reviewer who wants the rate moved
                    should not have to refuse the whole requisition. */}
                <button onClick={() => setDeciding('changes')}
                  className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">
                  Ask for changes
                </button>
                <button onClick={() => setDeciding('reject')}
                  className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-attention hover:border-etyme-attention">
                  Reject
                </button>
              </div>
            )}
            {pending && !mine && (
              <div className="text-xs text-etyme-muted shrink-0">
                {pending.approver
                  ? `Waiting on ${pending.approver.name}`
                  : 'Waiting on a desk nobody is named for'}
              </div>
            )}
          </div>

          {data.approvals.length === 0 ? (
            <p className="mt-3 text-sm text-etyme-muted">
              {r.approvalState === 'AUTO_APPROVED'
                ? 'Cleared the moment it was raised — inside plan, inside budget, inside the going rate. No desk was needed.'
                : 'Not sent for approval yet. Nobody has been asked to look at this.'}
            </p>
          ) : (
            <Chain approvals={data.approvals} desks={deskIds} />
          )}

          {clearedFor && (
            <p className="mt-4 pt-3 border-t border-etyme-rule text-sm text-etyme-muted">
              {clearedFor}. Only these suppliers may be sent it.
            </p>
          )}
        </div>
      </Panel>

      {/* 2 — Distribution */}
      <Panel title="Send to vendors">
        {approved
          ? <DistributePanel reqId={id} billMax={r.billMax} invited={invitedIds}
              clearedIds={r.clearedSupplierIds ?? []} onSent={load} />
          : <div className="p-4 text-sm text-etyme-muted">
              {/* The column's own value, lower-cased, was not a sentence:
                  "This requisition is changes requested." A refusal says
                  what is missing and what to do about it. */}
              {r.approvalState === 'PENDING_APPROVAL'
                ? 'Still with the desks above. Suppliers see it once every one of them has said yes.'
                : r.approvalState === 'CHANGES_REQUESTED'
                  ? 'Sent back for changes. Edit it and it goes round again — to the desk that asked, not back to the start.'
                  : r.approvalState === 'REJECTED'
                    ? 'This was rejected, so it goes to no supplier. Raising a fresh one is the way back.'
                    : 'Not sent for approval yet. Suppliers see it once it has been through the desks.'}
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

      {/* 5 — The argument about the role, kept with the role */}
      <Discussion requisitionId={id} title={r.title} />

      {deciding && (
        <DecideModal
          req={{ id, title: r.title }}
          action={deciding}
          sourcing={mineIsSourcing}
          suppliers={suppliers}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); load() }}
        />
      )}
    </div>
  )
}
