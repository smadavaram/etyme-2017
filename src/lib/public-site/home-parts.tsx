'use client'

import { useState } from 'react'
import type { HomeDemo } from './home-demo'
import { ASK_ETYME } from './story'
import type { HomeCfo } from './home-cfo'
import {
  SEE_IT_WORK, DEMO_INTRO, DEMO_COMPANY, DEMO_LABEL, DEMO_ASKED, DEMO_WATCH, DEMO_SENT, DEMO_SAVED, DEMO_BACK, DEMO_NOT_NOW,
  CFO_TITLE, CFO_INTRO, CFO_SHOW, CFO_HIDE, CFO_LABEL,
} from './home-words'
import { FILLED, OUTLINE } from './home-buttons'

/**
 * The things on the home page a reader presses that are not plain links:
 * See it work (and See it work again), the demo's Send and Not now, and
 * the CFO view's button.
 *
 * None of them calls the network. The demo is drawn in the page from the
 * seed (`./home-demo`), and its Send and Not now each show one plain line
 * in place of the buttons, with a way back; nothing is posted, counted or
 * sent.
 *
 * Drawn to the founder's reference page of 2026-11-13 in structure, and in
 * Etyme's own branding, on purpose (CLAUDE.md "Design system"; the founder
 * on the sign-in page, 2026-11-12: "Stick to the branding we had"): the
 * reference's green, its fonts and its pill buttons are not ours. Its
 * tinted answer box is the kit's action wash; its amber tags are the kit's
 * attention tone, with ink text, because attention-colored text on its own
 * wash is under 4.5:1 at that size.
 */

/** Scroll to the demo, smoothly unless the reader asked for less motion, and move keyboard focus there. */
function toDemo(e: React.MouseEvent) {
  const target = document.getElementById('demo')
  if (!target) return
  e.preventDefault()
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
  history.replaceState(null, '', SEE_IT_WORK.href)
}

/**
 * See it work: an anchor to the demo, so it works with no script, and
 * with script it scrolls and moves focus. `className` and `label` let the
 * last call draw "See it work again" on the ink panel with the same act.
 */
export function SeeItWork({ className = OUTLINE, label }: { className?: string; label?: string } = {}) {
  return (
    <a href={SEE_IT_WORK.href} className={className} onClick={toDemo}>
      {label ?? (<>{SEE_IT_WORK.t}<span aria-hidden="true">&nbsp;↓</span></>)}
    </a>
  )
}

/**
 * The Ask Etyme section's head and card: the heading, the line under it,
 * the demo tag; then the question, the answer, the three contractors and
 * the card that would send the job. Send and Not now post nothing: each
 * shows its line in place of the buttons, and Back brings them back.
 */
