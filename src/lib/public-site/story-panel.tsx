'use client'

import { useEffect, useRef, useState } from 'react'
import { EtymeMark } from '@/components/logo'
import {
  STORY, STORY_BAR, ASK_ETYME, STORY_DONE, STORY_NOT_NOW, STORY_STEPS_LABEL, STORY_STEP_MS,
  type Cell, type Pill, type StoryStep,
} from './story'

/**
 * The product shown working, in one compact panel (founder, 2026-10-14,
 * "Build it", replacing the big live frame): a bar with the mark, whose
 * program it is and the four chips; a chat column where Ask Etyme answers
 * a question and a decision card presses itself; the table that answer
 * changes, its row lighting; and a footer with the step's one figure and
 * the page's own button.
 *
 * ── It cannot be blank ───────────────────────────────────────────────
 *
 * Every step is in the HTML the server sends, so with no script the
 * page's own step is shown whole — question, answer, card and table —
 * and the other three are in the document, hidden. The words are data
 * (`./story`), checked against the seed. Nothing waits on a frame or a
 * request.
 *
 * ── It plays on its own, and stops for a reader ──────────────────────
 *
 * Once the page is live a step plays every five seconds or so: the
 * messages come in, the card's Yes presses itself, the changed row
 * lights, and the next chip takes over. A chip jumps to its step and the
 * play carries on from there. It holds while a pointer is over the panel
 * or a control inside it has focus, and it never plays for a reader who
 * asked for reduced motion: they see the page's step and use the chips.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

const PILL: Record<Pill, string> = {
  ok: 'bg-etyme-verified-wash text-etyme-verified',
  wait: 'bg-etyme-action-wash text-etyme-action-press',
  att: 'bg-etyme-attention-wash text-etyme-attention',
  mute: 'bg-etyme-sunk text-etyme-muted',
}

function CellView({ c }: { c: Cell }) {
  if (typeof c === 'string') return <>{c}</>
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold ${PILL[c.pill]}`}>{c.t}</span>
}

/** How far a step has played: messages shown, and whether the card has been pressed. */
interface Played { shown: number; pressed: boolean }

const WHOLE: Played = { shown: 99, pressed: false }

