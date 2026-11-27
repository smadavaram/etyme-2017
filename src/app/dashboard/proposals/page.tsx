'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { RefusedState, LoadingState } from '@/components/ui'
import { CertificationsPanel, RegistrationsList } from './diversity-panels'

/**
 * Public-sector proposals (record 124, plugin 5): the firm's bids, what the
 * agent drafted from its own record, what is still missing, and who says
 * yes. A person records the bid and pastes its requirements; the agent
 * drafts and reminds; a person approves, and a person says it was sent.
 * Every button is drawn only where its route will take it. While the plugin
 * is off the page draws the route's own sentence and nothing else.
 */

interface Piece { id: string; kind: string; label: string; source: string | null; haveIt: boolean }
interface Flag { text: string; status: 'MISSING_PIECE' | 'A_PERSON_WRITES'; says: string }
interface Proposal {
  id: string; title: string; buyer: string | null; sourceUrl: string | null; dueAt: string | null
  state: string; stateSays: string; draft: string | null; missing: number; pieces: Piece[]; flags: Flag[]; nothingToCheck: string | null
  setAside: string | null; eligibility: { eligible: boolean; says: string | null }
}

const field = 'rounded-md border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-sm text-etyme-ink w-full'
const label = 'block text-[11px] text-etyme-muted mb-1'