export function HomeDemoBlock({ demo }: { demo: HomeDemo }) {
  const [said, setSaid] = useState<string | null>(null)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[28px] font-normal leading-tight tracking-[-0.02em] text-etyme-ink md:text-[32px]">{ASK_ETYME}</h2>
          <p className="mt-1.5 text-[15px] leading-snug text-etyme-muted">{DEMO_INTRO}</p>
        </div>
        <p className="inline-flex items-center gap-1.5 rounded-md border border-etyme-attention-line bg-etyme-attention-wash px-2.5 py-1 text-[12.5px] font-semibold text-etyme-ink">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-attention" />
          <span>{DEMO_LABEL}<span aria-hidden="true"> · </span>{DEMO_COMPANY}</span>
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-etyme-rule bg-etyme-raised shadow-sm">
        <div className="px-4 pt-5 sm:px-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-etyme-faint">{DEMO_ASKED}</p>
          <p className="mt-2 font-serif text-[20px] leading-snug text-etyme-ink sm:text-[22px]">“{demo.question}”</p>
          <p className="mt-4 rounded-lg bg-etyme-action-wash p-4 text-[15px] leading-relaxed text-etyme-ink">
            <strong className="font-semibold">{demo.answerLead}</strong> {demo.answerRest}
          </p>
        </div>

        <div className="px-4 pb-1 pt-2 sm:px-5">
          {/* On a phone each row is a short block, never a sideways scroll; from sm a table. */}
          <table className="w-full table-fixed border-collapse text-[14px] max-sm:block">
            <thead className="max-sm:hidden">
              <tr className="border-b border-etyme-rule text-left">
                {demo.head.map((h) => (
                  <th key={h} scope="col" className="pb-2 pr-2 pt-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-etyme-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {demo.rows.map((r, i) => (
                <tr key={r[0]} className="border-b border-etyme-rule last:border-b-0 max-sm:block max-sm:py-3">
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={`py-3 pr-2 align-top text-etyme-ink [overflow-wrap:anywhere] max-sm:block max-sm:py-0.5
                        ${j === 0 ? 'font-medium max-sm:text-[15px] max-sm:font-semibold' : ''} ${j === 2 ? 'tabular-nums' : ''}`}
                    >
                      {c}
                      {j === 0 && demo.watchRows.includes(i) && (
                        <span className="ml-1.5 inline-block whitespace-nowrap rounded-md border border-etyme-attention-line bg-etyme-attention-wash px-1.5 py-px align-[1px] text-[12px] font-semibold text-etyme-ink">
                          {DEMO_WATCH}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-etyme-rule bg-etyme-surface p-4 sm:mx-5 sm:mb-5">
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-snug text-etyme-ink">{demo.card.job}</p>
            <p className="mt-1 text-[14px] leading-snug text-etyme-muted">{demo.card.detail}</p>
          </div>
          <div aria-live="polite" className="min-w-0">
            {said ? (
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <p className="text-[14px] font-semibold leading-snug text-etyme-action-press">{said}</p>
                <button type="button" className={OUTLINE} onClick={() => setSaid(null)}>{DEMO_BACK}</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                <button type="button" className={FILLED} onClick={() => setSaid(DEMO_SENT)}>{demo.card.yes}</button>
                <button type="button" className={OUTLINE} onClick={() => setSaid(DEMO_SAVED)}>{DEMO_NOT_NOW}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The CFO view: a card with its heading and one sentence, and one button
 * whose words change, with aria-expanded, closed by default. Open, the
 * four figures as tiles, the three lines, and the brief's label. Its
 * figures are in the HTML the server sends either way; with no script the
 * page's own style shows them open and hides the button
 * (`data-cfo-toggle`, in the page's noscript).
 */
export function CfoView({ cfo }: { cfo: HomeCfo }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-etyme-rule bg-etyme-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-[42rem]">
          <h3 className="font-serif text-[21px] leading-snug text-etyme-ink md:text-[22px]">{CFO_TITLE}</h3>
          <p className="mt-1 text-[14px] leading-snug text-etyme-muted">{CFO_INTRO}</p>
        </div>
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
      </div>
      <div id="cfo-view" className={`${open ? 'block' : 'hidden'} mt-5 border-t border-etyme-rule pt-5`}>
        <ul className="grid gap-3 min-[340px]:grid-cols-2 md:grid-cols-4">
          {cfo.tiles.map((t) => (
            <li key={t.s} className="min-w-0 rounded-lg bg-etyme-surface p-3.5">
              <b className="block font-serif text-[22px] font-normal leading-none tabular-nums sm:text-[24px] text-etyme-ink">{t.b}</b>
              <span className="mt-1.5 block text-[13px] leading-snug text-etyme-muted">{t.s}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-4 grid gap-2.5 text-[15px] leading-snug">
          {cfo.lines.map((l) => (
            <li key={l.t} className="flex gap-2.5 rounded-lg border border-etyme-rule bg-etyme-canvas px-3.5 py-3 text-etyme-ink">
              {l.att && <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-etyme-attention" />}
              <span className="tabular-nums">{l.lead && <strong className="font-semibold">{l.lead}</strong>}{l.lead ? ' ' : ''}{l.t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-snug text-etyme-muted">{CFO_LABEL}</p>
      </div>
    </div>
  )
}
