'use client'

import { useEffect, useState } from 'react'

/**
 * The links nobody meant to leave broken.
 *
 * A queue, not a report. A report is something somebody has to think to
 * ask for, and the person who would think to ask is the one who already
 * knows the numbers are wrong.
 *
 * Sorted worst and oldest first, deliberately. A gap found this week is a
 * phone call. The same gap in April is archaeology.
 */

const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${Math.abs(Math.round(c / 100)).toLocaleString('en-US')}`

const SEVERITY: Record<string, { chip: string; word: string }> = {
  BREAKS_REPORTING: { chip: 'chip--attention', word: 'breaks reporting' },
  MISSTATES_MARGIN: { chip: 'chip--attention', word: 'misstates margin' },
  WORTH_TIDYING: { chip: 'chip--passive', word: 'worth tidying' },
}

export default function LooseEndsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/loose-ends')
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
        setData(b.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Operate</p>
        <h1 className="headline-serif text-[30px] leading-tight">Loose ends</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-etyme-muted">
          Placements missing the link that makes them add up. Worst first, then
          oldest — because a gap found this week is a phone call and the same
          gap in April is archaeology.
        </p>
      </header>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {data?.standing && (
        <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
          <div>
            <p className="stat-label">Loose</p>
            <p className="stat-value tabular-nums">{data.standing.total}</p>
          </div>
          {data.standing.atRiskCents > 0 && (
            <div>
              <p className="stat-label">Billed with no cost behind it</p>
              <p className="stat-value tabular-nums" style={{ color: 'var(--color-attention)' }}>
                {money(data.standing.atRiskCents)}
              </p>
            </div>
          )}
          {data.standing.coldTrails > 0 && (
            <div>
              <p className="stat-label">Cold trails</p>
              <p className="stat-value tabular-nums">{data.standing.coldTrails}</p>
            </div>
          )}
        </div>
      )}

      {data?.standing && (
        <p className="text-[13px] text-etyme-ink">{data.standing.says}</p>
      )}

      {/* The line the profitability screen needs to hear. */}
      {data?.reporting && !data.reporting.ok && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{data.reporting.says}</p>
        </div>
      )}

      {data?.ends?.map((e: any) => (
        <article key={`${e.kind}-${e.subject.id}`} className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-etyme-ink">{e.subject.label}</p>
            <div className="flex items-center gap-2">
              {e.coldTrail && <span className="chip chip--attention">cold trail</span>}
              <span className={`chip ${SEVERITY[e.severity].chip}`}>
                {SEVERITY[e.severity].word}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">{e.says}</p>
          <p className="mt-1 text-[13px] text-etyme-muted">{e.fix}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-etyme-rule pt-3">
            <span className="text-[11px] text-etyme-faint">
              Loose for {e.ageDays} day{e.ageDays === 1 ? '' : 's'}
            </span>
            {e.subject.client && (
              <span className="text-[11px] text-etyme-faint">{e.subject.client}</span>
            )}
            {e.subject.amountCents > 0 && (
              <span className="text-[11px] tabular-nums text-etyme-faint">
                {money(e.subject.amountCents)}
              </span>
            )}
            <a href={e.href} className="ml-auto text-[13px]" style={{ color: 'var(--color-action)' }}>
              Fix it →
            </a>
          </div>
        </article>
      ))}

      {!loading && data && data.ends.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Every placement has both sides and an order behind it. Nothing to chase.
          </p>
        </div>
      )}
    </div>
  )
}