export default function ProposalsPage() {
  const section = usePageSection('/dashboard/proposals')
  const [rows, setRows] = useState<Proposal[] | null>(null)
  const [mayWrite, setMayWrite] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', buyer: '', dueAt: '', sourceUrl: '', requirements: '', requiresCertification: '', requiresCertificationName: '' })
  const [where, setWhere] = useState<Record<string, string>>({})
  const [edit, setEdit] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/proposals')
    const body = await res.json().catch(() => ({}))
    if (res.status === 403) { setRefused(body.error?.message ?? 'This page is not part of your seat.'); return }
    if (!res.ok) { setErr(body.error?.message ?? 'The proposals could not be read.'); return }
    setRows(body.data); setMayWrite(Boolean(body.mayWrite)); setErr(null)
  }, [])
  useEffect(() => { void load() }, [load])

  async function call(url: string, method: string, body: unknown, ok: string) {
    setSaid(null); setErr(null)
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(out.error?.message ?? 'That did not go through.'); return false }
    setSaid(ok); await load(); return true
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    const done = await call('/api/proposals', 'POST', {
      title: form.title, buyer: form.buyer || undefined, dueAt: form.dueAt || undefined, sourceUrl: form.sourceUrl || undefined, requirements: form.requirements || undefined,
      requiresCertification: form.requiresCertification || undefined, requiresCertificationName: form.requiresCertificationName || undefined,
    }, 'Recorded. The proposals agent drafts it from your record when it next runs.')
    if (done) setForm({ title: '', buyer: '', dueAt: '', sourceUrl: '', requirements: '', requiresCertification: '', requiresCertificationName: '' })
  }

  if (refused) return <RefusedState says={refused} />
  if (!rows && !err) return <LoadingState says="Reading the proposals…" />

  return (
    <div className="animate-fade-in">
      <div className="page-head mb-6">
        {section && <p className="eyebrow">{section}</p>}
        <h1>Proposals</h1>
        <p>Public-sector bids. Record the bid and paste its requirements. The agent drafts a response from your own record and says what is missing. A person approves it, and a person sends it to the agency.</p>
      </div>

      {said && <p role="status" className="mb-3 text-sm text-etyme-verified">{said}</p>}
      {err && <p role="alert" className="mb-3 text-sm text-etyme-attention">{err}</p>}

      <CertificationsPanel />
      <RegistrationsList />

      {mayWrite && (
        <form onSubmit={start} className="panel mb-6 grid gap-3 sm:grid-cols-2">
          <label><span className={label}>Solicitation title or number</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className={field} /></label>
          <label><span className={label}>Agency</span>
            <input value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} className={field} /></label>
          <label><span className={label}>Due day</span>
            <input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} className={field} /></label>
          <label><span className={label}>Link to the solicitation</span>
            <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://" className={field} /></label>
          <label><span className={label}>Set aside for a certification? Leave empty for an open bid</span>
            <select value={form.requiresCertification} onChange={(e) => setForm({ ...form, requiresCertification: e.target.value })} className={field}>
              <option value="">Open bid</option><option value="MBE">MBE</option><option value="WBE">WBE</option><option value="EIGHT_A">8(a)</option><option value="HUBZONE">HUBZone</option><option value="OTHER">Another one</option>
            </select></label>
          {form.requiresCertification === 'OTHER' && <label><span className={label}>Its name</span>
            <input value={form.requiresCertificationName} onChange={(e) => setForm({ ...form, requiresCertificationName: e.target.value })} className={field} /></label>}
          <label className="sm:col-span-2"><span className={label}>Requirements, pasted as text</span>
            <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={5} className={field} /></label>
          <div className="sm:col-span-2"><button type="submit" className="btn-primary">Record the bid</button></div>
        </form>
      )}

      {rows && rows.length === 0 && <p className="text-sm text-etyme-muted">No bids recorded yet. Record one above and the agent drafts it.</p>}
      <div className="space-y-4">
        {rows?.map((p) => (
          <section key={p.id} className="panel text-sm" aria-label={`Proposal ${p.title}`}>
            <h2 className="text-base font-medium text-etyme-ink">
              {p.title} <span className="text-xs text-etyme-muted">· {p.stateSays}{p.dueAt ? ` · due ${p.dueAt}` : ''}{p.buyer ? ` · ${p.buyer}` : ''}</span>
            </h2>
            {p.sourceUrl && <p className="text-xs text-etyme-muted">Solicitation: {p.sourceUrl}</p>}
            {p.eligibility && !p.eligibility.eligible && <p role="alert" className="mt-1 text-etyme-attention">{p.eligibility.says} It is not put up for approval as eligible.</p>}
            <p className="mt-1 text-etyme-muted">{p.missing === 0 ? 'Every piece is in hand.' : `${p.missing} ${p.missing === 1 ? 'piece is' : 'pieces are'} still missing.`}</p>

            {p.nothingToCheck && <p className="mt-2 text-etyme-muted">{p.nothingToCheck}</p>}
            {p.flags.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label="Requirements the record does not answer">
                {p.flags.map((f) => <li key={f.text} className="text-etyme-attention">{f.text} <span className="text-etyme-muted">— {f.says}</span></li>)}
              </ul>
            )}

            <ul className="mt-3 space-y-2" aria-label="Pieces">
              {p.pieces.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-etyme-ink">{x.label}</span>
                  {x.haveIt ? <span className="text-etyme-verified">In hand: {x.source}</span> : <span className="text-etyme-attention">Missing</span>}
                  {mayWrite && p.state !== 'APPROVED' && p.state !== 'SUBMITTED' && (x.haveIt
                    ? <button type="button" className="btn-secondary" onClick={() => call(`/api/proposals/${p.id}/pieces/${x.id}`, 'PATCH', { haveIt: false }, 'Taken back. The proposal waits on this piece again.')}>Take back</button>
                    : <>
                      <input aria-label={`Where ${x.label} is kept`} placeholder="Where it is kept" value={where[x.id] ?? ''} onChange={(e) => setWhere({ ...where, [x.id]: e.target.value })} className={`${field} sm:w-64`} />
                      <button type="button" className="btn-secondary" onClick={() => call(`/api/proposals/${p.id}/pieces/${x.id}`, 'PATCH', { haveIt: true, source: where[x.id] ?? '' }, 'Marked in hand.')}>Mark in hand</button>
                    </>)}
                </li>
              ))}
            </ul>

            {p.draft ? (
              <div className="mt-3">
                <span className={label}>The draft. Read it and change any of it.</span>
                {mayWrite && p.state !== 'APPROVED' && p.state !== 'SUBMITTED' ? (
                  <>
                    <textarea aria-label={`Draft for ${p.title}`} rows={12} value={edit[p.id] ?? p.draft} onChange={(e) => setEdit({ ...edit, [p.id]: e.target.value })} className={field} />
                    {edit[p.id] !== undefined && edit[p.id] !== p.draft && (
                      <button type="button" className="btn-secondary mt-2" onClick={async () => { if (await call(`/api/proposals/${p.id}`, 'PATCH', { draft: edit[p.id] }, 'Your words are saved.')) setEdit((m) => { const n = { ...m }; delete n[p.id]; return n }) }}>Save my words</button>
                    )}
                  </>
                ) : <pre className="whitespace-pre-wrap rounded-md bg-etyme-sunk p-3 text-xs">{p.draft}</pre>}
              </div>
            ) : <p className="mt-3 text-etyme-muted">No draft yet. The agent writes one on its next run, if it is on.</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {mayWrite && p.state === 'READY_FOR_PERSON' && p.missing === 0 && <button type="button" className="btn-primary" onClick={() => call(`/api/proposals/${p.id}/approve`, 'POST', {}, 'Approved. Nothing has gone to the agency: send it yourself, then mark it sent.')}>Approve this draft</button>}
              {mayWrite && p.state === 'APPROVED' && <button type="button" className="btn-primary" onClick={() => call(`/api/proposals/${p.id}/submitted`, 'POST', {}, 'Recorded as sent to the agency.')}>I sent it to the agency</button>}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
