'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Supplier diversity under Proposals (record 132, plugin 5): the firm's
 * Certifications panel and its portal Registrations list. The page draws
 * them only where the plugin is on, because the page itself is only drawn
 * there. Every button is drawn only where its route will take it. A
 * certification is claimed only once it is held; the Owner records it, and
 * so attests an ownership fact. The agent drafts answers; a person submits
 * on the portal and marks it here.
 */

const field = 'rounded-md border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-sm text-etyme-ink w-full'
const label = 'block text-[11px] text-etyme-muted mb-1'

interface Cert { id: string; kind: string; name: string; certifier: string | null; status: string; number: string | null; expiresOn: string | null; held: boolean; says: string }
interface Fact { fact: string; words: string; attested: boolean; by: string | null; at: string | null }
interface Paper { id: string; name: string; status: string; on: string }
interface Registration { id: string; buyerName: string; portalUrl: string | null; status: string; statusSays: string; questions: string | null; answers: string | null; submittedBy: string | null; submittedAt: string | null }

const KIND_WORDS: Record<string, string> = { MBE: 'MBE', WBE: 'WBE', EIGHT_A: '8(a)', HUBZONE: 'HUBZone', OTHER: 'Another one' }
const STATUS_WORDS: Record<string, string> = { NOT_HELD: 'Not held', APPLIED: 'Applied for', HELD: 'Held', LAPSED: 'Lapsed' }

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; says: string | null }> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const out = await res.json().catch(() => ({}))
  return res.ok ? { ok: true, says: null } : { ok: false, says: out.error?.message ?? 'That did not go through.' }
}

