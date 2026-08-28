'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * What your suppliers are like to work with.
 *
 * The one screen in this product that no supplier could build about
 * themselves and no client could get by asking. It exists only because
 * every submission from every vendor passes through the same place.
 *
 * A decision surface. Twelve suppliers, six numbers each, and no overall
 * grade — a single letter would be argued with by everybody who got a B,
 * would hide which of the six is the problem, and would become the thing
 * a procurement team optimises instead of the behaviour underneath it.
 */

interface Figure {
  value: number | null
  of: number
  says: string
}

interface Card {
  vendorName: string
  rank: number | null
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
}

function Fig({ label, f, suffix = '%' }: { label: string; f: Figure; suffix?: string }) {
  return (
    <div>
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
  )
}

export default function ScorecardsPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState('')
  const [orderedBy, setOrderedBy] = useState('')
  const [windowDays, setWindowDays] = useState(365)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendors/scorecards')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setCards(body.data.suppliers)
      setSummary(body.data.summary)
      setOrderedBy(body.data.orderedBy)
      setWindowDays(body.data.windowDays)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-[860px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Governance</p>
        <h1 className="headline-serif text-[30px] leading-tight">Your suppliers, scored</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          Built from what actually happened here — not from who emails you
          most. None of your suppliers can work these out about themselves:
          they cannot see what the other eleven did with the same role.
        </p>
      </header>

      <div className="border-b border-etyme-rule pb-4">
        <p className="text-[14px] text-etyme-ink">{summary}</p>
        <p className="mt-1 text-[12px] text-etyme-faint">
          Last {Math.round(windowDays / 30)} months. {orderedBy}
        </p>
      </div>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && cards.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing to score yet. Send a role to a supplier and this fills in.
          </p>
        </div>
      )}

      {cards.map((c) => (
        <article key={c.vendorName} className="panel">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-etyme-ink">
                {c.rank != null && (
                  <span className="mr-2 text-[12px] tabular-nums text-etyme-faint">
                    {c.rank}
                  </span>
                )}
                {c.vendorName}
              </p>
              <p className="mt-0.5 text-[13px] text-etyme-muted">{c.summary}</p>
            </div>
            {!c.enough && <span className="chip chip--passive">Too early</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-9 gap-y-3 border-t border-etyme-rule pt-4">
            <Fig label="Answered" f={c.answered} />
            <Fig label="First CV" f={c.firstReplyHours} suffix="h" />
            <Fig label="Worth reading" f={c.worthReading} />
            <Fig label="Hired" f={c.hired} />
          </div>

          {/* The actionable one. A percentage tells a procurement manager
              nothing they can raise on a call; this is the sentence they
              read out. */}
          {c.holdsThemUp && (
            <p className="mt-3 text-[13px] text-etyme-attention">{c.holdsThemUp.says}</p>
          )}

          <button
            onClick={() => setOpen(open === c.vendorName ? null : c.vendorName)}
            className="mt-3 text-[12px] text-etyme-muted underline"
          >
            {open === c.vendorName ? 'Less' : 'What each number means'}
          </button>

          {open === c.vendorName && (
            <ul className="mt-3 space-y-1.5 border-t border-etyme-rule pt-3">
              {[c.answered, c.firstReplyHours, c.worthReading, c.hired, c.asks].map((f, i) => (
                <li key={i} className="text-[12px] text-etyme-muted">
                  {f.says}
                </li>
              ))}
              {/* Never omitted. A number built on a gap should say so. */}
              {c.unknowns.map((u, i) => (
                <li key={`u${i}`} className="text-[12px] text-etyme-faint">
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
