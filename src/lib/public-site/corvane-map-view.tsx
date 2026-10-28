'use client'

import { useState, type MouseEvent } from 'react'
import { EtymeMark } from '@/components/logo'
import { DemoLink } from './demo-link'
import type { MapCell, RoleMap, Tone } from './corvane-map'

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
 * On a phone the drawing's shape holds (coordinator's call, 2026-10-27,
 * reversing the stacked blocks of the release walk): the tabs wrap, the
 * five figures sit two to a row, and the one table is drawn at every
 * width inside its own box that scrolls sideways, the row's name pinned
 * on the left. The page itself never scrolls sideways.
 *
 * The same view draws each door's map (2026-10-28): the door's own
 * party's roles over its own book (`./door-maps`). A map with one seat —
 * a worker's own page — draws no tab row.
 *
 * `doorsOpen` is the page's one read of whether Corvane is seeded on this
 * deployment (`./corvane-seeded`). Where it is not, no "Open the demo as …"
 * link is drawn, because the door behind it would answer 404; the reader
 * is told the demo is being set up instead.
 */

/** Said where a seat's demo link would be, while the demo company is not seeded. */
export const DEMO_BEING_SET_UP = 'The demo is being set up.'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

/** The row's name stays on the left while the table scrolls sideways on a phone. */
const STICKY = 'sticky left-0 z-10 bg-etyme-surface'

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

export function CorvaneMapView({ map, seat, hrefs, doorsOpen, inPage = false }: {
  map: RoleMap
  seat: string
  hrefs: Record<string, string>
  doorsOpen: boolean
  /**
   * Drawn on a door, under the door's own tabs. The door's tab is the page
   * (`aria-current="page"`); a seat on its map is the current one of a set
   * inside it (`aria-current="true"`), so a reader and a screen reader hear
   * one page, not two.
   */
  inPage?: boolean
}) {
  const [cur, setCur] = useState<string>(seat)

  function pick(key: string) {
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
        {map.views.length > 1 && (
        <nav aria-label="Read it as" className="flex flex-wrap gap-1.5 md:ml-auto">
          {map.views.map((v) => (
            <a
              key={v.key}
              href={hrefs[v.key]}
              onClick={pick(v.key)}
              aria-current={v.key === cur ? (inPage ? 'true' : 'page') : undefined}
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
        )}
      </div>

      {map.views.map((v) => (
        <div key={v.key} data-map-seat={v.key} hidden={v.key !== cur} className="bg-etyme-surface">
          <p className="px-3.5 pt-3 text-[13px] text-etyme-muted">{v.signed}</p>
          <p className="text-balance px-3.5 pt-1.5 font-serif text-[17px] leading-snug tracking-[-0.01em] text-etyme-ink">{v.headline}</p>

          <dl className="mt-3 grid grid-cols-1 gap-px border-t border-etyme-rule bg-etyme-rule min-[340px]:grid-cols-2 lg:grid-cols-5">
            {v.stats.map((s) => (
              <div key={s.label} className="bg-etyme-surface px-3.5 py-2.5 min-[340px]:last:odd:col-span-2 lg:last:odd:col-span-1">
                <dt className="text-[10px] uppercase tracking-[0.06em] text-etyme-muted">{s.label}</dt>
                <dd className={`font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums ${s.att ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{s.value}</dd>
                {s.sub && <dd className="text-[11px] text-etyme-muted">{s.sub}</dd>}
              </div>
            ))}
          </dl>

          <div data-map-scroll="" className="overflow-x-auto border-t border-etyme-rule">
            <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
              <thead>
                <tr>
                  {v.columns.map((c) => (
                    <th key={c.t} scope="col" className={`${c === v.columns[0] ? STICKY : ''} whitespace-nowrap border-b border-etyme-rule px-3 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-etyme-muted ${c.right ? 'text-right' : 'text-left'}`}>
                      {c.t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={`${j === 0 ? STICKY : ''} border-b border-etyme-rule px-3 py-2 align-top text-etyme-ink ${v.columns[j]?.right ? 'text-right' : ''}`}>
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
            {doorsOpen ? (
              <span data-map-door="open">
                <DemoLink
                  target={v.demo.target}
                  label={v.demo.label}
                  className={`font-semibold text-etyme-action-press underline-offset-4 hover:underline ${FOCUS} rounded-sm`}
                />
              </span>
            ) : (
              <span data-map-door="closed">{DEMO_BEING_SET_UP}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