export function CertificationsPanel() {
  const [certs, setCerts] = useState<Cert[] | null>(null)
  const [facts, setFacts] = useState<Fact[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [mayWrite, setMayWrite] = useState(false)
  const [entity, setEntity] = useState<string | null>(null)
  const [entityDraft, setEntityDraft] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({ kind: 'EIGHT_A', otherName: '', certifier: '', status: 'APPLIED', number: '', issuedOn: '', expiresOn: '', documentId: '' })

  const load = useCallback(async () => {
    const [c, f, e] = await Promise.all([fetch('/api/governance/certifications'), fetch('/api/governance/ownership-attestations'), fetch('/api/diversity/legal-entity')])
    const cb = await c.json().catch(() => ({})); const fb = await f.json().catch(() => ({})); const eb = await e.json().catch(() => ({}))
    if (!c.ok) { setErr(cb.error?.message ?? 'The certifications could not be read.'); return }
    setCerts(cb.data); setMayWrite(Boolean(cb.mayWrite)); setFacts(fb.data ?? []); setEntity(eb.data?.legalName ?? null); setErr(null)
    if (cb.mayWrite) {
      const p = await fetch('/api/diversity/certificate-papers'); const pb = await p.json().catch(() => ({}))
      if (p.ok) setPapers(pb.data ?? [])
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(url: string, method: string, body: unknown, ok: string) {
    setSaid(null); setErr(null)
    const r = await send(url, method, body)
    if (!r.ok) { setErr(r.says); return false }
    setSaid(ok); await load(); return true
  }

  async function record(e: React.FormEvent) {
    e.preventDefault()
    await act('/api/governance/certifications', 'POST', {
      kind: form.kind, otherName: form.otherName || undefined, certifier: form.certifier || undefined, status: form.status, number: form.number || undefined,
      issuedOn: form.issuedOn || undefined, expiresOn: form.expiresOn || undefined, documentId: form.documentId || undefined,
    }, 'Recorded. A certification counts as held only with its certificate on file and while it is in date.')
  }

  return (
    <section className="panel mb-6 text-sm" aria-label="Certifications">
      <h2 className="text-base font-medium text-etyme-ink">Certifications</h2>
      <p className="mt-1 text-etyme-muted">What the firm holds, as the Owner recorded it. A certification is claimed in a bid only while it is held, with its certificate on file and in date. Etyme never says one is held for you.</p>
      {said && <p role="status" className="mt-2 text-etyme-verified">{said}</p>}
      {err && <p role="alert" className="mt-2 text-etyme-attention">{err}</p>}

      <div className="mt-3">
        <span className={label}>The legal entity your bids are made in</span>
        {mayWrite ? (
          <div className="flex flex-wrap gap-2">
            <input aria-label="Legal entity name" className={`${field} sm:w-80`} value={entityDraft || entity || ''} onChange={(e) => setEntityDraft(e.target.value)} />
            <button type="button" className="btn-secondary" onClick={() => act('/api/diversity/legal-entity', 'PUT', { legalName: entityDraft || entity || '' }, 'Saved. Bids and registrations name this entity.')}>Save the legal entity</button>
          </div>
        ) : <p className={entity ? 'text-etyme-ink' : 'text-etyme-attention'}>{entity ?? 'Not set. The Owner enters it.'}</p>}
      </div>

      <ul className="mt-3 space-y-1" aria-label="Certifications held and applied for">
        {certs?.length === 0 && <li className="text-etyme-muted">No certification is recorded. Nothing is claimed in any bid.</li>}
        {certs?.map((c) => (
          <li key={c.id}>
            <span className="text-etyme-ink">{c.name}</span>{' '}
            <span className={c.held ? 'text-etyme-verified' : 'text-etyme-attention'}>{STATUS_WORDS[c.status] ?? c.status}</span>
            <span className="text-etyme-muted"> — {c.says}{c.certifier ? ` Certifier: ${c.certifier}.` : ''}{c.number ? ` Number ${c.number}.` : ''}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-medium text-etyme-ink">Ownership, in the Owner’s own words</h3>
      <ul className="mt-1 space-y-1" aria-label="Ownership facts">
        {facts.filter((f) => f.fact !== 'OTHER').map((f) => (
          <li key={f.fact} className="flex flex-wrap items-center gap-2">
            <span className="text-etyme-ink">{f.words}</span>
            {f.attested ? <span className="text-etyme-verified">Attested by {f.by} on {f.at?.slice(0, 10)}</span> : <span className="text-etyme-muted">Not attested. Bids and registrations do not say it.</span>}
            {mayWrite && <button type="button" className="btn-secondary" onClick={() => act('/api/governance/ownership-attestations', 'POST', { fact: f.fact, attested: !f.attested }, f.attested ? 'Withdrawn.' : 'Attested, with your name and today’s date.')}>{f.attested ? 'Withdraw' : 'I attest this is true of the firm'}</button>}
          </li>
        ))}
      </ul>

      {mayWrite ? (
        <form onSubmit={record} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label><span className={label}>Certification</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={field}>{Object.entries(KIND_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {form.kind === 'OTHER' && <label><span className={label}>Its name</span><input value={form.otherName} onChange={(e) => setForm({ ...form, otherName: e.target.value })} className={field} /></label>}
          <label><span className={label}>Where it stands</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={field}>{Object.entries(STATUS_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className={label}>Certified by</span><input value={form.certifier} onChange={(e) => setForm({ ...form, certifier: e.target.value })} className={field} /></label>
          <label><span className={label}>Certificate number</span><input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className={field} /></label>
          <label><span className={label}>Issued</span><input type="date" value={form.issuedOn} onChange={(e) => setForm({ ...form, issuedOn: e.target.value })} className={field} /></label>
          <label><span className={label}>Expires</span><input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} className={field} /></label>
          <label className="sm:col-span-2"><span className={label}>The certificate, from the company’s papers</span>
            <select value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })} className={field}>
              <option value="">None yet</option>{papers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.on}</option>)}
            </select></label>
          <div className="sm:col-span-3"><button type="submit" className="btn-primary">Record the certification</button></div>
        </form>
      ) : <p className="mt-3 text-xs text-etyme-muted">Only an Owner records a certification or attests ownership.</p>}
    </section>
  )
}

export function RegistrationsList() {
  const [rows, setRows] = useState<Registration[] | null>(null)
  const [mayWrite, setMayWrite] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({ buyerName: '', portalUrl: '', questions: '' })
  const [edit, setEdit] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/diversity/registrations'); const body = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(body.error?.message ?? 'The registrations could not be read.'); return }
    setRows(body.data); setMayWrite(Boolean(body.mayWrite)); setErr(null)
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(url: string, method: string, body: unknown, ok: string) {
    setSaid(null); setErr(null)
    const r = await send(url, method, body)
    if (!r.ok) { setErr(r.says); return false }
    setSaid(ok); await load(); return true
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (await act('/api/diversity/registrations', 'POST', { buyerName: form.buyerName, portalUrl: form.portalUrl || undefined, questions: form.questions || undefined }, 'Recorded. The agent drafts the answers from your record when it next runs.')) setForm({ buyerName: '', portalUrl: '', questions: '' })
  }

  return (
    <section className="panel mb-6 text-sm" aria-label="Registrations">
      <h2 className="text-base font-medium text-etyme-ink">Supplier-diversity registrations</h2>
      <p className="mt-1 text-etyme-muted">One line per buyer’s portal. Paste the portal’s questions and the agent drafts answers from your record, and leaves to you whatever the record does not answer. You submit on the portal yourself, then mark it here.</p>
      {said && <p role="status" className="mt-2 text-etyme-verified">{said}</p>}
      {err && <p role="alert" className="mt-2 text-etyme-attention">{err}</p>}
      {mayWrite && (
        <form onSubmit={start} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><span className={label}>Buyer</span><input value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} required className={field} /></label>
          <label><span className={label}>Link to the portal</span><input value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} placeholder="https://" className={field} /></label>
          <label className="sm:col-span-2"><span className={label}>The portal’s questions, pasted as text</span><textarea value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} rows={4} className={field} /></label>
          <div className="sm:col-span-2"><button type="submit" className="btn-primary">Record the registration</button></div>
        </form>
      )}
      {rows?.length === 0 && <p className="mt-3 text-etyme-muted">No registrations recorded yet.</p>}
      <div className="mt-3 space-y-3">
        {rows?.map((r) => (
          <div key={r.id} className="rounded-md border border-etyme-rule p-3" aria-label={`Registration ${r.buyerName}`}>
            <h3 className="font-medium text-etyme-ink">{r.buyerName} <span className="text-xs text-etyme-muted">· {r.statusSays}{r.submittedBy ? ` by ${r.submittedBy} on ${r.submittedAt?.slice(0, 10)}` : ''}</span></h3>
            {r.portalUrl && <p className="text-xs text-etyme-muted">Portal: {r.portalUrl}</p>}
            {r.answers ? (
              mayWrite && r.status !== 'SUBMITTED' ? (
                <>
                  <textarea aria-label={`Answers for ${r.buyerName}`} rows={8} value={edit[r.id] ?? r.answers} onChange={(e) => setEdit({ ...edit, [r.id]: e.target.value })} className={`${field} mt-2`} />
                  {edit[r.id] !== undefined && edit[r.id] !== r.answers && <button type="button" className="btn-secondary mt-2" onClick={async () => { if (await act(`/api/diversity/registrations/${r.id}`, 'PATCH', { answers: edit[r.id] }, 'Your words are saved.')) setEdit((m) => { const n = { ...m }; delete n[r.id]; return n }) }}>Save my words</button>}
                </>
              ) : <pre className="mt-2 whitespace-pre-wrap rounded-md bg-etyme-sunk p-3 text-xs">{r.answers}</pre>
            ) : <p className="mt-2 text-etyme-muted">{r.questions ? 'No answers yet. The agent drafts them on its next run, if it is on.' : 'No questions pasted yet.'}</p>}
            {mayWrite && r.status !== 'SUBMITTED' && r.answers && <button type="button" className="btn-primary mt-2" onClick={() => act(`/api/diversity/registrations/${r.id}/submitted`, 'POST', {}, 'Recorded as submitted on the portal, with your name and today’s date.')}>I submitted it on the portal</button>}
          </div>
        ))}
      </div>
    </section>
  )
}
