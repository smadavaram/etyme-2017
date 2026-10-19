'use client'

import { useEffect, useRef, useState } from 'react'
import { EtymeMark } from '@/components/logo'
import {
  STORIES, DEFAULT_STORY, ASK_ETYME, STORY_DONE, STORY_NOT_NOW, STORY_STEPS_LABEL, STORY_STEP_MS,
  STORY, cellText, startOf, type Cell, type Pill, type PillCell, type StoryStep, type StoryKey,
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
 * ── It names the person in front of the step ─────────────────────────
 *
 * Beside the company on the bar, with a small dot: the person the step
 * is in front of (founder, 2026-10-19). On a phone the bar is one line,
 * the company and the person after a middle dot, with the four chips in
 * one row under it that scrolls sideways (founder, the same day, on four
 * rows of bar before any content). On the home page that is three
 * people over four steps — Marcus Oyelaran, Helena Marsh, Renata Kowal —
 * and on a door it is that party's own person. A status inside an answer
 * and a pill in the table may flip where a card presses (Helena's week,
 * from waiting to signed), and a row may appear (the job sent).
 *
 * A week is said as its days ("Oct 11–17") once the page is live, read
 * off the reader's own today; before that it reads "Last week", so the
 * first frame the server sends is the frame the browser draws.
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

function PillView({ c, pressed }: { c: PillCell; pressed: boolean }) {
  const p = pressed && c.then ? c.then : c
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold transition-colors ${PILL[p.pill]}`}>{p.t}</span>
}

function CellView({ c, pressed, today }: { c: Cell; pressed: boolean; today: string | null }) {
  if (typeof c === 'string' || 'week' in c) return <>{cellText(c, today)}</>
  return <PillView c={c} pressed={pressed} />
}

/** How far a step has played: messages shown, and whether the card has been pressed. */
interface Played { shown: number; pressed: boolean }

/** A message that presses: a card's Yes, or a status that flips where a card would. */
const presses = (m: StoryStep['chat'][number]) => Boolean(m.card || m.status)

const WHOLE: Played = { shown: 99, pressed: false }

function StepBody({ s, book, played, lit, today }: { s: StoryStep; book: string; played: Played; lit: boolean; today: string | null }) {
  const rows = played.pressed && s.table.added ? [...s.table.rows, s.table.added] : s.table.rows
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
            {m.status && (
              <span className="mt-1.5 block">
                <PillView c={m.status} pressed={played.pressed} />
              </span>
            )}
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
      <div className="min-w-0 bg-etyme-surface p-3.5">
        <p className="mb-1.5 flex justify-between gap-2 text-[11px] uppercase tracking-[0.06em] text-etyme-faint">
          <span>{s.table.title}</span>
          <span className="hidden sm:inline">{book}</span>
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
            {rows.map((r, i) => (
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
                    <CellView c={c} pressed={played.pressed} today={today} />
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

/**
 * Which story plays is the page's to say (`./story`, `STORIES`): every
 * page plays Northbend Athletic's three people unless it names another;
 * the MSPs' door names Aptiva Workforce's, in Cavanaugh Glassworks'
 * program, and each other door and tab its own party's person. A key
 * rather than the words, so the server hands the browser one short
 * string. `start` is the page's step as its index in the Northbend story;
 * a door's story opens at its own step with the same screen.
 */
export function StoryPanel({
  start = 0, story: key = DEFAULT_STORY, children,
}: { start?: number; story?: StoryKey; children?: React.ReactNode }) {
  const story = STORIES[key]
  const steps = story.steps
  const first = startOf(story, start)
  const [cur, setCur] = useState(first)
  // The reader's own today, once the page is live; the weeks read as their days from then.
  const [today, setToday] = useState<string | null>(null)
  // Before the page is live every step is whole and nothing is pressed:
  // that is what a reader with no script sees.
  const [played, setPlayed] = useState<Played>(WHOLE)
  const [lit, setLit] = useState(false)
  const [live, setLive] = useState(false)
  const hold = useRef(false)
  const reduce = useRef(false)
  const timers = useRef<number[]>([])
  const chipRow = useRef<HTMLDivElement>(null)

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
    const s = steps[i]
    let t = 150
    s.chat.forEach((m, k) => {
      after(t, () => setPlayed((p) => ({ ...p, shown: k + 1 })))
      if (presses(m)) {
        after(t + 1100, () => {
          setPlayed((p) => ({ ...p, pressed: true }))
          setLit(true)
          after(900, () => setLit(false))
        })
        // What comes after the press is said after it.
        t += 1100
      }
      t += 700
    })
    // A door's story is one step: it plays once and holds there.
    if (steps.length === 1) return
    after(STORY_STEP_MS, () => {
      if (hold.current) {
        // A reader is in the panel: wait, and look again shortly.
        const wait = () => (hold.current ? after(800, wait) : playStep((i + 1) % steps.length))
        wait()
        return
      }
      playStep((i + 1) % steps.length)
    })
  }

  // On a phone the four chips are one row that scrolls sideways; the
  // step playing is scrolled into the middle of it. The row is scrolled,
  // never the page, so a reader further down is not pulled back up.
  useEffect(() => {
    const row = chipRow.current
    if (!row || row.scrollWidth <= row.clientWidth) return
    const chip = row.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!chip) return
    const off = chip.getBoundingClientRect().left - row.getBoundingClientRect().left
    row.scrollTo({ left: row.scrollLeft + off - (row.clientWidth - chip.offsetWidth) / 2, behavior: reduce.current ? 'auto' : 'smooth' })
  }, [cur])

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setLive(true)
    setToday(new Date().toISOString().slice(0, 10))
    if (!reduce.current) playStep(first)
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section
      aria-label={`Etyme shown working on ${story.bar.company}, a sample company`}
      onMouseEnter={() => { hold.current = true }}
      onMouseLeave={() => { hold.current = false }}
      onFocus={() => { hold.current = true }}
      onBlur={() => { hold.current = false }}
      className="overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-raised shadow-lift"
    >
      {/* The bar: the mark, whose program, the person, and the four chips.
          On a phone it is two rows: "Northbend Athletic · Marcus Oyelaran,
          hiring manager" on one line, the mark and the size of the program
          left for md up (Ask Etyme carries the mark just below), set a
          point smaller so the home page's line is whole at 375, and the
          four chips in one row that scrolls sideways. A door's longer title
          ends in an ellipsis; the line under the panel says it whole. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-etyme-rule bg-etyme-surface px-3 py-2.5 text-[13px] text-etyme-muted md:px-3.5">
        <p data-story-bar="" className="flex min-w-0 max-w-full items-center gap-x-1 text-[12px] md:gap-x-2.5 md:text-[13px]">
          <EtymeMark size={18} className="hidden shrink-0 md:block" />
          <b className="shrink-0 whitespace-nowrap font-semibold text-etyme-ink">{story.bar.company}</b>
          <span className="hidden md:inline">{story.bar.rest}</span>
          <span aria-hidden="true" className="md:hidden">·</span>
          {/* The person in front of this step. */}
          <span data-story-who="" className="flex min-w-0 items-center gap-1.5 text-etyme-ink">
            <span aria-hidden="true" className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-verified md:block" />
            <span className="truncate">{steps[cur].who}</span>
          </span>
        </p>
        <div
          ref={chipRow}
          role="group"
          aria-label={STORY_STEPS_LABEL}
          className="-m-1 flex basis-full flex-nowrap gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] md:m-0 md:ml-auto md:basis-auto md:overflow-visible md:p-0 [&::-webkit-scrollbar]:hidden"
        >
          {/* The four steps, always: a door that plays one of them shows the
              other three as names, so the reader sees where its step sits. */}
          {STORY.map(({ n, chip }) => {
            const i = steps.findIndex((s) => s.chip === chip)
            if (i < 0) {
              return (
                <span key={chip} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-etyme-rule px-3 py-1 text-[13px] text-etyme-faint">
                  <span className="tabular-nums">{n}</span>
                  {chip}
                </span>
              )
            }
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={i === cur}
                onClick={() => playStep(i)}
                disabled={!live}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition-colors disabled:cursor-default ${FOCUS} ${
                  i === cur
                    ? 'border-etyme-ink bg-etyme-ink text-etyme-canvas'
                    : i < cur
                      ? 'border-etyme-verified bg-etyme-raised text-etyme-verified'
                      : 'border-etyme-rule bg-etyme-raised text-etyme-ink hover:border-etyme-ink'
                }`}
              >
                <span className={`tabular-nums ${i === cur ? 'opacity-70' : 'text-etyme-faint'}`}>{n}</span>
                {chip}
              </button>
            )
          })}
        </div>
      </div>

      {/* Every step is in the document; one is shown. */}
      {steps.map((s, i) => (
        <div key={s.chip} data-story-step={s.n} hidden={i !== cur}>
          <StepBody s={s} book={story.book} played={i === cur ? played : WHOLE} lit={i === cur && lit} today={today} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-etyme-rule bg-etyme-surface px-3.5 py-2.5 text-[13px] text-etyme-muted">
            <p>
              <span className="mr-1 font-serif text-[20px] text-etyme-ink">{s.sum.big}</span>
              {s.sum.rest}
            </p>
            {/* The page's button, from md up; on a phone it is drawn under
                the hero instead (`LiveDemo`), so only one is ever shown. */}
            {i === cur && children && <div className="hidden md:block">{children}</div>}
          </div>
        </div>
      ))}
    </section>
  )
}
