'use client'

import { readJson } from '@/lib/read-response'
import { RefusedState, LoadingState, EmptyState, ErrorState } from '@/components/ui'
import { usePageSection } from '@/components/page-section'
import { OWN_CARD_EMPTY_SAYS } from '@/lib/scorecard'

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
  /** What fills each figure while it is empty, in a sentence; null where it has a number. */
  fills?: Partial<Record<'answered' | 'firstReplyHours' | 'worthReading' | 'hired', string | null>>
  enough: boolean
  summary: string
  unknowns: string[]
  fix: string[]
}

export default function MyStandingPage() {
  const section = usePageSection('/dashboard/my-standing')
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me/scorecard')
      const body = await readJson(res)
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

  // A refusal is the whole answer: not drawn under a heading and a promise
  // about numbers the reader may not read (sign-up walk round five).
  if (error && !loading && cards.length === 0) {
    return <RefusedState says={error} />
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-6 px-4 py-6">
      <header>
        {section && <p className="eyebrow">{section}</p>}
        <h1 className="headline-serif text-[30px] leading-tight">How your clients see you</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          The same numbers they read. You are not shown anybody else&rsquo;s, and
          you are not ranked against them — but this is what decides who gets
          the next job, so it should not be a secret from you.
        </p>
      </header>

      {cards.length > 0 && <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>}

      {loading && <LoadingState says="Reading how your clients see you…" compact />}

      {error && <ErrorState says={error} />}

      {!loading && cards.length === 0 && !error && (
        <EmptyState says={summary || OWN_CARD_EMPTY_SAYS} />
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
              { label: 'You answered', f: c.answered, suffix: '%', fills: c.fills?.answered },
              { label: 'Your first resume', f: c.firstReplyHours, suffix: 'h', fills: c.fills?.firstReplyHours },
              { label: 'Worth reading', f: c.worthReading, suffix: '%', fills: c.fills?.worthReading },
              { label: 'Hired', f: c.hired, suffix: '%', fills: c.fills?.hired },
            ].map(({ label, f, suffix, fills }) => (
              <div key={label} className="max-w-[22ch]">
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
                {f.value == null && fills && <p className="mt-1 text-[12px] text-etyme-muted">{fills}</p>}
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
