'use client'

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

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Stat({ label, value, tone = 'ink', sub }: {
  label: string; value: number | string; tone?: 'ink' | 'attention' | 'verified'; sub?: string
}) {
  const tones = { ink: 'text-etyme-ink', attention: 'text-etyme-attention', verified: 'text-etyme-verified' }
  return (
    <div>
      <Lbl>{label}</Lbl>
      <p className={`font-serif text-3xl mt-1 tabular-nums ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[12px] text-etyme-muted mt-0.5">{sub}</p>}
    </div>
  )
}

export default function PacketsPage() {
  const [packets, setPackets] = useState<Packet[] | null>(null)
  const [available, setAvailable] = useState<Available[]>([])
  const [counts, setCounts] = useState({ open: 0, awaitingReview: 0, stale: 0 })
  const [canAsk, setCanAsk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const [packetKey, setPacketKey] = useState('')
  const [email, setEmail] = useState('')
  const [companies, setCompanies] = useState<{ id: string; name: string; kind: string }[]>([])
  const [subjectCompanyId, setSubjectCompanyId] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/packets')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setPackets(body.data.packets)
      setAvailable(body.data.available)
      setCounts({
        open: body.data.open,
        awaitingReview: body.data.awaitingReview,
        stale: body.data.stale,
      })
      setCanAsk(body.data.canAsk)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!asking) return
    fetch('/api/companies')
      .then((r) => r.json())
      .then((b) => setCompanies(b.data?.companies ?? []))
      .catch(() => setCompanies([]))
  }, [asking])

  const spec = available.find((a) => a.key === packetKey)

  async function ask() {
    setBusy(true); setError(null); setFlash(null); setLink(null)
    try {
      const res = await fetch('/api/packets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packetKey,
          recipientEmail: email,
          ...(spec?.subject === 'COMPANY' ? { subjectCompanyId } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setFlash(body.data.message)
      if (body.data.link) setLink(body.data.link)
      if (body.data.created) {
        setPacketKey(''); setEmail(''); setSubjectCompanyId(''); setAsking(false)
      }
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!packets) return <p className="text-etyme-muted text-sm">{error ?? 'Loading…'}</p>

  const review = packets.filter((p) => p.awaitingReview > 0)
  const open = packets.filter((p) => p.awaitingReview === 0 && !p.completedAt && !p.linkExpired)
  const stale = packets.filter((p) => p.awaitingReview === 0 && !p.completedAt && p.linkExpired)
  const done = packets.filter((p) => p.completedAt)

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>Documents you have asked for</h1>
          <p>
            A named list sent to somebody who needs no account. It never asks for what we already
            hold and have not seen expire.
          </p>
        </div>
        {canAsk && (
          <button onClick={() => setAsking(!asking)} className="btn-secondary text-[13px] mt-3 shrink-0">
            {asking ? 'Cancel' : 'Ask for documents'}
          </button>
        )}
      </div>

      {flash && (
        <div className="mb-5 rounded-md border border-etyme-verified/30 bg-etyme-verified/5 p-3">
          <p className="text-[13px] text-etyme-verified">{flash}</p>
          {link && (
            <p className="text-[12px] text-etyme-muted mt-1.5">
              Link to send them: <span className="font-mono text-etyme-ink">{link}</span>
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 p-3">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {asking && (
        <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
          <h2 className="font-serif text-[19px] text-etyme-ink mb-4 tracking-[-0.02em]">Ask for documents</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <Lbl>Which set</Lbl>
              <select value={packetKey} onChange={(e) => setPacketKey(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm">
                <option value="">Choose…</option>
                {available.map((a) => (
                  <option key={a.key} value={a.key}>{a.label} ({a.itemCount})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <Lbl>Send to</Lbl>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                placeholder="office@supplier.com"
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            </label>
            {spec?.subject === 'COMPANY' && (
              <label className="block sm:col-span-2">
                <Lbl>About which company</Lbl>
                <select value={subjectCompanyId} onChange={(e) => setSubjectCompanyId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm">
                  <option value="">Choose…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <button onClick={ask}
            disabled={busy || !packetKey || !email.trim() || (spec?.subject === 'COMPANY' && !subjectCompanyId)}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40">
            Send the request
          </button>
        </section>
      )}

      <div className="grid grid-cols-3 gap-6 mb-8 pb-6 border-b border-etyme-rule">
        <Stat label="Waiting on you" value={counts.awaitingReview} tone={counts.awaitingReview > 0 ? 'attention' : 'ink'} sub="documents to look at" />
        <Stat label="Still open" value={counts.open} sub="waiting on them" />
        <Stat label="Link expired" value={counts.stale} tone={counts.stale > 0 ? 'attention' : 'ink'} sub="they cannot reply" />
      </div>

      {packets.length === 0 && (
        <p className="text-[13px] text-etyme-faint">
          Nothing asked for yet. A packet is how you get a W-9 and an insurance certificate without
          four emails.
        </p>
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
                  {p.recipientEmail} · asked by {p.askedBy} on {p.askedAt}
                </p>
              </div>
              <span className="text-[12px] tabular-nums text-etyme-muted shrink-0">
                {p.progress.received}/{p.progress.total}
              </span>
            </div>
            <p className={`text-[12px] mt-2 ${p.linkExpired && !p.completedAt ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
              {p.completedAt
                ? `Finished ${p.completedAt}`
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
