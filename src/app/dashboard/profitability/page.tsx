'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * What placements actually made.
 *
 * Not (bill rate − pay rate) × hours. The client approved forty and the
 * employer accepted thirty-eight, and the margin is neither rate times
 * one of those numbers. Every figure here comes from the work ledger.
 *
 * Three views because they tell three different stories, and the second
 * two contradict the first often enough to be worth the tabs: a
 * placement can look fine while the consultant loses money over a year
 * on bench time, and a client can look profitable while owing more than
 * they have ever paid.
 */

type By = 'contract' | 'candidate' | 'customer'

const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${Math.abs(Math.round(c / 100)).toLocaleString('en-US')}`

const TONE: Record<string, string> = {
  LOSS: 'chip--attention',
  THIN: 'chip--passive',
  FINE: 'chip--verified',
}

export default function ProfitabilityPage() {
  const [by, setBy] = useState<By>('contract')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/profitability?by=${by}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [by])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Grow</p>
        <h1 className="headline-serif text-[30px] leading-tight">What we made</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-etyme-muted">
          From what was actually approved and accepted, not from a rate card.
          Employer burden, commission and expenses are counted — and on the
          candidate view, so is the bench.
        </p>
      </header>

      <div className="flex gap-1 border-b border-etyme-rule">
        {(['contract', 'candidate', 'customer'] as By[]).map((t) => (
          <button
            key={t}
            onClick={() => setBy(t)}
            className="px-4 py-2 text-[13px] capitalize"
            style={
              by === t
                ? { borderBottom: '2px solid var(--color-action)', color: 'var(--color-ink)', fontWeight: 600 }
                : { color: 'var(--color-muted)' }
            }
          >
            By {t}
          </button>
        ))}
      </div>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {data?.overall && (
        <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
          <div>
            <p className="stat-label">Billed</p>
            <p className="stat-value tabular-nums">{money(data.overall.revenueCents)}</p>
          </div>
          <div>
            <p className="stat-label">Margin</p>
            <p
              className="stat-value tabular-nums"
              style={{ color: data.overall.marginCents < 0 ? 'var(--color-attention)' : 'var(--color-verified)' }}
            >
              {money(data.overall.marginCents)}
            </p>
          </div>
          <div>
            <p className="stat-label">Rate</p>
            <p className="stat-value tabular-nums">
              {data.overall.marginPct == null ? '—' : `${data.overall.marginPct}%`}
            </p>
          </div>
          {data.breaches > 0 && (
            <span className="chip chip--attention ml-auto">
              {data.breaches} below the agreed floor
            </span>
          )}
        </div>
      )}

      {data?.note && <p className="text-[13px] text-etyme-muted">{data.note}</p>}

      {data?.rows?.map((r: any, i: number) => (
        <article key={i} className="panel">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-etyme-ink">
                {by === 'customer' ? r.client.name : r.person.name}
              </p>
              <p className="text-[12px] text-etyme-faint">
                {by === 'contract' && `${r.client.name} · ${r.contractType}`}
                {by === 'candidate' && `${r.contracts} assignment${r.contracts === 1 ? '' : 's'} · ${r.idleDays} idle days`}
                {by === 'customer' && `${r.contracts} contracts · ${r.people} people`}
              </p>
            </div>
            {r.health && <span className={`chip ${TONE[r.health]}`}>{r.health.toLowerCase()}</span>}
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">
            {by === 'candidate' ? r.netSays : (r.profit?.says ?? r.says)}
          </p>

          {/* The bench, and the case where every assignment made money and
              the year did not. */}
          {by === 'candidate' && r.profitableOnPaperOnly && (
            <p className="mt-1 text-[13px] text-etyme-attention">
              Profitable on paper only.
            </p>
          )}

          {by === 'customer' && (
            <p
              className={`mt-1 text-[13px] ${r.marginOnPaperOnly ? 'text-etyme-attention' : 'text-etyme-muted'}`}
            >
              {r.cashSays}
            </p>
          )}

          {r.floorBreach && (
            <p className="mt-1 text-[13px] text-etyme-attention">{r.floorBreach}</p>
          )}

          {/* Never presented as measured when it is assumed. */}
          {(r.profit?.assumptions ?? r.assumptions ?? []).length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-etyme-rule pt-3">
              {(r.profit?.assumptions ?? r.assumptions).map((a: string, j: number) => (
                <li key={j} className="text-[11px] text-etyme-faint">{a}</li>
              ))}
            </ul>
          )}
        </article>
      ))}

      {!loading && data && data.rows?.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing to add up yet. This fills in as hours are approved and accepted.
          </p>
        </div>
      )}
    </div>
  )
}
