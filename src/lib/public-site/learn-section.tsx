'use client'

import { useEffect, useRef, useState } from 'react'
import {
  LEARN_TILES, LEARN_WORDS, JOIN_THE_BENCH_HREF, tileDelayMs, finaleDelayMs,
} from './learn-tiles'
import { TileGlyph } from './learn-icons'
import s from './learn-section.module.css'

/**
 * The Learn section, built once and placed wherever the free course is
 * offered: the door at /start and the home page.
 *
 * It plays once, when it scrolls into view: a line draws across, the ten
 * tiles light in order, and it lands on "Course complete" and "Join the
 * bench". It never loops. A visitor who asks for less motion gets the
 * finished picture at once, with nothing moving. Every tile and both
 * closing cards are on the page from the first paint, only faint, so
 * nothing below the section moves when it plays.
 *
 * The call to action is the caller's: on /start it continues into "What
 * are you?" below, on the home page it links to /start and nothing is
 * collected there.
 */
export interface LearnSectionProps {
  cta: { label: string; href: string }
  /** The door's own page has one h1; anywhere else the heading is an h2. */
  headingLevel?: 'h1' | 'h2'
}

const REDUCED = '(prefers-reduced-motion: reduce)'

export function LearnSection({ cta, headingLevel = 'h2' }: LearnSectionProps) {
  const root = useRef<HTMLElement>(null)
  const [started, setStarted] = useState(false)
  const [run, setRun] = useState(0)
  const [lit, setLit] = useState(0)
  const [reduced, setReduced] = useState(false)
  const Heading = headingLevel

  // Start once, when the section is on screen.
  useEffect(() => {
    const quiet = typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches
    setReduced(quiet)
    if (quiet) { setLit(LEARN_TILES.length); return }
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') { setStarted(true); return }
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setStarted(true); watch.disconnect() }
    }, { threshold: 0.25 })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // Light the tiles in order, at the moment each begins to rise.
  useEffect(() => {
    if (!started || reduced) return
    setLit(0)
    const timers = LEARN_TILES.map((_, i) => setTimeout(() => setLit(i + 1), tileDelayMs(i)))
    return () => timers.forEach(clearTimeout)
  }, [started, reduced, run])

  const playing = started && !reduced

  return (
    <section ref={root} className={s.section} aria-label={`${LEARN_WORDS.eyebrow}: ${LEARN_WORDS.headline} ${LEARN_WORDS.free}`}>
      {/* Without a script nothing would ever light, so the finished picture is shown. */}
      <noscript>
        <style>{`.${s.tile},.${s.finale}{opacity:1;transform:none}.${s.fill}{width:100%}.${s.replay}{display:none}`}</style>
      </noscript>
      <div key={run} className={`${s.stage} ${playing ? s.play : ''}`}>
        <p className={s.eyebrow}>{LEARN_WORDS.eyebrow} · <b>{LEARN_WORDS.eyebrowStrong}</b></p>
        <Heading className={s.title}>{LEARN_WORDS.headline} <span className={s.free}>{LEARN_WORDS.free}</span></Heading>
        <p className={s.lede}>{LEARN_WORDS.lede}</p>

        <div className={s.track} aria-hidden="true"><div className={s.fill} /></div>

        <ol className={s.grid}>
          {LEARN_TILES.map((t, i) => (
            <li key={t.key} className={`${s.tile} ${i < lit ? s.on : ''}`}
              style={playing ? { animationDelay: `${tileDelayMs(i)}ms` } : undefined}>
              <div className={s.n}>{String(t.n).padStart(2, '0')}</div>
              <span className={s.ic}><TileGlyph name={t.key} /></span>
              <h3 className={s.tileName}>{t.name}</h3>
              <p className={s.tileLine}>{t.line}</p>
            </li>
          ))}
        </ol>

        <div className={s.finale} style={playing ? { animationDelay: `${finaleDelayMs()}ms` } : undefined}>
          <div className={s.badge}>
            <h3>{LEARN_WORDS.finaleDoneTitle}</h3>
            <p>{LEARN_WORDS.finaleDoneLine}</p>
          </div>
          <a className={s.join} href={JOIN_THE_BENCH_HREF}>
            <h3>{LEARN_WORDS.finaleJoinTitle}</h3>
            <p>{LEARN_WORDS.finaleJoinLine}</p>
          </a>
        </div>
      </div>

      <div className={s.controls}>
        <a className={s.cta} href={cta.href}>{cta.label}</a>
        {started && (
          <button type="button" className={s.replay} onClick={() => { setLit(0); setRun((r) => r + 1) }}>
            {LEARN_WORDS.replay}
          </button>
        )}
      </div>
    </section>
  )
}
