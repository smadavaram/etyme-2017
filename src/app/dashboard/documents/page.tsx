'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { statusWord } from '@/lib/document-request'

/**
 * Paperwork — what the company asks people and firms for, and where
 * each request stands.
 *
 * A working surface: the library of things this company asks for (a
 * W-9, an NDA, a certificate of insurance) and every request made from
 * it, with the one thing to do next on each row. Asking sends the
 * person a note and a place to answer; a signed NDA or an uploaded W-9
 * comes back here as "on file" the moment they do it.
 *
 * Nothing on this page is a signing product. A signature is the person
 * attesting from their own page, or the company recording the signed
 * copy it received. That is what the trade actually does.
 */

interface Template { id: string; name: string; audience: string; needsSignature: boolean; instanceCount: number }
interface Request_ {
  id: string
  template: { id: string; name: string; needsSignature: boolean }
  subjectType: string
  subject: string
  status: string
  sentAt: string | null
  signedAt: string | null
  hasSignedFile: boolean
  fileName: string | null
  note: string | null
}
interface Person { id: string; name: string }

const AUDIENCES = ['CANDIDATE', 'VENDOR', 'CLIENT', 'EMPLOYEE', 'GENERAL']

export default function DocumentsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [requests, setRequests] = useState<Request_[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const [newTemplate, setNewTemplate] = useState({ name: '', audience: 'CANDIDATE', needsSignature: false })
  const [ask, setAsk] = useState({ templateId: '', personId: '' })
  const [record, setRecord] = useState<{ id: string; kind: 'upload' | 'sign'; fileUrl: string; note: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [t, r, b] = await Promise.all([
        fetch('/api/documents').then(readJson),
        fetch('/api/documents?view=instances').then(readJson),
        fetch('/api/bench?limit=200').then(readJson).catch(() => null),
      ])
      setTemplates(t?.data?.templates ?? [])
      setRequests(r?.data?.instances ?? [])
      const listings: any[] = b?.data?.listings ?? b?.data?.consultants ?? []
      setPeople(
        listings
          .map((l) => l.consultant?.person ?? l.person ?? null)
          .filter((p): p is Person => Boolean(p?.id && p?.name))
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function post(url: string, body: unknown): Promise<any> {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return readJson(res)
  }

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await post('/api/documents', { type: 'template', ...newTemplate })
      setNewTemplate({ name: '', audience: 'CANDIDATE', needsSignature: false })
      setSaid(`${newTemplate.name} added to the library.`)
      await load()
    } catch (e: any) { setError(e.message) }
  }

  async function askFor(e: React.FormEvent) {
    e.preventDefault()
    try {
      const made = await post('/api/documents', { type: 'instance', templateId: ask.templateId, subjectType: 'PERSON', subjectId: ask.personId })
      const id = made?.data?.instance?.id
      const sent = await post(`/api/documents/${id}/send`, {})
      setSaid(sent?.data?.says ?? 'Asked for.')
      setAsk({ templateId: '', personId: '' })
      await load()
    } catch (e: any) { setError(e.message) }
  }

  async function send(id: string) {
    try {
      const r = await post(`/api/documents/${id}/send`, {})
      setSaid(r?.data?.says ?? 'Asked for.')
      await load()
    } catch (e: any) { setError(e.message) }
  }

  async function saveRecord(e: React.FormEvent) {
    e.preventDefault()
    if (!record) return
    try {
      const r = await post(`/api/documents/${record.id}/${record.kind}`, { fileUrl: record.fileUrl, note: record.note })
      setSaid(r?.data?.says ?? 'Recorded.')
      setRecord(null)
      await load()
    } catch (e: any) { setError(e.message) }
  }

  const tone = (status: string) =>
    status === 'SIGNED' || status === 'UPLOADED' ? 'bg-etyme-verified/10 text-etyme-verified'
      : status === 'SENT' ? 'bg-etyme-attention/10 text-etyme-attention'
        : 'bg-etyme-rule/50 text-etyme-muted'

  return (
    <div className="max-w-5xl">
      <div className="page-head mb-6">
        <p className="eyebrow">Operate</p>
        <h1>Paperwork</h1>
        <p>What you ask people and firms for, and where each request stands. Asking sends them a note and a place to answer.</p>
      </div>

      {said && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-etyme-verified/10 text-sm text-etyme-verified flex justify-between">
          <span>{said}</span>
          <button onClick={() => setSaid(null)} className="text-etyme-verified/70">Close</button>
        </div>
      )}
      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Ask somebody for a document</h2>
        <form onSubmit={askFor} className="bg-etyme-surface border border-etyme-rule rounded-lg p-4 flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[200px]">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Which document</span>
            <select value={ask.templateId} onChange={(e) => setAsk({ ...ask, templateId: e.target.value })} required
              className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised">
              <option value="">Choose from the library</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.needsSignature ? ' (signed)' : ''}</option>)}
            </select>
          </label>
          <label className="flex-1 min-w-[200px]">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">From whom</span>
            <select value={ask.personId} onChange={(e) => setAsk({ ...ask, personId: e.target.value })} required
              className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised">
              <option value="">Somebody on your bench</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!ask.templateId || !ask.personId}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            Ask for it
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Requests <span className="text-xs text-etyme-faint tabular-nums font-sans">{requests.length}</span></h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {loading && <p className="p-4 text-sm text-etyme-muted">Loading…</p>}
          {!loading && requests.length === 0 && (
            <p className="p-4 text-sm text-etyme-muted">Nothing asked for yet. Add a document to the library below, then ask somebody for it above.</p>
          )}
          {requests.map((r) => (
            <div key={r.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm text-etyme-ink">{r.template.name} <span className="text-etyme-muted">· {r.subject}</span></div>
                <div className="text-xs text-etyme-faint tabular-nums mt-0.5">
                  {r.signedAt ? `${statusWord(r.status)} ${new Date(r.signedAt).toLocaleDateString()}` : r.sentAt ? `Asked ${new Date(r.sentAt).toLocaleDateString()}` : 'Not asked yet'}
                  {r.fileName ? ` · ${r.fileName}` : ''}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tone(r.status)}`}>{statusWord(r.status)}</span>
              {(r.status === 'PENDING' || r.status === 'SENT') && (
                <button onClick={() => send(r.id)} className="text-xs text-etyme-action hover:underline">
                  {r.status === 'PENDING' ? 'Ask for it' : 'Ask again'}
                </button>
              )}
              {r.status === 'SENT' && (
                <button
                  onClick={() => setRecord({ id: r.id, kind: r.template.needsSignature ? 'sign' : 'upload', fileUrl: '', note: '' })}
                  className="text-xs text-etyme-action hover:underline"
                >
                  {r.template.needsSignature ? 'Record the signed copy' : 'Record the file'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {record && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8" onClick={() => setRecord(null)} role="dialog" aria-modal="true" aria-label="Record a document">
          <form onSubmit={saveRecord} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-etyme-surface border border-etyme-rule rounded-lg p-5 space-y-4">
            <h2 className="font-serif text-lg text-etyme-ink">{record.kind === 'sign' ? 'The signed copy you received' : 'The file you received'}</h2>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Where the file is</span>
              <input value={record.fileUrl} onChange={(e) => setRecord({ ...record, fileUrl: e.target.value })} required placeholder="https://…"
                className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">A note, if any</span>
              <input value={record.note} onChange={(e) => setRecord({ ...record, note: e.target.value })} placeholder="Came by email on the 12th"
                className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRecord(null)} className="text-sm text-etyme-muted">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">Record</button>
            </div>
          </form>
        </div>
      )}

      <section>
        <h2 className="font-serif text-lg text-etyme-ink mb-3">The library <span className="text-xs text-etyme-faint tabular-nums font-sans">{templates.length}</span></h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule mb-3">
          {templates.length === 0 && <p className="p-4 text-sm text-etyme-muted">Nothing in the library yet. A W-9, an NDA, a certificate of insurance — add what you ask for.</p>}
          {templates.map((t) => (
            <div key={t.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 text-sm text-etyme-ink">{t.name}</div>
              <span className="text-xs text-etyme-muted">{t.audience.charAt(0) + t.audience.slice(1).toLowerCase()}{t.needsSignature ? ' · needs a signature' : ''}</span>
              <span className="text-xs text-etyme-faint tabular-nums">{t.instanceCount} asked</span>
            </div>
          ))}
        </div>
        <form onSubmit={addTemplate} className="bg-etyme-surface border border-etyme-rule rounded-lg p-4 flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[200px]">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Add to the library</span>
            <input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} required placeholder="W-9"
              className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
          </label>
          <label>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Asked of</span>
            <select value={newTemplate.audience} onChange={(e) => setNewTemplate({ ...newTemplate, audience: e.target.value })}
              className="border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised">
              {AUDIENCES.map((a) => <option key={a} value={a}>{a.charAt(0) + a.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-etyme-ink pb-2">
            <input type="checkbox" checked={newTemplate.needsSignature} onChange={(e) => setNewTemplate({ ...newTemplate, needsSignature: e.target.checked })} />
            Needs a signature
          </label>
          <button type="submit" className="px-4 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-canvas">Add</button>
        </form>
      </section>
    </div>
  )
}
