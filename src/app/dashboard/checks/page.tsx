'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * The check queue.
 *
 * The one screen that stops the system grading its own homework. Ten
 * machine decisions a week, in front of a person, one at a time.
 *
 * A decision surface, and the smallest one in the product: one item, its
 * evidence, two buttons. Anything else on this page is a reason not to do
 * it, and a review nobody completes is worse than no review — the empty
 * queue reads as "nothing to worry about".
 */

interface Item {
  id: string
  code: string
  verdict: 'PASS' | 'FAIL'
  at: string
  asks: string
  shows: string
}

interface Maybe {
  id: string
  title: string
  postedBy: string | null
  asks: string
  because: string[]
  likeOpening: { id: string; title: string; location: string | null } | null
}

interface Queue {
  maybes: Maybe[]
  sample: Item[]
  waiting: number
  agreement: { percent: number | null; says: string; worrying: boolean; reviewed: number }
  week: { done: number; target: number; says: string; behind: boolean }
}

export default function ChecksPage() {
  const [q, setQ] = useState<Queue | null>(null)
  const [at, setAt] = useState(0)
  const [note, setNote] = useState('')
  const [disagreeing, setDisagreeing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checks/queue')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setQ(body.data)
      setAt(0)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Update the counters without moving the queue underneath somebody.
   *
   * The whole point of this screen is a number that tells the truth. It
   * read 0 of 10 while you worked through the sample and only caught up at
   * the end, which is the same lie in miniature that the screen exists to
   * prevent.
   */
  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/checks/queue')
      const body = await res.json()
      if (!res.ok) return
      setQ((prev) =>
        prev
          ? { ...prev, agreement: body.data.agreement, week: body.data.week, waiting: body.data.waiting }
          : body.data
      )
    } catch {
      // A stale counter is not worth an error message over the item the
      // person is actually looking at.
    }
  }, [])

  useEffect(() => { load() }, [load])

  const item = q?.sample[at]

  async function settle(leadId: string, same: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/same-seat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ same }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function answer(agreed: boolean) {
    if (!item) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/checks/${item.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agreed, note: agreed ? null : note }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)

      setNote('')
      setDisagreeing(false)
      if (at + 1 < (q?.sample.length ?? 0)) {
        setAt(at + 1)
        refreshCounts()
      } else {
        load()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Operate</p>
        <h1 className="headline-serif text-[30px] leading-tight">Check the checker</h1>
        <p className="mt-1 max-w-[58ch] text-[13px] text-etyme-muted">
          Ten a week. Never let the machine be the only thing checking the
          machine — it will report ninety-six percent while your clients
          quietly stop calling.
        </p>
      </header>

      {q && (
        <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
          <div>
            <p className="stat-label">This week</p>
            <p
              className="stat-value"
              style={{ color: q.week.behind ? 'var(--color-attention)' : undefined }}
            >
              {q.week.done}
              <span className="text-[16px] text-etyme-faint">/{q.week.target}</span>
            </p>
          </div>
          <div>
            <p className="stat-label">You agreed with</p>
            <p
              className="stat-value"
              style={{ color: q.agreement.worrying ? 'var(--color-attention)' : undefined }}
            >
              {q.agreement.percent === null ? '—' : `${q.agreement.percent}%`}
            </p>
          </div>
          <div>
            <p className="stat-label">Waiting</p>
            <p className="stat-value">{q.waiting}</p>
          </div>
        </div>
      )}

      {q && (
        <p
          className={`text-[13px] ${q.agreement.worrying ? 'text-etyme-attention' : 'text-etyme-muted'}`}
        >
          {q.agreement.says}
        </p>
      )}

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && q && q.sample.length === 0 && (
        <div className="panel">
          <h2 className="headline-serif text-[19px]">Nothing to review</h2>
          <p className="mt-1 max-w-[54ch] text-[13px] text-etyme-muted">
            The model has not made a judgement since you last looked. This
            fills up as submissions get checked — the skill-evidence check
            is the one that lands here.
          </p>
        </div>
      )}

      {/* Two adverts the collapse would not settle itself.
          SAME joins a seat on its own; LIKELY never does, because a
          wrongly merged seat loses a live role and nobody notices. This
          is where a person settles it in ten seconds. */}
      {q && q.maybes.length > 0 && (
        <div className="panel">
          <p className="eyebrow mb-3">Same seat?</p>
          {q.maybes.map((m) => (
            <div key={m.id} className="mb-4 border-b border-etyme-rule pb-4 last:mb-0 last:border-0 last:pb-0">
              <h3 className="headline-serif text-[18px] leading-snug">{m.asks}</h3>
              <p className="mt-1 text-[12px] text-etyme-muted">
                <span className="font-medium text-etyme-ink">{m.title}</span>
                {m.postedBy && <> · posted by {m.postedBy}</>}
              </p>
              {m.because.length > 0 && (
                <p className="mt-1 text-[12px] text-etyme-muted">
                  Because {m.because.join(', ')}.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => settle(m.id, true)}
                  disabled={busy}
                  className="rounded-md bg-etyme-action px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                >
                  Same seat
                </button>
                <button
                  onClick={() => settle(m.id, false)}
                  disabled={busy}
                  className="rounded-md border border-etyme-rule px-3 py-1.5 text-[12px] font-medium text-etyme-ink"
                >
                  Different
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {item && (
        <div className="panel">
          <div className="mb-3 flex items-center justify-between">
            <span className={`chip ${item.verdict === 'PASS' ? 'chip--verified' : 'chip--attention'}`}>
              {item.code.replace(/_/g, ' ').toLowerCase()}
            </span>
            <span className="text-[11px] text-etyme-faint">
              {at + 1} of {q!.sample.length}
            </span>
          </div>

          <h2 className="headline-serif text-[20px] leading-snug">{item.asks}</h2>

          <pre className="mt-3 whitespace-pre-wrap rounded-md border border-etyme-rule bg-etyme-canvas p-3 font-sans text-[13px] leading-relaxed text-etyme-ink">
            {item.shows}
          </pre>

          {!disagreeing ? (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => answer(true)}
                disabled={busy}
                className="rounded-md bg-etyme-verified px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                Agreed
              </button>
              <button
                onClick={() => setDisagreeing(true)}
                disabled={busy}
                className="rounded-md border border-etyme-rule px-4 py-2 text-[13px] font-medium text-etyme-ink"
              >
                No, it got this wrong
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <label className="eyebrow mb-1 block">What did it get wrong?</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Quoted a line about Docker as evidence for Kubernetes."
                className="w-full rounded-md border border-etyme-rule bg-etyme-raised p-3 text-[13px] text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-action focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-etyme-faint">
                This note is the only thing that improves the check. An
                agreement teaches it nothing.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => answer(false)}
                  disabled={busy || note.trim().length < 4}
                  className="rounded-md bg-etyme-action px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Record it'}
                </button>
                <button
                  onClick={() => { setDisagreeing(false); setNote('') }}
                  className="px-3 py-2 text-[13px] text-etyme-muted hover:text-etyme-ink"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
