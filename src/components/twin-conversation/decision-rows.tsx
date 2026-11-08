'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { statusMeans } from '@/lib/read-response'
import { FormMessage } from '@/components/ui'
import type { QueueCard } from '@/app/api/conversations/twin/ask'
import { batchLabel, batchOf, batchSays, todayRows } from './today-decisions'

/**
 * Today's queue as rows (founder, 2026-11-08, "One app, two tabs"): each
 * decision on the one decisions list is a row with its own Yes and Not
 * now, through the one route that performs it, and "Yes to all N" where
 * every open row is one press with nothing to type (./today-decisions).
 * The number on Ask Etyme reads the same list and re-reads after every
 * act, so the two never disagree.
 *
 * Drawn by the Today page, which is the architect's: this component is
 * the whole of it, and the page places it.
 */
export function DecisionRows() {
  const [rows, setRows] = useState<QueueCard[] | null>(null)
  const [total, setTotal] = useState(0)
  const [refused, setRefused] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, { state: 'DONE' | 'LATER' | 'ERROR'; says: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [batchSaid, setBatchSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/decisions')
      const body = await res.json().catch(() => null)
      if (!res.ok) { setRefused(body?.error?.message ?? statusMeans(res.status)); return }
      const got = todayRows(body)
      setRows(got.rows)
      setTotal(got.read?.total ?? got.rows.length)
    } catch {
      setRefused('What needs you could not be read just now. Check your connection and try again.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const settled = useMemo(() => new Set(Object.entries(done).filter(([, v]) => v.state !== 'ERROR').map(([k]) => k)), [done])
  const batch = rows ? batchOf(rows, settled) : null

  async function press(card: QueueCard): Promise<{ ok: boolean; says: string }> {
    if (!card.act) return { ok: false, says: 'This one opens its page.' }
    try {
      const res = await fetch(card.act.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card.act.body) })
      const body = await res.json().catch(() => null)
      const said = res.ok
        ? { ok: true, says: typeof body?.data?.message === 'string' ? body.data.message : typeof body?.data?.says === 'string' ? body.data.says : card.act.done }
        : { ok: false, says: body?.error?.message ?? statusMeans(res.status) }
      setDone((d) => ({ ...d, [card.key]: { state: said.ok ? 'DONE' : 'ERROR', says: said.says } }))
      return said
    } catch {
      const said = { ok: false, says: 'Your answer did not reach Etyme, so nothing changed. Try again.' }
      setDone((d) => ({ ...d, [card.key]: { state: 'ERROR', says: said.says } }))
      return said
    }
  }

  async function one(card: QueueCard) {
    setBusy(card.key)
    await press(card)
    setBusy(null)
  }

  async function all(cards: QueueCard[]) {
    setBusy('*')
    const results: { ok: boolean; says: string }[] = []
    // One at a time, each through its own route, so each is recorded as its own decision.
    for (const c of cards) results.push(await press(c))
    setBatchSaid(batchSays(results))
    setBusy(null)
  }

  if (refused) return <FormMessage tone="error">{refused}</FormMessage>
  if (!rows) return <p className="text-[13px] text-etyme-muted" role="status">Reading what needs you…</p>
  if (rows.length === 0) return <p className="text-[13px] text-etyme-muted">Nothing needs you today.</p>

  return (
    <section aria-label="Needs you" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Needs you · {total}</p>
        {batch && (
          <button type="button" className="btn-secondary text-[13px]" disabled={busy !== null} onClick={() => void all(batch)}>
            {busy === '*' ? 'Recording…' : batchLabel(batch.length)}
          </button>
        )}
      </div>
      {batchSaid && <p role="status" className="text-[12.5px] text-etyme-muted">{batchSaid}</p>}
      <ul className="divide-y divide-etyme-rule overflow-hidden rounded-[12px] border border-etyme-rule bg-etyme-raised">
        {rows.map((card) => {
          const said = done[card.key]
          const settledRow = said && said.state !== 'ERROR'
          return (
            <li key={card.key} className="flex flex-wrap items-start gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-etyme-ink">{card.title}</p>
                {card.fact && <p className="mt-0.5 text-[12.5px] text-etyme-muted">{card.fact}</p>}
                {said?.state === 'ERROR' && <div className="mt-1"><FormMessage tone="error">{said.says}</FormMessage></div>}
                {settledRow && (
                  <p className="mt-1 text-[12.5px] text-etyme-muted">
                    <span className={`chip ${said.state === 'DONE' ? 'chip--verified' : 'chip--passive'}`}>{said.state === 'DONE' ? 'Done' : 'Kept waiting'}</span>
                    <span className="ml-2">{said.says}</span>
                  </p>
                )}
              </div>
              {!settledRow && (
                <div className="flex shrink-0 gap-2">
                  {card.act ? (
                    <button type="button" className="btn-primary text-[13px]" disabled={busy !== null} onClick={() => void one(card)}>
                      {busy === card.key ? 'Recording…' : card.act.label}
                    </button>
                  ) : (
                    <Link href={card.href as Route} className="btn-primary text-[13px]">{card.open ?? 'Open'}</Link>
                  )}
                  <button
                    type="button"
                    className="btn-secondary text-[13px]"
                    disabled={busy !== null}
                    onClick={() => setDone((d) => ({ ...d, [card.key]: { state: 'LATER', says: 'Kept waiting. Nothing changed.' } }))}
                  >
                    Not now
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
