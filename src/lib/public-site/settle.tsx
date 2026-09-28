'use client'

import { useEffect } from 'react'

/**
 * The home page settles on a band when the reader stops scrolling near
 * one, on a phone and on a desktop.
 *
 * ── Why not CSS scroll snapping ──────────────────────────────────────
 *
 * The founder, 2026-09-28 (night), on his phone: scrolling section to
 * section did not work. It was `scroll-snap-type: y proximity`, which
 * iOS Safari barely applies. `mandatory` was measured next, in WebKit and
 * Chromium at 390 and 1440 wide, and it traps the reader:
 *
 *   - WebKit never rests inside a band taller than the screen, so a wheel
 *     turn jumps a whole band and the lower half of the tiles is skipped,
 *     and the footer's lower half could not be reached at all — End
 *     stopped at the footer's first line, 608 pixels short of the bottom.
 *   - Chromium, scrolled the way a trackpad scrolls, never left the hero:
 *     every small step past the hero's last line snapped back to it.
 *
 * Most bands are taller than a phone's screen, so a snap that works only
 * where bands fit is a snap that works almost nowhere the founder reads.
 *
 * ── What this does instead ───────────────────────────────────────────
 *
 * When scrolling stops, if the start of the next band in the direction of
 * travel is within a third of the screen, the page glides to it; if the
 * reader has only just passed a band's start, it glides back to it.
 * Anywhere else — the middle of a tall band, the footer, the last screen
 * of the page — nothing moves. So it settles band by band, and it can
 * never hold anybody: the most it ever moves is a third of a screen, once,
 * after the reader has let go.
 *
 * The bands are the page's own sections and the close; the footer is not
 * one. The header's height is the scroll padding (lib/public-site/frame),
 * so a band settles under the header, the same place an anchor link lands.
 * A reader who asked for reduced motion gets nothing at all.
 */

/** How far ahead a band's start may be, as a share of the screen, to be glided to. */
export const AHEAD = 1 / 3
/** How far behind a band's start may be, as a share of the screen, to be glided back to. */
export const BEHIND = 1 / 8

/**
 * Where to settle, or null to stay. Pure, so a test can hold it without a
 * browser: `starts` are the scroll positions that put each band's start
 * under the header, `y` where the reader stopped, `dir` the direction
 * they were traveling, `view` the screen's height, `max` the furthest the
 * page scrolls.
 */
export function settleTarget(starts: number[], y: number, dir: 1 | -1, view: number, max: number): number | null {
  if (y <= 0 || y >= max - 1) return null
  const ahead = starts
    .filter((s) => (dir > 0 ? s > y : s < y) && Math.abs(s - y) <= view * AHEAD && s <= max)
    .sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0]
  if (ahead !== undefined) return Math.abs(ahead - y) < 2 ? null : ahead
  const behind = starts
    .filter((s) => (dir > 0 ? s <= y : s >= y) && Math.abs(s - y) <= view * BEHIND)
    .sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0]
  if (behind !== undefined) return Math.abs(behind - y) < 2 ? null : behind
  return null
}

export function SettleOnBands() {
  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = window.scrollY
    let dir: 1 | -1 = 1
    // Ours, not the reader's: the glide itself, and the landing on an anchor.
    let quietUntil = Date.now() + 1000

    const settle = () => {
      if (still.matches || Date.now() < quietUntil) return
      const header = document.querySelector('header')
      const pad = header ? header.getBoundingClientRect().height : 0
      const y = window.scrollY
      const bands = document.querySelectorAll('main > section, [data-close-band]')
      const starts = Array.from(bands, (b) => Math.round(b.getBoundingClientRect().top + y - pad))
      const max = document.documentElement.scrollHeight - window.innerHeight
      const to = settleTarget(starts, y, dir, window.innerHeight, max)
      if (to === null) return
      quietUntil = Date.now() + 700
      window.scrollTo({ top: to, behavior: 'smooth' })
    }

    const onScroll = () => {
      const y = window.scrollY
      if (y !== last) dir = y > last ? 1 : -1
      last = y
      if (timer) clearTimeout(timer)
      timer = setTimeout(settle, 160)
    }
    const onHash = () => { quietUntil = Date.now() + 1000 }
    // A new touch or wheel is the reader taking over from a glide.
    const onInput = () => { quietUntil = 0 }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', onHash)
    window.addEventListener('touchstart', onInput, { passive: true })
    window.addEventListener('wheel', onInput, { passive: true })
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('touchstart', onInput)
      window.removeEventListener('wheel', onInput)
    }
  }, [])
  return null
}
