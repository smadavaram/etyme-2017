'use client'

import { useState, type MouseEvent } from 'react'
import { EtymeMark } from '@/components/logo'
import { DemoLink } from './demo-link'
import type { CorvaneMap, MapCell, SeatKey, Tone } from './corvane-map'

/**
 * The map, drawn: the bar, four role tabs, who is signed in, the one
 * sentence naming what stopped, five figures and the table, for the seat
 * the address asks for (`/?seat=operations`), CFO where it asks for none.
 *
 * Progressive, the way the doors' tabs are: every tab is a plain link to
 * its own address, so an advertisement can open one and a reader with no
 * script gets the seat from the server. With a script, a tab switches in
 * place and the address follows it, so a copied link opens the same seat.
 * All four seats are in the HTML; the three not chosen are hidden.
 *
 * On a phone the tabs wrap, the figures stack, and the table scrolls
 * sideways inside its own box, so the page itself never does.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

const CHIP: Record<Tone, string> = {
  att: 'bg-etyme-attention-wash text-etyme-attention',
  ok: 'bg-etyme-verified-wash text-etyme-verified',
}

function Cell({ c }: { c: MapCell }) {
  const words = c.chip
    ? <span className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold ${CHIP[c.chip]}`}>{c.t}</span>
    : <span className={`${c.strong ? 'font-semibold text-etyme-ink' : ''} ${c.att ? 'text-etyme-attention' : ''}`}>{c.t}</span>
  return (
    <>
      {words}
      {c.sub && <span className="block text-[11px] font-normal text-etyme-muted">{c.sub}</span>}
    </>
  )
}

export function CorvaneMapView({ map, seat, hrefs }: { map: CorvaneMap; seat: SeatKey; hrefs: Record<SeatKey, string> }) {
  const [cur, setCur] = useState<SeatKey>(seat)

  function pick(key: SeatKey) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      // A click that asks for a new tab or window is the reader's choice.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      setCur(key)
      window.history.replaceState(null, '', hrefs[key])
    }
  }

  return (
    <div data-corvane-map="" className="overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-raised shadow-lift">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-etyme-rule bg-etyme-surface px-3 py-2.5 text-[12px] text-etyme-muted md:px-3.5 md:text-[13px]">
        <p data-map-bar="" className="flex min-w-0 items-center gap-2">
          <EtymeMark size={18} className="hidden shrink-0 md:block" />
          <span className="min-w-0">{map.bar}</span>
        </p>
        <nav aria-label="Read it as" className="flex flex-wrap gap-1.5 md:ml-auto">
          {map.views.map((v) => (
            <a
              key={v.key}
              href={hrefs[v.key]}
              onClick={pick(v.key)}
              aria-current={v.key === cur ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition-colors ${FOCUS} ${
                v.key === cur
                  ? 'border-etyme-action bg-etyme-action text-white'
                  : 'border-etyme-rule bg-etyme-canvas text-etyme-ink hover:border-etyme-action'
              }`}
            >
              {v.tab}
            </a>
          ))}
        </nav>
      </div>

      {map.views.map((v) => (
        <div key={v.key} data-map-seat={v.key} hidden={v.key !== cur} className="bg-etyme-surface">
          <p className="px-3.5 pt-3 text-[13px] text-etyme-muted">{v.signed}</p>
          <p className="text-balance px-3.5 pt-1.5 font-serif text-[17px] leading-snug tracking-[-0.01em] text-etyme-ink">{v.headline}</p>

          <dl className="mt-3 grid grid-cols-1 border-t border-etyme-rule sm:grid-cols-3 lg:grid-cols-5">
            {v.stats.map((s) => (
              <div key={s.label} className="border-b border-etyme-rule px-3.5 py-2.5 sm:border-r lg:border-b-0 lg:last:border-r-0">
                <dt className="text-[10px] uppercase tracking-[0.06em] text-etyme-muted">{s.label}</dt>
                <dd className={`font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums ${s.att ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{s.value}</dd>
                {s.sub && <dd className="text-[11px] text-etyme-muted">{s.sub}</dd>}
              </div>
            ))}
          </dl>

          <div className="overflow-x-auto border-t border-etyme-rule">
            <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
              <thead>
                <tr>
                  {v.columns.map((c) => (
                    <th key={c.t} scope="col" className={`whitespace-nowrap border-b border-etyme-rule px-3 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-etyme-muted ${c.right ? 'text-right' : 'text-left'}`}>
                      {c.t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={`border-b border-etyme-rule px-3 py-2 align-top text-etyme-ink ${v.columns[j]?.right ? 'text-right' : ''}`}>
                        <Cell c={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5 text-[12px] text-etyme-muted">
            <span>{v.caption}</span>
            <DemoLink
              target={v.demo.target}
              label={v.demo.label}
              className={`font-semibold text-etyme-action-press underline-offset-4 hover:underline ${FOCUS} rounded-sm`}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
