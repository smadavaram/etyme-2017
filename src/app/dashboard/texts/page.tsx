'use client'

import { useEffect, useState } from 'react'

/**
 * What has been said to consultants, and what came back.
 *
 * The screen behind the data integrity layer. Everything clever in this
 * product sits on a bench record, and the bench record rots — somebody
 * free at $78 three weeks ago took a contract on Tuesday and nobody
 * updated it, because updating records is nobody's job.
 *
 * The number at the top is the one that matters: how much of this bench
 * nobody has heard from. It is the number the whole loop exists to move.
 *
 * Scoped to one vendor, and that is not a formality. A consultant on two
 * benches must never learn that from us.
 */

interface Message {
  id: string
  person: { id: string; name: string }
  kind: string
  direction: 'OUT' | 'IN'
  body: string
  status: string
  statusNote: string
  read: string | null
  at: string
}

interface Feed {
  messages: Message[]
  bench: { total: number; unconfirmed: number; noMobile: number; optedOut: number; says: string }
  provider: string
}

function when(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const KIND: Record<string, string> = {
  FRESHNESS: 'still looking?',
  CONSENT: 'ok to submit?',
  OUTCOME: 'what happened',
  PLACED: 'you got it',
  LINK: 'reply',
}

export default function TextsPage() {
  const [f, setF] = useState<Feed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/texts')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error?.message ?? `HTTP ${r.status}`)
        setF(body.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Talent</p>
        <h1 className="headline-serif text-[30px] leading-tight">Keeping the bench honest</h1>
        <p className="mt-1 max-w-[60ch] text-[13px] text-etyme-muted">
          A record that says somebody is free at $78 was true three weeks
          ago. Everything else here sits on top of it, so we ask — one
          question, one tap, in your name.
        </p>
      </header>

      {f && (
        <>
          <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
            <div>
              <p className="stat-label">Not confirmed</p>
              <p
                className="stat-value"
                style={{ color: f.bench.unconfirmed > 0 ? 'var(--color-attention)' : undefined }}
              >
                {f.bench.unconfirmed}
                <span className="text-[16px] text-etyme-faint">/{f.bench.total}</span>
              </p>
            </div>
            <div>
              <p className="stat-label">No mobile</p>
              <p className="stat-value">{f.bench.noMobile}</p>
            </div>
            <div>
              <p className="stat-label">Asked us to stop</p>
              <p className="stat-value">{f.bench.optedOut}</p>
            </div>
          </div>

          <p className="text-[13px] text-etyme-muted">{f.bench.says}</p>

          {f.provider.startsWith('not set up') && (
            <div className="rounded-md border border-etyme-rule bg-etyme-canvas px-4 py-3 text-[13px] text-etyme-ink">
              Messages are being written down but not sent — no SMS provider
              is set up yet. Everything below is what would have gone out.
            </div>
          )}
        </>
      )}

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}
      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {f && f.messages.length === 0 && (
        <div className="panel">
          <h2 className="headline-serif text-[19px]">Nothing sent yet</h2>
          <p className="mt-1 max-w-[56ch] text-[13px] text-etyme-muted">
            The check-in runs every fortnight for anybody on the bench who
            is not currently working. The consent ask goes out with each
            submission.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {f?.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-md border px-3 py-2 ${
              m.direction === 'IN'
                ? 'border-etyme-rule bg-etyme-raised'
                : 'border-transparent bg-etyme-canvas'
            }`}
          >
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[12px]">
                <span className="font-medium text-etyme-ink">{m.person.name}</span>
                <span className="text-etyme-faint">
                  {' '}
                  · {m.direction === 'IN' ? 'replied' : KIND[m.kind] ?? m.kind.toLowerCase()} ·{' '}
                  {when(m.at)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {m.read && <span className="chip chip--action">{m.read.toLowerCase()}</span>}
                {m.direction === 'OUT' && m.status !== 'SENT' && (
                  <span
                    className={`chip ${m.status === 'FAILED' ? 'chip--danger' : 'chip--passive'}`}
                    title={m.statusNote}
                  >
                    {m.status === 'NOT_CONFIGURED' ? 'not sent' : m.status.toLowerCase()}
                  </span>
                )}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-etyme-ink">
              {m.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
