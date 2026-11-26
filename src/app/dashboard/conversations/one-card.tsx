'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { statusMeans } from '@/lib/read-response'
import { barWords, dueCount, lateCount } from '@/lib/notify/one-card/score-bar'
import type { OneCard as Card } from '@/lib/notify/one-card/build'
import type { OneCardRead } from '@/lib/notify/one-card/read'

/**
 * Ask Etyme, one job, one card (record 130, drawn in
 * prototypes/ask-etyme-one-card). Three zones: the score bar, the next
 * card with Yes and Not now, and under it the queue, what is done today
 * and the agent. The Ask box is the chat's own input below this.
 *
 * Every figure is read from the record by GET /api/conversations/one-card.
 * Yes goes through the route the row already has (the one the Today list
 * and the chat press); a row with none offers one button that opens its
 * record. Not now changes nothing on the record: the card goes to the back
 * of this screen's line. Why stays closed until it is tapped.
 */

type Said = { ok: boolean; says: string }

export function OneCard({ onShown }: { onShown?: (shown: boolean) => void }) {
  const [read, setRead] = useState<OneCardRead | null>(null)
  const [refused, setRefused] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [later, setLater] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said | null>(null)
  const [why, setWhy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations/one-card', { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setRefused(true); setFailed(body?.error?.message ?? statusMeans(res.status)); return }
      setRead(body.data as OneCardRead); setRefused(false); setFailed(null)
    } catch {
      setRefused(true); setFailed('What needs you could not be read just now. Check your connection and try again.')
    }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { onShown?.(!!read && !refused) }, [read, refused, onShown])

  // The card in focus: the highest score that was not put off, then the ones that were, in the order they were put off.
  const line = useMemo(() => {
    if (!read) return [] as Card[]
    const fresh = read.cards.filter((c) => !later.includes(c.key))
    const kept = later.map((k) => read.cards.find((c) => c.key === k)).filter((c): c is Card => !!c)
    return [...fresh, ...kept]
  }, [read, later])
  const card = line[0] ?? null

  async function answer(act: { url: string; body: Record<string, unknown>; done: string }) {
    setBusy(true)
    let result: Said
    try {
      const res = await fetch(act.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act.body) })
      const body = await res.json().catch(() => null)
      result = res.ok
        ? { ok: true, says: typeof body?.data?.message === 'string' ? body.data.message : typeof body?.data?.says === 'string' ? body.data.says : act.done }
        : { ok: false, says: body?.error?.message ?? statusMeans(res.status) }
    } catch {
      result = { ok: false, says: 'Your answer did not reach Etyme, so nothing changed. Try again.' }
    }
    setSaid(result)
    setWhy(false)
    if (result.ok) await load()
    setBusy(false)
  }

  if (refused) return failed && read ? <p role="status" className="mx-auto mb-4 max-w-[480px] text-[13px] text-etyme-muted">{failed}</p> : null
  if (!read) return <p className="mx-auto mb-4 max-w-[480px] text-[13px] text-etyme-muted" role="status">Reading what needs you…</p>

  const now = new Date()
  const due = dueCount(read.cards, now)
  const late = lateCount(read.cards, now)

  return (
    <section aria-label="Your next decision" className="mx-auto mb-6 flex w-full max-w-[480px] flex-col gap-4" data-one-card>
      <div className="flex rounded-[12px] border border-etyme-rule bg-etyme-surface" role="group" aria-label="Score">
        <Figure value={String(due)} label="Due" />
        <Figure value={String(late)} label="Late" tone={late > 0 ? 'late' : undefined} />
        <Figure value={barWords(read.onTimePct, '%')} label="On time" tone={read.onTimePct !== null ? 'ok' : undefined} />
      </div>

      {card ? (
        <article aria-label="Next card" data-card-key={card.key} className="rounded-[16px] border border-etyme-rule bg-etyme-raised p-6 shadow-[0_1px_2px_rgba(31,30,29,0.06),0_8px_24px_rgba(31,30,29,0.06)]">
          <h2 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-etyme-ink">{card.act}</h2>
          <p className="mt-2 text-[18px] font-medium text-etyme-ink">{card.name}</p>
          {card.figure && <p className="mt-3 font-mono text-[28px] font-medium tabular-nums text-etyme-ink">{card.figure}</p>}
          {card.tag && <span className={`mt-3 inline-block text-[13px] font-medium ${/^Late/.test(card.tag) ? 'text-etyme-attention' : 'text-etyme-muted'}`}>{card.tag}</span>}
          <div className="mt-6 flex gap-3">
            {card.yes ? (
              <button type="button" disabled={busy} onClick={() => void answer(card.yes!)} className="min-h-[48px] flex-1 rounded-[10px] bg-etyme-action px-5 py-3.5 text-[16px] font-medium text-white hover:bg-etyme-action-hover disabled:opacity-60">
                {busy ? 'Recording…' : 'Yes'}
              </button>
            ) : card.open ? (
              <Link href={card.open.href as Route} className="flex min-h-[48px] flex-1 items-center justify-center rounded-[10px] bg-etyme-action px-5 py-3.5 text-[16px] font-medium text-white hover:bg-etyme-action-hover">{card.open.words}</Link>
            ) : null}
            {card.no && (
              <button type="button" disabled={busy} onClick={() => void answer(card.no!)} className="min-h-[48px] rounded-[10px] border border-etyme-rule px-5 py-3.5 text-[16px] font-medium text-etyme-ink disabled:opacity-60">{card.no.label}</button>
            )}
            <button type="button" disabled={busy} onClick={() => { setSaid({ ok: true, says: 'Kept waiting. Nothing changed.' }); setWhy(false); setLater((l) => [...l.filter((k) => k !== card.key), card.key]) }} className="min-h-[48px] flex-1 rounded-[10px] border border-etyme-rule px-5 py-3.5 text-[16px] font-medium text-etyme-ink disabled:opacity-60">Not now</button>
          </div>
          <button type="button" aria-expanded={why} onClick={() => setWhy((w) => !w)} className="mt-4 py-1 text-[14px] text-etyme-action-press underline">Why</button>
          {why && (
            <dl className="mt-2 rounded-[10px] border border-etyme-rule bg-etyme-surface px-3.5 py-3 text-[13px] text-etyme-muted" data-why>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-etyme-faint">Rule</dt>
              <dd className="mt-0.5 text-etyme-ink">{card.why.rule}</dd>
              <dt className="mt-2 text-[11px] uppercase tracking-[0.06em] text-etyme-faint">Source</dt>
              <dd className="mt-0.5 text-etyme-ink">{card.why.source}</dd>
              <dt className="mt-2 text-[11px] uppercase tracking-[0.06em] text-etyme-faint">Ledger</dt>
              <dd className="mt-0.5 font-mono text-etyme-ink">{card.why.ledger}</dd>
            </dl>
          )}
        </article>
      ) : (
        <p className="rounded-[16px] border border-etyme-rule bg-etyme-raised p-6 font-serif text-[22px] text-etyme-ink">Nothing needs you today.</p>
      )}
      {said && <p role="status" className={`text-[13px] ${said.ok ? 'text-etyme-muted' : 'text-etyme-danger'}`} data-said>{said.says}</p>}

      <div className="flex gap-2 text-center">
        <Cell value={String(read.queue)} label="Queue" />
        <Cell value={String(read.doneToday)} label="Done today" />
        {read.agent.ownerMaySwitch ? (
          <Link href={read.agent.href as Route} aria-label={`Agent ${read.agent.state}. Change it in Agent control.`} className="min-w-0 flex-1 rounded-[12px] border border-etyme-rule bg-etyme-surface px-1.5 py-2.5">
            <b className={`block font-mono text-[20px] font-medium ${read.agent.state === 'On' ? 'text-etyme-verified' : 'text-etyme-ink'}`}>{read.agent.state}</b>
            <span className="text-[12px] text-etyme-muted">Agent</span>
          </Link>
        ) : (
          <Cell value={read.agent.state} label="Agent" tone={read.agent.state === 'On' ? 'ok' : undefined} />
        )}
      </div>
    </section>
  )
}

function Figure({ value, label, tone }: { value: string; label: string; tone?: 'late' | 'ok' }) {
  return (
    <div className="min-w-0 flex-1 border-l border-etyme-rule p-3 text-center first:border-l-0">
      <b className={`block font-mono text-[26px] font-medium tabular-nums ${tone === 'late' ? 'text-etyme-attention' : tone === 'ok' ? 'text-etyme-verified' : 'text-etyme-ink'}`}>{value}</b>
      <span className="text-[12px] text-etyme-muted">{label}</span>
    </div>
  )
}

function Cell({ value, label, tone }: { value: string; label: string; tone?: 'ok' }) {
  return (
    <div className="min-w-0 flex-1 rounded-[12px] border border-etyme-rule bg-etyme-surface px-1.5 py-2.5">
      <b className={`block font-mono text-[20px] font-medium tabular-nums ${tone === 'ok' ? 'text-etyme-verified' : 'text-etyme-ink'}`}>{value}</b>
      <span className="text-[12px] text-etyme-muted">{label}</span>
    </div>
  )
}
