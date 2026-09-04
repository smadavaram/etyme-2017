'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Interviews, from whichever chair you are sitting in.
 *
 * One page, both sides. A client sees what they booked and says what
 * came of it; a supplier sees what they have been asked to confirm.
 * Ordered by what needs doing rather than by date — an interview waiting
 * on somebody for two days matters more than one on Friday that
 * everybody has already agreed to.
 */

interface Row {
  id: string
  you: 'CLIENT' | 'VENDOR'
  round: number
  stage: string
  mode: string
  state: string
  slots: { start: string; end: string }[]
  scheduledAt: string | null
  location: string | null
  names: { vendor: string; client: string; consultant: string }
  role: string
  says: string
  yours: boolean
  overdue: boolean
  outcome: string | null
  feedback: string | null
  confirmed: {
    client: string | null
    vendor: string | null
    consultant: string | null
    consultantVia: string | null
  }
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function InterviewsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/interviews')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setRows(body.data.interviews)
      setSummary(body.data.summary)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function act(id: string, payload: Record<string, unknown>) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/interviews/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setDeciding(null)
      setFeedback('')
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Operate</p>
        <h1 className="headline-serif text-[30px] leading-tight">Interviews</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          Nothing is booked until the client, the supplier and the consultant
          have all said so. Three diaries, and the one that breaks is almost
          never the client&rsquo;s.
        </p>
      </header>

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing booked. Interviews start from a candidate on a role.
          </p>
        </div>
      )}

      {rows.map((r) => (
        <article
          key={r.id}
          className="panel"
          style={r.yours ? { borderColor: 'var(--color-attention)' } : undefined}
        >
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-etyme-ink">
                {r.names.consultant}
              </p>
              <p className="text-[12px] text-etyme-faint">
                {r.role} · {r.you === 'CLIENT' ? r.names.vendor : r.names.client} ·{' '}
                {r.stage.toLowerCase()} · {r.mode.toLowerCase()}
              </p>
            </div>
            {r.yours && <span className="chip chip--attention">Needs you</span>}
          </div>

          <p className={`mt-2 text-[13px] ${r.overdue ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
            {r.says}
          </p>

          {/* A consultant confirmed by their supplier is not the same as a
              consultant who confirmed, and it matters when nobody turns up. */}
          {r.confirmed.consultantVia === 'VENDOR_ASSERTED' && (
            <p className="mt-1 text-[11px] text-etyme-faint">
              {r.names.vendor} confirmed on the consultant&rsquo;s behalf.
            </p>
          )}

          {r.feedback && (
            <p className="mt-2 border-l-2 border-etyme-rule pl-3 text-[13px] text-etyme-muted">
              {r.feedback}
            </p>
          )}

          {/* ── The supplier's side: confirm a time ─────────────────── */}
          {r.you === 'VENDOR' && r.state === 'PROPOSED' && (
            <div className="mt-4 border-t border-etyme-rule pt-3">
              <p className="stat-label">Times offered</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.slots.map((s) => (
                  <button
                    key={s.start}
                    disabled={busy === r.id}
                    onClick={() => act(r.id, { action: 'confirm', slotStart: s.start, forConsultant: true })}
                    className="rounded border border-etyme-rule px-3 py-1.5 text-[12px]
                               text-etyme-ink hover:border-etyme-action disabled:opacity-40"
                  >
                    {when(s.start)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-etyme-faint">
                Confirming answers for your consultant too. It is recorded as
                yours, which is what counts if they do not turn up.
              </p>
            </div>
          )}

          {/* ── The client's side: what came of it ──────────────────── */}
          {r.you === 'CLIENT' && (r.state === 'CONFIRMED' || r.state === 'PROPOSED') && (
            <div className="mt-4 border-t border-etyme-rule pt-3">
              {deciding !== r.id ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDeciding(r.id)}
                    className="rounded bg-etyme-action px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    Say what came of it
                  </button>
                  <button
                    disabled={busy === r.id}
                    onClick={() => act(r.id, { action: 'outcome', noShowBy: 'CONSULTANT' })}
                    className="rounded border border-etyme-rule px-3 py-1.5 text-[12px] text-etyme-muted"
                  >
                    Nobody turned up
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="What happened. On a rejection this is the only thing that makes the next submission better."
                    className="w-full rounded border border-etyme-rule bg-etyme-raised p-2
                               text-[13px] text-etyme-ink placeholder:text-etyme-faint"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(['ADVANCE', 'OFFER', 'REJECT'] as const).map((o) => (
                      <button
                        key={o}
                        disabled={busy === r.id || (o === 'REJECT' && feedback.trim().length < 3)}
                        onClick={() => act(r.id, { action: 'outcome', outcome: o, feedback })}
                        className="rounded border border-etyme-rule px-3 py-1.5 text-[12px]
                                   text-etyme-ink hover:border-etyme-action disabled:opacity-40"
                      >
                        {o === 'ADVANCE' ? 'Next round' : o === 'OFFER' ? 'Make an offer' : 'Not going forward'}
                      </button>
                    ))}
                    <button
                      onClick={() => { setDeciding(null); setFeedback('') }}
                      className="px-2 py-1.5 text-[12px] text-etyme-faint underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
