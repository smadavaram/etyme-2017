'use client'

import { readJson } from '@/lib/read-response'
import { DataTable, type Column } from '@/components/data-table'
import { ViewToggle, FilterBar, Star, emptyWord, type View } from '@/components/network-view'
import { applyFilter, locationsOf, isRecent, type NetworkFilter } from '@/lib/network-filters'
import { STAGE_WORD, STAGE_ASKS, STAGE_VERB, type ChecklistItem, type RequestState, type Stage, type Decision } from '@/lib/supplier-onboarding'

import { useState, useEffect, useCallback, useMemo } from 'react'

/**
 * Your suppliers.
 *
 * A client running contract staff already has twelve of them and an MSA
 * with each. This is the box they paste that list into — the one they
 * already email — and every firm in it becomes a supplier they can send
 * a role to today, whether or not that firm has heard of us.
 *
 * Two steps on purpose. Read first, create second: creating twelve
 * companies and then asking somebody to check them is the wrong way
 * round, and the wrong ones are hard to take back out.
 */

interface Row {
  company: string | null
  contactName: string | null
  email: string
  domain: string | null
  line: string
  needs: string[]
}

interface Pair {
  domain: string
  ok: boolean
  keep: { id: string; name: string } | null
  fold: { id: string; name: string } | null
  says: string
  moving: string[]
  button: string
}

interface Supplier {
  companyId: string
  name: string
  joined: boolean
  agreement: boolean
  contacts: { email: string; name: string | null; state: string }[]
  invitedAt: string | null
  where: string
  tier: string | null
  // A firm still in the pipeline, shown on the list with the desk it is on.
  pending?: { requestId: string; stageWord: string }
  // The Network questions
  onSiteCount: number
  onSite: boolean
  lastEngagement: string | null
  favorite: boolean
  blocked: boolean
  blockedReason: string | null
  location: string | null
}

