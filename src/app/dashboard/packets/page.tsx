'use client'

import { readJson } from '@/lib/read-response'
import { plainDate } from '@/lib/plain-date'
import { emptyRequestsSays } from './words'
import { usePageSection } from '@/components/page-section'
import { EmptyState, Field, Input, LoadingState, PageHead, Panel, RefusedState, Select, Stat, SubmitButton } from '@/components/ui'

import { useEffect, useState, useCallback } from 'react'

/**
 * What you have asked partners for, and what came back.
 *
 * The inside view of the same thing a supplier sees at /packet/:token.
 * Ordered by what needs a person: documents waiting to be looked at first,
 * then requests still open, then links that quietly expired — which look
 * identical to being ignored and are the reason people say the system does
 * not work.
 */

interface Packet {
  id: string
  label: string
  purpose: string
  direction: string
  subject: string
  recipientEmail: string
  askedBy: string
  askedAt: string
  progress: { total: number; received: number; complete: boolean; summary: string }
  completedAt: string | null
  reopenedReason: string | null
  expiresInDays: number
  linkExpired: boolean
  awaitingReview: number
}

interface Available {
  key: string
  label: string
  purpose: string
  subject: string
  itemCount: number
}

export default function PacketsPage() {
  // The section on the reader's own menu; nothing while it is not known.
  const section = usePageSection('/dashboard/packets')
  const [packets, setPackets] = useState<Packet[] | null>(null)
  const [available, setAvailable] = useState<Available[]>([])
  const [counts, setCounts] = useState({ open: 0, awaitingReview: 0, stale: 0 })
  const [canAsk, setCanAsk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  // What was actually asked for, and which rule wanted each one. A
  // client's own order can add a document the shipped list has never
  // heard of, and "Asking for 6 documents" does not say which six.
  const [asked, setAsked] = useState<{ label: string; required: boolean; becauseOf: string | null }[]>([])
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const [packetKey, setPacketKey] = useState('')
  const [email, setEmail] = useState('')
  const [companies, setCompanies] = useState<{ id: string; name: string; kind: string }[]>([])
  const [subjectCompanyId, setSubjectCompanyId] = useState('')
  const [subjectPersonId, setSubjectPersonId] = useState('')
  const [people, setPeople] = useState<{ id: string; name: string; email: string | null }[]>([])
  const [notOffered, setNotOffered] = useState<{ label: string; why: string }[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/packets')
      const body = await readJson(res)
      setPackets(body.data.packets)
      setAvailable(body.data.available)
      setCounts({
        open: body.data.open,
        awaitingReview: body.data.awaitingReview,
        stale: body.data.stale,
      })
      setCanAsk(body.data.canAsk)
      setPeople(body.data.people ?? [])
      setNotOffered(body.data.notOffered ?? [])
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Opened from another page to ask for one thing — the compliance page's
  // held start, a supplier's lapsing cover — the form opens filled in.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('ask') !== '1') return
    setAsking(true)
    if (q.get('packetKey')) setPacketKey(q.get('packetKey')!)
    if (q.get('subjectCompanyId')) setSubjectCompanyId(q.get('subjectCompanyId')!)
    if (q.get('subjectPersonId')) setSubjectPersonId(q.get('subjectPersonId')!)
  }, [])

  useEffect(() => {
    if (!asking) return
    fetch('/api/companies')
      .then((r) => r.json())
      .then((b) => setCompanies(b.data?.companies ?? []))
      .catch(() => setCompanies([]))
  }, [asking])

  const spec = available.find((a) => a.key === packetKey)

  async function ask() {
    setBusy(true); setError(null); setFlash(null); setLink(null); setAsked([])
    try {
      const res = await fetch('/api/packets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packetKey,
          recipientEmail: email,
          ...(spec?.subject === 'COMPANY' ? { subjectCompanyId } : {}),
          ...(spec?.subject === 'PERSON' ? { subjectPersonId } : {}),
        }),
      })
      const body = await readJson(res)
      setFlash(body.data.message)
      setAsked(body.data.asking ?? [])
      if (body.data.link) setLink(body.data.link)
      if (body.data.created) {
        setPacketKey(''); setEmail(''); setSubjectCompanyId(''); setSubjectPersonId(''); setAsking(false)
      }
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Until the list is read there is nothing to count and nothing to ask
  // from: the route's sentence alone if it would not answer, and the
  // loading line while it has not yet.
  if (!packets) return error ? <RefusedState says={error} /> : <LoadingState says="Opening document requests…" />

  const review = packets.filter((p) => p.awaitingReview > 0)
  const open = packets.filter((p) => p.awaitingReview === 0 && !p.completedAt && !p.linkExpired)
  const stale = packets.filter((p) => p.awaitingReview === 0 && !p.completedAt && p.linkExpired)
  const done = packets.filter((p) => p.completedAt)

  return (
    <>
      <PageHead
        eyebrow={section}
        title="Document requests"
        subtitle="Ask a supplier or a person for documents with one link. They need no account. We never ask again for something already on file that has not run out."
        actions={canAsk && (
          <button onClick={() => setAsking(!asking)} className="btn-secondary text-[13px]">
            {asking ? 'Cancel' : 'Request documents'}
          </button>
        )}
      />

      {flash && (
        <div className="mb-5 rounded-md border border-etyme-verified/30 bg-etyme-verified/5 p-3">
          <p className="text-[13px] text-etyme-verified">{flash}</p>
          {link && (
            <p className="text-[12px] text-etyme-muted mt-1.5">
              Link to send them: <span className="font-mono text-etyme-ink">{link}</span>
            </p>
          )}
          {asked.length > 0 && (
            <ul className="mt-2 space-y-1">
              {asked.map((a) => (
                <li key={a.label} className="text-[12px] text-etyme-muted">
                  <span className="text-etyme-ink">{a.label}</span>
                  {a.required ? '' : ' (optional)'}
                  {/* Whose rule wanted it, in that rule's own words.
                      "The system requires it" is the answer that makes
                      somebody phone you. */}
                  {a.becauseOf ? ` — ${a.becauseOf}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 p-3">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {asking && (
        <Panel title="Request documents" className="mb-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="What you need">
              <Select value={packetKey} onChange={(e) => setPacketKey(e.target.value)}>
                <option value="">Choose…</option>
                {available.map((a) => (
                  <option key={a.key} value={a.key}>{a.label} ({a.itemCount})</option>
                ))}
              </Select>
            </Field>
            <Field label="Send to">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                placeholder="office@supplier.com" />
            </Field>
            {spec?.subject === 'PERSON' && (
              <Field label="About which person" className="sm:col-span-2"
                help={people.length === 0
                  ? 'Nobody is on an open contract with your firm yet, so there is nobody to ask about.'
                  : undefined}>
                <Select value={subjectPersonId}
                  onChange={(e) => {
                    setSubjectPersonId(e.target.value)
                    const who = people.find((p) => p.id === e.target.value)
                    if (who?.email && !email.trim()) setEmail(who.email)
                  }}>
                  <option value="">Choose…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            )}
            {spec?.subject === 'COMPANY' && (
              <Field label="About which company" className="sm:col-span-2">
                <Select value={subjectCompanyId} onChange={(e) => setSubjectCompanyId(e.target.value)}>
                  <option value="">Choose…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <SubmitButton type="button" onClick={ask} pending={busy} pendingLabel="Sending…"
            disabled={!packetKey || !email.trim() || (spec?.subject === 'COMPANY' && !subjectCompanyId) || (spec?.subject === 'PERSON' && !subjectPersonId)}
            className="mt-4">
            Send the request
          </SubmitButton>
          {notOffered.length > 0 && (
            <div className="mt-4 text-[12px] text-etyme-muted">
              <p>Not sent from here: {notOffered.map((n) => n.label).join(', ')}.</p>
              <p className="mt-0.5">{notOffered[0].why}</p>
            </div>
          )}
        </Panel>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <Stat label="Waiting on you" value={counts.awaitingReview} tone={counts.awaitingReview > 0 ? 'attention' : 'default'} sub="documents to look at" />
        <Stat label="Still open" value={counts.open} sub="waiting on them" />
        <Stat label="Link expired" value={counts.stale} tone={counts.stale > 0 ? 'attention' : 'default'} sub="they cannot reply" />
      </div>

      {/* ── Never a dead end ──
          This read "A packet is how you get a W-9…" with no button under
          it, so a compliance officer could not ask for anything from the
          page named for asking. It now says what to do, and offers it
          where this desk may. */}
      {packets.length === 0 && (
        <EmptyState
          says={emptyRequestsSays(canAsk)}
          action={canAsk && !asking ? { label: 'Request documents', onClick: () => setAsking(true) } : undefined}
        />
      )}

      <Group title="Waiting on you" rows={review} note="Something arrived and nobody has looked at it." />
      <Group title="Waiting on them" rows={open} />
      <Group title="Link expired" rows={stale} note="They cannot reply to these. Send a new request." />
      <Group title="Done" rows={done} />
    </>
  )
}

function Group({ title, rows, note }: { title: string; rows: Packet[]; note?: string }) {
  if (rows.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="font-serif text-[19px] text-etyme-ink tracking-[-0.02em]">
        {title}
        <span className="ml-2 text-[12px] text-etyme-muted font-sans tabular-nums">{rows.length}</span>
      </h2>
      {note && <p className="text-[12px] text-etyme-muted mt-0.5 mb-3">{note}</p>}
      <div className="space-y-2 mt-3">
        {rows.map((p) => (
          <div key={p.id} className="bg-etyme-surface border border-etyme-rule rounded-lg p-4">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[14px] text-etyme-ink">
                  {p.label}
                  <span className="ml-2 text-[13px] text-etyme-muted">{p.subject}</span>
                </p>
                <p className="text-[12px] text-etyme-faint mt-0.5">
                  {p.recipientEmail} · asked by {p.askedBy} on {plainDate(p.askedAt)}
                </p>
              </div>
              <span className="text-[12px] tabular-nums text-etyme-muted shrink-0">
                {p.progress.received}/{p.progress.total}
              </span>
            </div>
            <p className={`text-[12px] mt-2 ${p.linkExpired && !p.completedAt ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
              {p.completedAt
                ? `Finished ${plainDate(p.completedAt)}`
                : p.linkExpired
                  ? `Their link expired ${Math.abs(p.expiresInDays)} days ago, so they cannot reply.`
                  : p.progress.summary}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
