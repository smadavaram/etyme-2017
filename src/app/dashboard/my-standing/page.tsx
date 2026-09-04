'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * How your clients see you.
 *
 * Not optional, and not a courtesy. A scorecard the supplier cannot see
 * is a blacklist with better manners — it decides who gets the next role
 * and the supplier never learns why the calls stopped.
 *
 * The same six numbers the client reads, plus the half their view does
 * not need: what to do about it. "Sixty per cent" tells a recruiter
 * nothing. "Your rate is over the band on half of them" tells them what
 * to do on Monday.
 *
 * It shows no other supplier's numbers, and no rank. Learning you are
 * third of nine is learning something about two firms who never agreed
 * to tell you.
 */

interface Figure {
  value: number | null
  of: number
  says: string
}

interface Card {
  clientName: string
  sent: number
  received: number
  answered: Figure
  firstReplyHours: Figure
  worthReading: Figure
  hired: Figure
  holdsThemUp: { code: string; count: number; says: string } | null
  asks: Figure
  enough: boolean
  summary: string
  unknowns: string[]
  fix: string[]
}

export default function MyStandingPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me/scorecard')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setCards(body.data.clients)
      setSummary(body.data.summary)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-[760px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Grow</p>
        <h1 className="headline-serif text-[30px] leading-tight">How your clients see you</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          The same numbers they read. You are not shown anybody else&rsquo;s, and
          you are not ranked against them — but this is what decides who gets
          the next role, so it should not be a secret from you.
        </p>
      </header>

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && cards.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            No client has sent you a role yet. Nothing to show.
          </p>
        </div>
      )}

      {cards.map((c) => (
        <article key={c.clientName} className="panel">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[15px] font-semibold text-etyme-ink">{c.clientName}</p>
            {!c.enough && <span className="chip chip--passive">Too early</span>}
          </div>
          <p className="mt-0.5 text-[13px] text-etyme-muted">{c.summary}</p>

          <div className="mt-4 flex flex-wrap gap-x-9 gap-y-3 border-t border-etyme-rule pt-4">
            {[
              { label: 'You answered', f: c.answered, suffix: '%' },
              { label: 'Your first CV', f: c.firstReplyHours, suffix: 'h' },
              { label: 'Worth reading', f: c.worthReading, suffix: '%' },
              { label: 'Hired', f: c.hired, suffix: '%' },
            ].map(({ label, f, suffix }) => (
              <div key={label}>
                <p className="stat-label">{label}</p>
                <p className="stat-value tabular-nums">
                  {f.value == null ? (
                    <span className="text-etyme-faint">—</span>
                  ) : (
                    <>
                      {f.value}
                      <span className="text-[15px] text-etyme-faint">{suffix}</span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* The half the client's view does not need. */}
          <div className="mt-4 border-t border-etyme-rule pt-3">
            <p className="stat-label">What to fix</p>
            <ul className="mt-2 space-y-1.5">
              {c.fix.map((f, i) => (
                <li key={i} className="text-[13px] text-etyme-ink">
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {c.unknowns.length > 0 && (
            <ul className="mt-3 space-y-1">
              {c.unknowns.map((u, i) => (
                <li key={i} className="text-[12px] text-etyme-faint">
                  {u}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}
