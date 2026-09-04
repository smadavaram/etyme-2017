'use client'

import { useEffect, useState } from 'react'

/**
 * The five onboardings, derived live. Nothing here is stored state —
 * every checklist is computed from what actually exists, so it cannot
 * drift from the truth.
 */

const TABS = ['CLIENTS', 'SUPPLIERS', 'CONSULTANTS', 'ASSIGNMENTS'] as const
type Tab = (typeof TABS)[number]

const STATE_CHIP: Record<string, string> = {
  DONE: 'chip--verified',
  MISSING: 'chip--attention',
  STALE: 'chip--attention',
  NOT_APPLICABLE: 'chip--passive',
}

export default function OnboardingPage() {
  const [tab, setTab] = useState<Tab>('ASSIGNMENTS')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/readiness')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function confirmStart(contractId: string) {
    const res = await fetch('/api/onboarding/confirm-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId }),
    })
    const body = await res.json()
    setNote(body.data?.says ?? body.error?.message ?? null)
    load()
  }

  const lists: Record<Tab, any[]> = {
    CLIENTS: data?.clients ?? [],
    SUPPLIERS: data?.suppliers ?? [],
    CONSULTANTS: data?.consultants ?? [],
    ASSIGNMENTS: data?.assignments ?? [],
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Operate</p>
        <h1 className="headline-serif text-[30px] leading-tight">Getting set up</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-etyme-muted">
          One word, five processes. Each list is derived from what actually
          exists right now — nothing here is a ticked box that can drift from
          the truth.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-etyme-rule">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-[13px] capitalize"
            style={
              tab === t
                ? { borderBottom: '2px solid var(--color-action)', color: 'var(--color-ink)', fontWeight: 600 }
                : { color: 'var(--color-muted)' }
            }
          >
            {t.toLowerCase()} {lists[t].length > 0 && `(${lists[t].filter((c: any) => !c.ready).length} open)`}
          </button>
        ))}
      </div>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}
      {error && (
        <div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div>
      )}
      {note && <p className="text-[13px] text-etyme-verified">{note}</p>}

      {!loading && !error && lists[tab].length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing here yet. This list fills itself as {tab.toLowerCase()} exist.
          </p>
        </div>
      )}

      {!loading &&
        lists[tab].map((c: any, i: number) => (
          <article key={i} className="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold text-etyme-ink">{c.subject}</p>
              <span className={`chip ${c.ready ? 'chip--verified' : 'chip--passive'}`}>
                {c.done}/{c.of}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-etyme-muted">{c.says}</p>

            <ul className="mt-3 space-y-2 border-t border-etyme-rule pt-3">
              {c.items
                .filter((it: any) => it.state !== 'NOT_APPLICABLE')
                .map((it: any) => (
                  <li key={it.key} className="flex flex-wrap items-baseline gap-2">
                    <span className={`chip ${STATE_CHIP[it.state]}`}>
                      {it.state === 'DONE' ? 'done' : 'missing'}
                    </span>
                    <span className="text-[13px] text-etyme-ink">{it.label}</span>
                    {it.state !== 'DONE' && (
                      <>
                        <span className="text-[12px] text-etyme-faint">— {it.why}</span>
                        <a href={it.href} className="text-[12px]" style={{ color: 'var(--color-action)' }}>
                          Fix it →
                        </a>
                      </>
                    )}
                  </li>
                ))}
            </ul>

            {tab === 'ASSIGNMENTS' &&
              !c.items.find((x: any) => x.key === 'start')?.state?.includes('DONE') &&
              data?.assignmentIds?.[i] &&
              c.items.find((x: any) => x.key === 'start')?.state === 'MISSING' && (
                <button
                  onClick={() => confirmStart(data.assignmentIds[i])}
                  className="btn-primary mt-3 text-[13px]"
                >
                  Confirm they started
                </button>
              )}
          </article>
        ))}
    </div>
  )
}