function StepBody({ s, played, lit }: { s: StoryStep; played: Played; lit: boolean }) {
  return (
    <div className="grid md:min-h-[300px] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* The conversation. */}
      <div aria-live="polite" className="flex flex-col gap-2.5 border-b border-etyme-rule bg-etyme-surface p-3.5 md:border-b-0 md:border-r">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-etyme-faint">
          <EtymeMark size={14} />
          {ASK_ETYME}
        </p>
        {s.chat.map((m, i) => (
          <div
            key={i}
            data-story-message=""
            className={`max-w-[92%] rounded-xl px-3 py-2 text-[14px] leading-snug transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
              m.who === 'me'
                ? 'self-end rounded-br-sm bg-etyme-ink text-etyme-canvas'
                : 'self-start rounded-bl-sm border border-etyme-rule bg-etyme-raised text-etyme-ink'
            } ${i < played.shown ? 'opacity-100' : 'translate-y-1.5 opacity-0'}`}
          >
            {m.text}
            {m.card && (
              <div className="mt-2 rounded-lg border border-etyme-rule bg-etyme-surface px-2.5 py-2">
                <p className="text-[13px] font-semibold">{m.card.t}</p>
                <p className="text-[12px] text-etyme-muted">{m.card.s}</p>
                <div className="mt-2 flex gap-1.5">
                  <span
                    className={`rounded-md px-3 py-1 text-[13px] font-semibold text-white transition-colors ${
                      played.pressed ? 'bg-etyme-verified' : 'bg-etyme-action'
                    }`}
                  >
                    {played.pressed ? STORY_DONE : m.card.yes}
                  </span>
                  <span className="rounded-md border border-etyme-rule bg-etyme-raised px-3 py-1 text-[13px] text-etyme-ink">
                    {STORY_NOT_NOW}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* The table the answer changes. */}
      <div className="min-w-0 p-3.5">
        <p className="mb-1.5 flex justify-between gap-2 text-[11px] uppercase tracking-[0.06em] text-etyme-faint">
          <span>{s.table.title}</span>
          <span className="hidden sm:inline">{STORY_BAR.company}</span>
        </p>
        <table className="w-full border-collapse text-[12.5px] tabular-nums sm:text-[13px]">
          <thead>
            <tr>
              {s.table.head.map((h) => (
                <th
                  key={h.t}
                  className={`border-b border-etyme-rule px-1.5 py-1.5 text-[12px] font-medium text-etyme-muted sm:px-2 ${
                    h.right ? 'text-right' : 'text-left'
                  } ${h.wide ? 'hidden sm:table-cell' : ''}`}
                >
                  {h.t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.table.rows.map((r, i) => (
              <tr
                key={i}
                data-story-flash={i === s.table.flash ? '' : undefined}
                className={`transition-colors duration-500 motion-reduce:transition-none ${lit && i === s.table.flash ? 'bg-etyme-action-wash' : ''}`}
              >
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`border-b border-etyme-rule px-1.5 py-1.5 align-top sm:px-2 ${
                      s.table.head[j]?.right ? 'text-right' : 'text-left'
                    } ${s.table.head[j]?.wide ? 'hidden sm:table-cell' : ''} ${j === 0 ? '' : 'whitespace-nowrap'}`}
                  >
                    <CellView c={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StoryPanel({ start = 0, children }: { start?: number; children?: React.ReactNode }) {
  const [cur, setCur] = useState(start)
  // Before the page is live every step is whole and nothing is pressed:
  // that is what a reader with no script sees.
  const [played, setPlayed] = useState<Played>(WHOLE)
  const [lit, setLit] = useState(false)
  const [live, setLive] = useState(false)
  const hold = useRef(false)
  const reduce = useRef(false)
  const timers = useRef<number[]>([])

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const after = (ms: number, f: () => void) => {
    timers.current.push(window.setTimeout(f, ms))
  }

  /** Play step `i` from its first message. */
  const playStep = (i: number) => {
    clear()
    setCur(i)
    setLit(false)
    if (reduce.current) {
      setPlayed(WHOLE)
      return
    }
    setPlayed({ shown: 0, pressed: false })
    const s = STORY[i]
    let t = 150
    s.chat.forEach((m, k) => {
      after(t, () => setPlayed((p) => ({ ...p, shown: k + 1 })))
      if (m.card) {
        after(t + 1100, () => {
          setPlayed((p) => ({ ...p, pressed: true }))
          setLit(true)
          after(900, () => setLit(false))
        })
      }
      t += 700
    })
    after(STORY_STEP_MS, () => {
      if (hold.current) {
        // A reader is in the panel: wait, and look again shortly.
        const wait = () => (hold.current ? after(800, wait) : playStep((i + 1) % STORY.length))
        wait()
        return
      }
      playStep((i + 1) % STORY.length)
    })
  }

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setLive(true)
    if (!reduce.current) playStep(start)
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section
      aria-label={`Etyme shown working on ${STORY_BAR.company}, a sample company`}
      onMouseEnter={() => { hold.current = true }}
      onMouseLeave={() => { hold.current = false }}
      onFocus={() => { hold.current = true }}
      onBlur={() => { hold.current = false }}
      className="overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-raised shadow-lift"
    >
      {/* The bar: the mark, whose program, and the four chips. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-etyme-rule bg-etyme-surface px-3.5 py-2.5 text-[13px] text-etyme-muted">
        <EtymeMark size={18} />
        <b className="font-semibold text-etyme-ink">{STORY_BAR.company}</b>
        <span>{STORY_BAR.rest}</span>
        <div role="group" aria-label={STORY_STEPS_LABEL} className="flex w-full flex-wrap gap-1.5 md:ml-auto md:w-auto">
          {STORY.map((s, i) => (
            <button
              key={s.chip}
              type="button"
              aria-pressed={i === cur}
              onClick={() => playStep(i)}
              disabled={!live}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors disabled:cursor-default ${FOCUS} ${
                i === cur
                  ? 'border-etyme-ink bg-etyme-ink text-etyme-canvas'
                  : i < cur
                    ? 'border-etyme-verified bg-etyme-raised text-etyme-verified'
                    : 'border-etyme-rule bg-etyme-raised text-etyme-ink hover:border-etyme-ink'
              }`}
            >
              <span className={`tabular-nums ${i === cur ? 'opacity-70' : 'text-etyme-faint'}`}>{s.n}</span>
              {s.chip}
            </button>
          ))}
        </div>
      </div>

      {/* Every step is in the document; one is shown. */}
      {STORY.map((s, i) => (
        <div key={s.chip} data-story-step={s.n} hidden={i !== cur}>
          <StepBody s={s} played={i === cur ? played : WHOLE} lit={i === cur && lit} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-etyme-rule bg-etyme-surface px-3.5 py-2.5 text-[13px] text-etyme-muted">
            <p>
              <span className="mr-1 font-serif text-[20px] text-etyme-ink">{s.sum.big}</span>
              {s.sum.rest}
            </p>
            {i === cur && children}
          </div>
        </div>
      ))}
    </section>
  )
}
