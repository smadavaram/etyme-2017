'use client'

import { useEffect, useState } from 'react'
import { ASK } from './home-page-words'
import type { HomeSample } from './home-sample'

/**
 * The home page's Ask Etyme panel and the CFO view behind one button
 * (approved design, 2026-11-18). Four sample questions, each answered with
 * the rows behind it; every figure is the seed's (`./home-sample`). The
 * Ask panel is told which question a role card points at through the
 * `etyme:ask` event. Nothing here calls the network.
 */

const GELASIO = { fontFamily: 'var(--font-gelasio), Georgia, serif' } as const

export function HomeAsk({ sample, startOn = 'pay' }: { sample: HomeSample; startOn?: string }) {
  const [key, setKey] = useState(startOn)
  const [cfo, setCfo] = useState(false)
  useEffect(() => {
    const on = (e: Event) => setKey(String((e as CustomEvent).detail))
    window.addEventListener('etyme:ask', on)
    return () => window.removeEventListener('etyme:ask', on)
  }, [])
  const q = sample.questions.find((x) => x.key === key) ?? sample.questions[0]
  const grid = 'flex justify-between gap-3 px-4 py-2.5 text-[14.5px] sm:grid sm:grid-cols-[1.4fr_1fr_.8fr]'

  return (
    <div className="mt-8 overflow-hidden rounded-[22px] border border-etyme-rule bg-etyme-raised">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-etyme-rule bg-etyme-surface px-5 py-4">
        <span className="text-[20px] font-semibold" style={GELASIO}>{ASK.title}</span>
        <span className="whitespace-nowrap rounded-full bg-etyme-ink px-3 py-1.5 text-[12.5px] font-bold uppercase tracking-[0.04em] text-etyme-canvas">{ASK.tag}</span>
      </div>
      <p className="px-5 pt-3.5 text-[14.5px] text-etyme-muted">{sample.context}</p>

      <div role="group" aria-label="Sample questions" className="flex flex-wrap gap-2.5 px-5 pb-1 pt-4">
        {sample.questions.map((x) => (
          <button
            key={x.key}
            type="button"
            data-q={x.key}
            aria-pressed={x.key === q.key}
            onClick={() => setKey(x.key)}
            className={`min-h-11 rounded-full border px-4 py-2 text-left text-[14.5px] font-semibold ${x.key === q.key ? 'border-etyme-action bg-etyme-action text-white' : 'border-etyme-rule bg-etyme-canvas text-etyme-ink hover:border-etyme-action'}`}
          >
            {x.question}
          </button>
        ))}
      </div>

      <div id="answer" aria-live="polite" className="px-5 pb-6 pt-4">
        <p className="mb-1.5 text-[26px] leading-tight sm:text-[30px]" style={GELASIO}>{q.lead} <span className="text-etyme-action-press">{q.rest}</span></p>
        <p className="mb-4 max-w-[640px] text-[15.5px] text-etyme-muted">{q.note}</p>
        <div role="table" aria-label="Record behind the answer" className="overflow-hidden rounded-xl border border-etyme-rule">
          <div role="row" className={`${grid} bg-etyme-surface text-[12.5px] font-bold uppercase tracking-[0.06em] text-etyme-muted`}>
            <span>{q.head[0]}</span><span className="hidden sm:block">{q.head[1]}</span><span className="text-right">{q.head[2]}</span>
          </div>
          {q.rows.map((r, i) => (
            <div key={i} role="row" className={`${grid} border-t border-etyme-rule`}>
              <span className="min-w-0">{r[0]}<span className="block text-[12.5px] text-etyme-muted sm:hidden">{r[1]}</span></span>
              <span className="hidden sm:block">{r[1]}</span>
              <span className="text-right tabular-nums">{r[2]}</span>
            </div>
          ))}
          {q.total && (
            <div role="row" className={`${grid} border-t border-etyme-rule bg-etyme-action/10 font-bold`}>
              <span>{q.total[0]}</span><span className="hidden sm:block">{q.total[1]}</span><span className="text-right tabular-nums">{q.total[2]}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-etyme-rule bg-etyme-surface px-5 py-3">
        <button
          type="button"
          aria-expanded={cfo}
          aria-controls="cfoPanel"
          onClick={() => setCfo(!cfo)}
          className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-etyme-action-press"
        >
          {ASK.cfoShow}
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: cfo ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
      <div id="cfoPanel" hidden={!cfo} className="bg-etyme-surface px-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2 min-[760px]:grid-cols-4">
          {sample.cfo.tiles.map((t) => (
            <div key={t.s} className="min-w-0 rounded-xl border border-etyme-rule bg-etyme-raised px-4 py-3.5">
              <strong className="block text-[22px] font-semibold" style={GELASIO}>{t.b}</strong>
              <span className="mt-0.5 block text-[13px] leading-snug text-etyme-muted">{t.s}</span>
            </div>
          ))}
        </div>
        <ul className="mt-3 grid gap-1 text-[14px] text-etyme-ink">
          {sample.cfo.lines.map((l) => (
            <li key={l.t}>{l.lead && <strong className="font-semibold">{l.lead} </strong>}{l.t}</li>
          ))}
        </ul>
        <p className="mt-3 text-[13.5px] text-etyme-muted">{ASK.cfoNote}</p>
      </div>
    </div>
  )
}

/** A role card's link: opens the question that role cares about, then scrolls to the panel. */
export function RoleLink({ label, ask }: { label: string; ask: string }) {
  return (
    <a
      href="#ask"
      data-ask={ask}
      onClick={() => window.dispatchEvent(new CustomEvent('etyme:ask', { detail: ask }))}
      className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-etyme-action-press hover:underline"
    >
      {label} <span aria-hidden="true">→</span>
    </a>
  )
}
