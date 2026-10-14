'use client'

import { useEffect, useRef, useState } from 'react'
import type { EmbedStep } from '@/lib/sample-seat'

/**
 * The live product inside the home page (founder, 2026-10-14): the
 * read-only sample screens from `/embed/demo`, in a frame drawn like a
 * browser window, with the four chips under it.
 *
 * ── It works with no script ──────────────────────────────────────────
 *
 * The iframe has a `name`, and each chip is a plain link with that name
 * as its `target`, so with JavaScript off a chip still opens its step in
 * the same frame. The script only lights the chip that was pressed,
 * writes the path into the chrome strip, and shows the fallback line when
 * the frame does not load.
 *
 * ── The page never waits on the frame ────────────────────────────────
 *
 * The frame's box is sized before it loads — a fixed aspect ratio,
 * taller on a phone — so nothing moves when it arrives. It is served
 * with `loading="lazy"`, which is right on a phone, where it sits under
 * the fold; on a desktop, where it is the first thing under the headline,
 * the script switches it to eager as soon as the page is live.
 *
 * ── When it fails ────────────────────────────────────────────────────
 *
 * The frame is same-origin, so the script can read what loaded: a sample
 * screen's title says "Sample program". Anything else (an error page), or
 * nothing at all after twelve seconds, shows one quiet line with a link
 * to the same screen on its own page. The line is never shown while the
 * frame is still loading.
 *
 * ── One frame for every page, opened at that page's step ─────────────
 *
 * Since 2026-10-14 every product page and party door draws this same
 * frame (founder: "make sure even the sub pages and doors follow the
 * same structure"). A page says which step it opens at, and the chip for
 * that step is lit from the start; the home page opens at the overview,
 * which is none of the four, so no chip is lit there. An optional caption
 * says, in one line, what this page's reader is looking at.
 */

/** Where the frame's screens are served. A step is a path under it. */
export const EMBED_BASE = '/embed/demo'

/** The frame's address for a step: the overview is the base itself. */
export function embedSrc(step: EmbedStep = 'overview'): string {
  return step === 'overview' ? EMBED_BASE : `${EMBED_BASE}/${step}`
}

const LOAD_WAIT_MS = 12_000
const DESKTOP = '(min-width: 768px)'

export interface HomeDemoProps {
  name: string
  /** The step the frame opens at. The overview when not given. */
  step?: EmbedStep
  title: string
  chrome: string
  label: string
  /** One line about what this page's reader is looking at, above the label. */
  caption?: string
  chipsLabel: string
  chips: { t: string; href: string }[]
  fallback: { t: string; link: string }
  /** The button under the frame, drawn by the page (it counts its click). */
  children: React.ReactNode
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

export function HomeDemo({ name, step, title, chrome, label, caption, chipsLabel, chips, fallback, children }: HomeDemoProps) {
  const src = embedSrc(step)
  const frame = useRef<HTMLIFrameElement>(null)
  const [path, setPath] = useState(src)
  const [failed, setFailed] = useState(false)
  // What the frame actually shows, read from it, so a link followed inside
  // the frame still puts the true path in the chrome strip.
  const [shown, setShown] = useState(src)

  // Eager on a desktop, lazy on a phone. Served lazy, so a phone with no
  // script still defers it.
  useEffect(() => {
    const f = frame.current
    if (f && window.matchMedia(DESKTOP).matches) f.loading = 'eager'
  }, [])

  // Nothing loaded in time, or something that is not a sample screen:
  // say so quietly. The clock starts only once the frame is on screen, so
  // a lazy frame under the fold on a phone is never called broken.
  useEffect(() => {
    const f = frame.current
    if (!f) return
    setFailed(false)
    let timer: number | undefined
    const verdict = (): 'ok' | 'bad' | 'pending' => {
      try {
        const doc = f.contentDocument
        if (!doc || !doc.location.pathname.startsWith('/embed/demo') || doc.readyState !== 'complete') return 'pending'
        return doc.title.includes('Sample program') ? 'ok' : 'bad'
      } catch {
        return 'bad'
      }
    }
    const settle = () => {
      const v = verdict()
      if (v === 'pending') return
      window.clearTimeout(timer)
      setFailed(v === 'bad')
      if (v === 'ok') setShown(f.contentDocument?.location.pathname ?? path)
    }
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      seen.disconnect()
      if (verdict() === 'pending') timer = window.setTimeout(() => setFailed(verdict() !== 'ok'), LOAD_WAIT_MS)
    })
    seen.observe(f)
    f.addEventListener('load', settle)
    settle()
    return () => {
      seen.disconnect()
      window.clearTimeout(timer)
      f.removeEventListener('load', settle)
    }
  }, [path])

  return (
    <div>
      <div className="overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-raised shadow-lift">
        {/* The browser-chrome strip: three dots, the real path, and whose screens these are. */}
        <div className="flex min-w-0 items-center gap-2 border-b border-etyme-rule bg-etyme-surface px-3.5 py-2.5 text-[13px] text-etyme-muted">
          <span aria-hidden="true" className="flex shrink-0 gap-1.5">
            <i className="block h-2.5 w-2.5 rounded-full bg-etyme-sunk" />
            <i className="block h-2.5 w-2.5 rounded-full bg-etyme-sunk" />
            <i className="block h-2.5 w-2.5 rounded-full bg-etyme-sunk" />
          </span>
          <span className="ml-1 min-w-0 truncate rounded-md bg-etyme-sunk px-2.5 py-0.5 font-mono text-[12px] text-etyme-ink">
            {shown}
          </span>
          <span className="ml-auto hidden shrink-0 sm:inline">{chrome}</span>
        </div>
        {/* The box is sized before the frame loads, so nothing shifts. */}
        <div className="relative aspect-[3/4] w-full bg-etyme-canvas md:aspect-[16/10]">
          <iframe
            ref={frame}
            name={name}
            src={src}
            title={title}
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>

      <p className="mt-3 text-[14px] leading-snug text-etyme-muted sm:hidden">{chrome}</p>
      {caption && <p className="mt-3 text-[15px] leading-snug text-etyme-ink">{caption}</p>}
      <p className={`${caption ? 'mt-1 text-etyme-muted' : 'mt-3 text-etyme-ink'} text-[15px] leading-snug`}>{label}</p>
      {failed && (
        <p role="status" className="mt-1 text-[14px] text-etyme-muted">
          {fallback.t}{' '}
          <a href={path} className="font-medium text-etyme-action-press underline underline-offset-4">
            {fallback.link}
          </a>
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <nav aria-label="Move the demo to a step" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[12px] uppercase tracking-[0.06em] text-etyme-muted">{chipsLabel}</span>
          {chips.map((c) => {
            const here = path === c.href
            return (
              <a
                key={c.href}
                href={c.href}
                target={name}
                aria-current={here ? 'page' : undefined}
                onClick={() => setPath(c.href)}
                className={`rounded-full border px-3.5 py-1.5 text-[14px] transition-colors ${FOCUS} ${
                  here
                    ? 'border-etyme-ink bg-etyme-ink text-etyme-canvas'
                    : 'border-etyme-rule bg-etyme-surface text-etyme-ink hover:border-etyme-ink'
                }`}
              >
                {c.t}
              </a>
            )
          })}
        </nav>
        {children}
      </div>
    </div>
  )
}
