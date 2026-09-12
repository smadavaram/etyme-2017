'use client'

import Link from 'next/link'

import { readJson } from '@/lib/read-response'
import { ProposeInterviewDialog } from '@/components/propose-interview'
import { useSession } from '@/components/session-provider'
import { hasPermission } from '@/lib/permissions'

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
  submissionId: string
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
  interviewers: string[]
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
  // Deciding a round — the outcome, the panel, the next one — is for
  // whoever is hiring: the same permission that raises a requisition.
  // Nike's AP clerk is a party to the programme and could see every
  // button; the route refuses them, and a button that only ever refuses
  // is a form whose answer is thrown away.
  const { permissions } = useSession()
  const mayDecide = hasPermission(permissions, 'requirements.write')
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  // Who is in the room. Set once when a round was proposed and never
  // changeable after, which is not how interviews go — somebody drops
  // out the morning of, an architect is pulled in.
  const [panelFor, setPanelFor] = useState<string | null>(null)
  const [adding, setAdding] = useState('')
  // "Next round" said what came of it and then left the client nowhere
  // to go. This is the round after it, proposed from the row it came
  // from.
  const [proposingFor, setProposingFor] = useState<Row | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/interviews')
      const body = await readJson(res)
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
      const body = await readJson(res)
      setDeciding(null)
      setFeedback('')
      // The row as it now is, before the list comes back. A client who
      // has just said "next round" must be able to set that round up
      // without waiting for a refetch or reaching for the reload key.
      if (body?.data) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...body.data } : r)))
        if (body.data.says) setNote(body.data.says)
      }
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

      {note && (
        <p className="text-[13px] text-etyme-ink" role="status">
          {note}
        </p>
      )}

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing booked. Interviews start from{' '}
            <Link href="/dashboard/submissions" className="text-etyme-action underline">
              a candidate on a role
            </Link>
            .
          </p>
        </div>
      )}

      {rows.map((r) => {
      const laterRoundExists = rows.some(
        (x) => x.submissionId === r.submissionId && x.round > r.round
      )
      return (
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
          {r.you === 'CLIENT' && mayDecide && (r.state === 'CONFIRMED' || r.state === 'PROPOSED') && (
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

          {/* ── Through to the next round ──
              "Next round" recorded a decision and then offered nothing
              to act on: the client had said somebody goes through and
              had no way to set the round up. It appears on the row that
              went through, and only until that next round exists. */}
          {r.you === 'CLIENT' && mayDecide && r.outcome === 'ADVANCE' && !laterRoundExists && (
            <div className="mt-4 border-t border-etyme-rule pt-3">
              <button
                onClick={() => setProposingFor(r)}
                className="rounded bg-etyme-action px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                Set up round {r.round + 1}
              </button>
              <p className="mt-2 text-[11px] text-etyme-faint">
                {r.names.consultant.split(' ')[0]} is through. Offer times and
                {' '}{r.names.vendor} confirms.
              </p>
            </div>
          )}

          {/* ── Who is in the room ──
              Only the side running the round decides its panel, and only
              while the round is still ahead of them. Names, not seats:
              plenty of interviewers have no account here, and requiring
              one would mean a client's own principal engineer cannot be
              listed. */}
          {r.you === 'CLIENT' && mayDecide && !['DONE', 'CANCELLED', 'NO_SHOW'].includes(r.state) && (
            <div className="mt-4 border-t border-etyme-rule pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="lbl">Panel</span>
                {(r.interviewers ?? []).length === 0 && (
                  <span className="text-[12px] text-etyme-faint">nobody listed yet</span>
                )}
                {(r.interviewers ?? []).map((name) => (
                  <span key={name} className="chip chip--passive">
                    {name}
                    <button
                      onClick={() => act(r.id, { action: 'interviewers', remove: [name] })}
                      disabled={busy === r.id}
                      aria-label={`Take ${name} off round ${r.round}`}
                      className="ml-1 text-etyme-faint hover:text-etyme-danger"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setPanelFor(panelFor === r.id ? null : r.id)}
                  className="text-[12px] text-etyme-action hover:underline"
                >
                  {panelFor === r.id ? 'Done' : 'Add somebody'}
                </button>
              </div>

              {panelFor === r.id && (
                <form
                  className="mt-2 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = adding.trim()
                    if (!name) return
                    act(r.id, { action: 'interviewers', add: [name] })
                    setAdding('')
                  }}
                >
                  <input
                    value={adding}
                    onChange={(e) => setAdding(e.target.value)}
                    placeholder="Their name"
                    className="rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]
                               text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-action focus:outline-none"
                  />
                  <button type="submit" disabled={busy === r.id} className="btn-secondary text-[12px]">
                    Add
                  </button>
                </form>
              )}
            </div>
          )}
        </article>
      )
      })}

      {proposingFor && (
        <ProposeInterviewDialog
          submissionId={proposingFor.submissionId}
          candidate={proposingFor.names.consultant}
          round={proposingFor.round + 1}
          onDone={(says) => {
            setProposingFor(null)
            setNote(says)
            load()
          }}
          onCancel={() => setProposingFor(null)}
        />
      )}
    </div>
  )
}