interface SupplierRequest {
  id: string
  name: string
  domain: string | null
  contactName: string | null
  contactEmail: string | null
  reason: string
  skills: string[]
  state: RequestState
  stage: Stage
  stageWord: string
  checklist: ChecklistItem[]
  decisions: Decision[]
  steps: { stage: Stage; word: string; status: 'done' | 'now' | 'next' | 'declined'; by: string | null; at: string | null; note: string | null }[]
  recommendedBy: string
  decidedBy: string | null
  decisionNote: string | null
  mine: boolean
  mayAct: boolean
  whyNot: string | null
  leadNamed: boolean
  createdAt: string
  readiness: { ok: boolean; held: number; of: number; missing: string[]; toVerify: string[]; says: string }
  link: string
  linkSentAt: string | null
  applied: string | null
  application: { legalName: string | null; experience: string | null; references: any[]; bank: { bankName: string; accountName: string; last4: string } | null; skills: string[] } | null
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STANDING: { value: string; word: string }[] = [
  { value: 'PROBATION', word: 'On probation' },
  { value: 'APPROVED', word: 'Approved' },
  { value: 'PREFERRED', word: 'Preferred' },
]

export default function SuppliersPage() {
  const [text, setText] = useState('')

  /** A word from a short list, saved on the register row for that firm. */
  async function setStanding(companyId: string, tier: string) {
    const res = await fetch('/api/counterparties', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ otherCompanyId: companyId, relationship: 'SUPPLIER', tier }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j?.error?.message ?? 'That could not be saved.'); return }
    setSuppliers((cur) => cur.map((x) => (x.companyId === companyId ? { ...x, tier: tier || null } : x)))
  }
  const [rows, setRows] = useState<Row[] | null>(null)
  const [readSummary, setReadSummary] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [listSummary, setListSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [requests, setRequests] = useState<SupplierRequest[]>([])
  const [mayRecommend, setMayRecommend] = useState(false)
  const [mayDecide, setMayDecide] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [rec, setRec] = useState({ name: '', contactName: '', contactEmail: '', reason: '', skills: '' })
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [view, setView] = useState<View>('feed')
  const [filter, setFilter] = useState<NetworkFilter>('ALL')
  const [place, setPlace] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  // The star: a firm this client would send the next role to first.
  async function star(s: Supplier) {
    const on = !s.favorite
    setSuppliers((cur) => cur.map((x) => (x.companyId === s.companyId ? { ...x, favorite: on } : x)))
    try {
      await readJson(await fetch('/api/favorites', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'COMPANY', targetId: s.companyId, on }),
      }))
    } catch (err: any) {
      setSuppliers((cur) => cur.map((x) => (x.companyId === s.companyId ? { ...x, favorite: !on } : x)))
      setError(err.message)
    }
  }

  // A firm in the pipeline is on the list too, marked Pending with the
  // desk it is on — so "do we have them?" has one answer, not two.
  const listed = useMemo<Supplier[]>(() => [
    ...suppliers,
    ...requests.filter((r) => r.state === 'RECOMMENDED' || r.state === 'IN_REVIEW').map((r) => ({
      companyId: `pending-${r.id}`, name: r.name, joined: false, agreement: false,
      contacts: r.contactEmail ? [{ email: r.contactEmail, name: r.contactName, state: 'PENDING' }] : [],
      invitedAt: null, where: `Pending · ${r.stageWord}. Recommended by ${r.recommendedBy}.`, tier: null,
      pending: { requestId: r.id, stageWord: r.stageWord },
      onSiteCount: 0, onSite: false, lastEngagement: r.createdAt, favorite: false, blocked: false, blockedReason: null, location: null,
    })),
  ], [suppliers, requests])
  const places = useMemo(() => locationsOf(listed), [listed])
  const shown = useMemo(() => applyFilter(listed, filter, place, now), [listed, filter, place, now])
  const counts = useMemo(() => ({
    ALL: listed.filter((r) => !r.blocked).length,
    ON_SITE: listed.filter((r) => r.onSite && !r.blocked).length,
    RECENT: listed.filter((r) => isRecent(r.lastEngagement, now) && !r.blocked).length,
    FAVORITES: listed.filter((r) => r.favorite && !r.blocked).length,
    BLOCKED: listed.filter((r) => r.blocked).length,
  }), [listed, now])

  const loadRequests = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/supplier-requests'))
      setRequests(body.data.requests)
      setMayRecommend(body.data.mayRecommend)
      setMayDecide(body.data.mayDecide)
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers')
      const body = await readJson(res)
      setSuppliers(body.data.suppliers)
      setListSummary(body.data.summary)
      loadRequests()

      // The same firm listed twice. Two clients each list Cloudepa and
      // neither knows the other did — a real state, and one somebody has
      // to be able to fix.
      const dup = await fetch('/api/suppliers/join').then((r) => r.json()).catch(() => null)
      setPairs(dup?.data?.pairs ?? [])
    } catch (err: any) {
      setError(err.message)
    }
  }, [loadRequests])

  useEffect(() => { load() }, [load])

  // ── Recommend, mark, approve, decline ─────────────────────────────
  async function recommend() {
    setBusy(true); setError(null); setDone(null)
    try {
      const body = await readJson(await fetch('/api/supplier-requests', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec),
      }))
      setDone(body.data.says)
      setRec({ name: '', contactName: '', contactEmail: '', reason: '', skills: '' })
      setRecommending(false)
      loadRequests()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function act(id: string, payload: Record<string, unknown>) {
    setBusy(true); setError(null); setDone(null)
    try {
      const body = await readJson(await fetch(`/api/supplier-requests/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }))
      // A mark speaks through the checklist itself; only a decision gets a banner.
      if (body.data.says && payload.action !== 'mark') setDone(body.data.says)
      setNoteFor(null); setNoteText('')
      await loadRequests()
      if (payload.action === 'approve') load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function read() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/suppliers/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await readJson(res)
      setRows(body.data.rows)
      setReadSummary(body.data.summary)
      setSkipped(body.data.skipped)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!rows) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const body = await readJson(res)
      setDone(body.data.summary)
      setRows(null)
      setText('')
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function join(keepId: string, foldId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/suppliers/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keepId, foldId }),
      })
      const body = await readJson(res)
      setDone(body.data.says)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function edit(i: number, field: 'company' | 'contactName', value: string) {
    if (!rows) return
    const next = [...rows]
    next[i] = {
      ...next[i],
      [field]: value || null,
      needs: field === 'company' && value ? [] : next[i].needs,
    }
    setRows(next)
  }

  const needFirm = rows?.filter((r) => !r.company).length ?? 0

  const standingSelect = (s: Supplier) => (
    <select
      aria-label={`Standing of ${s.name}`}
      value={s.tier ?? ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setStanding(s.companyId, e.target.value)}
      className="border border-etyme-rule rounded px-2 py-1 text-[12px] bg-etyme-raised"
    >
      <option value="">{s.agreement ? 'Approved by agreement' : 'Not rated'}</option>
      {STANDING.map((o) => <option key={o.value} value={o.value}>{o.word}</option>)}
    </select>
  )

  const columns: Column<Supplier>[] = [
    {
      key: 'name', label: 'Supplier',
      render: (s) => (
        <div>
          <p className="text-etyme-ink">{s.name}</p>
          <p className="text-[11px] text-etyme-faint">{s.contacts[0]?.email ?? 'No contact on file'}</p>
        </div>
      ),
    },
    { key: 'tier', label: 'Standing', render: (s) => (s.pending ? <span className="text-[12px] text-etyme-faint">—</span> : standingSelect(s)), sortValue: (s) => s.tier ?? '' },
    { key: 'onSiteCount', label: 'On site', align: 'right', render: (s) => <span className="tabular-nums">{s.onSiteCount}</span> },
    { key: 'lastEngagement', label: 'Last engagement', render: (s) => <span className="tabular-nums text-etyme-muted">{when(s.lastEngagement)}</span>, sortValue: (s) => s.lastEngagement ?? '', hideOnMobile: true },
    { key: 'location', label: 'Location', render: (s) => <span className="text-etyme-muted">{s.location ?? '—'}</span>, hideOnMobile: true },
    { key: 'joined', label: 'Here', render: (s) => <span className={`chip ${s.pending ? 'chip--attention' : s.joined ? 'chip--verified' : 'chip--passive'}`}>{s.pending ? `Pending · ${s.pending.stageWord}` : s.joined ? 'Signed in' : 'Listed'}</span>, sortValue: (s) => (s.pending ? -1 : s.joined ? 1 : 0) },
    {
      key: 'favorite', label: 'First call', align: 'center', sortValue: (s) => (s.favorite ? 1 : 0),
      render: (s) => (s.pending ? null : <Star on={s.favorite} onClick={(e) => { e.stopPropagation(); star(s) }} name={s.name} />),
    },
  ]

  return (
    <div className="mx-auto max-w-[980px] space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Network</p>
          <h1 className="headline-serif text-[30px] leading-tight">Suppliers</h1>
          <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
            Who you buy from, and where each stands. A firm becomes a supplier when your lead, Procurement, HR and
            Finance have each said yes — anybody who raises a requirement can recommend one.
          </p>
        </div>
        {mayRecommend && !recommending && (
          <button
            onClick={() => setRecommending(true)}
            className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Recommend a supplier
          </button>
        )}
      </header>

      {/* ── Recommend one ───────────────────────────────────────────── */}
      {recommending && (
        <section className="panel space-y-3">
          <p className="stat-label">Recommend a supplier</p>
          <p className="text-[13px] text-etyme-muted">
            It walks four desks: your department lead confirms the need, Procurement qualifies the firm — experience,
            references, revenue and delivery proofs, proposal, D&amp;B — HR clears compliance and screening, and Finance
            checks the W-9 and bank details. The firm gets a link of its own to supply its side. You are told at each step.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={rec.name} onChange={(e) => setRec({ ...rec, name: e.target.value })} placeholder="Firm" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
            <input value={rec.contactEmail} onChange={(e) => setRec({ ...rec, contactEmail: e.target.value })} placeholder="Contact email (optional)" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
            <input value={rec.contactName} onChange={(e) => setRec({ ...rec, contactName: e.target.value })} placeholder="Contact name (optional)" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
            <input value={rec.skills} onChange={(e) => setRec({ ...rec, skills: e.target.value })} placeholder="What they supply — roles, skills (HR reads this)" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
            <input value={rec.reason} onChange={(e) => setRec({ ...rec, reason: e.target.value })} placeholder="Why — who they placed for you, what they are good at" className="rounded border border-etyme-rule px-3 py-2 text-[13px] sm:col-span-2" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={recommend} disabled={busy || !rec.name.trim() || !rec.reason.trim()}
              className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? 'Sending…' : 'Recommend'}
            </button>
            <button onClick={() => setRecommending(false)} className="text-[12px] text-etyme-muted hover:underline">Not now</button>
          </div>
        </section>
      )}

      {/* ── In the pipeline ─────────────────────────────────────────── */}
      {requests.some((r) => r.state === 'RECOMMENDED' || r.state === 'IN_REVIEW') && (
        <section className="space-y-3">
          <p className="stat-label">In the pipeline</p>
          {requests.filter((r) => r.state === 'RECOMMENDED' || r.state === 'IN_REVIEW').map((r) => (
            <article key={r.id} className="panel space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{r.name}</p>
                  <p className="text-[12px] text-etyme-faint">
                    Recommended by {r.recommendedBy} {when(r.createdAt)}{r.contactEmail ? ` · ${r.contactEmail}` : ''}
                    {r.skills.length > 0 && ` · supplies ${r.skills.join(', ')}`}
                  </p>
                </div>
                <span className="chip chip--passive">Pending · {r.stageWord}</span>
              </div>
              <p className="text-[13px] text-etyme-muted">“{r.reason}”</p>

              {/* The walk */}
              <ol className="flex flex-wrap gap-2">
                {r.steps.map((s) => (
                  <li key={s.stage} className={`rounded-full border px-3 py-1 text-[12px] ${
                    s.status === 'done' ? 'border-etyme-verified/40 bg-etyme-verified/10 text-etyme-verified'
                    : s.status === 'now' ? 'border-etyme-ink bg-etyme-ink text-white'
                    : s.status === 'declined' ? 'border-etyme-attention bg-etyme-attention/10 text-etyme-attention'
                    : 'border-etyme-rule text-etyme-faint'}`}
                    title={s.by ? `${s.by}${s.note ? `: ${s.note}` : ''}` : undefined}>
                    {s.status === 'done' ? '✓ ' : ''}{s.word}{s.by && s.status === 'done' ? ` · ${s.by.split(' ')[0]}` : ''}
                  </li>
                ))}
              </ol>
              {r.decisions.length > 0 && (
                <ul className="space-y-0.5">
                  {r.decisions.map((d, i) => (
                    <li key={i} className="text-[12px] text-etyme-muted">{d.byName} ({STAGE_WORD[d.stage]}) {d.outcome === 'APPROVED' ? 'said yes' : 'declined'}{d.note ? `: ${d.note.replace(/\.$/, '')}` : ''}.</li>
                  ))}
                </ul>
              )}

              {/* What this desk is asked, and what it can see */}
              {r.stage !== 'DONE' && <p className="text-[13px] text-etyme-ink">{STAGE_ASKS[r.stage]}</p>}

              {(r.stage === 'LEAD' || r.stage === 'PROCUREMENT') && (
                <div className="rounded-lg border border-etyme-rule bg-etyme-surface px-3 py-2 text-[12.5px]">
                  <p className="text-etyme-muted">What they supply, in the recommender’s words: <span className="text-etyme-ink">{r.skills.length ? r.skills.join(', ') : 'not said'}</span></p>
                  {r.application?.skills?.length ? <p className="text-etyme-muted">In their own words: <span className="text-etyme-ink">{r.application.skills.join(', ')}</span></p> : null}
                </div>
              )}

              {(r.stage === 'PROCUREMENT' || r.stage === 'HR' || r.stage === 'FINANCE') && (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-etyme-muted">
                    <span>
                      {r.applied ? `The firm supplied its side ${when(r.applied)}.` : r.linkSentAt ? `Link sent ${when(r.linkSentAt)}; nothing back yet.` : 'No link sent — add a contact email.'}
                    </span>
                    {r.contactEmail && r.mayAct && (
                      <button onClick={() => act(r.id, { action: 'resend' })} disabled={busy} className="rounded border border-etyme-rule px-2 py-0.5 text-[11px] hover:border-etyme-action">Send the link again</button>
                    )}
                    <a href={r.link} target="_blank" rel="noreferrer" className="text-[11px] text-etyme-action hover:underline">Open their page</a>
                  </div>
                  {r.application && (
                    <div className="grid grid-cols-1 gap-2 rounded-lg border border-etyme-rule bg-etyme-surface px-3 py-2 text-[12.5px] sm:grid-cols-2">
                      <p><span className="text-etyme-faint">Legal name</span> <span className="text-etyme-ink">{r.application.legalName ?? '—'}</span></p>
                      {r.stage === 'FINANCE' && <p><span className="text-etyme-faint">Bank</span> <span className="text-etyme-ink">{r.application.bank ? `${r.application.bank.bankName} · ${r.application.bank.accountName} · ····${r.application.bank.last4}` : '—'}</span></p>}
                      {r.stage === 'PROCUREMENT' && <p className="sm:col-span-2"><span className="text-etyme-faint">Experience</span> <span className="text-etyme-ink">{r.application.experience ?? '—'}</span></p>}
                      {r.stage === 'PROCUREMENT' && <p className="sm:col-span-2"><span className="text-etyme-faint">References</span> <span className="text-etyme-ink">{(r.application.references ?? []).map((x: any) => `${x.name}, ${x.company}`).join(' · ') || '—'}</span></p>}
                    </div>
                  )}
                  <p className="text-[11px] uppercase tracking-[0.12em] text-etyme-faint">{STAGE_WORD[r.stage]} verifies</p>
                  <ul className="divide-y divide-etyme-rule rounded-lg border border-etyme-rule bg-etyme-surface">
                    {r.checklist.filter((item) => item.desk === r.stage).map((item) => (
                      <li key={item.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
                        <span className={`w-5 text-center ${item.state === 'HELD' ? 'text-etyme-verified' : item.state === 'PROVIDED' ? 'text-etyme-action' : item.state === 'WAIVED' ? 'text-etyme-attention' : 'text-etyme-faint'}`}>
                          {item.state === 'HELD' ? '✓' : item.state === 'PROVIDED' ? '•' : item.state === 'WAIVED' ? '~' : '○'}
                        </span>
                        <span className={`flex-1 min-w-[200px] ${item.state === 'MISSING' ? 'text-etyme-ink' : 'text-etyme-muted'}`}>
                          {item.label}
                          {!item.required && <span className="text-etyme-faint"> · optional</span>}
                          <span className="text-etyme-faint"> · {item.by === 'VENDOR' ? 'from the firm' : 'this desk'}</span>
                          {item.fileName && <span className="text-etyme-faint"> — {item.fileName}</span>}
                          {item.state === 'PROVIDED' && <span className="text-etyme-action"> · received, verify</span>}
                          {item.note && <span className="text-etyme-faint"> — {item.note}</span>}
                        </span>
                        {r.mayAct && (item.state === 'MISSING' || item.state === 'PROVIDED') && (
                          <span className="flex gap-1">
                            <button onClick={() => act(r.id, { action: 'mark', key: item.key, state: 'HELD' })} disabled={busy}
                              className="rounded border border-etyme-rule px-2 py-0.5 text-[11px] text-etyme-ink hover:border-etyme-action">{item.state === 'PROVIDED' ? 'Verified' : 'On file'}</button>
                            <button onClick={() => { setNoteFor(`${r.id}:${item.key}`); setNoteText('') }} disabled={busy}
                              className="rounded border border-etyme-rule px-2 py-0.5 text-[11px] text-etyme-muted hover:border-etyme-action">Waive…</button>
                          </span>
                        )}
                        {r.mayAct && (item.state === 'HELD' || item.state === 'WAIVED') && (
                          <button onClick={() => act(r.id, { action: 'mark', key: item.key, state: 'MISSING' })} disabled={busy}
                            className="text-[11px] text-etyme-faint hover:underline">undo</button>
                        )}
                        {noteFor === `${r.id}:${item.key}` && (
                          <form className="flex w-full flex-wrap gap-2 pl-7" onSubmit={(e) => { e.preventDefault(); act(r.id, { action: 'mark', key: item.key, state: 'WAIVED', note: noteText }) }}>
                            <input autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Why this can be waived — it stays on the record"
                              className="flex-1 min-w-[220px] rounded border border-etyme-rule px-2 py-1 text-[12px]" />
                            <button type="submit" disabled={!noteText.trim() || busy} className="rounded bg-etyme-attention px-2 py-1 text-[11px] text-white disabled:opacity-40">Waive</button>
                            <button type="button" onClick={() => setNoteFor(null)} className="text-[11px] text-etyme-muted">Not now</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className={`text-[12.5px] ${r.readiness.ok ? 'text-etyme-verified' : 'text-etyme-muted'}`}>{r.readiness.says}</p>
                </>
              )}
              {r.stage === 'LEAD' && (
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-etyme-muted">
                  <span>{r.applied ? `The firm supplied its side ${when(r.applied)}.` : r.linkSentAt ? `Link sent to the firm ${when(r.linkSentAt)}.` : 'No link sent — add a contact email.'}</span>
                  <a href={r.link} target="_blank" rel="noreferrer" className="text-[11px] text-etyme-action hover:underline">Open their page</a>
                </div>
              )}

              {/* The decision, for whoever holds this desk */}
              {r.mayAct ? (
                <div className="flex flex-wrap items-center gap-2">
                  {noteFor === `${r.id}:approve` ? (
                    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act(r.id, { action: 'approve', note: noteText }) }}>
                      <input autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="A line for the record (optional)"
                        className="min-w-[260px] rounded border border-etyme-rule px-2 py-1 text-[12px]" />
                      <button type="submit" disabled={busy || !r.readiness.ok} className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                        {r.stage === 'DONE' ? 'Done' : STAGE_VERB[r.stage]}
                      </button>
                      <button type="button" onClick={() => setNoteFor(null)} className="text-[12px] text-etyme-muted">Not now</button>
                    </form>
                  ) : (
                    <button onClick={() => { setNoteFor(`${r.id}:approve`); setNoteText('') }} disabled={busy || !r.readiness.ok}
                      title={!r.readiness.ok ? r.readiness.says : undefined}
                      className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                      {r.stage === 'DONE' ? 'Done' : STAGE_VERB[r.stage]}
                    </button>
                  )}
                  {noteFor === `${r.id}:decline` ? (
                    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act(r.id, { action: 'decline', note: noteText }) }}>
                      <input autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Why — the recommender reads this"
                        className="min-w-[220px] rounded border border-etyme-rule px-2 py-1 text-[12px]" />
                      <button type="submit" disabled={!noteText.trim() || busy} className="rounded bg-etyme-attention px-3 py-1 text-[12px] text-white disabled:opacity-40">Decline</button>
                      <button type="button" onClick={() => setNoteFor(null)} className="text-[12px] text-etyme-muted">Not now</button>
                    </form>
                  ) : (
                    <button onClick={() => { setNoteFor(`${r.id}:decline`); setNoteText('') }} disabled={busy} className="text-[12px] text-etyme-muted hover:underline">Decline…</button>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-etyme-faint">{r.whyNot}</p>
              )}
            </article>
          ))}
        </section>
      )}

      {/* ── Not approved ────────────────────────────────────────────── */}
      {requests.some((r) => r.state === 'DECLINED') && (
        <section className="space-y-2">
          <p className="stat-label">Not approved</p>
          {requests.filter((r) => r.state === 'DECLINED').slice(0, 5).map((r) => (
            <p key={r.id} className="text-[12.5px] text-etyme-muted">
              <span className="text-etyme-ink">{r.name}</span> — {r.decidedBy ?? 'a desk'}: {r.decisionNote}
            </p>
          ))}
        </section>
      )}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {done && (
        <div className="panel">
          <p className="text-[13px]" style={{ color: 'var(--color-verified)' }}>{done}</p>
        </div>
      )}

      {/* ── What it made of the paste ─────────────────────────────── */}
      {rows && (
        <section className="space-y-3">
          <p className="text-[14px] text-etyme-ink">{readSummary}</p>

          {rows.length > 0 && (
            <div className="panel space-y-2">
              {rows.map((r, i) => (
                <div
                  key={r.email}
                  className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.2fr] items-center gap-2 border-b
                             border-etyme-rule pb-2 last:border-0 last:pb-0"
                >
                  <input
                    value={r.company ?? ''}
                    onChange={(e) => edit(i, 'company', e.target.value)}
                    placeholder="Which firm?"
                    className={`rounded border px-2 py-1 text-[13px] ${
                      r.company ? 'border-etyme-rule' : 'border-etyme-attention'
                    }`}
                  />
                  <input
                    value={r.contactName ?? ''}
                    onChange={(e) => edit(i, 'contactName', e.target.value)}
                    placeholder="Contact"
                    className="rounded border border-etyme-rule px-2 py-1 text-[13px]"
                  />
                  <span className="font-mono text-[12px] text-etyme-muted">{r.email}</span>
                </div>
              ))}
            </div>
          )}

          {skipped.length > 0 && (
            <p className="text-[12px] text-etyme-faint">
              Ignored, no address in them: {skipped.slice(0, 4).join(' · ')}
              {skipped.length > 4 && ` and ${skipped.length - 4} more`}
            </p>
          )}

          {rows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={add}
                disabled={busy || needFirm > 0}
                className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white
                           disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Adding…' : `Add ${rows.length} ${rows.length === 1 ? 'contact' : 'contacts'}`}
              </button>
              {needFirm > 0 && (
                <span className="text-[12px] text-etyme-attention">
                  {needFirm} still {needFirm === 1 ? 'needs' : 'need'} a firm — a personal
                  address does not say which.
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── The same firm, listed twice ───────────────────────────── */}
      {pairs.length > 0 && (
        <section className="space-y-3">
          <p className="stat-label">The same firm, listed twice</p>
          {pairs.map((p) => (
            <article key={p.domain} className="panel">
              <p className="text-[13px] text-etyme-ink">{p.says}</p>
              {/* Said before the button, not after. A dialog that only
                  says "this cannot be undone" is one people click
                  through. */}
              {p.moving.length > 0 && (
                <p className="mt-1 text-[12px] text-etyme-muted">
                  Moving: {p.moving.join(', ')}.
                </p>
              )}
              {p.ok && p.keep && p.fold ? (
                <button
                  onClick={() => join(p.keep!.id, p.fold!.id)}
                  disabled={busy}
                  className="mt-3 rounded border border-etyme-rule px-3 py-1.5 text-[12px]
                             text-etyme-ink hover:border-etyme-action disabled:opacity-40"
                >
                  {p.button}
                </button>
              ) : (
                <p className="mt-2 text-[12px] text-etyme-faint">{p.button}</p>
              )}
            </article>
          ))}
        </section>
      )}

      {/* ── Who you buy from ──────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="stat-label">Who you buy from</p>
            <p className="text-[13px] text-etyme-muted">{listSummary}</p>
          </div>
          {suppliers.length > 0 && <ViewToggle view={view} onChange={setView} />}
        </div>

        {suppliers.length > 0 && (
          <FilterBar filter={filter} onFilter={setFilter} counts={counts} places={places} place={place} onPlace={setPlace} />
        )}

        {suppliers.length > 0 && shown.length === 0 && (
          <div className="panel">
            <p className="text-[13px] text-etyme-muted">{emptyWord(filter, place).replace(/^Nobody/, 'No supplier')}</p>
          </div>
        )}

        {view === 'table' && suppliers.length > 0 && (
          <DataTable<Supplier>
            columns={columns}
            data={shown}
            rowKey={(s) => s.companyId}
            searchPlaceholder="Search by firm, contact or place…"
            searchFilter={(s, q) => `${s.name} ${s.contacts.map((c) => c.email).join(' ')} ${s.location ?? ''}`.toLowerCase().includes(q.toLowerCase())}
            exportName="suppliers"
            defaultPageSize={50}
            emptyMessage={emptyWord(filter, place).replace(/^Nobody/, 'No supplier')}
            rowClassName={(s) => (s.blocked ? 'opacity-70' : '')}
          />
        )}

        {view === 'feed' && shown.map((s) => (
          <article key={s.companyId} className="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  {s.name}
                  {s.location && <span className="ml-2 text-[12px] font-normal text-etyme-faint">{s.location}</span>}
                </p>
                <p className="text-[12px] text-etyme-faint">
                  {s.contacts.map((c) => c.email).join(' · ') || 'No contact on file'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.pending ? (
                  <span className="chip chip--attention">Pending · {s.pending.stageWord}</span>
                ) : (
                  <>
                    <Star on={s.favorite} onClick={() => star(s)} name={s.name} />
                    {/* Their standing with you. The VENDOR_TIER rule reads it;
                        an agreement on file counts as approved until you say
                        otherwise. */}
                    {standingSelect(s)}
                    <span className={`chip ${s.joined ? 'chip--verified' : 'chip--passive'}`}>
                      {s.joined ? 'Signed in' : 'Listed'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="mt-2 text-[12px] text-etyme-muted">
              {s.onSiteCount > 0 ? `${s.onSiteCount} ${s.onSiteCount === 1 ? 'person' : 'people'} on site now. ` : ''}
              {s.lastEngagement ? `Last engagement ${when(s.lastEngagement)}. ` : ''}
              {s.where}
            </p>
            {s.blocked && (
              <p className="mt-1 text-[12px] text-etyme-attention">Blocked{s.blockedReason ? ` — ${s.blockedReason}` : ''}. Nothing is sent to them.</p>
            )}
          </article>
        ))}
      </section>

      {/* ── Import, for Procurement ─────────────────────────────────── */}
      {mayDecide && (
        <details className="panel">
          <summary className="cursor-pointer text-[13px] text-etyme-muted">
            Import the suppliers you already have — a pasted list, for firms Procurement has approved before
          </summary>
          <div className="mt-3 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={
            'Cloudepa Systems, Ravi Menon, ravi@cloudepa.com\n' +
            'Vertex Talent Ltd, priya@vertextalent.io\n' +
            'Brightmoor Staffing <hello@brightmoor.co.uk>'
          }
          className="w-full rounded-lg border border-etyme-rule bg-white p-3 font-mono
                     text-[12px] leading-relaxed text-etyme-ink placeholder:text-etyme-faint"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={read}
            disabled={busy || text.trim().length === 0}
            className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Reading…' : 'Read the list'}
          </button>
          <span className="text-[12px] text-etyme-faint">
            A spreadsheet column, a signature block, or an Outlook To: field.
          </span>
        </div>

          </div>
        </details>
      )}
    </div>
  )
}
