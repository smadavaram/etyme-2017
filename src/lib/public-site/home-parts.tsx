'use client'

import { useState } from 'react'
import type { HomeDemo } from './home-demo'
import { ASK_ETYME } from './story'
import type { CfoLine } from './home-cfo'
import {
  SEE_IT_WORK, DEMO_COMPANY, DEMO_LABEL, DEMO_SENT, DEMO_BACK, DEMO_NOT_NOW, CFO_SHOW, CFO_HIDE, CFO_LABEL,
} from './home-words'

/**
 * The three things on the home page a reader presses that are not links:
 * See it work, the demo's Send and Not now, and the CFO view's button.
 *
 * None of them calls the network. The demo is drawn in the page from the
 * seed (`./home-demo`), and its Send shows one plain line in place of the
 * buttons, with a way back; nothing is posted, counted or sent.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

/** The filled button, at least 44 pixels high. */
export const FILLED =
  `inline-flex min-h-11 items-center justify-center rounded-lg bg-etyme-action px-5 py-2.5 text-center text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${FOCUS}`
/** The outline button beside it, at least 44 pixels high. */
export const OUTLINE =
  `inline-flex min-h-11 items-center justify-center rounded-lg border border-etyme-rule bg-etyme-surface px-5 py-2.5 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-action ${FOCUS}`

/**
 * See it work: an anchor to the demo, so it works with no script, and
 * with script it scrolls smoothly (unless the reader asked for reduced
 * motion) and moves keyboard focus to the demo.
 */
export function SeeItWork() {
  return (
    <a
      href={SEE_IT_WORK.href}
      className={OUTLINE}
      onClick={(e) => {
        const target = document.getElementById('demo')
        if (!target) return
        e.preventDefault()
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
        target.focus({ preventScroll: true })
        history.replaceState(null, '', SEE_IT_WORK.href)
      }}
    >
      {SEE_IT_WORK.t}
    </a>
  )
}

/**
 * The Ask Etyme demo: Northbend Athletic, labeled a demo company, the
 * question, the answer, the three contractors, and the card that would
 * send the job. Send and Not now post nothing: each shows the demo line
 * in place of the buttons, and Back brings them back.
 */
export function HomeDemoBlock({ demo }: { demo: HomeDemo }) {
  const [said, setSaid] = useState(false)
  const att = (i: number, j: number) => demo.attention.some(([r, c]) => r === i && c === j)
  return (
    <div className="min-w-0 rounded-lg border border-etyme-rule bg-etyme-surface p-4 sm:p-6">
      <p className="text-[13px] font-medium text-etyme-muted">
        <span className="text-etyme-ink">{ASK_ETYME}</span>
        <span aria-hidden="true"> · </span>
        {DEMO_COMPANY}
        <span aria-hidden="true"> · </span>
        {DEMO_LABEL}
      </p>

      <div className="mt-4 grid gap-3">
        <p className="ml-auto max-w-[85%] rounded-lg bg-etyme-sunk px-3.5 py-2.5 text-[15px] leading-snug text-etyme-ink">
          {demo.question}
        </p>
        <p className="max-w-[95%] rounded-lg border border-etyme-rule bg-etyme-raised px-3.5 py-2.5 text-[15px] leading-snug text-etyme-ink">
          {demo.answer}
        </p>
      </div>

      <table className="mt-4 w-full table-fixed border-collapse text-[13px] sm:text-[14px]">
        <thead>
          <tr className="border-b border-etyme-rule text-left text-etyme-muted">
            {demo.head.map((h, j) => (
              <th key={h} scope="col" className={`py-2 pr-2 font-medium ${j >= 2 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {demo.rows.map((r, i) => (
            <tr key={r[0]} className="border-b border-etyme-rule last:border-b-0">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`py-2 pr-2 align-top tabular-nums [overflow-wrap:anywhere]
                    ${j === 0 ? 'font-medium text-etyme-ink' : 'text-etyme-ink'}
                    ${j >= 2 ? 'text-right' : ''} ${att(i, j) ? 'text-etyme-attention' : ''}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 rounded-lg border border-etyme-rule bg-etyme-raised p-4">
        <p className="text-[15px] leading-snug text-etyme-ink">{demo.card.ask}</p>
        <p className="mt-2 text-[14px] font-medium leading-snug text-etyme-ink">{demo.card.job}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-etyme-muted">{demo.card.detail}</p>
        <div className="mt-3" aria-live="polite">
          {said ? (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <p className="text-[15px] leading-snug text-etyme-ink">{DEMO_SENT}</p>
              <button type="button" className={OUTLINE} onClick={() => setSaid(false)}>{DEMO_BACK}</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className={FILLED} onClick={() => setSaid(true)}>{demo.card.yes}</button>
              <button type="button" className={OUTLINE} onClick={() => setSaid(true)}>{DEMO_NOT_NOW}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The CFO view, closed behind one button whose words change, with
 * aria-expanded. Its lines are in the HTML the server sends either way;
 * with no script the page's own style shows them open and hides the
 * button (`data-cfo-toggle`, in the page's noscript).
 */
export function CfoView({ lines }: { lines: CfoLine[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        data-cfo-toggle=""
        aria-expanded={open}
        aria-controls="cfo-view"
        className={OUTLINE}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? CFO_HIDE : CFO_SHOW}
      </button>
      <div id="cfo-view" className={`${open ? 'block' : 'hidden'} mt-4 rounded-lg border border-etyme-rule bg-etyme-surface p-4 sm:p-6`}>
        <ul className="grid gap-1.5 text-[15px] leading-snug">
          {lines.map((l) => (
            <li key={l.t} className={`tabular-nums ${l.att ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{l.t}</li>
          ))}
        </ul>
        <p className="mt-3 text-[14px] leading-snug text-etyme-muted">{CFO_LABEL}</p>
      </div>
    </div>
  )
}
